import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { identity } from "./packageIO";
import {
	PLAYER_MAX_BUFFERED_BYTES,
	PLAYER_MAX_RANGE_BYTES,
	type PlayerMediaCapability,
	parsePlayerRange,
	playerBufferedBytes,
	servePlayerMedia,
} from "./playerMedia";

let root: string, file: string, bytes: Buffer, cap: PlayerMediaCapability & { revoked: number };
const token = randomUUID(),
	stepId = randomUUID();
const url = (t: string = token, s: string = stepId) => `openscreen-lesson-media://${t}/${s}`;
function capability(target = file): PlayerMediaCapability & { revoked: number } {
	const abort = new AbortController();
	const stats = lstatSync(target);
	const value = {
		token,
		videos: new Map([[stepId, { path: target, size: stats.size, identity: identity(stats) }]]),
		signal: abort.signal,
		inflight: 0,
		revoked: 0,
		live: true,
		isCurrent: () => value.live,
		revoke: () => {
			value.revoked++;
			value.live = false;
			abort.abort();
		},
	};
	return value;
}
const get = (target: string, range?: string, method = "GET") =>
	servePlayerMedia(
		new Request(target, { method, headers: range === undefined ? {} : { Range: range } }),
		() => cap,
	);
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "player-media-"));
	file = path.join(root, "step.mp4");
	bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
	await fs.writeFile(file, bytes);
	cap = capability();
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

