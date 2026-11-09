import { createHash } from "node:crypto";
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
): Buffer {
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
let root: string, file: string, executable: string;
beforeEach(async () => {
	vi.clearAllMocks();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "encoded-video-"));
	executable = path.join(root, "ffmpeg");
	await fs.writeFile(executable, "synthetic-decoder-identity");
	mocks.resolve.mockReturnValue(executable);
	file = path.join(root, "video.mp4");
	await fs.writeFile(file, mp4());
});
afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
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
it("refuses malformed boxes, fragments, duplicate moov and unsafe expectation bounds", () => {
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
])("refuses incomplete or inconsistent decoded output grid %#", (output) => {
	expect(() => inspectDecodedFrames(output, expected)).toThrow();
});
function processStub() {
	const proc = Object.assign(new EventEmitter(), {
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: vi.fn(() => {
			queueMicrotask(() => proc.emit("close", null));
			return true;
		}),
	});
	return proc;
}
const versionListing =
	"ffmpeg version test-1 Copyright FFmpeg developers\nconfiguration: /private/build/path\n";
function child(mode = "success", versionMode = "success", onDecode?: () => Promise<void>) {
	const processes: ReturnType<typeof processStub>[] = [];
	mocks.spawn.mockImplementation((_exe: string, args: string[]) => {
		const proc = processStub();
		processes.push(proc);
		const isVersion = args.includes("-version"),
			active = isVersion ? versionMode : mode;
		void (async () => {
			if (active === "hang") return;
			if (active === "spawn") {
				queueMicrotask(() => proc.emit("error", new Error("PRIVATE")));
				return;
			}
			if (!isVersion) await onDecode?.();
			else await Promise.resolve();
			const output = isVersion ? versionListing : listing();
			proc.stdout.write(active === "malformed" ? "not-ffmpeg PRIVATE" : output);
			if (active === "stdout") proc.stdout.write("#".repeat(1024 * 1024 + 1));
			if (active === "stderr") proc.stderr.write("PRIVATE".repeat(12000));
			if (active === "warning") proc.stderr.write("PRIVATE");
			proc.emit("close", active === "exit" ? 1 : 0);
		})();
		return proc;
	});
	return processes;
}
it.skipIf(process.platform !== "linux")(
	"pins a local descriptor, shell-free arguments, bounded decode and honest evidence",
	async () => {
		child();
		expect(await validateRangeVideo(file, expected)).toMatchObject({
			samples: { sampleCount: 2 },
			decoded: { frames: 2 },
		});
		const [exe, args, options] = mocks.spawn.mock.calls[1];
		expect(exe).toBe(executable);
		expect(mocks.spawn.mock.calls[0]).toEqual([
			executable,
			["-version"],
			{ stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
		]);
		expect(args).toContain("/proc/self/fd/3");
		expect(args).not.toContain(file);
		expect(options.shell).toBeUndefined();
		expect(options.stdio[3]).toEqual(expect.any(Number));
		expect(args).toEqual([
			"-nostdin",
			"-hide_banner",
			"-v",
			"error",
			"-xerror",
			"-max_alloc",
			"67108864",
			"-threads",
			"1",
			"-filter_threads",
			"1",
			"-max_pixels",
			"1638400",
			"-hwaccel",
			"none",
			"-protocol_whitelist",
			"file",
			"-probesize",
			"4194304",
			"-analyzeduration",
			"5000000",
			"-err_detect",
			"explode",
			"-enable_drefs",
			"0",
			"-use_absolute_path",
			"0",
			"-f",
			"mov",
			"-i",
			"/proc/self/fd/3",
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
		]);
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
		const processes = child("hang");
		const promise = validateRangeVideo(file, expected);
		const rejected = expect(promise).rejects.toThrow("range-video-validation-failed");
		// Let actual file IO reach spawn before advancing the process deadline.
		await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(2));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(processes[1].kill).toHaveBeenCalledWith("SIGKILL");
		await rejected;
	},
);
it.skipIf(process.platform !== "linux")(
	"refuses missing tools, nonregular/oversized files and malformed bytes before decode",
	async () => {
		mocks.resolve.mockReturnValue(null);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		mocks.resolve.mockReturnValue(executable);
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
	// Rename changes the old inode's ctime too. Mask that redundant signal only
	// in the stat view, to independently pin the named-inode guard.
	await maskFinalMediaStat("ctimeMs");
	child("success", "success", async () => {
		await fs.rename(file, `${file}.old`);
		await fs.writeFile(file, mp4());
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

// Model a filesystem stat view where one timestamp signal is unavailable/coarse.
// Actual disposable files are rewritten/renamed; no utimes or clock manipulation.
async function maskFinalMediaStat(field: "mtimeMs" | "ctimeMs") {
	const open = fs.open.bind(fs);
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await open(...args);
		if (args[0] === file) {
			const stat = handle.stat.bind(handle);
			let original: number | undefined;
			vi.spyOn(handle, "stat").mockImplementation(async () => {
				const value = await stat();
				if (original === undefined) original = value[field];
				else value[field] = original;
				return value;
			});
		}
		return handle;
	});
}
it.skipIf(process.platform !== "linux")(
	"pins ctime independently on an actual same-inode same-size rewrite with a controlled coarse-mtime stat view",
	async () => {
		await maskFinalMediaStat("mtimeMs");
		const before = await fs.stat(file);
		child("success", "success", async () => {
			// The awaited work between initial fstat and this write normally suffices;
			// retry a bounded number of same-byte writes if the filesystem clock is coarse.
			for (let i = 0; i < 10; i++) {
				await fs.writeFile(file, mp4());
				if ((await fs.stat(file)).ctimeMs !== before.ctimeMs) break;
			}
			const after = await fs.stat(file);
			expect(after.ino).toBe(before.ino);
			expect(after.size).toBe(before.size);
			expect(after.ctimeMs).not.toBe(before.ctimeMs);
		});
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			"range-video-validation-failed",
		);
	},
);
it.skipIf(process.platform !== "linux")(
	"observes SIGKILL at the stdout cap even when excess output is ignorable comments",
	async () => {
		const processes = child("stdout");
		await expect(validateRangeVideo(file, expected)).rejects.toThrow();
		expect(processes[1].kill).toHaveBeenCalledWith("SIGKILL");
	},
);
it.each([
	"win32",
	"darwin",
])("refuses the %s platform before file or tool access", async (platform) => {
	const lstat = vi.spyOn(fs, "lstat");
	vi.stubGlobal("process", { ...process, platform });
	await expect(validateRangeVideo(file, expected)).rejects.toThrow("range-video-validation-failed");
	expect(lstat).not.toHaveBeenCalled();
	expect(mocks.resolve).not.toHaveBeenCalled();
	expect(mocks.spawn).not.toHaveBeenCalled();
});
it.skipIf(process.platform !== "linux")(
	"records path-free decoder SHA256 and a bounded self-reported version token",
	async () => {
		child();
		const proof = await validateRangeVideo(file, expected);
		expect(proof.decoded.decoder).toEqual({
			sha256: createHash("sha256").update("synthetic-decoder-identity").digest("hex"),
			version: "test-1",
			trust: "same-user-local-executable",
		});
		expect(JSON.stringify(proof)).not.toContain(root);
		expect(JSON.stringify(proof)).not.toContain("/private/build/path");
	},
);
it
	.skipIf(process.platform !== "linux")
	.each(["spawn", "exit", "stdout", "stderr", "warning", "malformed"])(
	"refuses provenance %s with a fixed error",
	async (mode) => {
		const processes = child("success", mode);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
		if (mode === "stdout" || mode === "stderr")
			expect(processes[0].kill).toHaveBeenCalledWith("SIGKILL");
	},
);
it.skipIf(process.platform !== "linux")(
	"kills version probing at three seconds before decode",
	async () => {
		vi.useFakeTimers();
		const processes = child("success", "hang");
		const rejected = expect(validateRangeVideo(file, expected)).rejects.toThrow();
		await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
		await vi.advanceTimersByTimeAsync(3000);
		expect(processes[0].kill).toHaveBeenCalledWith("SIGKILL");
		await rejected;
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
	},
);
it.skipIf(process.platform !== "linux")(
	"refuses decoder replacement during the proof",
	async () => {
		child("success", "success", async () => {
			await fs.writeFile(executable, "substitute-decoder-identity");
		});
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-validation-failed$/,
		);
	},
);

