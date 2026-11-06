import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveFfmpeg } from "../media/audioPeaks";

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_BOXES = 4096;
const TIMEOUT_MS = 30_000;
const MAX_STDOUT = 1024 * 1024;
const MAX_STDERR = 64 * 1024;
const fail = () => new Error("range-video-validation-failed");
export interface VideoExpectation {
	width: number;
	height: number;
	fps: number;
	frames: number;
}
interface Box {
	type: string;
	data: Buffer;
	start: number;
	end: number;
}
/** Deliberately small ISO BMFF subset: ordinary non-fragmented, unreordered avc1. */
export function inspectRangeVideo(bytes: Buffer, expected: VideoExpectation) {
	if (
		bytes.length > MAX_BYTES ||
		![expected.width, expected.height, expected.fps, expected.frames].every(Number.isInteger) ||
		expected.width < 2 ||
		expected.height < 2 ||
		expected.width > 1280 ||
		expected.height > 1280 ||
		expected.width % 2 ||
		expected.height % 2 ||
		expected.fps < 1 ||
		expected.fps > 60 ||
		expected.frames < 1 ||
		expected.frames > 3600
	)
		throw fail();
	let budget = MAX_BOXES;
	function boxes(data: Buffer, base = 0): Box[] {
		const result: Box[] = [];
		for (let at = 0; at < data.length; ) {
			if (--budget < 0 || at + 8 > data.length) throw fail();
			const size = data.readUInt32BE(at);
			// Extended/EOF-sized boxes are unnecessary for this bounded exporter.
			if (size < 8 || at + size > data.length) throw fail();
			result.push({
				type: data.toString("ascii", at + 4, at + 8),
				data: data.subarray(at + 8, at + size),
				start: base + at + 8,
				end: base + at + size,
			});
			at += size;
		}
		return result;
	}
	function one(list: Box[], type: string) {
		const found = list.filter((box) => box.type === type);
		if (found.length !== 1) throw fail();
		return found[0].data;
	}
	function full(data: Buffer, length: number) {
		if (data.length !== length || data.readUInt32BE(0) !== 0) throw fail();
	}
	const top = boxes(bytes);
	if (top.some((box) => box.type === "moof")) throw fail();
	one(top, "ftyp");
	const mdat = top.filter((box) => box.type === "mdat");
	if (mdat.length !== 1) throw fail();
	const movie = boxes(one(top, "moov"));
	if (movie.some((box) => box.type === "mvex")) throw fail();
	const mvhd = one(movie, "mvhd");
	if (mvhd.length < 20 || mvhd[0] !== 0) throw fail();
	const movieScale = mvhd.readUInt32BE(12);
	// Native MP4 uses millisecond movie ticks; do not accept coarser edit rounding.
	if (movieScale !== 1000) throw fail();
	let video: { track: Box[]; media: Box[] } | undefined;
	let tracks = 0;
	for (const trackBox of movie.filter((box) => box.type === "trak")) {
		if (++tracks > 2) throw fail();
		const track = boxes(trackBox.data),
			media = boxes(one(track, "mdia"));
		const handler = one(media, "hdlr");
		if (handler.length < 12) throw fail();
		const kind = handler.toString("ascii", 8, 12);
		if (kind === "vide") {
			if (video) throw fail();
			video = { track, media };
		} else if (kind !== "soun") throw fail();
	}
	if (!video) throw fail();
	const mdhd = one(video.media, "mdhd");
	full(mdhd, 24);
	const scale = mdhd.readUInt32BE(12),
		duration = mdhd.readUInt32BE(16);
	if (!scale || scale % expected.fps || duration !== expected.frames * (scale / expected.fps))
		throw fail();
	const tick = scale / expected.fps;
	const tkhd = one(video.track, "tkhd");
	if (
		tkhd.length !== 84 ||
		tkhd.readUInt32BE(0) !== 3 ||
		tkhd.readUInt32BE(20) !== Math.ceil((duration * movieScale) / scale) ||
		tkhd.readUInt32BE(76) !== expected.width * 65536 ||
		tkhd.readUInt32BE(80) !== expected.height * 65536
	)
		throw fail();
	const matrix = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
	if (matrix.some((value, i) => tkhd.readUInt32BE(40 + i * 4) !== value)) throw fail();
	const edits = video.track.filter((box) => box.type === "edts");
	if (edits.length > 1) throw fail();
	if (edits.length) {
		const elst = one(boxes(edits[0].data), "elst");
		full(elst, 20);
		if (
			elst.readUInt32BE(4) !== 1 ||
			elst.readInt32BE(12) !== 0 ||
			elst.readUInt32BE(16) !== 0x10000 ||
			elst.readUInt32BE(8) !== Math.ceil((duration * movieScale) / scale)
		)
			throw fail();
	}
	const table = boxes(one(boxes(one(video.media, "minf")), "stbl"));
	if (table.some((box) => !["stsd", "stts", "stss", "stsc", "stsz", "stco"].includes(box.type)))
		throw fail();
	const stsd = one(table, "stsd");
	if (stsd.length < 8 || stsd.readUInt32BE(0) !== 0 || stsd.readUInt32BE(4) !== 1) throw fail();
	const entry = boxes(stsd.subarray(8));
	if (entry.length !== 1) throw fail();
	const avc = one(entry, "avc1");
	if (
		avc.length < 78 ||
		avc.readUInt16BE(6) !== 1 ||
		avc.readUInt16BE(24) !== expected.width ||
		avc.readUInt16BE(26) !== expected.height
	)
		throw fail();
	one(boxes(avc.subarray(78)), "avcC");
	// Reject external data references before launching a demuxer.
	const dref = one(boxes(one(boxes(one(video.media, "minf")), "dinf")), "dref");
	if (dref.length < 8 || dref.readUInt32BE(0) !== 0 || dref.readUInt32BE(4) !== 1) throw fail();
	const url = one(boxes(dref.subarray(8)), "url ");
	if (url.length !== 4 || url.readUInt32BE(0) !== 1) throw fail();
	const stts = one(table, "stts");
	if (stts.length < 8) throw fail();
	const runs = stts.readUInt32BE(4);
	if (!runs || runs > expected.frames) throw fail();
	full(stts, 8 + runs * 8);
	let samples = 0;
	for (let i = 0; i < runs; i++) {
		const count = stts.readUInt32BE(8 + i * 8),
			delta = stts.readUInt32BE(12 + i * 8);
		if (!count || delta !== tick) throw fail();
		samples += count;
	}
	if (samples !== expected.frames) throw fail();
	const stsz = one(table, "stsz");
	if (stsz.length < 12 || stsz.readUInt32BE(8) !== samples) throw fail();
	const fixedSize = stsz.readUInt32BE(4);
	full(stsz, fixedSize ? 12 : 12 + samples * 4);
	const sizes = Array.from(
		{ length: samples },
		(_, i) => fixedSize || stsz.readUInt32BE(12 + i * 4),
	);
	if (sizes.some((size) => !size)) throw fail();
	const stco = one(table, "stco");
	if (stco.length < 8) throw fail();
	const chunks = stco.readUInt32BE(4);
	if (!chunks || chunks > samples) throw fail();
	full(stco, 8 + chunks * 4);
	const stsc = one(table, "stsc");
	if (stsc.length < 8) throw fail();
	const maps = stsc.readUInt32BE(4);
	if (!maps || maps > chunks) throw fail();
	full(stsc, 8 + maps * 12);
	const mappings = Array.from({ length: maps }, (_, i) => ({
		first: stsc.readUInt32BE(8 + i * 12),
		count: stsc.readUInt32BE(12 + i * 12),
		description: stsc.readUInt32BE(16 + i * 12),
	}));
	if (
		mappings[0].first !== 1 ||
		mappings.some(
			(m, i) =>
				!m.count ||
				m.description !== 1 ||
				m.first > chunks ||
				(i > 0 && m.first <= mappings[i - 1].first),
		)
	)
		throw fail();
	let sample = 0,
		mapping = 0,
		previousEnd = mdat[0].start;
	for (let chunk = 1; chunk <= chunks; chunk++) {
		if (mapping + 1 < maps && mappings[mapping + 1].first === chunk) mapping++;
		const offset = stco.readUInt32BE(4 + chunk * 4);
		let end = offset;
		for (let i = 0; i < mappings[mapping].count; i++) {
			if (sample >= samples) throw fail();
			end += sizes[sample++];
		}
		if (offset < previousEnd || end > mdat[0].end) throw fail();
		previousEnd = end;
	}
	if (sample !== samples) throw fail();
	return {
		codec: "h264" as const,
		timingBasis: "stored-mp4-stts-deltas" as const,
		sampleCount: samples,
		timeScale: scale,
		sampleDurationTicks: tick,
		durationTicks: duration,
		durationSec: duration / scale,
	};
}

