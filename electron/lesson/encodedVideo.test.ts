import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inspectDecodedFrames, inspectRangeVideo, validateRangeVideo } from "./encodedVideo";

const mocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	resolve: vi.fn<() => string | null>(() => "/trusted/ffmpeg"),
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../media/audioPeaks", () => ({ resolveFfmpeg: mocks.resolve }));
const expected = { width: 64, height: 32, fps: 30, frames: 2 };
function u32(...values: number[]) {
	const b = Buffer.alloc(values.length * 4);
	values.forEach((value, i) => b.writeUInt32BE(value, i * 4));
	return b;
}
function box(type: string, ...data: Buffer[]) {
	const body = Buffer.concat(data);
	return Buffer.concat([u32(body.length + 8), Buffer.from(type), body]);
}
/** Small structural fixture, deliberately not a decodable H.264 bitstream. */
function mp4(
	options: {
		delta?: number;
		handler?: string;
		offset?: number;
		count?: number;
		edits?: number;
	} = {},
) {
	const header = Buffer.alloc(78);
	header.writeUInt16BE(1, 6);
	header.writeUInt16BE(64, 24);
	header.writeUInt16BE(32, 26);
	const stbl = box(
		"stbl",
		box("stsd", u32(0, 1), box("avc1", header, box("avcC", Buffer.from([1])))),
		box("stts", u32(0, 1, 2, options.delta ?? 512)),
		box("stsz", u32(0, 1, options.count ?? 2)),
		box("stco", u32(0, 1, options.offset ?? 24)),
		box("stsc", u32(0, 1, 1, 2, 1)),
	);
	const mdia = box(
		"mdia",
		box("mdhd", u32(0, 0, 0, 15360, 1024, 0)),
		box("hdlr", u32(0, 0), Buffer.from(options.handler ?? "vide")),
		box("minf", box("dinf", box("dref", u32(0, 1), box("url ", u32(1)))), stbl),
	);
	const trackHeader = Buffer.alloc(84);
	trackHeader.writeUInt32BE(3, 0);
	trackHeader.writeUInt32BE(67, 20);
	[65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824].forEach((n, i) =>
		trackHeader.writeUInt32BE(n, 40 + i * 4),
	);
	trackHeader.writeUInt32BE(64 * 65536, 76);
	trackHeader.writeUInt32BE(32 * 65536, 80);
	return Buffer.concat([
		box("ftyp", Buffer.from("isom0000")),
		box("mdat", Buffer.from([1, 2])),
		box(
			"moov",
			box("mvhd", u32(0, 0, 0, 1000, 67)),
			box(
				"trak",
				box("tkhd", trackHeader),
				mdia,
				box("edts", box("elst", u32(0, 1, options.edits ?? 67, 0, 0x10000))),
			),
		),
	]);
}
function listing(frames = 2) {
	return `#format: frame checksums\n#tb 0: 1/30\n#dimensions 0: 64x32\n${Array.from({ length: frames }, (_, i) => `0, ${i}, ${i}, 1, 3072, ${"a".repeat(32)}`).join("\n")}\n`;
}
let root: string, file: string;
beforeEach(async () => {
	vi.clearAllMocks();
	mocks.resolve.mockReturnValue("/trusted/ffmpeg");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "encoded-video-"));
	file = path.join(root, "video.mp4");
	await fs.writeFile(file, mp4());
});
afterEach(async () => {
	vi.useRealTimers();
	await fs.rm(root, { recursive: true, force: true });
});
it("separates stored sample timing from decoded frame evidence", () => {
	expect(inspectRangeVideo(mp4(), expected)).toMatchObject({ sampleCount: 2, durationTicks: 1024 });
	expect(inspectDecodedFrames(listing(), expected)).toMatchObject({
		frames: 2,
		pixelFormat: "yuv420p",
	});
});
it.each([
	["zero final sample timing", { delta: 0 }],
	["wrong sample duration", { delta: 511 }],
	["audio only", { handler: "soun" }],
	["unknown stream", { handler: "text" }],
	["sample count", { count: 1 }],
	["outside mdat", { offset: 9999 }],
	["short edit", { edits: 33 }],
])("refuses %s container evidence", (_name, options) => {
	expect(() => inspectRangeVideo(mp4(options), expected)).toThrow();
});
it.each([0, 1, 7, 25, 150])("refuses truncation at %s", (length) => {
	expect(() => inspectRangeVideo(mp4().subarray(0, length), expected)).toThrow();
});
it("refuses malformed boxes, fragments, duplicate video and unsafe expectation bounds", () => {
	const bytes = mp4();
	bytes.writeUInt32BE(0, 0);
	for (const input of [
		bytes,
		Buffer.concat([mp4(), box("moof")]),
		Buffer.concat([mp4(), box("moov")]),
	])
		expect(() => inspectRangeVideo(input, expected)).toThrow();
	for (const patch of [
		{ frames: 0 },
		{ frames: 3601 },
		{ width: 1282 },
		{ height: 3 },
		{ fps: 0 },
		{ fps: 61 },
	])
		expect(() => inspectRangeVideo(mp4(), { ...expected, ...patch })).toThrow();
});
it.each([
	listing(1),
	listing(3),
	listing().replace("64x32", "32x64"),
	listing().replace("1/30", "1/29"),
	listing().replace("0, 1, 1, 1", "0, 0, 0, 1"),
	listing().replace("3072", "1"),
	listing().replace("0, 0, 0, 1", "0, 0, 0, 0"),
	"",
])("refuses incomplete or mistimed decoded evidence %#", (output) => {
	expect(() => inspectDecodedFrames(output, expected)).toThrow();
});
function child(mode = "success") {
	const proc = Object.assign(new EventEmitter(), {
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: vi.fn(() => {
			queueMicrotask(() => proc.emit("close", null));
			return true;
		}),
	});
	mocks.spawn.mockImplementation(() => {
		queueMicrotask(() => {
			if (mode === "hang") return;
			if (mode === "spawn") {
				proc.emit("error", new Error("PRIVATE"));
				return;
			}
			proc.stdout.write(mode === "stdout" ? "x".repeat(1024 * 1024 + 1) : listing());
			if (mode === "stderr") proc.stderr.write("PRIVATE".repeat(12000));
			if (mode === "warning") proc.stderr.write("PRIVATE");
			proc.emit("close", mode === "exit" ? 1 : 0);
		});
		return proc;
	});
	return proc;
}
it.skipIf(process.platform !== "linux")(
	"pins a local descriptor, shell-free arguments, bounded decode and honest evidence",
	async () => {
		child();
		expect(await validateRangeVideo(file, expected)).toMatchObject({
			samples: { sampleCount: 2 },
			decoded: { frames: 2 },
		});
		const [exe, args, options] = mocks.spawn.mock.calls[0];
		expect(exe).toBe("/trusted/ffmpeg");
		expect(args).toContain("/proc/self/fd/3");
		expect(args).not.toContain(file);
		expect(options.shell).toBeUndefined();
		expect(options.stdio[3]).toEqual(expect.any(Number));
		expect(args).toEqual(
			expect.arrayContaining(["-xerror", "-fps_mode", "passthrough", "-frames:v", "3"]),
		);
	},
);
it.skipIf(process.platform !== "linux").each(["spawn", "exit", "stdout", "stderr", "warning"])(
	"fails closed on process %s without leaking diagnostics",
	async (mode) => {
		child(mode);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			"range-video-validation-failed",
		);
	},
);
it.skipIf(process.platform !== "linux")(
	"kills a wedged decoder on the bounded deadline",
	async () => {
		vi.useFakeTimers();
		const proc = child("hang");
		const promise = validateRangeVideo(file, expected);
		const rejected = expect(promise).rejects.toThrow("range-video-validation-failed");
		// Let actual file IO reach spawn before advancing the process deadline.
		await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
		await vi.advanceTimersByTimeAsync(30_000);
		await rejected;
		expect(proc.kill).toHaveBeenCalledWith("SIGKILL");
	},
);
it.skipIf(process.platform !== "linux")(
	"refuses missing tools, nonregular/oversized files and malformed bytes before decode",
	async () => {
		mocks.resolve.mockReturnValue(null);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow();
		mocks.resolve.mockReturnValue("/trusted/ffmpeg");
		await fs.writeFile(file, "invalid");
		await expect(validateRangeVideo(file, expected)).rejects.toThrow();
		await fs.truncate(file, 128 * 1024 * 1024 + 1);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow();
		await fs.unlink(file);
		await fs.symlink(root, file);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow();
		expect(mocks.spawn).not.toHaveBeenCalled();
	},
);
it.skipIf(process.platform !== "linux")("rejects pathname replacement during decode", async () => {
	// Replace the path after opening but before the spawned child closes.
	mocks.spawn.mockImplementation(() => {
		const proc = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
		});
		void (async () => {
			await fs.rename(file, `${file}.old`);
			await fs.writeFile(file, mp4());
			proc.stdout.write(listing());
			proc.emit("close", 0);
		})();
		return proc;
	});
	await expect(validateRangeVideo(file, expected)).rejects.toThrow("range-video-validation-failed");
});

