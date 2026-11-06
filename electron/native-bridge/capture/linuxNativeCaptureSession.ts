import { type ChildProcessByStdio, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import {
	type CapturePrivacyPolicy,
	decideButtonCollection,
	normalizeCapturePrivacyPolicy,
	summarizeCapturePrivacyPolicy,
} from "../../../src/lib/capturePrivacy";
import {
	type NativeClockSnapshot,
	NativeClockSourceEndedError,
	nativeClockSnapshotEventSchema,
	nativeClockSnapshotSchema,
} from "../../../src/lib/clockBridge/schema";
import type { InputCaptureHealth, InputCaptureStatus } from "../../../src/native/captureEvents";
import type { CursorRecordingData } from "../../../src/native/contracts";
import { CaptureEventJournal } from "../../recording/captureEventJournal";
import {
	bindCapturePolicyToMedia,
	reserveCaptureDestination,
	writeCapturePolicyReceipt,
} from "../../recording/capturePolicyReceipt";
import type { CursorPauseRange } from "../cursor/recording/cursorPauseRanges";
import {
	NdjsonLineReader,
	PipeWireCursorAccumulator,
	type PipeWireHelperEvent,
} from "../cursor/recording/pipeWireCursorAccumulator";
import { findPipeWireCursorHelperPath } from "../cursor/recording/pipeWireCursorRecordingSession";
import { requireButtonPrivacyHelper } from "./buttonPrivacyProbe";

/**
 * Drives the Linux capture helper for a full recording: video, audio and cursor
 * telemetry from ONE portal session.
 *
 * WHY ONE SESSION MATTERS ENOUGH TO BUILD THIS. `SelectSources` may be called
 * once per portal session, so a second process means a second picker. Before
 * this, Linux users picked a source twice — once for Chromium's
 * `getDisplayMedia` and once for the cursor helper — and the two captures could
 * legitimately be of different things, because each picker was answered
 * separately. That is also why the cursor overlay never lined up: the telemetry
 * described one stream and the pixels came from another.
 *
 * TIMEOUTS. `ready` arrives in milliseconds and means the helper loaded
 * libpipewire and reached the portal. `capture-started` cannot arrive until a
 * human has clicked through the compositor's dialog, which has no upper bound —
 * so the picker is deliberately NOT on a timer. The caller shows its own UI for
 * that wait; a timeout there would cancel recordings whose user was merely
 * reading the dialog. Once the picker has answered, the first frame IS bounded:
 * see [`FIRST_FRAME_TIMEOUT_MS`].
 */

const READY_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 15_000;
/**
 * How long the first frame may take once the picker has answered (#1101).
 *
 * Normal start-up after the answer is well under that: connect the stream,
 * negotiate a format (twice when a DMA-BUF allocation failure falls back to
 * shared memory, #1069), skip up to eight crop-less frames, probe the encoder
 * ladder. The helper's own give-ups land inside it too — 60 failed imports in a
 * row is 1–2 s — so a helper that CAN say what went wrong does, and this only
 * catches a stream that stays silent. Without it, frames the shim never
 * delivers leave the HUD waiting forever, with nothing on screen to say so.
 */
const FIRST_FRAME_TIMEOUT_MS = 10_000;
/**
 * The most of the helper's output [`helperOutput`] keeps, in UTF-8 bytes: the 64 KiB
 * Save Diagnostics writes of each helper. Only the newest is kept, as on Windows and
 * macOS.
 */
const HELPER_OUTPUT_MAX_BYTES = 64 * 1024;
const HELPER_EVENTS = new Set([
	"ready",
	"source-selected",
	"stream-started",
	"cursor-sample",
	"audio-source",
	"encoder-selection",
	"capture-started",
	"capture-stopped",
	"warning",
	"error",
	"debug",
	"pointer-button",
	"capture-boundary",
	"input-capture-status",
	"input-discontinuity",
	"input-drain",
	"clock-snapshot",
]);

export interface LinuxCaptureConfig {
	capturePrivacyPolicy?: CapturePrivacyPolicy;
	/** Persist physical button evidence separately from visual cursor samples. */
	captureInputEvents?: boolean;
	outputPath: string;
	cursorMode: "metadata" | "embedded";
	fps: number;
	bitrate?: number;
	audio: {
		system: { enabled: boolean };
		microphone: { enabled: boolean; deviceName?: string; gain: number };
	};
	maxCursorSamples: number;
	/**
	 * Negotiate the portal and stop there, until [`arm`] is called.
	 *
	 * Splits "the user has chosen what to share" from "pixels are flowing" so a
	 * countdown can sit between them. Without it the countdown runs first and the
	 * picker appears afterwards, which is backwards: the picker's wait has no
	 * upper bound, so the countdown finishes while the user is still reading a
	 * dialog they have not been shown yet.
	 */
	deferStart?: boolean;
}

/** What the portal handed over. `undefined` means the backend did not say. */
export type LinuxCaptureSourceKind = "monitor" | "window" | "virtual";

export interface LinuxCaptureResult {
	capturePolicyPath?: string;
	inputEvents?: { path: string; status: InputCaptureHealth["state"] };
	path: string;
	durationMs: number;
	frames: number;
	droppedFrames: number;
	cursor: CursorRecordingData;
	/** What the portal actually granted, when it said. */
	sourceKind?: LinuxCaptureSourceKind;
	videoEncoder?: string;
}

export class LinuxNativeCaptureSession {
	private readonly captureId = randomUUID();
	private releaseDestination:
		| import("../../recording/capturePolicyReceipt").CaptureReservation
		| undefined;
	private discarded = false;
	private bindingPromise: Promise<void> | undefined;
	private readonly privacyPolicy: CapturePrivacyPolicy;
	private inputSuppressed = false;
	private capturePolicyPath: string | undefined;
	private readonly cursor: PipeWireCursorAccumulator;
	private journal: CaptureEventJournal | null = null;
	private inputStatus: InputCaptureStatus = {
		event: "input-capture-status",
		state: "unknown",
		driver: "linux-evdev",
		scope: "global-physical-buttons-no-taps",
	};
	private inputWarning: string | null = null;
	private inputInterrupted = false;
	private readonly lines = new NdjsonLineReader();
	private process: ChildProcessByStdio<Writable, Readable, Readable> | null = null;

	private readyResolve: (() => void) | null = null;
	private readyReject: ((error: Error) => void) | null = null;
	private readyTimer: NodeJS.Timeout | null = null;

	private clockSnapshotSupported = false;
	private stopping = false;
	private readonly clockQueries = new Map<
		string,
		{
			resolve: (point: NativeClockSnapshot) => void;
			reject: (error: Error) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private capturing = false;
	private startedResolve: (() => void) | null = null;
	private startedReject: ((error: Error) => void) | null = null;
	private firstFrameTimer: NodeJS.Timeout | null = null;

	private sourceSelected = false;
	private sourceSelectedResolve: (() => void) | null = null;
	private sourceSelectedReject: ((error: Error) => void) | null = null;
	private armed = false;

	private stopped: LinuxCaptureResult | null = null;
	private stoppedResolve: (() => void) | null = null;
	private stoppedReject: ((error: Error) => void) | null = null;

	private sourceKind: LinuxCaptureSourceKind | undefined;
	private negotiatedCursorMode: LinuxCaptureConfig["cursorMode"] | undefined;
	private videoEncoder: string | undefined;
	private lastError: string | null = null;
	private paused = false;
	private helperOutputText = "";
	private cursorRecordingStartMs = 0;
	private cursorPauseStartedAtMs: number | null = null;
	private cursorPauseRanges: CursorPauseRange[] = [];

	constructor(private readonly config: LinuxCaptureConfig) {
		this.privacyPolicy = normalizeCapturePrivacyPolicy(config.capturePrivacyPolicy);
		this.cursor = new PipeWireCursorAccumulator(config.maxCursorSamples);
	}

	/**
	 * Spawns the helper and resolves once it reports `ready` — which is BEFORE
	 * the portal picker is raised. Call [`waitUntilCapturing`] to wait for the
	 * user to answer it.
	 */
	async start(): Promise<void> {
		const helperPath = findPipeWireCursorHelperPath();
		if (!helperPath) {
			throw new Error(
				"The Linux capture helper is not available. Build it with `npm run build:native:linux`.",
			);
		}

		if (this.config.capturePrivacyPolicy !== undefined)
			this.releaseDestination = reserveCaptureDestination(this.config.outputPath, this.captureId);
		try {
			await requireButtonPrivacyHelper(helperPath);
		} catch (error) {
			this.releaseDestination?.();
			throw error;
		}
		if (this.discarded) {
			this.releaseDestination?.();
			throw new Error("Capture was cancelled before helper launch");
		}

		this.cursor.reset(Date.now());
		this.lines.reset();
		this.cursorRecordingStartMs = 0;
		this.cursorPauseStartedAtMs = null;
		this.cursorPauseRanges = [];
		this.paused = false;

		const request = {
			capturePointerButtons: this.buttonDecision.allowed,
			outputPath: this.config.outputPath,
			cursorMode: this.config.cursorMode,
			video: {
				fps: this.config.fps,
				...(this.config.bitrate ? { bitrate: this.config.bitrate } : {}),
			},
			audio: this.config.audio,
			...(this.config.deferStart ? { deferStart: true } : {}),
		};

		this.releaseDestination?.launching();
		const child = spawn(helperPath, [JSON.stringify(request)], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.process = child;

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			this.appendHelperOutput(chunk);
			const message = chunk.trim();
			if (message) {
				console.error("[capture-linux]", message);
			}
		});
		child.once("exit", (code, signal) => {
			this.rejectClockQueries();
			this.releaseDestination?.();
			this.process = null;
			if (this.capturing && !this.stopped) this.inputInterrupted = true;
			const reason =
				this.lastError ??
				`the Linux capture helper exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
			this.rejectReady(new Error(reason));
			this.startedReject?.(new Error(reason));
			this.startedReject = null;
			this.startedResolve = null;
			// A session held open across a countdown can die before it is armed —
			// the user revoking the share from the compositor's indicator, or
			// closing the window they picked. Whoever is waiting on the picker
			// has to learn that rather than wait forever.
			this.sourceSelectedReject?.(new Error(reason));
			this.sourceSelectedReject = null;
			this.sourceSelectedResolve = null;
			// A clean exit after `capture-stopped` is the normal path; anything
			// else means the file may not have its trailer.
			if (this.stopped) {
				this.stoppedResolve?.();
			} else {
				this.stoppedReject?.(new Error(reason));
			}
			this.stoppedResolve = null;
			this.stoppedReject = null;
		});
		child.on("error", (error) => {
			// A failed signal is not proof a spawned process exited.
			if (!child.pid) {
				this.releaseDestination?.();
				this.process = null;
			}
			this.rejectReady(error);
		});

		try {
			this.releaseDestination?.helper(child.pid);
			await new Promise<void>((resolve, reject) => {
				this.readyResolve = resolve;
				this.readyReject = reject;
				this.readyTimer = setTimeout(() => {
					this.rejectReady(new Error("Timed out waiting for the Linux capture helper"));
				}, READY_TIMEOUT_MS);
			});
		} catch (error) {
			this.kill();
			throw error;
		}
	}

	/**
	 * Resolves once the user has answered the compositor's picker.
	 *
	 * No timeout: a human is reading a dialog and there is no upper bound on
	 * that. Resolves immediately if the answer already arrived, so callers need
	 * not race the event.
	 *
	 * A session started WITHOUT `deferStart` still reports this — it simply
	 * arrives moments before capture rather than being waited on.
	 */
	waitUntilSourceSelected(): Promise<void> {
		if (this.sourceSelected) {
			return Promise.resolve();
		}
		if (!this.process) {
			return Promise.reject(new Error("The Linux capture helper is not running."));
		}
		return new Promise<void>((resolve, reject) => {
			this.sourceSelectedResolve = resolve;
			this.sourceSelectedReject = reject;
		});
	}

	/**
	 * Releases a deferred session: connect to PipeWire and start encoding.
	 *
	 * Safe to call on a session that was not deferred (the helper ignores the
	 * verb) and safe to call twice, so a caller never has to track whether a
	 * prepare happened.
	 */
	arm() {
		if (this.armed) {
			return;
		}
		this.armed = true;
		this.write("record");
	}

	/**
	 * Resolves when the first frame has been encoded. The picker's wait is not
	 * timed; the first frame after it is, and the helper is killed if it never
	 * comes. See the class doc.
	 */
	waitUntilCapturing(): Promise<void> {
		if (!this.process) {
			return Promise.reject(new Error("The Linux capture helper is not running."));
		}
		// A previously observed capture-started event must not bypass the helper
		// liveness check above.
		if (this.capturing) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve, reject) => {
			const settle = () => {
				if (this.firstFrameTimer) {
					clearTimeout(this.firstFrameTimer);
					this.firstFrameTimer = null;
				}
			};
			this.startedResolve = () => {
				settle();
				resolve();
			};
			this.startedReject = (error) => {
				settle();
				reject(error);
			};
			this.startFirstFrameTimer();
		});
	}

	/**
	 * Starts the first-frame clock once a capture wait is pending AND the picker
	 * has answered, whichever comes last. Never earlier: a prepared session sits
	 * answered through the whole countdown, and the picker itself has no bound.
	 */
	private startFirstFrameTimer() {
		if (!this.sourceSelected || !this.startedReject || this.firstFrameTimer) {
			return;
		}
		this.firstFrameTimer = setTimeout(() => {
			this.firstFrameTimer = null;
			const reject = this.startedReject;
			this.startedResolve = null;
			this.startedReject = null;
			this.kill();
			reject?.(
				new Error(
					"OpenScreen could not start screen capture: the screen share delivered no " +
						`frame within ${FIRST_FRAME_TIMEOUT_MS / 1000} s.`,
				),
			);
		}, FIRST_FRAME_TIMEOUT_MS);
	}

	pause() {
		if (this.paused) {
			return;
		}
		this.write("pause");
		this.paused = true;
		this.cursorPauseStartedAtMs = Date.now();
	}

	resume() {
		if (!this.paused) {
			return;
		}
		this.write("resume");
		this.completeCursorPauseRange();
		this.paused = false;
	}

	private completeCursorPauseRange(endMs = Date.now()) {
		if (this.cursorPauseStartedAtMs === null || this.cursorRecordingStartMs <= 0) return;
		this.cursorPauseRanges.push({
			startMs: Math.max(0, this.cursorPauseStartedAtMs - this.cursorRecordingStartMs),
			endMs: Math.max(0, endMs - this.cursorRecordingStartMs),
		});
		this.cursorPauseStartedAtMs = null;
	}

	private get buttonDecision() {
		// Current global drivers cannot attest application identity.
		return decideButtonCollection(this.privacyPolicy, null, this.inputSuppressed);
	}

	/** One-way for this take; reenabling requires a fresh explicitly authorized take. */
	suppressButtonEvidence() {
		if (this.inputSuppressed) return;
		this.inputSuppressed = true;
		this.journal?.append({
			event: "input-policy-suppressed",
			policy: summarizeCapturePrivacyPolicy(this.privacyPolicy),
		});
		this.write("suppress-input");
	}

	get inputCaptureHealth(): InputCaptureHealth {
		return {
			privacy: this.buttonDecision,
			state:
				this.journal && !this.journal.available
					? "failed"
					: this.inputInterrupted
						? "interrupted"
						: !this.config.captureInputEvents || !this.buttonDecision.allowed
							? "disabled"
							: this.inputStatus.state,
			driver: this.inputStatus.driver,
			scope: this.inputStatus.scope,
			warning: this.inputWarning,
		};
	}

	get isPaused() {
		return this.paused;
	}

	/**
	 * What the portal granted. Known from `stream-started`, so it is populated by
	 * the time [`waitUntilCapturing`] resolves.
	 *
	 * `undefined` means the backend did not report a kind — which is NOT the same
	 * as "a screen", and callers must not collapse the two. Guessing is what this
	 * whole field exists to stop.
	 */
	get grantedSourceKind(): LinuxCaptureSourceKind | undefined {
		return this.sourceKind;
	}

	/**
	 * The cursor mode the helper really negotiates, known once `start()` resolves.
	 * A portal without EMBEDDED gets METADATA instead (#1357), so the cursor has
	 * to be drawn by the editor even though the system cursor was asked for.
	 */
	get cursorMode(): LinuxCaptureConfig["cursorMode"] {
		return this.negotiatedCursorMode ?? this.config.cursorMode;
	}

	/**
	 * What the helper said in this session, for Save Diagnostics' `helperOutput.linux`:
	 * its stderr as written and every stdout line except `cursor-sample`, which comes
	 * at the capture rate and would push everything else out. Still readable after the
	 * helper exits, which is when a bug report asks for it.
	 */
	get helperOutput(): string {
		return this.helperOutputText;
	}

	private appendHelperOutput(text: string) {
		this.helperOutputText += text;
		if (Buffer.byteLength(this.helperOutputText, "utf8") <= HELPER_OUTPUT_MAX_BYTES) {
			return;
		}
		const bytes = Buffer.from(this.helperOutputText, "utf8");
		let start = bytes.length - HELPER_OUTPUT_MAX_BYTES;
		// A continuation byte (0b10xxxxxx) is the middle of a character: start at the
		// next one, so the kept text never opens on a replacement character.
		while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) {
			start += 1;
		}
		this.helperOutputText = bytes.subarray(start).toString("utf8");
	}

	/**
	 * Asks the helper to write the trailer and exit, then returns what it made.
	 *
	 * Waits for the PROCESS to exit rather than for `capture-stopped` alone: the
	 * MP4's moov atom is written during teardown, and returning a path to a file
	 * whose index is still being written would hand the app an unplayable
	 * recording.
	 */
	async stop(): Promise<LinuxCaptureResult> {
		this.stopping = true;
		this.rejectClockQueries();
		const child = this.process;
		if (!child) {
			if (this.stopped) {
				await this.finalizePolicyBinding();
				return this.stopped;
			}
			throw new Error("The Linux capture helper is not running.");
		}

		this.completeCursorPauseRange();
		const exited = new Promise<void>((resolve, reject) => {
			this.stoppedResolve = resolve;
			this.stoppedReject = reject;
		});
		this.write("stop");
		try {
			child.stdin.end();
		} catch {
			// Already closed if the helper died on its own; the exit handler runs.
		}

		const timer = setTimeout(() => {
			console.error("[capture-linux] helper did not exit in time; terminating");
			this.kill();
		}, STOP_TIMEOUT_MS);
		try {
			await exited;
		} finally {
			clearTimeout(timer);
		}

		if (!this.stopped) {
			throw new Error(this.lastError ?? "The Linux capture helper produced no output file.");
		}
		await this.finalizePolicyBinding();
		return this.stopped;
	}

	private finalizePolicyBinding(): Promise<void> {
		if (!this.capturePolicyPath) return Promise.resolve();
		if (!this.bindingPromise)
			this.bindingPromise = bindCapturePolicyToMedia(this.config.outputPath, this.captureId)
				.then(() => undefined)
				.catch(() => {
					this.inputWarning =
						"Capture policy could not be bound to finished media; treat button evidence as unverified.";
				});
		return this.bindingPromise;
	}

	/** Kills the helper and discards whatever it wrote. */
	discard() {
		this.discarded = true;
		this.rejectClockQueries();
		this.kill();
		if (!this.process) this.releaseDestination?.();
	}

	/** Renegotiation may reuse the path only after the previous child actually exits. */
	async discardAndWait(): Promise<void> {
		const child = this.process;
		if (!child) {
			this.discard();
			return;
		}
		const exited = new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				child.removeListener("exit", done);
				child.removeListener("error", failedSpawn);
				reject(
					new Error(
						"Previous Linux capture helper did not exit; its destination remains reserved.",
					),
				);
			}, 5000);
			const failedSpawn = () => {
				if (!child.pid) done();
			};
			const done = () => {
				clearTimeout(timer);
				child.removeListener("exit", done);
				child.removeListener("error", failedSpawn);
				resolve();
			};
			child.once("exit", done);
			child.on("error", failedSpawn);
		});
		this.discard();
		await exited;
	}

	/** Read-only query of the encoder's own clock; never derives it from UTC or parent controls. */
	get clockIdentity(): string {
		return this.captureId;
	}
	sampleClock(): Promise<NativeClockSnapshot> {
		if (!this.process || this.stopping || this.stopped || this.discarded)
			return Promise.reject(new NativeClockSourceEndedError());
		if (!this.clockSnapshotSupported)
			return Promise.reject(new Error("Native recording clock snapshots are unavailable"));
		if (this.clockQueries.size >= 4)
			return Promise.reject(new Error("Native recording clock query capacity reached"));
		const requestId = randomUUID();
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.clockQueries.delete(requestId);
				reject(new Error("Native recording clock query timed out"));
			}, 1000);
			this.clockQueries.set(requestId, { resolve, reject, timer });
			this.write(`clock ${requestId}`);
		});
	}
	private rejectClockQueries() {
		for (const pending of this.clockQueries.values()) {
			clearTimeout(pending.timer);
			pending.reject(new NativeClockSourceEndedError());
		}
		this.clockQueries.clear();
	}

	private write(command: string) {
		try {
			this.process?.stdin.write(`${command}\n`);
		} catch {
			// The helper is gone; stop()/exit already reports that.
		}
	}

	private kill() {
		const child = this.process;
		if (!child || child.killed) {
			return;
		}
		child.kill("SIGTERM");
		setTimeout(() => {
			if (this.process === child) {
				child.kill("SIGKILL");
			}
		}, 500).unref();
	}

	private handleStdout(chunk: string) {
		this.lines.push(chunk, (line) => {
			let payload: PipeWireHelperEvent;
			try {
				const decoded: unknown = JSON.parse(line);
				if (
					!decoded ||
					typeof decoded !== "object" ||
					Array.isArray(decoded) ||
					typeof (decoded as { event?: unknown }).event !== "string"
				)
					throw new Error("Invalid helper envelope");
				payload = decoded as PipeWireHelperEvent;
			} catch {
				// Parse errors can quote the original payload. Never retain an unknown
				// record in diagnostics where an input privacy decision cannot be applied.
				this.appendHelperOutput("[protocol] malformed helper record omitted\n");
				console.error("[capture-linux] malformed helper record omitted");
				return;
			}
			if (!HELPER_EVENTS.has(payload.event)) return;
			if (
				payload.event === "warning" &&
				(typeof payload.code !== "string" || typeof payload.message !== "string")
			)
				return;
			const privateInputLine =
				payload.event === "input-capture-status" ||
				payload.event === "input-drain" ||
				payload.event === "capture-boundary" ||
				payload.event === "input-discontinuity" ||
				(payload.event === "warning" &&
					typeof payload.code === "string" &&
					payload.code.startsWith("click-capture-"));
			if (
				payload.event !== "clock-snapshot" &&
				payload.event !== "cursor-sample" &&
				payload.event !== "pointer-button" &&
				((this.buttonDecision.allowed && this.capturing && !this.stopped) || !privateInputLine)
			) {
				this.appendHelperOutput(`${line}\n`);
			}
			this.handleEvent(payload);
		});
	}

	private handleEvent(payload: PipeWireHelperEvent) {
		switch (payload.event) {
			case "clock-snapshot": {
				const parsed = nativeClockSnapshotEventSchema.safeParse(payload);
				if (!parsed.success) return;
				const pending = this.clockQueries.get(parsed.data.requestId);
				if (!pending) return;
				const { event: _event, schemaVersion: _schemaVersion, requestId, ...fields } = parsed.data;
				const point = nativeClockSnapshotSchema.safeParse({
					version: 1,
					clockId: this.captureId,
					...fields,
				});
				this.clockQueries.delete(requestId);
				clearTimeout(pending.timer);
				if (point.success) pending.resolve(point.data);
				else pending.reject(new Error("Invalid native recording clock response"));
				return;
			}

			case "input-capture-status":
				if (this.inputSuppressed) return;
				this.inputStatus = {
					event: "input-capture-status",
					state: payload.state,
					driver: payload.driver,
					scope: payload.scope,
				};
				this.journal?.append(this.inputStatus);
				return;
			case "input-discontinuity":
				if (this.buttonDecision.allowed && this.capturing && !this.stopped)
					this.journal?.append(payload);
				return;
			case "capture-boundary":
				if (this.capturing && !this.stopped) {
					this.journal?.append(
						this.buttonDecision.allowed
							? payload
							: {
									event: "capture-boundary",
									timestampMs: payload.timestampMs,
									monotonicMs: payload.monotonicMs,
									mediaTimeMs: payload.mediaTimeMs,
									reason: payload.reason,
									intervalId: payload.intervalId,
									buttonStateObservation: "suppressed",
									buttonsDown: [],
								},
					);
				}
				return;
			case "input-drain":
				if (!this.buttonDecision.allowed) return;
				if (this.capturing && !this.stopped)
					this.journal?.append({
						event: "input-drain",
						monotonicMs: payload.monotonicMs,
						scope: payload.scope,
						completed: payload.completed,
						processedMessages: payload.processedMessages,
						acceptedEdges: payload.acceptedEdges,
						excludedEdges: payload.excludedEdges,
					});
				return;
			case "pointer-button":
				// Native driver projects reader observations through the encoder
				// pause history, including late delivery from closed intervals. Never derive clicks from cursor samples a second time.
				if (this.buttonDecision.allowed && this.capturing && !this.stopped)
					this.journal?.append(payload);
				return;
			case "ready":
				this.clockSnapshotSupported = payload.clockSnapshotVersion === 1;
				if (payload.buttonPrivacyVersion !== 1) {
					this.suppressButtonEvidence();
					this.rejectReady(
						new Error(
							"The Linux helper lacks button privacy controls. Rebuild it with npm run build:native:linux.",
						),
					);
					this.kill();
					return;
				}
				if (payload.cursorMode === "metadata" || payload.cursorMode === "embedded") {
					this.negotiatedCursorMode = payload.cursorMode;
				}
				this.resolveReady();
				return;

			case "source-selected":
				if (payload.sourceKind) {
					this.sourceKind = payload.sourceKind;
				}
				this.sourceSelected = true;
				console.info(
					"[capture-linux] source selected",
					JSON.stringify({ sourceKind: payload.sourceKind ?? null }),
				);
				this.sourceSelectedResolve?.();
				this.sourceSelectedResolve = null;
				this.sourceSelectedReject = null;
				this.startFirstFrameTimer();
				return;

			case "stream-started":
				if (payload.sourceKind) {
					this.sourceKind = payload.sourceKind;
				}
				// The source kind is logged unconditionally for the same reason
				// as the audio node: when someone reports "I picked a window and
				// got my whole screen", this line is the answer, and it is the
				// only place the truth appears — the app cannot name a source
				// when asking the portal, so nothing upstream knows it.
				console.info(
					"[capture-linux] portal stream started",
					JSON.stringify({
						width: payload.width,
						height: payload.height,
						sourceKind: payload.sourceKind ?? null,
					}),
				);
				return;

			case "audio-source":
				// Logged unconditionally: when someone reports "that is not my
				// microphone", this line is the answer.
				console.info(
					"[capture-linux] audio source",
					JSON.stringify({
						role: payload.role,
						requested: payload.requested ?? null,
						node: payload.node ?? null,
					}),
				);
				if (payload.requested && !payload.node) {
					console.warn(
						`[capture-linux] no PipeWire node matched ${JSON.stringify(payload.requested)}; ` +
							"the session default source was recorded instead",
					);
				}
				return;

			case "encoder-selection":
				this.videoEncoder = payload.video;
				console.info(
					"[capture-linux] encoder",
					JSON.stringify({ video: payload.video, rejected: payload.rejected ?? [] }),
				);
				return;

			case "capture-started":
				// Cursor samples started flowing when the helper did, which was
				// before the portal picker. The recording's zero is HERE, so the
				// telemetry is re-based onto it and anything from during the
				// picker is dropped rather than left pinned to the start.
				this.cursor.rebase(payload.timestampMs);
				this.cursorRecordingStartMs = payload.timestampMs;
				this.capturing = true;
				if (this.config.capturePrivacyPolicy !== undefined) {
					try {
						this.capturePolicyPath = writeCapturePolicyReceipt(this.config.outputPath, {
							version: 2,
							captureId: this.captureId,
							policy: this.privacyPolicy,
							applicationIdentity: "unavailable",
							collectionAllowedAtStart: this.buttonDecision.allowed,
							suppressedAtStart: this.inputSuppressed,
						});
					} catch {
						this.inputWarning =
							"Button evidence suppressed: capture policy receipt could not be saved.";
						this.suppressButtonEvidence();
					}
				}

				if (this.buttonDecision.allowed && this.config.captureInputEvents && !this.journal) {
					this.journal = new CaptureEventJournal(this.config.outputPath, (error) => {
						this.inputWarning = "Input event journal could not be saved. Video continues.";
						console.error("[capture-linux] input event journal failed; video continues", error);
					});
					this.journal.append({
						event: "session-start",
						helperMonotonicMs: payload.monotonicMs ?? null,
						mediaTimeMs: payload.mediaTimeMs ?? null,
						timestampMs: payload.timestampMs,
						videoPath: this.config.outputPath,
						sourceKind: this.sourceKind ?? null,
						application: null,
						window: null,
					});
					this.journal.append(this.inputStatus);
				}
				console.info(
					"[capture-linux] capture started",
					JSON.stringify({ width: payload.width, height: payload.height, fps: payload.fps }),
				);
				this.startedResolve?.();
				this.startedResolve = null;
				this.startedReject = null;
				return;

			case "cursor-sample":
				if (
					payload.interactionType === "click" &&
					(!this.capturing || this.stopped !== null || !this.buttonDecision.allowed)
				)
					return;
				this.cursor.addSample(payload);
				return;

			case "capture-stopped":
				this.journal?.append({ event: "session-end", durationMs: payload.durationMs });
				this.stopped = {
					...(this.capturePolicyPath ? { capturePolicyPath: this.capturePolicyPath } : {}),
					...(this.journal
						? {
								inputEvents: {
									path: this.journal.path,
									status: this.inputCaptureHealth.state,
								},
							}
						: {}),
					path: payload.path,
					durationMs: payload.durationMs,
					frames: payload.frames,
					droppedFrames: payload.dropped,
					cursor: this.cursor.toRecordingData(this.cursorPauseRanges),
					...(this.sourceKind ? { sourceKind: this.sourceKind } : {}),
					...(this.videoEncoder ? { videoEncoder: this.videoEncoder } : {}),
				};
				console.info(
					"[capture-linux] capture stopped",
					JSON.stringify({
						frames: payload.frames,
						dropped: payload.dropped,
						durationMs: payload.durationMs,
						convertMs: payload.convertMs,
						uploadMs: payload.uploadMs,
						encodeMs: payload.encodeMs,
					}),
				);
				return;

			case "warning":
				if (typeof payload.code !== "string" || typeof payload.message !== "string") return;
				if (
					payload.code.startsWith("click-capture-") &&
					(!this.capturing || this.stopped !== null || !this.buttonDecision.allowed)
				)
					return;
				if (payload.code.startsWith("click-capture-") && this.buttonDecision.allowed) {
					this.inputWarning = payload.message;
					this.journal?.append({
						event: "input-warning",
						code: payload.code,
						message: payload.message,
					});
				}
				console.warn(`[capture-linux] ${payload.code}: ${payload.message}`);
				return;

			case "error":
				console.error(`[capture-linux] ${payload.code}: ${payload.message}`);
				// Kept so the process-exit handler can report the CAUSE rather
				// than just the exit code, which on its own says nothing useful.
				this.lastError = payload.message;
				this.rejectReady(new Error(payload.message));
				this.sourceSelectedReject?.(new Error(payload.message));
				this.sourceSelectedReject = null;
				this.sourceSelectedResolve = null;
				return;

			case "debug":
				console.info("[capture-linux][debug]", JSON.stringify(payload));
				return;
		}
	}

	private resolveReady() {
		const resolve = this.readyResolve;
		this.clearReadyState();
		resolve?.();
	}

	private rejectReady(error: Error) {
		const reject = this.readyReject;
		this.clearReadyState();
		reject?.(error);
	}

	private clearReadyState() {
		if (this.readyTimer) {
			clearTimeout(this.readyTimer);
			this.readyTimer = null;
		}
		this.readyResolve = null;
		this.readyReject = null;
	}
}
