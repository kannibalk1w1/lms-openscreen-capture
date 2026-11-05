import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same hoisting caveat as the cursor-session test next door: `vi.mock` factories
 * run above every top-level statement, so the cast is written out inline rather
 * than shared through a helper that would still be in its temporal dead zone.
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
	// No helper binary in a test checkout; pretend the first candidate resolves so
	// path lookup is not what is under test.
	return {
		...actual,
		accessSync: vi.fn(),
		default: { ...((actual as WithDefault).default ?? {}), accessSync: vi.fn() },
	};
});

import { execFile, spawn } from "node:child_process";
import { disabledCapturePrivacyPolicy } from "../../../src/lib/capturePrivacy";
import type { NativeLinuxRecordingRequest } from "../../../src/lib/nativeLinuxRecording";
import { LinuxCaptureStartup } from "../../ipc/linuxCaptureStartup";
import {
	inspectCapturePrivacy,
	readCapturePolicyReceipt,
} from "../../recording/capturePolicyReceipt";
import { LinuxNativeCaptureSession } from "./linuxNativeCaptureSession";

class FakeHelper extends EventEmitter {
	stdout = new PassThrough();
	stderr = new PassThrough();
	stdinWrites: string[] = [];
	killed = false;
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

	kill() {
		this.killed = true;
		return true;
	}

	emitEvent(event: Record<string, unknown>) {
		this.stdout.write(
			`${JSON.stringify({ schemaVersion: 1, ...(event.event === "ready" ? { buttonPrivacyVersion: 1 } : {}), ...event })}\n`,
		);
	}
}

const spawnMock = vi.mocked(spawn);
let helper: FakeHelper;

function newSession(deferStart = false, inputOutputPath?: string) {
	return new LinuxNativeCaptureSession({
		...(deferStart ? { deferStart: true } : {}),
		outputPath: inputOutputPath ?? "/tmp/recording.mp4",
		captureInputEvents: Boolean(inputOutputPath),
		...(inputOutputPath
			? {
					capturePrivacyPolicy: {
						version: 1 as const,
						buttonScope: "global" as const,
						allowedApplications: [],
						excludedApplications: [],
					},
				}
			: {}),
		cursorMode: "metadata",
		fps: 30,
		audio: {
			system: { enabled: false },
			microphone: { enabled: false, gain: 1 },
		},
		maxCursorSamples: 100,
	});
}

async function startReady(session: LinuxNativeCaptureSession) {
	const started = session.start();
	await Promise.resolve();
	helper.emitEvent({ event: "ready", timestampMs: 1_000 });
	await started;
}

function flushStdout() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function emitCaptureStarted(timestampMs: number) {
	helper.emitEvent({
		event: "capture-started",
		timestampMs,
		path: "/tmp/recording.mp4",
		width: 800,
		height: 600,
		fps: 30,
	});
}

function emitCursorSample(timestampMs: number) {
	helper.emitEvent({
		event: "cursor-sample",
		timestampMs,
		x: 400,
		y: 300,
		width: 800,
		height: 600,
		visible: true,
	});
}

async function finishCapture(session: LinuxNativeCaptureSession, timestampMs: number) {
	const request = JSON.parse((spawnMock.mock.calls.at(-1)?.[1] as string[])[0]);
	if (existsSync(`${request.outputPath}.capture-policy.lock`))
		writeFileSync(request.outputPath, "fake completed media");
	const stopping = session.stop();
	await flushStdout();
	helper.emitEvent({
		event: "capture-stopped",
		timestampMs,
		path: "/tmp/recording.mp4",
		durationMs: timestampMs - 1_000,
		frames: 27,
		dropped: 0,
	});
	await flushStdout();
	helper.emit("exit", 0, null);
	return stopping;
}

