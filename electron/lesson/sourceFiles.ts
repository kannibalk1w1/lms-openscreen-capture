import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import {
	type LessonSourceIdentity,
	MAX_LESSON_SOURCE_BYTES,
	MAX_LESSON_SOURCES,
} from "../../src/lib/lesson/mediaSelection";
import type { CompositorClipInput } from "../../src/native/contracts";
import { resolveVisibleClips } from "../../src/native/sceneDescription";
import { RangeMediaError } from "./rangeErrors";
export function checkSourceCancellation(signal?: AbortSignal) {
	if (signal?.aborted) throw new RangeMediaError("range-media-cancelled");
}
export interface ResolvedRangeSource {
	path: string;
	bindings: string[];
}
export function resolveRangeSources(
	document: AxcutDocument,
	clips: CompositorClipInput[],
): ResolvedRangeSource[] {
	const paths = new Map(
		[...new Set(clips.map((clip) => clip.screenPath))].map((source) => [source, new Set<string>()]),
	);
	if (!paths.size || paths.size > MAX_LESSON_SOURCES)
		throw new RangeMediaError("range-media-unsupported");
	const assets = new Map(document.assets.map((asset) => [asset.id, asset]));
	for (const clip of resolveVisibleClips(document)) {
		const asset = assets.get(clip.assetId),
			bindings = asset?.originalPath ? paths.get(asset.originalPath) : undefined;
		if (bindings)
			bindings.add(
				createHash("sha256")
					.update(JSON.stringify(["screen", clip.assetId]))
					.digest("hex"),
			);
	}
	const result = [...paths].map(([path, bindings]) => ({ path, bindings: [...bindings].sort() }));
	if (
		result.some((source) => !source.bindings.length) ||
		result.reduce((sum, source) => sum + source.bindings.length, 0) > 32
	)
		throw new RangeMediaError("range-media-unsupported");
	return result.sort((a, b) => a.bindings.join().localeCompare(b.bindings.join()));
}
function sameFile(a: Stats, b: Stats) {
	return (
		a.isFile() &&
		b.isFile() &&
		a.dev === b.dev &&
		a.ino === b.ino &&
		a.size === b.size &&
		a.mtimeMs === b.mtimeMs &&
		a.ctimeMs === b.ctimeMs
	);
}
function boundedFile(stat: Stats, limit: number) {
	return (
		stat.isFile() &&
		Number.isSafeInteger(stat.dev) &&
		Number.isSafeInteger(stat.ino) &&
		Number.isSafeInteger(stat.size) &&
		stat.size > 0 &&
		stat.size <= limit &&
		Number.isFinite(stat.mtimeMs) &&
		Number.isFinite(stat.ctimeMs)
	);
}
/** Operation-time identity checks only; portable content pins contain no inode/path/time. */
export async function hashRegularFile(
	target: string,
	{ signal, limit = MAX_LESSON_SOURCE_BYTES }: { signal?: AbortSignal; limit?: number } = {},
) {
	try {
		checkSourceCancellation(signal);
		if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_LESSON_SOURCE_BYTES)
			throw new RangeMediaError("range-media-unsupported");
		const namedBefore = await fs.lstat(target);
		checkSourceCancellation(signal);
		if (!boundedFile(namedBefore, limit)) throw new RangeMediaError("range-media-unsupported");
		const file = await fs.open(
			target,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
		);
		try {
			checkSourceCancellation(signal);
			const before = await file.stat();
			if (!boundedFile(before, limit) || !sameFile(namedBefore, before))
				throw new RangeMediaError("range-media-changed");
			const hash = createHash("sha256"),
				buffer = Buffer.alloc(1024 * 1024);
			let bytes = 0;
			for (;;) {
				checkSourceCancellation(signal);
				const read = await file.read(buffer, 0, buffer.length, null);
				checkSourceCancellation(signal);
				if (!read.bytesRead) break;
				bytes += read.bytesRead;
				if (bytes > limit) throw new RangeMediaError("range-media-unsupported");
				hash.update(buffer.subarray(0, read.bytesRead));
			}
			const after = await file.stat(),
				namedAfter = await fs.lstat(target);
			checkSourceCancellation(signal);
			if (bytes !== before.size || !sameFile(before, after) || !sameFile(after, namedAfter))
				throw new RangeMediaError("range-media-changed");
			return { bytes, sha256: hash.digest("hex") };
		} finally {
			await file.close();
		}
	} catch (error) {
		if (error instanceof RangeMediaError) throw error;
		throw new RangeMediaError("range-media-unsupported");
	}
}
export async function requireNoCursorSidecar(source: string, signal?: AbortSignal) {
	checkSourceCancellation(signal);
	try {
		await fs.lstat(`${source}.cursor.json`);
	} catch (error) {
		checkSourceCancellation(signal);
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw new RangeMediaError("range-media-unsupported");
	}
	throw new RangeMediaError("range-media-unsupported");
}
export async function observeRangeSources(sources: ResolvedRangeSource[], signal?: AbortSignal) {
	const result: LessonSourceIdentity["sources"] = [];
	let remaining = MAX_LESSON_SOURCE_BYTES;
	for (const source of sources) {
		checkSourceCancellation(signal);
		await requireNoCursorSidecar(source.path, signal);
		const hash = await hashRegularFile(source.path, { signal, limit: remaining });
		remaining -= hash.bytes;
		result.push({ role: "screen", bindings: source.bindings, ...hash });
	}
	return result;
}
export function requireSourceCoverage(
	identity: LessonSourceIdentity,
	sources: ResolvedRangeSource[],
) {
	const keys = (rows: { bindings: string[] }[]) =>
		rows.map((row) => [...row.bindings].sort().join()).sort();
	if (JSON.stringify(keys(identity.sources)) !== JSON.stringify(keys(sources)))
		throw new RangeMediaError("range-media-changed");
}
export function requireMatchingSourceContent(
	expected: LessonSourceIdentity["sources"],
	actual: LessonSourceIdentity["sources"],
) {
	const canonical = (rows: LessonSourceIdentity["sources"]) =>
		rows
			.map((row) => ({ ...row, bindings: [...row.bindings].sort() }))
			.sort((a, b) => a.bindings.join().localeCompare(b.bindings.join()));
	if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual)))
		throw new RangeMediaError("range-media-changed");
}