it.each([
	"tkhd-duration",
	"rotation",
	"external-reference",
	"composition-offsets",
	"codec",
	"huge-runs",
])("rejects unsupported %s metadata", (kind) => {
	const bytes = mp4();
	if (kind === "tkhd-duration") bytes.writeUInt32BE(33, bytes.indexOf(Buffer.from("tkhd")) + 24);
	if (kind === "rotation") bytes.writeUInt32BE(1, bytes.indexOf(Buffer.from("tkhd")) + 44);
	if (kind === "external-reference") bytes.writeUInt32BE(0, bytes.indexOf(Buffer.from("url ")) + 4);
	if (kind === "composition-offsets")
		bytes.write("ctts", bytes.indexOf(Buffer.from("stco")), "ascii");
	if (kind === "codec") bytes.write("mp4a", bytes.indexOf(Buffer.from("avc1")), "ascii");
	if (kind === "huge-runs") bytes.writeUInt32BE(0xffffffff, bytes.indexOf(Buffer.from("stts")) + 8);
	expect(() => inspectRangeVideo(bytes, expected)).toThrow();
});

it("bounds box traversal and rejects coarsely rounded movie edits", () => {
	const bytes = mp4();
	bytes.writeUInt32BE(1, bytes.indexOf(Buffer.from("mvhd")) + 16);
	expect(() => inspectRangeVideo(bytes, expected)).toThrow();
	const excessive = Buffer.concat([mp4(), ...Array.from({ length: 4096 }, () => box("free"))]);
	expect(() => inspectRangeVideo(excessive, expected)).toThrow();
});
