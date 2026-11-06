import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { outputFrameCount } from "../../src/lib/exporter/outputFrameCount";
import { LessonOperationError } from "../../src/lib/lesson/api";
import {
	buildLessonSceneDescription,
	lessonRenderFingerprint,
} from "../../src/lib/lesson/frameSource";
import { lessonMediaSelectionSchema } from "../../src/lib/lesson/mediaSelection";
import type {
	CompositorClipInput,
	CompositorExportParams,
	CompositorExportResult,
} from "../../src/native/contracts";
import { buildNativeClipList } from "../../src/native/sceneDescription";
import { validateRangeVideo } from "./encodedVideo";
import { planLessonRange } from "./rangePlan";

export class RangeMediaError extends Error {
	constructor(
		readonly code: "range-media-unsupported" | "range-media-changed" | "range-media-incomplete",
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
export type RangeMediaRenderer = (
	clips: CompositorClipInput[],
	outPath: string,
	sceneJson: string,
	params: CompositorExportParams,
) => Promise<CompositorExportResult | null>;

/** Private ephemeral cuts; original document and identifiers remain untouched. */
export async function prepareLessonRangeMedia(document: AxcutDocument, input: unknown) {
	const selection = lessonMediaSelectionSchema.parse(input);
	const current = await planLessonRange(document, selectionRequest(selection)).catch((error) => {
		if (error instanceof LessonOperationError && error.code === "project-changed")
			throw new RangeMediaError("range-media-changed");
		throw error;
	});
	if (JSON.stringify(current) !== JSON.stringify(selection))
		throw new RangeMediaError("range-media-changed");
	const duration = selection.programme.endSec - selection.programme.startSec;
	if (duration < 1 / 30 || duration > 120 || selection.keptSpans.length > 32)
		throw new RangeMediaError("range-media-unsupported");
	const derived = structuredClone(document);
	const used = new Set(derived.timeline.trimRanges.map((trim) => trim.id));
	let sequence = 0;
	for (const clip of derived.timeline.clips) {
		const end = clip.sourceEndSec!;
		const rawEnd = clip.timelineStartSec + end - clip.sourceStartSec;
		for (const [startSec, endSec] of [
			[
				clip.sourceStartSec,
				Math.min(end, clip.sourceStartSec + selection.startSec - clip.timelineStartSec),
			],
			[
				Math.max(
					clip.sourceStartSec,
					clip.sourceStartSec + selection.endSec - clip.timelineStartSec,
				),
				end,
			],
		]) {
			if (endSec <= startSec) continue;
			let id: string;
			do {
				id = `__lesson_media_cut_${sequence++}`;
			} while (used.has(id));
			used.add(id);
			derived.timeline.trimRanges.push({
				id,
				assetId: clip.assetId,
				clipId: clip.id,
				startSec,
				endSec,
				reason: "Ephemeral selected lesson range",
				origin: "user",
			});
		}
		if (!Number.isFinite(rawEnd)) throw new RangeMediaError("range-media-unsupported");
	}
	const clips = buildNativeClipList(derived),
		scene = buildLessonSceneDescription(derived);
	// No hidden source dependency or native sidecar fallback is silently dropped.
	if (
		!clips.length ||
		clips.length > 32 ||
		clips.some((clip) => !!clip.webcamPath) ||
		scene.audioTracks.length ||
		scene.clickSound ||
		scene.background.kind === "image" ||
		scene.annotations.some((item) => !!item.imagePath) ||
		scene.webcamEffect
	)
		throw new RangeMediaError("range-media-unsupported");
	const scale = Math.min(1, 1280 / Math.max(scene.output.width, scene.output.height));
	const params = {
		width: Math.max(2, Math.round((scene.output.width * scale) / 2) * 2),
		height: Math.max(2, Math.round((scene.output.height * scale) / 2) * 2),
		fps: 30,
		codec: "h264",
		bitrate: 4_000_000,
	};
	const expectedFrames = outputFrameCount(clips, scene.speedRegions, params.fps);
	// The clip reader can clamp to probed asset duration. That must never shorten
	// the authored programme interval while certifying the clamped frame count.
	// Apply the shared frame-grid rule to programme duration independently of
	// native source clips, so their duration clamp cannot certify a shorter range.
	const programmeFrames = outputFrameCount(
		[{ sourceStartSec: 0, sourceEndSec: duration }],
		undefined,
		params.fps,
	);
	if (expectedFrames !== programmeFrames) throw new RangeMediaError("range-media-unsupported");
	if (!Number.isInteger(expectedFrames) || expectedFrames < 1 || expectedFrames > 3600)
		throw new RangeMediaError("range-media-unsupported");
	return { selection, derived, clips, scene, params, expectedFrames };
}
function selectionRequest(selection: ReturnType<typeof lessonMediaSelectionSchema.parse>) {
	return {
		projectId: selection.projectId,
		documentSha256: selection.documentSha256,
		startSec: selection.startSec,
		endSec: selection.endSec,
	};
}
const MAX_BYTES = 8 * 1024 * 1024 * 1024;
async function hashRegularFile(target: string) {
	if (!(await fs.lstat(target)).isFile()) throw new RangeMediaError("range-media-unsupported");
	const file = await fs.open(
		target,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
	);
	try {
		const before = await file.stat();
		if (!before.isFile() || before.size <= 0 || before.size > MAX_BYTES)
			throw new RangeMediaError("range-media-unsupported");
		const hash = createHash("sha256"),
			buffer = Buffer.alloc(1024 * 1024);
		let bytes = 0;
		for (;;) {
			const read = await file.read(buffer, 0, buffer.length, null);
			if (!read.bytesRead) break;
			bytes += read.bytesRead;
			if (bytes > MAX_BYTES) throw new RangeMediaError("range-media-unsupported");
			hash.update(buffer.subarray(0, read.bytesRead));
		}
		const after = await file.stat();
		if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
			throw new RangeMediaError("range-media-changed");
		return { bytes, sha256: hash.digest("hex") };
	} finally {
		await file.close();
	}
}
async function requireNoCursorSidecar(source: string) {
	try {
		await fs.lstat(`${source}.cursor.json`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	throw new RangeMediaError("range-media-unsupported");
}
/** Backend building block only. A caller must supply explicit selection/destination authority. */
export async function materializeLessonRange(options: {
	selection: unknown;
	readDocument: (id: string) => Promise<AxcutDocument>;
	render: RangeMediaRenderer;
	pickDirectory: () => Promise<string | null>;
}) {
	try {
		const selection = lessonMediaSelectionSchema.parse(options.selection);
		const prepared = await prepareLessonRangeMedia(
			await options.readDocument(selection.projectId),
			selection,
		);
		const parent = await options.pickDirectory();
		if (!parent) return { status: "cancelled" as const };
		if (!path.isAbsolute(parent) || !(await fs.stat(parent)).isDirectory())
			throw new RangeMediaError("range-media-unsupported");
		const sources = [...new Set(prepared.clips.map((clip) => clip.screenPath))];
		if (sources.length > 8) throw new RangeMediaError("range-media-unsupported");
		const before = [];
		let totalBytes = 0;
		for (const source of sources) {
			await requireNoCursorSidecar(source);
			const hash = await hashRegularFile(source);
			totalBytes += hash.bytes;
			if (totalBytes > MAX_BYTES) throw new RangeMediaError("range-media-unsupported");
			before.push(hash);
		}
		await prepareLessonRangeMedia(await options.readDocument(selection.projectId), selection);
		const directory = path.join(parent, `lesson-range-${randomUUID()}`);
		await fs.mkdir(directory, { mode: 0o700 });
		try {
			const file = path.join(directory, "range.mp4");
			const stats = await options.render(
				prepared.clips,
				file,
				JSON.stringify(prepared.scene),
				prepared.params,
			);
			if (
				!stats ||
				stats.frames !== prepared.expectedFrames ||
				!Number.isFinite(stats.videoDurationS) ||
				Math.abs(stats.videoDurationS - prepared.expectedFrames / 30) > 1e-6
			)
				throw new RangeMediaError("range-media-incomplete");
			const videoEvidence = await validateRangeVideo(file, {
				...prepared.params,
				frames: prepared.expectedFrames,
			});
			await prepareLessonRangeMedia(await options.readDocument(selection.projectId), selection);
			for (let index = 0; index < sources.length; index++) {
				await requireNoCursorSidecar(sources[index]);
				if (JSON.stringify(await hashRegularFile(sources[index])) !== JSON.stringify(before[index]))
					throw new RangeMediaError("range-media-changed");
			}
			const output = await hashRegularFile(file);
			if (output.bytes !== videoEvidence.bytes || output.sha256 !== videoEvidence.sha256)
				throw new RangeMediaError("range-media-changed");
			await fs.chmod(file, 0o600);
			const receipt = {
				format: "openscreen-lesson-range-media",
				version: 1,
				selection,
				renderInputsSha256: await lessonRenderFingerprint(prepared.derived),
				output: {
					path: "range.mp4",
					...output,
					width: prepared.params.width,
					height: prepared.params.height,
					fps: 30,
					frames: stats.frames,
					nativeReportedDurationSec: stats.videoDurationS,
					basis: "selected-programme-seconds",
				},
				sources: before.map((hash, index) => ({ index, ...hash })),
				validation: "mp4-video-samples-and-full-frame-decode",
				videoEvidence,
				mediaDecodedByValidator: true,
				encodedTimingVerified: true,
				audio: {
					policy: "native-source-or-synthesized-silence",
					streamMetadataVerified: false,
					timingVerified: false,
				},
			};
			await fs.writeFile(
				path.join(directory, "range-export.json"),
				JSON.stringify(receipt, null, 2) + "\n",
				{ flag: "wx", mode: 0o600 },
			);
			return {
				status: "materialized" as const,
				path: directory,
				frames: stats.frames,
				nativeReportedDurationSec: stats.videoDurationS,
			};
		} catch (error) {
			throw new RangeMediaError(
				error instanceof RangeMediaError && error.code === "range-media-changed"
					? "range-media-changed"
					: "range-media-incomplete",
				directory,
			);
		}
	} catch (error) {
		if (error instanceof RangeMediaError) throw error;
		throw new RangeMediaError("range-media-unsupported");
	}
}
