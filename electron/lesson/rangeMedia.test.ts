import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import * as nativeScene from "../../src/native/sceneDescription";
import { validateRangeVideo } from "./encodedVideo";
import {
	materializeLessonRange,
	prepareLessonRangeMedia,
	RangeMediaError,
	type RangeMediaRenderer,
} from "./rangeMedia";
import { planLessonRange } from "./rangePlan";
import { captureLessonSourceIdentity } from "./sourceIdentity";

// Authority/receipt unit tests isolate the separately integration-tested decoder.
vi.mock("./encodedVideo", () => ({
	validateRangeVideo: vi.fn(async (file: string) => {
		const bytes = await fs.readFile(file);
		const { createHash } = await import("node:crypto");
		return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	}),
}));

let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-media-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = path.join(root, "source.mp4");
	await fs.writeFile(source, "fixture-source-bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Range media" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Source",
			originalPath: source,
			cameraTrack: null,
			durationSec: 5,
			video: { codec: "h264", fps: 30, width: 640, height: 360 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 5,
			timelineStartSec: 0,
			timelineEndSec: 5,
			origin: "user",
			reason: "fixture",
			wordRefs: [],
		},
	];
	doc.timeline.trimRanges = [
		{ id: "cut", assetId: "a", clipId: "c", startSec: 1, endSec: 2, origin: "user", reason: "cut" },
	];
	doc.legacyEditor = {
		aspectRatio: "16:9",
		wallpaper: "#ffffff",
		speedRegions: [{ id: "speed", startMs: 2000, endMs: 4000, speed: 2 }],
	};
	const reference = await planLessonRange(doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(doc),
		startSec: 0.5,
		endSec: 4,
	});
	const selection = await captureLessonSourceIdentity({
		selection: reference,
		intent: "author-current",
		readDocument: async () => doc,
	});
	const render = vi.fn<RangeMediaRenderer>(async (_clips, file, _scene, params) => {
		await fs.writeFile(file, "MOCK_ENCODED_OUTPUT");
		return { frames: 45, wallS: 1, fps: 45, videoDurationS: 45 / params.fps! };
	});
	return {
		source,
		doc,
		selection,
		render,
		options: { selection, readDocument: async () => doc, render, pickDirectory: async () => root },
	};
}
it("narrows source windows through ephemeral trims and shared scene/frame readers without changing the original", async () => {
	const f = await fixture(),
		before = JSON.stringify(f.doc),
		prepared = await prepareLessonRangeMedia(f.doc, f.selection);
	expect(prepared.clips.map((clip) => [clip.sourceStartSec, clip.sourceEndSec])).toEqual([
		[0.5, 1],
		[2, 4],
	]);
	expect(prepared.scene.clips.map((clip) => [clip.sourceStartSec, clip.sourceEndSec])).toEqual([
		[0.5, 1],
		[2, 4],
	]);
	expect(prepared.expectedFrames).toBe(45);
	expect(JSON.stringify(f.doc)).toBe(before);
	expect(prepared.params).toMatchObject({ width: 640, height: 360, fps: 30, codec: "h264" });
});
it("verifies source and output bytes before writing a path-minimal completion receipt in a new private folder", async () => {
	const f = await fixture(),
		before = await fs.readFile(f.source),
		result = await materializeLessonRange(f.options);
	if (result.status !== "materialized") throw new Error("Expected output");
	const receipt = JSON.parse(
		await fs.readFile(path.join(result.path, "range-export.json"), "utf8"),
	);
	expect(receipt).toMatchObject({
		format: "openscreen-lesson-range-media",
		validation: "mp4-video-samples-and-full-frame-decode",
		mediaDecodedByValidator: true,
		encodedTimingVerified: true,
		output: {
			path: "range.mp4",
			frames: 45,
			nativeReportedDurationSec: 1.5,
			basis: "selected-programme-seconds",
		},
	});
	expect(JSON.stringify(receipt)).not.toContain(f.source);
	expect(receipt.sources[0].sha256).toHaveLength(64);
	expect(receipt.output.sha256).toHaveLength(64);
	expect(await fs.readFile(f.source)).toEqual(before);
	expect(f.render).toHaveBeenCalledTimes(1);
	const again = await materializeLessonRange(f.options);
	expect(again.status).toBe("materialized");
	if (again.status === "materialized") expect(again.path).not.toBe(result.path);
});
it("rejects forged or stale plans and external scene dependencies before choosing an output folder", async () => {
	const f = await fixture(),
		pick = vi.fn(async () => root);
	for (const selection of [
		{ ...f.selection, programme: { ...f.selection.programme, endSec: 3 } },
		{ ...f.selection, documentSha256: "0".repeat(64) },
	])
		await expect(prepareLessonRangeMedia(f.doc, selection)).rejects.toThrow();
	f.doc.legacyEditor = { ...f.doc.legacyEditor, wallpaper: "/private/background.png" };
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 0.5,
		endSec: 4,
	});
	await expect(prepareLessonRangeMedia(f.doc, selection)).rejects.toThrow(
		"range-media-unsupported",
	);
	expect(pick).not.toHaveBeenCalled();
	expect(f.render).not.toHaveBeenCalled();
});
it("refuses cursor sidecars without creating output, and handles explicit cancellation", async () => {
	const f = await fixture();
	expect(await materializeLessonRange({ ...f.options, pickDirectory: async () => null })).toEqual({
		status: "cancelled",
	});
	await fs.writeFile(`${f.source}.cursor.json`, "PRIVATE_CURSOR_PAYLOAD");
	await expect(materializeLessonRange(f.options)).rejects.toThrow("range-media-unsupported");
	expect(f.render).not.toHaveBeenCalled();
	expect((await fs.readdir(root)).filter((name) => name.startsWith("lesson-range-"))).toEqual([]);
});
it.each([
	"source",
	"project",
	"stats",
	"render",
])("preserves incomplete %s output without a completion receipt", async (kind) => {
	const f = await fixture();
	const render: RangeMediaRenderer = async (clips, file, scene, params) => {
		const result = await f.render(clips, file, scene, params);
		if (kind === "source") await fs.writeFile(f.source, "changed-source-bytes");
		if (kind === "project") f.doc.timeline.clips[0].sourceStartSec = 0.25;
		if (kind === "render") throw new Error("PRIVATE_NATIVE_ERROR");
		return kind === "stats" ? { ...result!, frames: 99 } : result;
	};
	let failed: unknown;
	try {
		await materializeLessonRange({ ...f.options, render });
	} catch (error) {
		failed = error;
	}
	expect(failed).toBeInstanceOf(RangeMediaError);
	const error = failed as RangeMediaError;
	expect(error.code).toBe(
		kind === "source" || kind === "project" ? "range-media-changed" : "range-media-incomplete",
	);
	expect(error.artifactPath).toBeTruthy();
	expect(error.message).not.toContain("PRIVATE");
	expect(await fs.readdir(error.artifactPath!)).toEqual(["range.mp4"]);
});

