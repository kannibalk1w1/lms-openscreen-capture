import { createHash, Hash } from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_LESSON_SOURCE_BYTES } from "../../src/lib/lesson/mediaSelection";
import {
	hashRegularFile,
	observeRangeSources,
	requireMatchingSourceContent,
	requireSourceCoverage,
} from "./sourceFiles";

let root: string, source: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "source-pin-"));
	source = path.join(root, "source");
	await fs.writeFile(source, "original");
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
it("hashes regular bytes, permitting identical replacement across separate observations", async () => {
	const expected = { bytes: 8, sha256: createHash("sha256").update("original").digest("hex") };
	expect(await hashRegularFile(source)).toEqual(expected);
	await fs.unlink(source);
	await fs.writeFile(source, "original");
	expect(await hashRegularFile(source)).toEqual(expected);
});
it.each([
	"missing",
	"empty",
	"directory",
	"symlink",
])("refuses %s sources with path-free errors", async (kind) => {
	await fs.unlink(source);
	if (kind === "empty") await fs.writeFile(source, "");
	if (kind === "directory") await fs.mkdir(source);
	if (kind === "symlink") await fs.symlink(root, source);
	await expect(hashRegularFile(source)).rejects.toThrow(/^range-media-unsupported$/);
});
it("cancels before filesystem access", async () => {
	const spy = vi.spyOn(fs, "lstat"),
		controller = new AbortController();
	controller.abort();
	await expect(hashRegularFile(source, { signal: controller.signal })).rejects.toThrow(
		"range-media-cancelled",
	);
	expect(spy).not.toHaveBeenCalled();
});
it.each([
	"dev",
	"ino",
	"size",
	"mtimeMs",
	"ctimeMs",
])("detects changed %s at descriptor and named-path boundaries", async (field) => {
	const original = await fs.stat(source),
		lstat = fs.lstat.bind(fs);
	for (const boundary of ["open", "finish"]) {
		let calls = 0;
		const spy = vi.spyOn(fs, "lstat").mockImplementation(async (...args) => {
			if (String(args[0]) !== source) return lstat(...args);
			calls++;
			if ((boundary === "open" && calls === 1) || (boundary === "finish" && calls === 2))
				return Object.assign(Object.create(Object.getPrototypeOf(original)), original, {
					[field]: (original[field as keyof Stats] as number) + 1,
				});
			return original;
		});
		await expect(hashRegularFile(source)).rejects.toThrow("range-media-changed");
		spy.mockRestore();
	}
});
it("detects truncation and cancellation between bounded chunks and always closes", async () => {
	const open = fs.open.bind(fs),
		controller = new AbortController();
	let closed = false,
		reads = 0;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const file = await open(...args),
			read = file.read.bind(file),
			close = file.close.bind(file);
		file.read = (async (...readArgs: Parameters<typeof file.read>) => {
			reads++;
			const result = await read(...readArgs);
			controller.abort();
			return result;
		}) as typeof file.read;
		file.close = async () => {
			closed = true;
			await close();
		};
		return file;
	});
	await expect(hashRegularFile(source, { signal: controller.signal })).rejects.toThrow(
		"range-media-cancelled",
	);
	expect(reads).toBe(1);
	expect(closed).toBe(true);
});
it.each([
	0, 1,
])("bounds aggregate reads at 8GiB + %s with faithful file-stat doubles", async (extra) => {
	const targets = [source, path.join(root, "second")],
		stats = await fs.stat(source),
		open = fs.open.bind(fs),
		lstat = fs.lstat.bind(fs);
	const length = (target: string) => 4 * 1024 ** 3 + (target === targets[1] ? extra : 0);
	const stat = (target: string) =>
		Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { size: length(target) });
	vi.spyOn(Hash.prototype, "update").mockReturnThis();
	vi.spyOn(fs, "lstat").mockImplementation(async (...args) =>
		targets.includes(String(args[0])) ? stat(String(args[0])) : lstat(...args),
	);
	let readBytes = 0,
		maxChunk = 0;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const target = String(args[0]);
		if (!targets.includes(target)) return open(...args);
		let position = 0;
		return {
			stat: async () => stat(target),
			close: async () => {
				/* Virtual stream owns no descriptor. */
			},
			read: async (buffer: Buffer, _offset: number, size: number) => {
				maxChunk = Math.max(maxChunk, size);
				const bytesRead = Math.min(size, length(target) - position);
				position += bytesRead;
				readBytes += bytesRead;
				return { bytesRead, buffer };
			},
		} as unknown as Awaited<ReturnType<typeof fs.open>>;
	});
	const operation = observeRangeSources(
		targets.map((target, i) => ({ path: target, bindings: [String(i).repeat(64)] })),
	);
	if (extra) await expect(operation).rejects.toThrow("range-media-unsupported");
	else expect((await operation).reduce((n, s) => n + s.bytes, 0)).toBe(MAX_LESSON_SOURCE_BYTES);
	expect(maxChunk).toBe(1024 ** 2);
	expect(readBytes).toBe(extra ? 4 * 1024 ** 3 : MAX_LESSON_SOURCE_BYTES);
});
it("compares opaque binding groups and byte hashes independently of ordering", () => {
	const a = {
		role: "screen" as const,
		bindings: ["a".repeat(64), "b".repeat(64)],
		bytes: 8,
		sha256: "c".repeat(64),
	};
	const identity = {
		version: 1 as const,
		observationId: crypto.randomUUID(),
		basis: "explicit-author-current" as const,
		sources: [a],
	};
	expect(() =>
		requireSourceCoverage(identity, [{ path: "PRIVATE", bindings: [...a.bindings].reverse() }]),
	).not.toThrow();
	expect(() =>
		requireSourceCoverage(identity, [{ path: "PRIVATE", bindings: [a.bindings[0]] }]),
	).toThrow("range-media-changed");
	expect(() =>
		requireMatchingSourceContent([a], [{ ...a, bindings: [...a.bindings].reverse() }]),
	).not.toThrow();
	for (const changed of [
		{ ...a, bytes: 9 },
		{ ...a, sha256: "d".repeat(64) },
		{ ...a, bindings: ["e".repeat(64)] },
	])
		expect(() => requireMatchingSourceContent([a], [changed])).toThrow("range-media-changed");
});