// Rebuild enclosing box sizes when adding/removing a sibling. Existing valid
// stco/stts and unrelated fields stay intact, so refusals isolate one guard.
function editPayload(bytes: Buffer, route: string[], edit: (payload: Buffer) => Buffer): Buffer {
	const parts: Buffer[] = [];
	for (let at = 0; at < bytes.length; ) {
		const size = bytes.readUInt32BE(at),
			type = bytes.toString("ascii", at + 4, at + 8);
		const data = bytes.subarray(at + 8, at + size);
		parts.push(
			type === route[0]
				? box(type, route.length === 1 ? edit(data) : editPayload(data, route.slice(1), edit))
				: bytes.subarray(at, at + size),
		);
		at += size;
	}
	return Buffer.concat(parts);
}
const tableRoute = ["moov", "trak", "mdia", "minf", "stbl"];
function twoChunks(secondOffset = 25) {
	let bytes = editPayload(mp4(), [...tableRoute, "stco"], () => u32(0, 2, 24, secondOffset));
	bytes = editPayload(bytes, [...tableRoute, "stsc"], () => u32(0, 1, 1, 1, 1));
	return bytes;
}
it("accepts a valid two-chunk control before rejecting only overlapping chunk offsets", () => {
	expect(inspectRangeVideo(twoChunks(), expected).sampleCount).toBe(2);
	expect(() => inspectRangeVideo(twoChunks(24), expected)).toThrow();
});
it.each([
	"ctts-sibling",
	"mvex",
	"duplicate-video",
	"third-track",
	"zero-size",
	"first-chunk",
	"sample-description",
])("isolates the %s structural guard", (kind) => {
	let bytes = mp4();
	if (kind === "ctts-sibling")
		bytes = editPayload(bytes, tableRoute, (p) => Buffer.concat([p, box("ctts", u32(0, 1, 2, 0))]));
	if (kind === "mvex") bytes = editPayload(bytes, ["moov"], (p) => Buffer.concat([p, box("mvex")]));
	if (kind === "zero-size")
		bytes = editPayload(bytes, [...tableRoute, "stsz"], () => u32(0, 0, 2, 0, 1));
	if (kind === "first-chunk")
		bytes = editPayload(twoChunks(), [...tableRoute, "stsc"], () => u32(0, 1, 2, 1, 1));
	if (kind === "sample-description")
		bytes = editPayload(bytes, [...tableRoute, "stsc"], () => u32(0, 1, 1, 2, 2));
	if (kind === "duplicate-video" || kind === "third-track") {
		let track: Buffer = Buffer.alloc(0);
		editPayload(bytes, ["moov", "trak"], (p) => {
			track = box("trak", p);
			return p;
		});
		if (kind === "third-track") {
			const audio = Buffer.from(track);
			audio.write("soun", audio.indexOf(Buffer.from("vide")), "ascii");
			const oneAudio = editPayload(bytes, ["moov"], (p) => Buffer.concat([p, audio]));
			expect(inspectRangeVideo(oneAudio, expected).sampleCount).toBe(2);
			bytes = editPayload(oneAudio, ["moov"], (p) => Buffer.concat([p, audio]));
		} else bytes = editPayload(bytes, ["moov"], (p) => Buffer.concat([p, track]));
	}
	expect(() => inspectRangeVideo(bytes, expected)).toThrow();
});
it.each([
	["media-time", "elst", 16, 1, 4],
	["edit-rate", "elst", 20, 0x20000, 4],
	["mdhd-duration", "mdhd", 20, 1025, 4],
	["tkhd-width", "tkhd", 80, 65 * 65536, 4],
	["tkhd-height", "tkhd", 84, 33 * 65536, 4],
	["avc1-width", "avc1", 28, 65, 2],
	["avc1-height", "avc1", 30, 33, 2],
] as const)("changes only %s while the expected dimensions and other timing fields stay valid", (_name, type, offset, value, width) => {
	const bytes = mp4(),
		at = bytes.indexOf(Buffer.from(type)) + offset;
	if (width === 2) bytes.writeUInt16BE(value, at);
	else bytes.writeUInt32BE(value, at);
	expect(() => inspectRangeVideo(bytes, expected)).toThrow();
});
it.each([
	listing().replace("0, 1, 1, 1", "0, 0, 1, 1"), // DTS only
	listing().replace("0, 1, 1, 1", "0, 1, 0, 1"), // PTS only
	listing().replace("#tb 0: 1/30", "#tb 0: 1/30\n#tb 0: 1/30"),
])("isolates rounded decoded output-grid field refusal %#", (output) => {
	expect(() => inspectDecodedFrames(output, expected)).toThrow();
});

