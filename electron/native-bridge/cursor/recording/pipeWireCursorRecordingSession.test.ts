import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cast on `actual` is written out in each factory rather than shared in a
 * helper: `vi.mock` calls are HOISTED above every top-level statement, so a
 * module-scope helper is still in its temporal dead zone when the factory runs
 * and the mock dies with "Cannot access 'x' before initialization".
 *
 * The cast itself is needed because these modules DO carry a default export at
 * runtime — the CJS namespace, which the code under test may import — while
 * `@types/node` declares only the named ones. Spreading it keeps that shape
 * intact instead of dropping it.
 */
type WithDefault = { default?: Record<string, unknown> };

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	const spawn = vi.fn();
	const execFile = vi.fn((...args: unknown[]) => {
		const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
		callback(null, '{"event":"ready","buttonPrivacyVersion":1}\n', "");
	});
	return {
		...actual,
		spawn,
		execFile,
		default: { ...((actual as WithDefault).default ?? {}), spawn, execFile },
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	// The helper binary does not exist in a test checkout; pretend the first
	// candidate path is executable so path resolution is not what is under test.
	return {
		...actual,
		accessSync: vi.fn(),
		default: { ...((actual as WithDefault).default ?? {}), accessSync: vi.fn() },
	};
});

import { spawn } from "node:child_process";
import { PipeWireCursorAccumulator } from "./pipeWireCursorAccumulator";
import { PipeWireCursorRecordingSession } from "./pipeWireCursorRecordingSession";

/** Minimal stand-in for the helper process: stdio pipes plus kill bookkeeping. */
class FakeHelper extends EventEmitter {
	stdout = new PassThrough();
	stderr = new PassThrough();
	stdinWrites: string[] = [];
	killed = false;
	signals: (string | undefined)[] = [];
	stdin: Writable;

	constructor() {
		super();
		const writes = this.stdinWrites;
		this.stdin = new Writable({
			write(chunk, _encoding, callback) {
				writes.push(chunk.toString());
				callback();
			},
		});
	}

	kill(signal?: string) {
		this.signals.push(signal);
		this.killed = true;
		return true;
	}

	/** Feeds one NDJSON line, the way the real helper emits them. */
	emitEvent(event: Record<string, unknown>) {
		this.stdout.write(
			`${JSON.stringify({ schemaVersion: 1, ...(event.event === "ready" ? { buttonPrivacyVersion: 1 } : {}), ...event })}\n`,
		);
	}
}

const spawnMock = vi.mocked(spawn);
let helper: FakeHelper;

function newSession(overrides: Partial<{ maxSamples: number; sampleIntervalMs: number }> = {}) {
	return new PipeWireCursorRecordingSession({
		maxSamples: overrides.maxSamples ?? 100,
		sampleIntervalMs: overrides.sampleIntervalMs ?? 33,
		startTimeMs: 1_000,
	});
}

/** Starts a session that becomes ready as soon as the helper says so. */
async function startReady(session: PipeWireCursorRecordingSession) {
	const started = session.start();
	// The capability probe resolves in a microtask before capture listeners attach.
	await Promise.resolve();
	helper.emitEvent({ event: "ready", timestampMs: 1_000, pipewireVersion: "1.0.5" });
	await started;
}