/** Real decoded frame existence/order/size on FFmpeg's rounded output grid.
 * framemd5 supplies output durations and retimes timestamps: exact stored video
 * timing is established exclusively by inspectRangeVideo's sample tables.
 */
export function inspectDecodedFrames(output: string, expected: VideoExpectation) {
	const lines = output.trim().split(/\r?\n/);
	if (!lines.includes(`#dimensions 0: ${expected.width}x${expected.height}`)) throw fail();
	const timebases = lines.filter((line) => line.startsWith("#tb "));
	if (timebases.length !== 1) throw fail();
	const tb = /^#tb 0: (\d+)\/(\d+)$/.exec(timebases[0]);
	if (!tb || Number(tb[1]) <= 0 || Number(tb[2]) !== Number(tb[1]) * expected.fps) throw fail();
	const rows = lines.filter((line) => !line.startsWith("#"));
	if (rows.length !== expected.frames) throw fail();
	for (const [i, row] of rows.entries()) {
		const match = /^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*([a-f0-9]{32})$/.exec(row);
		if (
			!match ||
			Number(match[1]) !== i ||
			Number(match[2]) !== i ||
			Number(match[3]) !== 1 ||
			Number(match[4]) !== (expected.width * expected.height * 3) / 2
		)
			throw fail();
	}
	return {
		frames: rows.length,
		evidence: "decoded-frame-existence-order-size" as const,
		timestampBasis: "ffmpeg-rounded-output-grid" as const,
		pixelFormat: "yuv420p" as const,
		frameMd5ListingSha256: createHash("sha256").update(output).digest("hex"),
	};
}