/** Drives a session to a finished recording, optionally granting a source kind. */
async function record(sourceKind?: string) {
	const session = newSession();
	await startReady(session);

	helper.emitEvent({
		event: "stream-started",
		timestampMs: 1_100,
		nodeId: 42,
		width: 1280,
		height: 720,
		...(sourceKind ? { sourceKind } : {}),
	});
	await flushStdout();

	const stopping = session.stop();
	await flushStdout();
	helper.emitEvent({
		event: "capture-stopped",
		timestampMs: 2_000,
		path: "/tmp/recording.mp4",
		durationMs: 900,
		frames: 27,
		dropped: 0,
	});
	await flushStdout();
	helper.emit("exit", 0, null);

	return { session, result: await stopping };
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

describe("LinuxNativeCaptureSession", () => {
	/**
	 * The regression this file exists for. A restore token is bound to the source
	 * it was minted for, so replaying one made the portal hand back an
	 * already-approved MONITOR on every later run and stop raising its picker —
	 * and since `SelectSources` cannot name a source, "record this window" then
	 * had no way to mean anything. The request must carry no token at all.
	 */
	it("sends no restore token to the helper", async () => {
		await startReady(newSession());

		const [, args] = spawnMock.mock.calls[0];
		const request = JSON.parse((args as string[])[0]) as Record<string, unknown>;

		expect(request).not.toHaveProperty("restoreToken");
		expect(JSON.stringify(request)).not.toContain("restoreToken");
	});

	it("reports the cursor mode the helper fell back to (#1357)", async () => {
		const session = new LinuxNativeCaptureSession({
			outputPath: "/tmp/recording.mp4",
			cursorMode: "embedded",
			fps: 30,
			audio: { system: { enabled: false }, microphone: { enabled: false, gain: 1 } },
			maxCursorSamples: 100,
		});
		const started = session.start();
		await Promise.resolve();
		expect(session.cursorMode).toBe("embedded");
		helper.emitEvent({ event: "ready", timestampMs: 1_000, cursorMode: "metadata" });
		await started;

		expect(session.cursorMode).toBe("metadata");
	});

	it("keeps the requested cursor mode when the helper does not report one", async () => {
		const session = newSession();
		await startReady(session);

		expect(session.cursorMode).toBe("metadata");
	});

	it("reports the source kind the portal granted", async () => {
		const { session, result } = await record("window");

		expect(session.grantedSourceKind).toBe("window");
		expect(result.sourceKind).toBe("window");
	});

	it("distinguishes a granted monitor from a granted window", async () => {
		const { session, result } = await record("monitor");

		expect(session.grantedSourceKind).toBe("monitor");
		expect(result.sourceKind).toBe("monitor");
	});

	/**
	 * Absent is not "monitor". A backend that omits the field leaves the kind
	 * unknown, and collapsing that into a default is how the UI came to assert a
	 * source the capture had never been told about.
	 */
	it("leaves the granted kind unknown when the portal does not report one", async () => {
		const { session, result } = await record();

		expect(session.grantedSourceKind).toBeUndefined();
		expect(result.sourceKind).toBeUndefined();
	});

	/**
	 * The sequencing fix. The picker has to be answered BEFORE the countdown, so
	 * "a source was chosen" must be observable separately from "pixels are
	 * flowing" — otherwise the only thing to wait on is the first frame, which is
	 * far too late to start counting down.
	 */
	it("resolves the source selection before any frame is captured", async () => {
		const session = newSession(true);
		await startReady(session);

		let selected = false;
		const selecting = session.waitUntilSourceSelected().then(() => {
			selected = true;
		});
		await flushStdout();
		expect(selected).toBe(false);

		helper.emitEvent({
			event: "source-selected",
			timestampMs: 1_100,
			nodeId: 42,
			sourceKind: "window",
		});
		await selecting;

		expect(selected).toBe(true);
		// The kind is known one phase earlier than before, which is when the tray
		// label is needed.
		expect(session.grantedSourceKind).toBe("window");
	});

	it("asks the helper to defer, and arms it only when told to", async () => {
		const session = newSession(true);
		await startReady(session);

		const [, args] = spawnMock.mock.calls[0];
		expect(JSON.parse((args as string[])[0])).toMatchObject({ deferStart: true });
		expect(helper.stdinWrites).not.toContain("record\n");

		session.arm();
		expect(helper.stdinWrites).toContain("record\n");
	});

	it("arms at most once, so a caller need not track whether it prepared", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		session.arm();
		session.arm();

		expect(helper.stdinWrites.filter((line) => line === "record\n")).toHaveLength(1);
	});

	it("does not ask the helper to defer unless it was configured to", async () => {
		await startReady(newSession());

		const [, args] = spawnMock.mock.calls[0];
		expect(JSON.parse((args as string[])[0])).not.toHaveProperty("deferStart");
	});

	/**
	 * A prepared session is held open across the countdown, so it can die before
	 * it is ever armed — the user revoking the share from the compositor's
	 * indicator, or closing the window they picked. Whoever is waiting on the
	 * picker must learn that instead of waiting forever.
	 */
	it("rejects a pending source selection when the helper dies", async () => {
		const session = newSession(true);
		await startReady(session);

		const selecting = session.waitUntilSourceSelected();
		await flushStdout();
		helper.emit("exit", 1, null);

		await expect(selecting).rejects.toThrow();
	});

	it("resolves the source selection immediately once it has already arrived", async () => {
		const session = newSession(true);
		await startReady(session);

		helper.emitEvent({
			event: "source-selected",
			timestampMs: 1_100,
			nodeId: 42,
			sourceKind: "monitor",
		});
		await flushStdout();

		// Callers must not have to race the event to observe it.
		await expect(session.waitUntilSourceSelected()).resolves.toBeUndefined();
	});

	it("knows the granted kind by the time the capture is confirmed running", async () => {
		const session = newSession();
		await startReady(session);

		const capturing = session.waitUntilCapturing();
		helper.emitEvent({
			event: "stream-started",
			timestampMs: 1_100,
			nodeId: 7,
			width: 800,
			height: 600,
			sourceKind: "window",
		});
		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await capturing;

		expect(session.grantedSourceKind).toBe("window");
	});

	/**
	 * A capture-started event received before the wait is registered must
	 * satisfy that wait: the helper emits it as soon as the first frame stages,
	 * which can be before the caller awaits.
	 */
	it("resolves the capture wait immediately once the first frame already landed", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await flushStdout();

		// Callers must not have to race the event to observe it.
		await expect(session.waitUntilCapturing()).resolves.toBeUndefined();
	});

	/**
	 * Both events in one stdout chunk are handed to the session within one
	 * `data` callback, so no caller can register a wait between them.
	 */
	it("resolves the capture wait when arming and the first frame share a stdout chunk", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		helper.stdout.write(
			`${JSON.stringify({
				schemaVersion: 1,
				event: "source-selected",
				timestampMs: 1_100,
				nodeId: 42,
				sourceKind: "window",
			})}\n${JSON.stringify({
				schemaVersion: 1,
				event: "capture-started",
				timestampMs: 1_200,
				path: "/tmp/recording.mp4",
				width: 800,
				height: 600,
				fps: 30,
			})}\n`,
		);
		await flushStdout();

		await expect(session.waitUntilCapturing()).resolves.toBeUndefined();
	});

	/**
	 * A helper that died before any frame has nothing to report; the wait
	 * rejects.
	 */
	it("still rejects the capture wait when the helper died before any frame", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		helper.emit("exit", 1, null);
		await flushStdout();

		await expect(session.waitUntilCapturing()).rejects.toThrow();
	});

	/**
	 * A capture-started event received before the helper died must not answer
	 * a later wait: the recording is no longer running.
	 */
	it("rejects the capture wait when the helper died after its first frame", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await flushStdout();
		helper.emit("exit", 1, null);
		await flushStdout();

		await expect(session.waitUntilCapturing()).rejects.toThrow();
	});

	/**
	 * An undeferred session connects immediately, so the first frame can land
	 * before the caller awaits; the same wait must still be satisfied.
	 */
	it("resolves the capture wait on an undeferred session whose first frame already landed", async () => {
		const session = newSession();
		await startReady(session);

		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await flushStdout();

		await expect(session.waitUntilCapturing()).resolves.toBeUndefined();
	});

	/**
	 * A running capture answers every wait, not only the first one registered
	 * before the event.
	 */
	it("resolves a second capture wait after the first was answered by the event", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		const first = session.waitUntilCapturing();
		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await flushStdout();
		await first;

		await expect(session.waitUntilCapturing()).resolves.toBeUndefined();
	});

	it("removes cursor samples from repeated pauses and compacts later timestamps", async () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(900);
		const session = newSession();
		await startReady(session);

		emitCaptureStarted(1_000);
		emitCursorSample(1_100);
		await flushStdout();

		now.mockReturnValue(1_200);
		session.pause();
		emitCursorSample(1_250);
		now.mockReturnValue(1_400);
		session.resume();
		emitCursorSample(1_500);

		now.mockReturnValue(1_600);
		session.pause();
		emitCursorSample(1_650);
		now.mockReturnValue(1_800);
		session.resume();
		emitCursorSample(1_900);
		await flushStdout();

		now.mockReturnValue(2_000);
		const result = await finishCapture(session, 2_000);

		expect(result.cursor.samples.map((sample) => sample.timeMs)).toEqual([100, 300, 500]);
		expect(helper.stdinWrites.filter((line) => line === "pause\n")).toHaveLength(2);
		expect(helper.stdinWrites.filter((line) => line === "resume\n")).toHaveLength(2);
	});

	it("keeps native projected late clicks and resumed motion out of UTC pause compaction", async () => {
		const root = mkdtempSync(join(tmpdir(), "projected-click-policy-"));
		const session = newSession(false, join(root, "take.mp4"));
		await startReady(session);
		emitCaptureStarted(1000);
		await flushStdout();
		vi.spyOn(Date, "now").mockReturnValue(1200);
		session.pause();
		vi.mocked(Date.now).mockReturnValue(2200);
		session.resume();
		// Arrival and UTC deliberately disagree with the native encoder interval.
		// This proves pass-through and no second compaction, not native projection.
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 1500,
			mediaTimeMs: 190,
			intervalId: 0,
			mediaTimeObservation: "reader",
			x: 400,
			y: 300,
			width: 800,
			height: 600,
			visible: true,
			interactionType: "click",
		});
		helper.emitEvent({
			event: "cursor-sample",
			timestampMs: 2300,
			mediaTimeMs: 210,
			intervalId: 1,
			mediaTimeObservation: "dispatch",
			x: 401,
			y: 300,
			width: 800,
			height: 600,
			visible: true,
		});
		await flushStdout();
		vi.mocked(Date.now).mockReturnValue(2400);
		const result = await finishCapture(session, 2400);
		expect(result.cursor.samples.map((point) => point.timeMs)).toEqual([190, 210]);
		expect(result.cursor.samples[0].interactionType).toBe("click");
		rmSync(root, { recursive: true, force: true });
	});

	it("closes the cursor pause range when the recording stops while paused", async () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(900);
		const session = newSession();
		await startReady(session);

		emitCaptureStarted(1_000);
		emitCursorSample(1_100);
		await flushStdout();

		now.mockReturnValue(1_200);
		session.pause();
		emitCursorSample(1_300);
		await flushStdout();

		now.mockReturnValue(1_500);
		const result = await finishCapture(session, 1_500);

		expect(result.cursor.samples.map((sample) => sample.timeMs)).toEqual([100]);
		expect(helper.stdinWrites).not.toContain("resume\n");
	});

	/**
	 * A non-fatal `error` event after the first frame does not end the capture;
	 * a later wait is still satisfied.
	 */
	it("resolves the capture wait after a non-fatal error follows the first frame", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		helper.emitEvent({
			event: "error",
			timestampMs: 1_300,
			code: "audio-unavailable",
			message: "the system audio node vanished",
		});
		await flushStdout();

		await expect(session.waitUntilCapturing()).resolves.toBeUndefined();
	});

	/**
	 * A wait registered before the first frame stays pending until it lands.
	 */
	it("leaves the capture wait pending until the first frame lands", async () => {
		const session = newSession(true);
		await startReady(session);

		session.arm();
		let settled = false;
		const pending = session.waitUntilCapturing().then(() => {
			settled = true;
		});
		await flushStdout();
		expect(settled).toBe(false);

		helper.emitEvent({
			event: "capture-started",
			timestampMs: 1_200,
			path: "/tmp/recording.mp4",
			width: 800,
			height: 600,
			fps: 30,
		});
		await flushStdout();
		await pending;
		expect(settled).toBe(true);
	});

	describe("first-frame timeout (#1101)", () => {
		// Only the timers are faked: the fake helper's stdout still needs real
		// ticks to deliver its events, which `setImmediate` gives.
		const flushEvents = () => new Promise((resolve) => setImmediate(resolve));

		async function startFaked(deferStart = false) {
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
			const session = newSession(deferStart);
			const started = session.start();
			helper.emitEvent({ event: "ready", timestampMs: 1_000 });
			await flushEvents();
			await started;
			return session;
		}

		async function answerPicker() {
			helper.emitEvent({ event: "source-selected", timestampMs: 1_100, nodeId: 42 });
			await flushEvents();
		}

		afterEach(() => {
			vi.useRealTimers();
		});

		/**
		 * A stream that never delivers a frame and never reports an error used to
		 * leave the start hanging forever, with the HUD stuck before recording.
		 */
		it("fails the start and kills the helper when no frame follows the picker", async () => {
			const session = await startFaked(true);
			await answerPicker();

			// A countdown between the answer and the arm is not first-frame time.
			vi.advanceTimersByTime(60_000);
			expect(helper.killed).toBe(false);

			session.arm();
			const outcome = expect(session.waitUntilCapturing()).rejects.toThrow(
				/could not start screen capture/,
			);
			vi.advanceTimersByTime(9_999);
			expect(helper.killed).toBe(false);
			vi.advanceTimersByTime(1);

			await outcome;
			expect(helper.killed).toBe(true);
		});

		/** A human reading the picker has no upper bound; only what follows does. */
		it("does not start the clock until the picker has answered", async () => {
			const session = await startFaked();

			let settled = false;
			const capturing = session.waitUntilCapturing().finally(() => {
				settled = true;
			});
			const outcome = expect(capturing).rejects.toThrow(/could not start screen capture/);
			vi.advanceTimersByTime(600_000);
			await flushEvents();
			expect(settled).toBe(false);
			expect(helper.killed).toBe(false);

			await answerPicker();
			vi.advanceTimersByTime(10_000);

			await outcome;
			expect(helper.killed).toBe(true);
		});

		it("leaves a capture whose first frame arrived in time running", async () => {
			const session = await startFaked();

			const capturing = session.waitUntilCapturing();
			await answerPicker();
			vi.advanceTimersByTime(9_000);
			helper.emitEvent({
				event: "capture-started",
				timestampMs: 1_200,
				path: "/tmp/recording.mp4",
				width: 800,
				height: 600,
				fps: 30,
			});
			await flushEvents();
			await capturing;

			vi.advanceTimersByTime(60_000);
			expect(helper.killed).toBe(false);
		});
	});

	/**
	 * Save Diagnostics' `helperOutput.linux`. Before it, a Linux bundle had no entry for
	 * the helper at all, where Windows and macOS keep their helper's raw output.
	 */
	describe("helper output", () => {
		it("keeps the helper's stderr and events past its exit, without cursor samples", async () => {
			const session = newSession();
			await startReady(session);
			helper.stderr.write("pipewire: format negotiated\n");
			helper.emitEvent({ event: "encoder-selection", video: "h264_vaapi" });
			helper.emitEvent({
				event: "cursor-sample",
				timestampMs: 1_150,
				x: 10,
				y: 20,
				width: 1280,
				height: 720,
				visible: true,
			});
			helper.emitEvent({ event: "warning", code: "dmabuf", message: "falling back to shm" });
			await flushStdout();
			helper.emit("exit", 1, null);

			const output = session.helperOutput;
			expect(output).toContain('"event":"ready"');
			expect(output).toContain("pipewire: format negotiated\n");
			expect(output).toContain('"video":"h264_vaapi"');
			expect(output).toContain('"message":"falling back to shm"');
			expect(output).not.toContain("cursor-sample");
		});

		it("records a protocol error without retaining unclassified stdout", async () => {
			const session = newSession();
			await startReady(session);
			helper.stdout.write("thread 'main' panicked at src/main.rs:12\n");
			await flushStdout();

			expect(session.helperOutput).toContain("[protocol] malformed helper record omitted");
			expect(session.helperOutput).not.toContain("thread 'main' panicked");
		});

		it("keeps the newest 64 KiB of a helper that keeps talking", async () => {
			const session = newSession();
			await startReady(session);
			for (let i = 0; i < 1_000; i += 1) {
				helper.stderr.write(`warning ${i} ${"x".repeat(100)}\n`);
			}
			await flushStdout();

			expect(session.helperOutput.length).toBe(64 * 1024);
			expect(session.helperOutput).toContain("warning 999 ");
			expect(session.helperOutput).not.toContain('"event":"ready"');
		});

		it("counts the cap in UTF-8 bytes and cuts it between characters", async () => {
			const session = newSession();
			await startReady(session);
			// 90 000 bytes of a 3-byte character: the 64 KiB cut lands 2 bytes into one,
			// so the whole characters that fit are the 21 845 after it.
			helper.stderr.write("€".repeat(30_000));
			await flushStdout();

			expect(Buffer.byteLength(session.helperOutput, "utf8")).toBeLessThanOrEqual(64 * 1024);
			expect(session.helperOutput).toBe("€".repeat(21_845));
		});
	});
});