/** stdout is a stream: give the "data" listeners a turn before asserting. */
function flushStdout() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	helper = new FakeHelper();
	spawnMock.mockReset();
	spawnMock.mockReturnValue(helper as unknown as ReturnType<typeof spawn>);
	const silence = () => {
		// The session logs every helper diagnostic; keep the test output readable.
	};
	vi.spyOn(console, "info").mockImplementation(silence);
	vi.spyOn(console, "warn").mockImplementation(silence);
	vi.spyOn(console, "error").mockImplementation(silence);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("PipeWireCursorRecordingSession", () => {
	it("passes the sample interval to the helper as a JSON request argument", async () => {
		await startReady(newSession({ sampleIntervalMs: 20 }));
		const [, args] = spawnMock.mock.calls[0];
		expect(JSON.parse((args as string[])[0])).toEqual({
			sampleIntervalMs: 20,
			capturePointerButtons: false,
		});
	});

	it("resolves start() on `ready`, before the portal picker has been answered", async () => {
		const session = newSession();
		let resolved = false;
		const started = session.start().then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);
		helper.emitEvent({ event: "ready", timestampMs: 1_000 });
		await started;
		expect(resolved).toBe(true);
	});

	it("rejects start() when the helper reports an error instead of becoming ready", async () => {
		const session = newSession();
		const started = session.start();
		await Promise.resolve();
		helper.emitEvent({
			event: "error",
			code: "cursor-metadata-unsupported",
			message: "no METADATA cursor mode",
		});
		await expect(started).rejects.toThrow("no METADATA cursor mode");
	});

	it("rejects start() when the helper exits before becoming ready", async () => {
		const session = newSession();
		const started = session.start();
		await Promise.resolve();
		helper.emit("exit", 1, null);
		await expect(started).rejects.toThrow(/exited before ready/);
	});

	it("normalises cursor positions against the stream size, not a display", async () => {
		const session = newSession();
		await startReady(session);
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2_000,
			x: 960,
			y: 270,
			width: 1920,
			height: 1080,
			visible: true,
		});
		await flushStdout();

		const data = await session.stop();
		expect(data.samples).toHaveLength(1);
		expect(data.samples[0]).toEqual({
			timeMs: 1_000,
			cx: 0.5,
			cy: 0.25,
			visible: true,
			interactionType: "move",
		});
	});

	it("clamps out-of-range positions and preserves the helper's visibility flag", async () => {
		const session = newSession();
		await startReady(session);
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2_000,
			x: -40,
			y: 5_000,
			width: 1920,
			height: 1080,
			visible: false,
		});
		await flushStdout();

		const [sample] = (await session.stop()).samples;
		expect(sample.cx).toBe(0);
		expect(sample.cy).toBe(1);
		expect(sample.visible).toBe(false);
	});

	it("never retains an unexpected button click or its bitmap in cursor-only mode", async () => {
		const session = newSession();
		await startReady(session);
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2000,
			x: 1,
			y: 1,
			width: 10,
			height: 10,
			visible: true,
			interactionType: "click",
			assetId: "PRIVATE_CURSOR_BUTTON_CANARY",
			asset: {
				id: "PRIVATE_CURSOR_BUTTON_CANARY",
				imageDataUrl: "PRIVATE_CURSOR_BUTTON_CANARY",
				width: 1,
				height: 1,
				hotspotX: 0,
				hotspotY: 0,
			},
		});
		await flushStdout();
		expect(JSON.stringify(await session.stop())).not.toContain("PRIVATE_CURSOR_BUTTON_CANARY");
	});

	it("keeps cursor-only motion samples independent of button evidence", async () => {
		const session = newSession();
		await startReady(session);
		for (let i = 0; i < 3; i++) {
			helper.emitEvent({
				event: "cursor-sample",
				timestampMs: 2_000 + i,
				x: i,
				y: i,
				width: 100,
				height: 100,
				visible: true,
			});
		}
		await flushStdout();

		const { samples } = await session.stop();
		expect(samples.map((sample) => sample.interactionType)).toEqual(["move", "move", "move"]);
	});

	it("collects each cursor sprite once and reports the native provider", async () => {
		const session = newSession();
		await startReady(session);
		const asset = {
			id: "sha-1",
			imageDataUrl: "data:image/png;base64,AAAA",
			width: 24,
			height: 24,
			hotspotX: 4,
			hotspotY: 3,
		};
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2_000,
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			visible: true,
			assetId: "sha-1",
			asset,
		});
		// The helper only ships the payload once; later samples reference the id.
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2_100,
			x: 1,
			y: 1,
			width: 100,
			height: 100,
			visible: true,
			assetId: "sha-1",
		});
		await flushStdout();

		const data = await session.stop();
		expect(data.provider).toBe("native");
		expect(data.assets).toEqual([
			{
				id: "sha-1",
				platform: "linux",
				imageDataUrl: "data:image/png;base64,AAAA",
				width: 24,
				height: 24,
				hotspotX: 4,
				hotspotY: 3,
				scaleFactor: 1,
			},
		]);
		expect(data.samples.map((sample) => sample.assetId)).toEqual(["sha-1", "sha-1"]);
	});

	it("reports the `none` provider when no sprite ever arrived", async () => {
		const session = newSession();
		await startReady(session);
		const data = await session.stop();
		expect(data.provider).toBe("none");
		expect(data.assets).toEqual([]);
		expect(data.version).toBe(2);
	});

	it("keeps only the newest samples once maxSamples is exceeded", async () => {
		const session = newSession({ maxSamples: 2 });
		await startReady(session);
		for (let i = 0; i < 4; i++) {
			helper.emitEvent({
				event: "cursor-sample",
				timestampMs: 1_000 + i,
				x: i,
				y: 0,
				width: 100,
				height: 100,
				visible: true,
			});
		}
		await flushStdout();

		const { samples } = await session.stop();
		expect(samples.map((sample) => sample.timeMs)).toEqual([2, 3]);
	});

	it("tolerates a JSON object split across two stdout chunks", async () => {
		const session = newSession();
		await startReady(session);
		const line = JSON.stringify({
			event: "cursor-sample",
			schemaVersion: 1,
			timestampMs: 1_500,
			x: 10,
			y: 20,
			width: 100,
			height: 200,
			visible: true,
		});
		helper.stdout.write(line.slice(0, 25));
		await flushStdout();
		helper.stdout.write(`${line.slice(25)}\n`);
		await flushStdout();

		const { samples } = await session.stop();
		expect(samples).toHaveLength(1);
		expect(samples[0].cx).toBeCloseTo(0.1);
	});

	it("ignores unparseable output rather than losing the rest of the stream", async () => {
		const session = newSession();
		await startReady(session);
		helper.stdout.write("not json at all\n");
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 1_100,
			x: 50,
			y: 50,
			width: 100,
			height: 100,
			visible: true,
		});
		await flushStdout();

		const { samples } = await session.stop();
		expect(samples).toHaveLength(1);
	});

	it("asks the helper to stop over stdin before resorting to a signal", async () => {
		const session = newSession();
		await startReady(session);
		await session.stop();
		expect(helper.stdinWrites.join("")).toBe("stop\n");
		expect(helper.killed).toBe(false);
	});
});