// This records a same-user tool identity, not authenticated decoder attestation.
// Hash before/after the version and decode subprocesses; no executable path is
// exported. Filesystem IO is byte-bounded, not given a kernel-level deadline.
async function hashDecoderExecutable(executable: string) {
	const file = await fs.open(
		executable,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const before = await file.stat();
		const limit = 256 * 1024 * 1024;
		if (!before.isFile() || before.size < 1 || before.size > limit) throw fail();
		const hash = createHash("sha256"),
			buffer = Buffer.alloc(1024 * 1024);
		let bytes = 0;
		for (;;) {
			const read = await file.read(buffer, 0, buffer.length, null);
			if (!read.bytesRead) break;
			bytes += read.bytesRead;
			if (bytes > limit) throw fail();
			hash.update(buffer.subarray(0, read.bytesRead));
		}
		const after = await file.stat(),
			named = await fs.lstat(executable);
		if (
			bytes !== before.size ||
			!named.isFile() ||
			named.dev !== before.dev ||
			named.ino !== before.ino ||
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs
		)
			throw fail();
		return {
			sha256: hash.digest("hex"),
			dev: before.dev,
			ino: before.ino,
			size: before.size,
			mtimeMs: before.mtimeMs,
			ctimeMs: before.ctimeMs,
		};
	} finally {
		await file.close();
	}
}