it.skipIf(process.platform === "win32")(
	"rejects a selected source symlink (POSIX guard)",
	async () => {
		const f = await fixture(),
			real = path.join(root, "real.mp4");
		await fs.rename(f.source, real);
		await fs.symlink(real, f.source);
		await expect(materializeLessonRange(f.options)).rejects.toThrow("range-media-unsupported");
		expect(f.render).not.toHaveBeenCalled();
		expect(await fs.readFile(real, "utf8")).toBe("fixture-source-bytes");
	},
);

it("normalizes missing-source filesystem errors without exposing private paths", async () => {
	const f = await fixture();
	await fs.unlink(f.source);
	await expect(materializeLessonRange(f.options)).rejects.toThrow(/^range-media-unsupported$/);
	expect(f.render).not.toHaveBeenCalled();
});

it("refuses a native-clamped clip shorter than the selected programme before destination selection", async () => {
	const f = await fixture();
	f.doc.assets[0].durationSec = 3;
	f.doc.timeline.trimRanges = [];
	f.doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 1,
		endSec: 5,
	});
	expect(selection.programme).toMatchObject({ startSec: 1, endSec: 5 });
	const pick = vi.fn(async () => root);
	const render = vi.fn<RangeMediaRenderer>(async (_clips, file) => {
		await fs.writeFile(file, "CLAMPED_MOCK_OUTPUT");
		return { frames: 60, wallS: 1, fps: 60, videoDurationS: 2 };
	});
	await expect(prepareLessonRangeMedia(f.doc, selection)).rejects.toThrow(
		"range-media-unsupported",
	);
	expect(pick).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
	expect((await fs.readdir(root)).filter((name) => name.startsWith("lesson-range-"))).toEqual([]);
});
it.each([
	NaN,
	Infinity,
	1.6,
])("refuses native-reported duration %s without writing a completion receipt", async (duration) => {
	const f = await fixture();
	let failed: unknown;
	try {
		await materializeLessonRange({
			...f.options,
			render: async (...args) => ({ ...(await f.render(...args))!, videoDurationS: duration }),
		});
	} catch (error) {
		failed = error;
	}
	expect(failed).toBeInstanceOf(RangeMediaError);
	expect((failed as RangeMediaError).code).toBe("range-media-incomplete");
	expect(await fs.readdir((failed as RangeMediaError).artifactPath!)).toEqual(["range.mp4"]);
});
it("revalidates render inputs before rendering and rejects a sidecar created during encoding", async () => {
	const f = await fixture();
	let reads = 0;
	await expect(
		materializeLessonRange({
			...f.options,
			readDocument: async () => {
				reads++;
				if (reads === 2) f.doc.timeline.clips[0].sourceStartSec = 0.25;
				return f.doc;
			},
		}),
	).rejects.toThrow("range-media-changed");
	expect(f.render).not.toHaveBeenCalled();
	// Restore only this disposable in-memory fixture, then re-plan its legitimate reference.
	f.doc.timeline.clips[0].sourceStartSec = 0;
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 0.5,
		endSec: 4,
	});
	let failed: unknown;
	try {
		await materializeLessonRange({
			...f.options,
			selection: { ...f.selection, ...selection, version: 2 },
			render: async (...args) => {
				const result = await f.render(...args);
				await fs.writeFile(`${f.source}.cursor.json`, "PRIVATE_LATE_CURSOR");
				return result;
			},
		});
	} catch (error) {
		failed = error;
	}
	expect((failed as RangeMediaError).code).toBe("range-media-incomplete");
	expect(await fs.readdir((failed as RangeMediaError).artifactPath!)).toEqual(["range.mp4"]);
});
it.skipIf(process.platform === "win32")(
	"keeps output directory, video and receipt private on POSIX",
	async () => {
		const f = await fixture(),
			result = await materializeLessonRange(f.options);
		if (result.status !== "materialized") throw new Error("Expected output");
		expect((await fs.stat(result.path)).mode & 0o777).toBe(0o700);
		for (const name of ["range.mp4", "range-export.json"])
			expect((await fs.stat(path.join(result.path, name))).mode & 0o777).toBe(0o600);
		const receipt = JSON.parse(
			await fs.readFile(path.join(result.path, "range-export.json"), "utf8"),
		);
		expect(receipt.audio).toEqual({
			policy: "native-source-or-synthesized-silence",
			streamMetadataVerified: false,
			timingVerified: false,
		});
	},
);