it("ignores malformed private envelopes without logging raw data or breaking the cursor stream", async () => {
	const session = newSession();
	await startReady(session);
	helper.stdout.write("PRIVATE_CURSOR_CANARY malformed\nnull\n[]\n");
	helper.emitEvent({ event: "warning", message: "PRIVATE_CURSOR_CANARY" });
	helper.emitEvent({
		event: "pointer-button",
		device: "PRIVATE_CURSOR_CANARY",
		code: 272,
		pressed: true,
	});
	await flushStdout();
	expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
		"PRIVATE_CURSOR_CANARY",
	);
	expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("PRIVATE_CURSOR_CANARY");
	expect(helper.killed).toBe(false);
});

it("distinguishes a handler fault from malformed input without leaking exception or payload", async () => {
	await startReady(newSession());
	vi.spyOn(PipeWireCursorAccumulator.prototype, "addSample").mockImplementationOnce(() => {
		throw new Error("PRIVATE_EXCEPTION_CANARY");
	});
	helper.emitEvent({
		event: "cursor-sample",
		timestampMs: 1001,
		x: 1,
		y: 1,
		width: 20,
		height: 20,
		visible: true,
		private: "PRIVATE_PAYLOAD_CANARY",
	});
	helper.stdout.write("PRIVATE_MALFORMED_CANARY\n");
	await flushStdout();
	const errors = vi.mocked(console.error).mock.calls;
	expect(errors).toContainEqual(["[cursor-linux] helper handler failed; record omitted"]);
	expect(errors).toContainEqual(["[cursor-linux] malformed helper record omitted"]);
	expect(JSON.stringify(errors)).not.toContain("PRIVATE_");
});