it("parses exactly one bytes range, clamps it to the file and the per-request bound", () => {
	expect(parsePlayerRange(null, 1000)).toEqual({ start: 0, end: 999 });
	expect(parsePlayerRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
	expect(parsePlayerRange("bytes=10-19", 1000)).toEqual({ start: 10, end: 19 });
	expect(parsePlayerRange("bytes=990-5000", 1000)).toEqual({ start: 990, end: 999 });
	expect(parsePlayerRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
	expect(parsePlayerRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
	const big = 100 * 1024 * 1024;
	expect(parsePlayerRange("bytes=0-", big)).toEqual({ start: 0, end: PLAYER_MAX_RANGE_BYTES - 1 });
	for (const bad of [
		"bytes=0-1,5-9",
		"bytes=20-10",
		"bytes=1000-",
		"bytes=-0",
		"bytes=-",
		"items=0-1",
		"bytes= 0-1",
		"bytes=0x1-2",
		"bytes=1234567890123456-",
	])
		expect(parsePlayerRange(bad, 1000), bad).toBeNull();
});

it("returns a verified range with the headers media playback needs, and nothing else", async () => {
	const response = await get(url(), "bytes=100-199");
	expect(response.status).toBe(206);
	expect(Object.fromEntries(response.headers)).toEqual({
		"accept-ranges": "bytes",
		"cache-control": "no-store",
		"content-length": "100",
		"content-range": "bytes 100-199/1000",
		"content-type": "video/mp4",
		"x-content-type-options": "nosniff",
	});
	expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(100, 200))).toBe(true);
	const head = await get(url(), undefined, "HEAD");
	expect(head.status).toBe(200);
	expect(head.headers.get("content-length")).toBe("1000");
	expect(await head.arrayBuffer()).toHaveProperty("byteLength", 0);
	const ranged = await get(url(), "bytes=0-9", "HEAD");
	expect(ranged.status).toBe(206);
	expect(ranged.headers.get("content-range")).toBe("bytes 0-9/1000");
	expect(playerBufferedBytes()).toBe(0);
	expect(cap.revoked).toBe(0);
});

it("refuses unknown tokens, steps, schemes, URL extras and methods with empty fixed responses", async () => {
	const other = randomUUID();
	const refused = [
		url(other),
		url(token, other),
		url(token, "../step.mp4"),
		url(token, "media/step.mp4"),
		`${url()}?path=${encodeURIComponent(file)}`,
		`${url()}#x`,
		`openscreen-lesson-media://${token}:8080/${stepId}`,
		`file://${file}`,
		`openscreen-lesson-media://${token.toUpperCase()}x/${stepId}`,
	];
	for (const target of refused) {
		const response = await get(target, "bytes=0-9");
		expect(response.status, target).toBe(404);
		expect(await response.text()).toBe("");
		expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(root);
	}
	expect((await get(url(), "bytes=0-9", "POST")).status).toBe(405);
	for (const range of ["bytes=0-1,4-5", "bytes=2000-", "bytes=9-1"]) {
		const response = await get(url(), range);
		expect(response.status, range).toBe(416);
		expect(response.headers.get("content-range")).toBe("bytes */1000");
	}
	// A refused request never ends a valid capability; only a changed file does.
	expect(cap.revoked).toBe(0);
	expect((await get(url(), "bytes=0-9")).status).toBe(206);
});

it("serves nothing once the capability is revoked or no longer current", async () => {
	cap.revoke();
	expect((await get(url(), "bytes=0-9")).status).toBe(404);
	cap = capability();
	(cap as unknown as { live: boolean }).live = false;
	expect((await get(url(), "bytes=0-9")).status).toBe(404);
});

it.each([
	"rewritten-in-place",
	"replaced-by-rename",
	"became-symlink",
	"deleted",
])("returns no bytes and ends the capability when the verified file was %s", async (change) => {
	if (change === "rewritten-in-place") await fs.writeFile(file, Buffer.alloc(1000, 7));
	if (change === "replaced-by-rename") {
		await fs.writeFile(path.join(root, "other.mp4"), bytes);
		await fs.rename(path.join(root, "other.mp4"), file);
	}
	if (change === "became-symlink") {
		await fs.rename(file, path.join(root, "moved.mp4"));
		await fs.symlink(path.join(root, "moved.mp4"), file);
	}
	if (change === "deleted") await fs.rm(file);
	const response = await get(url(), "bytes=0-9");
	expect(response.status).toBe(404);
	expect(await response.text()).toBe("");
	expect(cap.revoked).toBe(1);
	expect((await get(url(), "bytes=0-9")).status).toBe(404);
	expect(playerBufferedBytes()).toBe(0);
});

it("returns no bytes when the file changes while its range is being read", async () => {
	const probe = await fs.open(file, "r"),
		prototype = Object.getPrototypeOf(probe);
	await probe.close();
	const real = prototype.read;
	vi.spyOn(prototype, "read").mockImplementation(async function (
		this: unknown,
		...args: unknown[]
	) {
		const result = await real.apply(this, args);
		// Same inode, changed bytes: only the final identity check can see it.
		await fs.appendFile(file, "tampered");
		return result;
	});
	const response = await get(url(), "bytes=0-99");
	expect(response.status).toBe(404);
	expect(cap.revoked).toBe(1);
});

it("returns no bytes when the capability is revoked while its range is being read", async () => {
	const probe = await fs.open(file, "r"),
		prototype = Object.getPrototypeOf(probe);
	await probe.close();
	const real = prototype.read;
	vi.spyOn(prototype, "read").mockImplementation(async function (
		this: unknown,
		...args: unknown[]
	) {
		const result = await real.apply(this, args);
		cap.revoke();
		return result;
	});
	const response = await get(url(), "bytes=0-99");
	expect(response.status).toBe(404);
	expect(await response.text()).toBe("");
	expect(cap.inflight).toBe(0);
	expect(playerBufferedBytes()).toBe(0);
});

it("bounds requests in flight per capability and bytes buffered across every player", async () => {
	const probe = await fs.open(file, "r"),
		prototype = Object.getPrototypeOf(probe);
	await probe.close();
	const real = prototype.read;
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	vi.spyOn(prototype, "read").mockImplementation(async function (
		this: unknown,
		...args: unknown[]
	) {
		await held;
		return real.apply(this, args);
	});
	const first = get(url(), "bytes=0-9"),
		second = get(url(), "bytes=10-19");
	await vi.waitFor(() => expect(cap.inflight).toBe(2));
	// Refused at once, not queued behind the held reads.
	const third = await Promise.race([
		get(url(), "bytes=20-29"),
		new Promise<"still-pending">((resolve) => setTimeout(() => resolve("still-pending"), 500)),
	]);
	expect(third).not.toBe("still-pending");
	if (third === "still-pending") return;
	expect(third.status).toBe(503);
	expect(third.headers.get("retry-after")).toBe("1");
	release();
	expect((await first).status).toBe(206);
	expect((await second).status).toBe(206);
	expect(cap.inflight).toBe(0);
	// Aggregate: a large file whose single range would exceed what all players may buffer at once.
	vi.restoreAllMocks();
	const large = path.join(root, "large.mp4");
	await fs.writeFile(large, Buffer.alloc(PLAYER_MAX_RANGE_BYTES * 5));
	const caps = [capability(large), capability(large), capability(large), capability(large)];
	let releaseLarge!: () => void;
	const heldLarge = new Promise<void>((resolve) => {
		releaseLarge = resolve;
	});
	const realLarge = prototype.read;
	vi.spyOn(prototype, "read").mockImplementation(async function (
		this: unknown,
		...args: unknown[]
	) {
		await heldLarge;
		return realLarge.apply(this, args);
	});
	const pending = caps.map((c) =>
		servePlayerMedia(new Request(url(), { headers: { Range: "bytes=0-" } }), () => c),
	);
	await vi.waitFor(() => expect(playerBufferedBytes()).toBe(PLAYER_MAX_BUFFERED_BYTES));
	const over = await Promise.race([
		servePlayerMedia(new Request(url(), { headers: { Range: "bytes=0-" } }), () =>
			capability(large),
		),
		new Promise<"still-pending">((resolve) => setTimeout(() => resolve("still-pending"), 500)),
	]);
	expect(over).not.toBe("still-pending");
	if (over === "still-pending") {
		releaseLarge();
		return;
	}
	expect(over.status).toBe(503);
	releaseLarge();
	for (const response of await Promise.all(pending)) expect(response.status).toBe(206);
	expect(playerBufferedBytes()).toBe(0);
});