function runDecoder(
	executable: string,
	args: string[],
	bounds: {
		fd?: number;
		timeoutMs: number;
		stdoutBytes: number;
		stderrBytes: number;
	},
) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(executable, args, {
			stdio:
				bounds.fd === undefined
					? ["ignore", "pipe", "pipe"]
					: ["ignore", "pipe", "pipe", bounds.fd],
			windowsHide: true,
		});
		let output = "",
			outBytes = 0,
			errBytes = 0,
			settled = false;
		// `close` can wait forever for descendant-held pipes. Failure settles
		// independently, closes only our read ends, and kills only our child.
		// Success still waits for close, so exit cannot truncate buffered output.
		const stop = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				child.kill("SIGKILL");
			} catch {
				/* Failure still releases our streams and settles. */
			}
			child.stdout?.destroy();
			child.stderr?.destroy();
			reject(fail());
		};
		const timer = setTimeout(stop, bounds.timeoutMs);
		child.stdout!.on("data", (chunk: Buffer) => {
			if (settled) return;
			outBytes += chunk.length;
			if (outBytes > bounds.stdoutBytes) stop();
			else output += chunk.toString("utf8");
		});
		child.stderr!.on("data", (chunk: Buffer) => {
			if (settled) return;
			errBytes += chunk.length;
			if (errBytes > bounds.stderrBytes) stop();
		});
		child.stdout!.on("error", stop);
		child.stderr!.on("error", stop);
		child.once("error", stop);
		child.once("exit", (code) => {
			if (code !== 0 || errBytes) stop();
		});
		child.once("close", (code) => {
			if (settled) return;
			if (code !== 0 || errBytes) {
				stop();
				return;
			}
			settled = true;
			clearTimeout(timer);
			resolve(output);
		});
	});
}

async function validateLocalVideo(filePath: string, expected: VideoExpectation) {
	// A pinned inherited descriptor gives Linux FFmpeg seekable local input. Other
	// platforms need their own accepted descriptor/path contract before enabling.
	if (
		process.platform !== "linux" ||
		!path.isAbsolute(filePath) ||
		!(await fs.lstat(filePath)).isFile()
	)
		throw fail();
	const resolved = resolveFfmpeg();
	if (!resolved || !path.isAbsolute(resolved)) throw fail();
	const executable = await fs.realpath(resolved);
	const file = await fs.open(
		filePath,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const before = await file.stat();
		if (!before.isFile() || before.size < 8 || before.size > MAX_BYTES) throw fail();
		const bytes = Buffer.alloc(before.size);
		let at = 0;
		while (at < bytes.length) {
			const read = await file.read(bytes, at, bytes.length - at, at);
			if (!read.bytesRead) throw fail();
			at += read.bytesRead;
		}
		const samples = inspectRangeVideo(bytes, expected);
		const decoderBefore = await hashDecoderExecutable(executable);
		const versionOutput = await runDecoder(executable, ["-version"], {
			timeoutMs: 3000,
			stdoutBytes: 16384,
			stderrBytes: 16384,
		});
		// Retain only the bounded version token, never configuration/build paths.
		const version = /^ffmpeg version ([A-Za-z0-9][A-Za-z0-9._+~:-]{0,159})(?:[ \t]|$)/.exec(
			versionOutput.split(/\r?\n/, 1)[0],
		)?.[1];
		if (!version) throw fail();
		const stdout = await runDecoder(
			executable,
			[
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
				String(expected.frames + 1),
				"-pix_fmt",
				"yuv420p",
				"-f",
				"framemd5",
				"pipe:1",
			],
			{
				fd: file.fd,
				timeoutMs: TIMEOUT_MS,
				stdoutBytes: MAX_STDOUT,
				stderrBytes: MAX_STDERR,
			},
		);
		const decoderAfter = await hashDecoderExecutable(executable);
		if (JSON.stringify(decoderAfter) !== JSON.stringify(decoderBefore)) throw fail();
		const decoded = inspectDecodedFrames(stdout, expected);
		const after = await file.stat(),
			named = await fs.lstat(filePath);
		if (
			!named.isFile() ||
			named.dev !== before.dev ||
			named.ino !== before.ino ||
			after.size !== before.size ||
			after.mtimeMs !== before.mtimeMs ||
			after.ctimeMs !== before.ctimeMs
		)
			throw fail();
		return {
			container: "nonfragmented-mp4" as const,
			samples,
			decoded: {
				...decoded,
				decoder: {
					sha256: decoderBefore.sha256,
					version,
					trust: "same-user-local-executable" as const,
				},
			},
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
	} catch {
		throw fail();
	} finally {
		await file.close();
	}
}

/** Fixed public error even for OS/resolver/open/close failures. */
export async function validateRangeVideo(filePath: string, expected: VideoExpectation) {
	try {
		return await validateLocalVideo(filePath, expected);
	} catch {
		throw fail();
	}
}
