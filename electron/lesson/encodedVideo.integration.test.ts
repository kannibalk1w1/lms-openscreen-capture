import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { resolveFfmpeg } from "../media/audioPeaks";
import { inspectDecodedFrames, inspectRangeVideo, validateRangeVideo } from "./encodedVideo";
import { materializeLessonRange, RangeMediaError } from "./rangeMedia";
import { planLessonRange } from "./rangePlan";
import { captureLessonSourceIdentity } from "./sourceIdentity";

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
it.skipIf(!supported).each([
	["truncated", "container parser"],
	["shortened", "container parser"],
	["dimensions", "container parser"],
	["corrupt-bitstream", "real decoder"],
	["zero-timing", "container parser"],
])("%s output is refused by the %s", async (kind, stage) => {
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
	if (stage === "container parser") expect(() => inspectRangeVideo(bytes, wanted)).toThrow();
	else expect(inspectRangeVideo(bytes, wanted).sampleCount).toBe(2);
	const file = path.join(root, "bad.mp4");
	await fs.writeFile(file, bytes);
	await expect(validateRangeVideo(file, wanted)).rejects.toThrow();
});
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
	const reference = await planLessonRange(doc, {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(doc),
		startSec: 0,
		endSec: 2 / 30,
	});
	const selection = await captureLessonSourceIdentity({
		selection: reference,
		intent: "author-current",
		readDocument: async () => doc,
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

it.skipIf(!supported)(
	"real decoded listings accept a zero-last-sample file: only stored sample timing proves the duration",
	async () => {
		const bad = fileURLToPath(new URL("./__fixtures__/range-video-zero-last.mp4", import.meta.url));
		const bytes = await fs.readFile(bad);
		// Expected mdhd/tkhd/edit metadata is intact; only stts has a zero last delta.
		expect(bytes.readUInt32BE(bytes.indexOf(Buffer.from("mdhd")) + 20)).toBe(1024);
		expect(() => inspectRangeVideo(bytes, expected)).toThrow();
		const { stdout, stderr } = await promisify(execFile)(
			resolveFfmpeg()!,
			[
				"-nostdin",
				"-hide_banner",
				"-v",
				"error",
				"-xerror",
				"-threads",
				"1",
				"-protocol_whitelist",
				"file",
				"-enable_drefs",
				"0",
				"-i",
				bad,
				"-map",
				"0:v:0",
				"-an",
				"-sn",
				"-dn",
				"-threads",
				"1",
				"-fps_mode",
				"passthrough",
				"-frames:v",
				"3",
				"-pix_fmt",
				"yuv420p",
				"-f",
				"framemd5",
				"pipe:1",
			],
			{ timeout: 5000, killSignal: "SIGKILL", maxBuffer: 65536, encoding: "utf8" },
		);
		expect(stderr).toBe("");
		expect(inspectDecodedFrames(stdout, expected).frames).toBe(2);
		await expect(validateRangeVideo(bad, expected)).rejects.toThrow();
	},
);
it.skipIf(!supported)(
	"runtime receipts identify the real decoder without exporting its local path",
	async () => {
		const proof = await validateRangeVideo(fixture, expected);
		expect(proof.decoded.decoder.sha256).toBe(
			createHash("sha256")
				.update(await fs.readFile(await fs.realpath(resolveFfmpeg()!)))
				.digest("hex"),
		);
		expect(proof.decoded.decoder.version).toMatch(/^[A-Za-z0-9][A-Za-z0-9._+~:-]*$/);
		expect(JSON.stringify(proof)).not.toContain(resolveFfmpeg());
	},
);