it.each([
	"source",
	"project",
	"output",
	"decoder",
])("withholds completion after %s changes or fails during validation", async (kind) => {
	const f = await fixture();
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file) => {
		const bytes = await fs.readFile(file);
		const { createHash } = await import("node:crypto");
		const evidence = {
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
		if (kind === "source") await fs.writeFile(f.source, "late change");
		if (kind === "project") f.doc.timeline.clips[0].sourceStartSec = 0.25;
		if (kind === "output") await fs.writeFile(file, "changed output");
		if (kind === "decoder") throw new Error("PRIVATE_DECODER_DIAGNOSTICS");
		return evidence as Awaited<ReturnType<typeof validateRangeVideo>>;
	});
	try {
		await materializeLessonRange(f.options);
		throw new Error("Unexpected receipt");
	} catch (error) {
		expect(error).toBeInstanceOf(RangeMediaError);
		const failure = error as RangeMediaError;
		expect(failure.code).toBe(
			kind === "decoder" ? "range-media-incomplete" : "range-media-changed",
		);
		expect(failure.message).not.toContain("PRIVATE");
		expect(await fs.readdir(failure.artifactPath!)).toEqual(["range.mp4"]);
	}
});
it.each([1 / 30, 120, 0.03, 120.001])("pins programme duration boundary %s", async (duration) => {
	const f = await fixture();
	f.doc.timeline.trimRanges = [];
	f.doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	f.doc.assets[0].durationSec = 121;
	f.doc.timeline.clips[0].sourceEndSec = 121;
	f.doc.timeline.clips[0].timelineEndSec = 121;
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 0,
		endSec: duration,
	});
	if (duration === 1 / 30 || duration === 120)
		expect((await prepareLessonRangeMedia(f.doc, selection)).expectedFrames).toBe(
			Math.round(duration * 30),
		);
	else
		await expect(prepareLessonRangeMedia(f.doc, selection)).rejects.toThrow(
			"range-media-unsupported",
		);
});