it("journals native button edges once independently of click samples", async () => {
	const root = mkdtempSync(join(tmpdir(), "native-input-"));
	try {
		const video = join(root, "recording.mp4");
		const session = newSession(false, video);
		await startReady(session);
		helper.emitEvent({
			event: "input-capture-status",
			state: "partial",
			driver: "linux-evdev",
			scope: "global-physical-buttons-no-taps",
		});
		const edge = {
			event: "pointer-button",
			timestampMs: 1100,
			monotonicMs: 100,
			mediaTimeMs: 90,
			code: 0x111,
			pressed: true,
			device: "/dev/input/event1",
			position: null,
		};
		helper.emitEvent(edge); // Picker input is not evidence.
		emitCaptureStarted(1050);
		helper.emitEvent(edge);
		emitCursorSample(1100); // Visual telemetry must not duplicate evidence.
		helper.emitEvent({ ...edge, pressed: false, mediaTimeMs: 95 });
		await flushStdout();
		const result = await finishCapture(session, 2000);
		expect(result.inputEvents).toEqual({ path: `${video}.events.ndjson`, status: "partial" });
		const records = readFileSync(`${video}.events.ndjson`, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records.map((record) => record.event)).toEqual([
			"session-start",
			"input-capture-status",
			"pointer-button",
			"pointer-button",
			"session-end",
		]);
		expect(records[2]).toMatchObject({
			code: 0x111,
			pressed: true,
			mediaTimeMs: 90,
			position: null,
		});
		expect(records[3]).toMatchObject({ pressed: false, mediaTimeMs: 95 });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("exposes live driver changes, warnings and unexpected exit", async () => {
	const session = newSession(false, "/tmp/health-test-unused.mp4");
	await startReady(session);
	expect(session.inputCaptureHealth.state).toBe("unknown");
	helper.emitEvent({
		event: "input-capture-status",
		state: "partial",
		driver: "linux-kwin",
		scope: "global-compositor-buttons",
	});
	await flushStdout();
	expect(session.inputCaptureHealth).toMatchObject({ state: "partial", driver: "linux-kwin" });
	helper.emitEvent({
		event: "warning",
		code: "click-capture-device-lost",
		message: "Compositor disconnected",
	});
	helper.emitEvent({
		event: "input-capture-status",
		state: "unavailable",
		driver: "linux-kwin",
		scope: "global-compositor-buttons",
	});
	await flushStdout();
	expect(session.inputCaptureHealth).toMatchObject({
		state: "unavailable",
		warning: null,
	});
	// No capture-started, so no journal is created or recording interrupted.
	helper.emit("exit", 1, null);
	expect(session.inputCaptureHealth.state).toBe("unavailable");
});

it("reports a journal collision introduced after reservation without failing video start", async () => {
	const root = mkdtempSync(join(tmpdir(), "input-health-"));
	try {
		const video = join(root, "recording.mp4");
		const { writeFileSync } = await import("node:fs");
		const session = newSession(false, video);
		await startReady(session);
		writeFileSync(`${video}.events.ndjson`, "existing evidence");
		emitCaptureStarted(1050);
		await flushStdout();
		expect(session.inputCaptureHealth.state).toBe("failed");
		const result = await finishCapture(session, 2000);
		expect(result.inputEvents?.status).toBe("failed");
		expect(readFileSync(`${video}.events.ndjson`, "utf8")).toBe("existing evidence");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("reports interrupted evidence after an unexpected helper exit", async () => {
	const root = mkdtempSync(join(tmpdir(), "input-interruption-"));
	try {
		const session = newSession(false, join(root, "recording.mp4"));
		await startReady(session);
		emitCaptureStarted(1050);
		await flushStdout();
		helper.emit("exit", 1, null);
		expect(session.inputCaptureHealth.state).toBe("interrupted");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("persists native control boundaries, interval identity and unmatched releases without synthesizing clicks", async () => {
	const root = mkdtempSync(join(tmpdir(), "native-boundaries-"));
	try {
		const video = join(root, "take.mp4"),
			session = newSession(false, video);
		await startReady(session);
		const boundary = {
			event: "capture-boundary",
			timestampMs: 1100,
			monotonicMs: 100,
			mediaTimeMs: 50,
			reason: "pause",
			intervalId: 0,
			buttonStateObservation: "dispatch",
			buttonsDown: [{ device: "mouse", code: 0x110 }],
		};
		helper.emitEvent(boundary); // No recording journal exists during the picker.
		emitCaptureStarted(1050);
		helper.emitEvent({ ...boundary, reason: "start", mediaTimeMs: 0, buttonsDown: [] });
		helper.emitEvent(boundary);
		helper.emitEvent({
			...boundary,
			reason: "resume",
			monotonicMs: 5100,
			intervalId: 1,
			buttonsDown: [],
		});
		helper.emitEvent({
			event: "pointer-button",
			timestampMs: 6200,
			monotonicMs: 5200,
			mediaTimeMs: 150,
			code: 0x110,
			pressed: false,
			device: "mouse",
			position: null,
			intervalId: 1,
			continuity: "unmatched-release",
		});
		helper.emitEvent({
			...boundary,
			reason: "stop",
			mediaTimeMs: 200,
			intervalId: 1,
			buttonsDown: [],
		});
		await flushStdout();
		await finishCapture(session, 200);
		const records = readFileSync(`${video}.events.ndjson`, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(
			records
				.filter((record) => record.event === "capture-boundary")
				.map((record) => record.reason),
		).toEqual(["start", "pause", "resume", "stop"]);
		expect(records.filter((record) => record.event === "pointer-button")).toHaveLength(1);
		expect(records.find((record) => record.continuity)).toMatchObject({
			continuity: "unmatched-release",
			intervalId: 1,
			pressed: false,
		});
		expect(records.at(-1).event).toBe("session-end");
		expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("retains late historical reader projections in journal arrival order without retiming them", async () => {
	const root = mkdtempSync(join(tmpdir(), "native-projection-"));
	try {
		const video = join(root, "take.mp4");
		const session = newSession(false, video);
		await startReady(session);
		emitCaptureStarted(1050);
		const boundary = {
			event: "capture-boundary",
			timestampMs: 2000,
			monotonicMs: 1000,
			mediaTimeMs: 500,
			reason: "pause",
			intervalId: 0,
			buttonStateObservation: "dispatch",
			buttonsDown: [],
		};
		helper.emitEvent(boundary);
		helper.emitEvent({ ...boundary, reason: "resume", monotonicMs: 3000, intervalId: 1 });
		const late = {
			event: "pointer-button",
			timestampMs: 1400,
			monotonicMs: 400,
			mediaTimeMs: 350,
			code: 0x110,
			pressed: true,
			device: "mouse",
			position: null,
			intervalId: 0,
			mediaTimeObservation: "reader",
			dispatchDelayMs: 2600,
			late: true,
		};
		helper.emitEvent(late);
		helper.emitEvent({
			...late,
			timestampMs: 1410,
			monotonicMs: 410,
			mediaTimeMs: 360,
			pressed: false,
		});
		await flushStdout();
		await finishCapture(session, 600);
		const records = readFileSync(`${video}.events.ndjson`, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const edges = records.filter((record) => record.event === "pointer-button");
		expect(edges).toHaveLength(2);
		expect(edges[0]).toMatchObject(late);
		expect(edges[1]).toMatchObject({ intervalId: 0, mediaTimeMs: 360, pressed: false, late: true });
		expect(edges[0].sequence).toBeGreaterThan(
			records.find((record) => record.reason === "resume").sequence,
		);
		expect(records.at(-1).event).toBe("session-end");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("persists device discontinuities and incomplete stop drain without creating releases", async () => {
	const root = mkdtempSync(join(tmpdir(), "native-stop-drain-"));
	try {
		const video = join(root, "take.mp4");
		const session = newSession(false, video);
		await startReady(session);
		emitCaptureStarted(1050);
		const loss = {
			event: "input-discontinuity",
			monotonicMs: 500,
			device: "mouse",
			reason: "kernel-overflow",
			buttonStateObservation: "dispatch",
			clearedButtons: [{ intervalId: 0, code: 0x110 }],
		};
		const drain = {
			event: "input-drain",
			monotonicMs: 600,
			scope: "queued-before-fence",
			completed: false,
			processedMessages: 65536,
			acceptedEdges: 2,
			excludedEdges: 1,
		};
		helper.emitEvent(loss);
		helper.emitEvent(drain);
		helper.emitEvent({
			event: "warning",
			code: "click-capture-drain-incomplete",
			message: "Queued evidence may be incomplete",
		});
		await flushStdout();
		expect(session.inputCaptureHealth.warning).toBe("Queued evidence may be incomplete");
		await finishCapture(session, 600);
		const records = readFileSync(`${video}.events.ndjson`, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(records.find((record) => record.event === "input-discontinuity")).toMatchObject(loss);
		expect(records.find((record) => record.event === "input-drain")).toMatchObject(drain);
		expect(records.filter((record) => record.event === "pointer-button")).toHaveLength(0);
		expect(records.find((record) => record.event === "input-warning")).toMatchObject({
			code: "click-capture-drain-incomplete",
		});
		expect(records.at(-1).event).toBe("session-end");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function policySession(
	video: string,
	capturePrivacyPolicy?: ReturnType<typeof disabledCapturePrivacyPolicy>,
) {
	return new LinuxNativeCaptureSession({
		outputPath: video,
		captureInputEvents: true,
		capturePrivacyPolicy,
		cursorMode: "metadata",
		fps: 30,
		audio: { system: { enabled: false }, microphone: { enabled: false, gain: 1 } },
		maxCursorSamples: 100,
	});
}
function emitPrivateButtonCanary(canary: string) {
	helper.emitEvent({
		event: "pointer-button",
		timestampMs: 1200,
		monotonicMs: 20,
		mediaTimeMs: 10,
		code: 0x110,
		pressed: true,
		device: canary,
		position: null,
		intervalId: 0,
	});
	helper.emitEvent({
		event: "cursor-sample",
		timestampMs: 1200,
		mediaTimeMs: 10,
		intervalId: 0,
		mediaTimeObservation: "reader",
		x: 2,
		y: 2,
		width: 10,
		height: 10,
		visible: true,
		interactionType: "click",
		assetId: canary,
		asset: { id: canary, imageDataUrl: canary, width: 1, height: 1, hotspotX: 0, hotspotY: 0 },
	});
	helper.emitEvent({
		event: "input-discontinuity",
		monotonicMs: 21,
		device: canary,
		reason: "kernel-overflow",
		buttonStateObservation: "dispatch",
		clearedButtons: [{ intervalId: 0, code: 0x110 }],
	});
	helper.emitEvent({ event: "warning", code: "click-capture-kernel-overflow", message: canary });
	helper.emitEvent({
		event: "capture-boundary",
		timestampMs: 1300,
		monotonicMs: 22,
		mediaTimeMs: 20,
		reason: "stop",
		intervalId: 0,
		buttonStateObservation: "dispatch",
		buttonsDown: [{ device: canary, code: 0x110 }],
	});
	helper.stdout.write(`malformed-private-record:${canary}\n`);
	helper.emitEvent({ event: "unknown-input-extension", device: canary });
	helper.emitEvent({
		event: "input-capture-status",
		state: "partial",
		driver: "linux-evdev",
		scope: "global-physical-buttons-no-taps",
		futureDeviceMetadata: canary,
	});
	helper.emitEvent({
		event: "input-drain",
		monotonicMs: 22,
		scope: "queued-before-fence",
		completed: true,
		processedMessages: 0,
		acceptedEdges: 0,
		excludedEdges: 0,
		futureDeviceMetadata: canary,
	});
}
it.each([
	"off",
	"unknown-app",
	"unknown-exclusion",
	"legacy-flag",
])("suppresses %s collection before startup and keeps a private canary out of disk, cursor and diagnostics", async (mode) => {
	const root = mkdtempSync(join(tmpdir(), "privacy-denied-"));
	try {
		const video = join(root, "take.mp4");
		const policy =
			mode === "legacy-flag"
				? undefined
				: {
						...disabledCapturePrivacyPolicy(),
						...(mode === "unknown-app"
							? { buttonScope: "applications" as const, allowedApplications: ["teaching.app"] }
							: {}),
						...(mode === "unknown-exclusion"
							? { buttonScope: "global" as const, excludedApplications: ["private.app"] }
							: {}),
					};
		const session = policySession(video, policy);
		await startReady(session);
		const request = JSON.parse((spawnMock.mock.calls[0][1] as string[])[0]);
		expect(request.capturePointerButtons).toBe(false);
		emitCaptureStarted(1050);
		await flushStdout();
		emitPrivateButtonCanary("PRIVATE_BUTTON_CANARY_DENIED");
		await flushStdout();
		expect(session.inputCaptureHealth.state).toBe("disabled");
		const result = await finishCapture(session, 1500);
		expect(existsSync(`${video}.events.ndjson`)).toBe(false);
		for (const file of readdirSync(root))
			expect(readFileSync(join(root, file), "utf8")).not.toContain("PRIVATE_BUTTON_CANARY_DENIED");
		expect(JSON.stringify(result.cursor)).not.toContain("PRIVATE_BUTTON_CANARY_DENIED");
		expect(session.helperOutput).not.toContain("PRIVATE_BUTTON_CANARY_DENIED");
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
			"PRIVATE_BUTTON_CANARY_DENIED",
		);
		expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
			"PRIVATE_BUTTON_CANARY_DENIED",
		);
		if (policy)
			expect(readCapturePolicyReceipt(video)).toMatchObject({
				policy: {
					buttonScope: policy.buttonScope,
					excludedApplicationsConfigured: policy.excludedApplications.length > 0,
				},
				applicationIdentity: "unavailable",
				collectionAllowedAtStart: false,
			});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
it("revokes an authorized take before queued helper lines arrive while retaining earlier evidence and video completion", async () => {
	const root = mkdtempSync(join(tmpdir(), "privacy-revoke-"));
	try {
		const video = join(root, "take.mp4");
		const session = policySession(video, {
			...disabledCapturePrivacyPolicy(),
			buttonScope: "global",
		});
		await startReady(session);
		expect(JSON.parse((spawnMock.mock.calls[0][1] as string[])[0]).capturePointerButtons).toBe(
			true,
		);
		emitCaptureStarted(1050);
		await flushStdout();
		helper.emitEvent({
			event: "pointer-button",
			timestampMs: 1100,
			monotonicMs: 10,
			mediaTimeMs: 5,
			code: 0x110,
			pressed: true,
			device: "authorized-before-suppression",
			position: null,
			intervalId: 0,
		});
		await flushStdout();
		session.suppressButtonEvidence();
		session.suppressButtonEvidence();
		expect(helper.stdinWrites.filter((line) => line === "suppress-input\n")).toHaveLength(1);
		emitPrivateButtonCanary("PRIVATE_BUTTON_CANARY_REVOKED");
		await flushStdout();
		expect(session.inputCaptureHealth).toMatchObject({
			state: "disabled",
			privacy: { reason: "suppressed", allowed: false },
		});
		const result = await finishCapture(session, 1500);
		const journal = readFileSync(`${video}.events.ndjson`, "utf8");
		expect(journal).toContain("authorized-before-suppression");
		expect(journal).toContain("input-policy-suppressed");
		expect(journal).toContain('"buttonStateObservation":"suppressed"');
		expect(journal).toContain('"event":"session-end"');
		const afterSuppression = journal.slice(journal.indexOf("input-policy-suppressed"));
		expect(afterSuppression).not.toContain("excludedEdges");
		expect(afterSuppression).not.toContain('"state":"partial"');
		for (const file of readdirSync(root))
			expect(readFileSync(join(root, file), "utf8")).not.toContain("PRIVATE_BUTTON_CANARY_REVOKED");
		expect(JSON.stringify(result.cursor)).not.toContain("PRIVATE_BUTTON_CANARY_REVOKED");
		expect(session.helperOutput).not.toContain("PRIVATE_BUTTON_CANARY_REVOKED");
		expect(readCapturePolicyReceipt(video).collectionAllowedAtStart).toBe(true);
		expect(readCapturePolicyReceipt(video).version).toBe(3);
		expect((await inspectCapturePrivacy(video)).status).toBe("bound");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
it("rejects a colliding destination before probing or spawning and preserves prior evidence", async () => {
	const root = mkdtempSync(join(tmpdir(), "privacy-receipt-collision-"));
	try {
		const video = join(root, "take.mp4");
		writeFileSync(`${video}.capture-policy.json`, "prior source receipt");
		writeFileSync(`${video}.events.ndjson`, "prior journal");
		const session = policySession(video, {
			...disabledCapturePrivacyPolicy(),
			buttonScope: "global",
		});
		const probes = vi.mocked(execFile).mock.calls.length;
		await expect(session.start()).rejects.toThrow("already contains media or evidence");
		expect(spawnMock).not.toHaveBeenCalled();
		expect(vi.mocked(execFile).mock.calls).toHaveLength(probes);
		expect(readFileSync(`${video}.capture-policy.json`, "utf8")).toBe("prior source receipt");
		expect(readFileSync(`${video}.events.ndjson`, "utf8")).toBe("prior journal");
		expect(existsSync(video)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("rejects an unsupported helper before declaring readiness, with parent retention suppressed", async () => {
	const session = newSession();
	const started = session.start();
	const rejection = expect(started).rejects.toThrow("lacks button privacy controls");
	await Promise.resolve();
	helper.emitEvent({ event: "ready", timestampMs: 1000, buttonPrivacyVersion: 0 });
	await rejection;
	expect(helper.killed).toBe(true);
	expect(session.inputCaptureHealth.privacy?.allowed).toBe(false);
});

it("checks a stale helper in probe-only mode before launching any real capture", async () => {
	vi.mocked(execFile).mockImplementationOnce(((...args: unknown[]) => {
		const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
		callback(null, '{"event":"ready"}\n', "");
	}) as typeof execFile);
	await expect(newSession().start()).rejects.toThrow("lacks button privacy controls");
	expect(spawnMock).not.toHaveBeenCalled();
	const probe = vi.mocked(execFile).mock.calls.at(-1);
	expect(JSON.parse((probe?.[1] as string[])[0])).toEqual({
		probeOnly: true,
		capturePointerButtons: false,
		cursorMode: "hidden",
	});
});

it("keeps revocation effective while the safe capability probe is still pending", async () => {
	const root = mkdtempSync(join(tmpdir(), "privacy-probe-revocation-"));
	try {
		let completeProbe: (error: Error | null, stdout: string, stderr: string) => void = () =>
			undefined;
		vi.mocked(execFile).mockImplementationOnce(((...args: unknown[]) => {
			completeProbe = args.at(-1) as typeof completeProbe;
		}) as typeof execFile);
		const video = join(root, "take.mp4");
		const session = policySession(video, {
			...disabledCapturePrivacyPolicy(),
			buttonScope: "global",
		});
		const starting = session.start();
		session.suppressButtonEvidence();
		completeProbe(null, '{"event":"ready","buttonPrivacyVersion":1}\n', "");
		await Promise.resolve();
		helper.emitEvent({ event: "ready", timestampMs: 1000 });
		await starting;
		expect(JSON.parse((spawnMock.mock.calls[0][1] as string[])[0]).capturePointerButtons).toBe(
			false,
		);
		emitCaptureStarted(1050);
		await flushStdout();
		emitPrivateButtonCanary("PRIVATE_BUTTON_CANARY_PROBE_REVOKED");
		await flushStdout();
		await finishCapture(session, 1500);
		expect(readCapturePolicyReceipt(video)).toMatchObject({
			collectionAllowedAtStart: false,
			suppressedAtStart: true,
		});
		expect(existsSync(`${video}.events.ndjson`)).toBe(false);
		for (const file of readdirSync(root))
			expect(readFileSync(join(root, file), "utf8")).not.toContain(
				"PRIVATE_BUTTON_CANARY_PROBE_REVOKED",
			);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it.each([
	"microphone",
	"revoke",
])("renegotiates the same recording identity after a %s change only after actual child exit", async (change) => {
	const root = mkdtempSync(join(tmpdir(), "countdown-lock-"));
	try {
		const children: FakeHelper[] = [];
		spawnMock.mockImplementation(() => {
			const child = new FakeHelper();
			children.push(child);
			return child as unknown as ReturnType<typeof spawn>;
		});
		let policy = { ...disabledCapturePrivacyPolicy(), buttonScope: "global" as "global" | "off" };
		const handlers = new Map<
			string,
			(event: unknown, request: NativeLinuxRecordingRequest) => Promise<unknown>
		>();
		const started = vi.fn();
		const sessions: LinuxNativeCaptureSession[] = [];
		const manager = new LinuxCaptureStartup({
			handle: (channel, handler) => {
				handlers.set(channel, handler);
			},
			platform: () => "linux",
			helperAvailable: () => true,
			readPolicy: () => policy,
			mkdir: async () => undefined,
			recordingsDir: root,
			filePrefix: "recording-",
			maxCursorSamples: 100,
			createSession: (config) => {
				const session = new LinuxNativeCaptureSession(config);
				sessions.push(session);
				return session;
			},
			active: () => null,
			onCandidate: () => undefined,
			onStarted: started,
			removeEmptyOutput: async () => undefined,
		});
		manager.register();
		const request: NativeLinuxRecordingRequest = {
			recordingId: 7,
			video: { fps: 30 },
			cursor: { mode: "editable-overlay" },
			audio: { system: { enabled: false }, microphone: { enabled: false, gain: 1 } },
		};
		const preparing = handlers.get("prepare-native-linux-recording")!(null, request);
		await vi.waitFor(() => expect(children).toHaveLength(1));
		children[0].emitEvent({ event: "ready", timestampMs: 1000 });
		children[0].emitEvent({ event: "source-selected", timestampMs: 1010, sourceKind: "window" });
		expect(await preparing).toMatchObject({ success: true });
		const next = {
			...request,
			audio: { ...request.audio, microphone: { enabled: change === "microphone", gain: 1 } },
		};
		if (change === "revoke") {
			policy = { ...policy, buttonScope: "off" };
			manager.requestPolicy(policy);
			manager.confirmPolicy(policy);
		}
		const starting = handlers.get("start-native-linux-recording")!(null, next);
		await vi.waitFor(() => expect(children[0].killed).toBe(true));
		expect(children).toHaveLength(1);
		expect(existsSync(join(root, "recording-7.mp4.capture-policy.lock"))).toBe(true);
		children[0].emit("exit", null, "SIGTERM");
		await vi.waitFor(() => expect(children).toHaveLength(2));
		children[1].emitEvent({ event: "ready", timestampMs: 1100 });
		children[1].emitEvent({ event: "source-selected", timestampMs: 1110, sourceKind: "window" });
		children[1].emitEvent({
			event: "capture-started",
			timestampMs: 1120,
			path: join(root, "recording-7.mp4"),
			width: 800,
			height: 600,
			fps: 30,
		});
		expect(await starting).toMatchObject({ success: true, recordingId: 7 });
		const args = JSON.parse((spawnMock.mock.calls[1][1] as string[])[0]);
		expect(args.capturePointerButtons).toBe(change !== "revoke");
		expect(args.audio.microphone.enabled).toBe(change === "microphone");
		expect(started).toHaveBeenCalledTimes(1);
		sessions[1].discard();
		children[1].emit("exit", null, "SIGTERM");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
