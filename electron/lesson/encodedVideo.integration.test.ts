import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { resolveFfmpeg } from "../media/audioPeaks";
import { validateRangeVideo } from "./encodedVideo";
import { materializeLessonRange, RangeMediaError } from "./rangeMedia";
import { planLessonRange } from "./rangePlan";

const fixture = fileURLToPath(new URL("./__fixtures__/range-video.mp4", import.meta.url));
const supported = process.platform === "linux" && !!resolveFfmpeg();
const expected = { width: 64, height: 32, fps: 30, frames: 2 };
let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-decode-"));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
it.skipIf(!supported)(
	"fully decodes the retained synthetic H.264 fixture with the runtime FFmpeg resolver",
	async () => {
		const proof = await validateRangeVideo(fixture, expected);
		expect(proof).toMatchObject({
			samples: { sampleCount: 2, sampleDurationTicks: 512, durationTicks: 1024 },
			decoded: { frames: 2 },
		});
	},
);
it
	.skipIf(!supported)
	.each(["truncated", "shortened", "dimensions", "corrupt-bitstream", "zero-timing"])(
	"runtime decoder refuses %s output",
	async (kind) => {
		let bytes = await fs.readFile(fixture);
		const wanted = { ...expected };
		if (kind === "truncated") bytes = bytes.subarray(0, bytes.length - 10);
		if (kind === "shortened") wanted.frames = 3;
		if (kind === "dimensions") wanted.width = 128;
		if (kind === "zero-timing") bytes.writeUInt32BE(0, bytes.indexOf(Buffer.from("stts")) + 16);
		if (kind === "corrupt-bitstream") {
			const start = bytes.indexOf(Buffer.from("mdat"));
			const size = bytes.readUInt32BE(start - 4);
			bytes.fill(0, start + 4, start - 4 + size);
		}
		const file = path.join(root, "bad.mp4");
		await fs.writeFile(file, bytes);
		await expect(validateRangeVideo(file, wanted)).rejects.toThrow();
	},
);
async function options(invalid = false) {
	const doc = createEmptyDocument({ projectId: "p", title: "Synthetic runtime proof" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Fixture",
			originalPath: fixture,
			cameraTrack: null,
			durationSec: 2 / 30,
			video: { codec: "h264", fps: 30, width: 64, height: 32 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 2 / 30,
			timelineStartSec: 0,
			timelineEndSec: 2 / 30,
			origin: "user",
			reason: "fixture",
			wordRefs: [],
		},
	];
	doc.legacyEditor = { aspectRatio: "2:1", wallpaper: "#ffffff" };
	const selection = await planLessonRange(doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(doc),
		startSec: 0,
		endSec: 2 / 30,
	});
	return {
		selection,
		readDocument: async () => doc,
		pickDirectory: async () => root,
		render: async (_clips: unknown, file: string) => {
			if (invalid) await fs.writeFile(file, "native stats cannot certify these bytes");
			else await fs.copyFile(fixture, file);
			return { frames: 2, wallS: 1, fps: 2, videoDurationS: 2 / 30 };
		},
	};
}
it.skipIf(!supported)(
	"production materialization requires sample AND decoded evidence before emitting a receipt",
	async () => {
		const result = await materializeLessonRange(await options());
		if (result.status !== "materialized") throw new Error("Missing output");
		const receipt = JSON.parse(
			await fs.readFile(path.join(result.path, "range-export.json"), "utf8"),
		);
		expect(receipt).toMatchObject({
			encodedTimingVerified: true,
			mediaDecodedByValidator: true,
			videoEvidence: { samples: { sampleCount: 2 }, decoded: { frames: 2 } },
			audio: { streamMetadataVerified: false, timingVerified: false },
		});
	},
);
it.skipIf(!supported)(
	"production materialization preserves bad output without a completion receipt despite correct native stats",
	async () => {
		try {
			await materializeLessonRange(await options(true));
			throw new Error("Unexpected receipt");
		} catch (error) {
			expect(error).toBeInstanceOf(RangeMediaError);
			const failure = error as RangeMediaError;
			expect(failure.code).toBe("range-media-incomplete");
			expect(await fs.readdir(failure.artifactPath!)).toEqual(["range.mp4"]);
		}
	},
);