async function manySources(count: number) {
	const f = await fixture();
	f.doc.timeline.trimRanges = [];
	f.doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	const asset = f.doc.assets[0],
		clip = f.doc.timeline.clips[0];
	f.doc.assets = [];
	f.doc.timeline.clips = [];
	const sources: string[] = [];
	for (let i = 0; i < count; i++) {
		const source = path.join(root, `source-${i}.mp4`);
		sources.push(source);
		await fs.writeFile(source, "bounded source fixture");
		f.doc.assets.push({ ...asset, id: `a${i}`, originalPath: source, durationSec: 1 });
		f.doc.timeline.clips.push({
			...clip,
			id: `c${i}`,
			assetId: `a${i}`,
			sourceEndSec: 1,
			timelineStartSec: i,
			timelineEndSec: i + 1,
		});
	}
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 0,
		endSec: count,
	});
	const render = vi.fn<RangeMediaRenderer>(async (_clips, file) => {
		await fs.writeFile(file, "bounded output fixture");
		return { frames: count * 30, wallS: 1, fps: count * 30, videoDurationS: count };
	});
	return { ...f, sources, options: { ...f.options, selection, render } };
}
it.each([8, 9])("pins the independent %s-source materialization boundary", async (count) => {
	const f = await manySources(count);
	if (count === 8) {
		const selection = await captureLessonSourceIdentity({
			selection: f.options.selection,
			intent: "author-current",
			readDocument: f.options.readDocument,
		});
		expect((await materializeLessonRange({ ...f.options, selection })).status).toBe("materialized");
	} else {
		await expect(
			captureLessonSourceIdentity({
				selection: f.options.selection,
				intent: "author-current",
				readDocument: f.options.readDocument,
			}),
		).rejects.toThrow("range-media-unsupported");
		expect(f.options.render).not.toHaveBeenCalled();
		expect((await fs.readdir(root)).some((name) => name.startsWith("lesson-range-"))).toBe(false);
	}
});
it.each([
	32, 33,
])("pins the early %s-kept-span boundary independently of the later native-clip limit", async (count) => {
	const f = await fixture(),
		end = count * 2 - 1;
	f.doc.assets[0].durationSec = end;
	f.doc.timeline.clips[0].sourceEndSec = end;
	f.doc.timeline.clips[0].timelineEndSec = end;
	f.doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	f.doc.timeline.trimRanges = Array.from({ length: count - 1 }, (_, i) => ({
		id: `cut${i}`,
		assetId: "a",
		clipId: "c",
		startSec: i * 2 + 1,
		endSec: i * 2 + 2,
		origin: "user",
		reason: "fixture",
	}));
	const selection = await planLessonRange(f.doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(f.doc),
		startSec: 0,
		endSec: end,
	});
	expect(selection.keptSpans).toHaveLength(count);
	const builder = vi.spyOn(nativeScene, "buildNativeClipList");
	if (count === 32)
		expect((await prepareLessonRangeMedia(f.doc, selection)).clips).toHaveLength(32);
	else {
		await expect(prepareLessonRangeMedia(f.doc, selection)).rejects.toThrow(
			"range-media-unsupported",
		);
		// Replanning fingerprints read original inputs. No derived/native projection
		// may happen after the independent kept-span refusal.
		expect(builder.mock.calls.every(([doc]) => doc === f.doc)).toBe(true);
	}
});