it.skipIf(process.platform !== "linux").each(["empty", "oversized", "directory"])(
	"refuses a %s decoder identity before spawning",
	async (kind) => {
		child();
		if (kind === "empty") await fs.truncate(executable, 0);
		if (kind === "oversized") await fs.truncate(executable, 256 * 1024 * 1024 + 1);
		if (kind === "directory") mocks.resolve.mockReturnValue(root);
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		expect(mocks.spawn).not.toHaveBeenCalled();
	},
);

it.skipIf(process.platform !== "linux")(
	"hashes the canonical target of a symlinked decoder",
	async () => {
		const link = path.join(root, "decoder-link");
		await fs.symlink(executable, link);
		mocks.resolve.mockReturnValue(link);
		child();
		const result = await validateRangeVideo(file, expected);
		expect(result.decoded.decoder.sha256).toBe(
			createHash("sha256")
				.update(await fs.readFile(executable))
				.digest("hex"),
		);
		expect(mocks.spawn.mock.calls.every(([target]) => target === executable)).toBe(true);
	},
);
it
	.skipIf(process.platform !== "linux")
	.each(["/private/local/tool", "release/private/local/tool", "C:\\private\\tool"])(
	"excludes a path-like version token %s from portable evidence",
	async (version) => {
		mocks.spawn.mockImplementation(() => {
			const proc = processStub();
			queueMicrotask(() => {
				proc.stdout.write(`ffmpeg version ${version} Copyright\n`);
				proc.emit("close", 0);
			});
			return proc;
		});
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
	},
);
// Isolate each hash-file guard from the later two-pass comparison. The stat
// views model a concurrent replacement/size change without editing timestamps.
it
	.skipIf(process.platform !== "linux")
	.each(["short-read", "named-inode", "after-size", "oversized-before-read"])(
	"independently pins executable %s accounting before any process",
	async (kind) => {
		const open = fs.open.bind(fs),
			lstat = fs.lstat.bind(fs);
		const executableReads = vi.fn();
		if (kind === "named-inode")
			vi.spyOn(fs, "lstat").mockImplementation(async (...args) => {
				const value = await lstat(...args);
				if (args[0] === executable)
					value.ino = typeof value.ino === "bigint" ? value.ino + 1n : value.ino + 1;
				return value;
			});
		vi.spyOn(fs, "open").mockImplementation(async (...args) => {
			const handle = await open(...args);
			if (args[0] === executable) {
				const stat = handle.stat.bind(handle),
					read = handle.read.bind(handle);
				let stats = 0;
				vi.spyOn(handle, "stat").mockImplementation(async () => {
					const value = await stat();
					stats++;
					if (kind === "short-read") value.size += 1;
					if (kind === "after-size" && stats === 2) value.size += 1;
					if (kind === "oversized-before-read") value.size = 256 * 1024 * 1024 + 1;
					return value;
				});
				vi.spyOn(handle, "read").mockImplementation(async (...readArgs) => {
					executableReads();
					if (kind === "oversized-before-read")
						throw new Error("Oversized executable must be refused before reading");
					return read(...readArgs);
				});
			}
			return handle;
		});
		child();
		await expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		expect(mocks.spawn).not.toHaveBeenCalled();
		if (kind === "oversized-before-read") expect(executableReads).not.toHaveBeenCalled();
	},
);
it.skipIf(process.platform !== "linux")(
	"fails and destroys owned pipes without waiting for close, even when direct-child kill throws",
	async () => {
		vi.useFakeTimers();
		const processes = child("success", "hang");
		let outcome = "pending";
		let reason: unknown;
		const result = validateRangeVideo(file, expected).then(
			() => {
				outcome = "resolved";
			},
			(error) => {
				outcome = "rejected";
				reason = error;
			},
		);
		await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
		processes[0].kill.mockImplementation(() => {
			throw new Error("PRIVATE_KILL_FAILURE");
		});
		await vi.advanceTimersByTimeAsync(3000);
		expect(processes[0].stdout.destroyed).toBe(true);
		expect(processes[0].stderr.destroyed).toBe(true);
		// Public validation also awaits closing its owned input descriptor.
		await vi.waitFor(() => expect(outcome).toBe("rejected"), { timeout: 500, interval: 20 });
		expect(reason).toBeInstanceOf(Error);
		expect((reason as Error).message).toBe("range-video-tool-unavailable");
		await result;
	},
);
it.skipIf(process.platform !== "linux")(
	"waits for successful close and all buffered output rather than accepting on exit",
	async () => {
		mocks.spawn.mockImplementation((_exe, args: string[]) => {
			const proc = processStub();
			queueMicrotask(() => {
				if (args.includes("-version")) {
					proc.stdout.write(versionListing);
					proc.emit("exit", 0);
					proc.emit("close", 0);
				} else {
					const output = listing(),
						split = output.indexOf("0, 1, 1");
					proc.stdout.write(output.slice(0, split));
					proc.emit("exit", 0);
					queueMicrotask(() => {
						proc.stdout.write(output.slice(split));
						proc.emit("close", 0);
					});
				}
			});
			return proc;
		});
		expect((await validateRangeVideo(file, expected)).decoded.frames).toBe(2);
	},
);

it.skipIf(process.platform !== "linux").each(["stdout", "stderr"])(
	"owned %s stream errors settle without child close",
	async (pipe) => {
		const processes = child("success", "hang");
		const rejected = expect(validateRangeVideo(file, expected)).rejects.toThrow(
			/^range-video-tool-unavailable$/,
		);
		await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
		processes[0][pipe as "stdout" | "stderr"].emit("error", new Error("PRIVATE_PIPE_ERROR"));
		await rejected;
		expect(processes[0].stdout.destroyed).toBe(true);
		expect(processes[0].stderr.destroyed).toBe(true);
	},
);
