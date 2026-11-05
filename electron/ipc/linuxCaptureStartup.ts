import path from "node:path";
import {
	decideButtonCollection,
	normalizeCapturePrivacyPolicy,
} from "../../src/lib/capturePrivacy";
import {
	type NativeLinuxRecordingRequest,
	portalCursorMode,
} from "../../src/lib/nativeLinuxRecording";
import { type CursorCaptureMode, normalizeCursorCaptureMode } from "../../src/lib/recordingSession";
import type {
	LinuxCaptureConfig,
	LinuxCaptureSourceKind,
} from "../native-bridge/capture/linuxNativeCaptureSession";

export interface LinuxStartupSession {
	start(): Promise<void>;
	waitUntilSourceSelected(): Promise<void>;
	waitUntilCapturing(): Promise<void>;
	arm(): void;
	discard(): void;
	suppressButtonEvidence(): void;
	readonly cursorMode: "metadata" | "embedded";
	readonly grantedSourceKind: LinuxCaptureSourceKind | undefined;
}
interface Context<T extends LinuxStartupSession> {
	handle(
		channel: string,
		handler: (event: unknown, request: NativeLinuxRecordingRequest) => Promise<unknown>,
	): void;
	platform(): string;
	helperAvailable(): boolean;
	readPolicy(): unknown;
	mkdir(): Promise<unknown>;
	recordingsDir: string;
	filePrefix: string;
	maxCursorSamples: number;
	createSession(config: LinuxCaptureConfig): T;
	active(): T | null;
	onCandidate(session: T): void;
	onStarted(session: T, recordingId: number, cursorMode: CursorCaptureMode): void;
	removeEmptyOutput(output: string): Promise<void>;
}

/** The actual IPC callbacks live here so asynchronous consent races are executable tests. */
export class LinuxCaptureStartup<T extends LinuxStartupSession> {
	private prepared: {
		session: T;
		outputPath: string;
		request: NativeLinuxRecordingRequest;
	} | null = null;
	private preparing: { token: symbol; session: T | null } | null = null;
	private last: T | null = null;
	private starting = false;
	private revoked = false;
	constructor(private readonly context: Context<T>) {}

	register() {
		this.context.handle("prepare-native-linux-recording", (_, request) => this.prepare(request));
		this.context.handle("start-native-linux-recording", (_, request) => this.start(request));
		this.context.handle("cancel-native-linux-prepare", async () => {
			this.cancel();
			return { success: true };
		});
	}

	/** Revoke immediately, including requests whose durable save later fails. */
	requestPolicy(value: unknown) {
		if (decideButtonCollection(normalizeCapturePrivacyPolicy(value), null).allowed) return;
		this.revoked = true;
		this.suppress();
	}
	confirmPolicy(value: unknown) {
		this.revoked = !decideButtonCollection(normalizeCapturePrivacyPolicy(value), null).allowed;
	}
	suppress() {
		for (const session of new Set([
			this.context.active(),
			this.prepared?.session,
			this.preparing?.session,
			this.last,
		]))
			session?.suppressButtonEvidence();
	}
	cancel() {
		this.preparing?.session?.discard();
		this.preparing = null;
		this.prepared?.session.discard();
		this.prepared = null;
	}
	private canonical(request: NativeLinuxRecordingRequest): NativeLinuxRecordingRequest {
		return {
			...request,
			capturePrivacyPolicy: normalizeCapturePrivacyPolicy(this.context.readPolicy()),
		};
	}
	private guard(session: T) {
		if (
			this.revoked ||
			!decideButtonCollection(normalizeCapturePrivacyPolicy(this.context.readPolicy()), null)
				.allowed
		)
			session.suppressButtonEvidence();
	}
	private track(session: T) {
		this.last = session;
		this.context.onCandidate(session);
		// No await between registration and re-reading current consent.
		this.guard(session);
	}
	private config(
		request: NativeLinuxRecordingRequest,
		outputPath: string,
		deferred: boolean,
	): LinuxCaptureConfig {
		const privacy = normalizeCapturePrivacyPolicy(request.capturePrivacyPolicy);
		return {
			outputPath,
			capturePrivacyPolicy: privacy,
			captureInputEvents: decideButtonCollection(privacy, null).allowed,
			cursorMode: portalCursorMode(
				normalizeCursorCaptureMode(request.cursor?.mode) ?? "editable-overlay",
			),
			fps: request.video.fps,
			...(request.video.bitrate ? { bitrate: request.video.bitrate } : {}),
			audio: request.audio,
			maxCursorSamples: this.context.maxCursorSamples,
			...(deferred ? { deferStart: true } : {}),
		};
	}
	private identity(request: NativeLinuxRecordingRequest) {
		const recordingId =
			typeof request?.recordingId === "number" && Number.isFinite(request.recordingId)
				? request.recordingId
				: Date.now();
		return {
			recordingId,
			outputPath: path.join(
				this.context.recordingsDir,
				`${this.context.filePrefix}${recordingId}.mp4`,
			),
		};
	}
	private settings(request: NativeLinuxRecordingRequest) {
		return JSON.stringify(this.config(request, "", false));
	}
	private takePrepared(outputPath: string, request: NativeLinuxRecordingRequest): T | null {
		const prepared = this.prepared;
		this.prepared = null;
		if (!prepared) return null;
		if (
			prepared.outputPath !== outputPath ||
			this.settings(prepared.request) !== this.settings(request)
		) {
			prepared.session.discard();
			return null;
		}
		return prepared.session;
	}
	private async prepare(input: NativeLinuxRecordingRequest) {
		if (this.context.platform() !== "linux")
			return { success: false, reason: "unsupported-platform" };
		if (this.context.active() || this.starting)
			return { success: false, reason: "already-recording" };
		this.cancel();
		const token = Symbol("linux-prepare");
		this.preparing = { token, session: null };
		try {
			if (!this.context.helperAvailable()) {
				this.preparing = null;
				return { success: false, reason: "missing-helper" };
			}
			const { recordingId, outputPath } = this.identity(input);
			await this.context.mkdir();
			if (this.preparing?.token !== token) return { success: false, reason: "cancelled" };
			const request = this.canonical(input);
			const session = this.context.createSession(this.config(request, outputPath, true));
			this.preparing.session = session;
			this.track(session);
			await session.start();
			await session.waitUntilSourceSelected();
			if (this.preparing?.token !== token) {
				session.discard();
				return { success: false, reason: "cancelled" };
			}
			this.preparing = null;
			this.prepared = { session, outputPath, request };
			return { success: true, recordingId, sourceKind: session.grantedSourceKind ?? null };
		} catch (error) {
			if (this.preparing?.token === token) this.cancel();
			return { success: false, error: String(error) };
		}
	}
	private async start(input: NativeLinuxRecordingRequest) {
		if (this.context.platform() !== "linux")
			return { success: false, error: "Native Linux capture requires Linux." };
		if (this.context.active() || this.starting)
			return { success: false, error: "Native Linux capture is already running." };
		this.starting = true;
		let outputPath: string | undefined;
		let candidate: T | undefined;
		try {
			if (!this.context.helperAvailable())
				return { success: false, error: "Native Linux capture helper is not available." };
			const identity = this.identity(input);
			outputPath = identity.outputPath;
			await this.context.mkdir();
			const request = this.canonical(input);
			const prepared = this.takePrepared(outputPath, request);
			if (this.preparing) this.cancel();
			const session =
				prepared ?? this.context.createSession(this.config(request, outputPath, false));
			candidate = session;
			this.track(session);
			if (!prepared) {
				await session.start();
				await session.waitUntilSourceSelected();
			}
			session.arm();
			await session.waitUntilCapturing();
			const cursorMode =
				session.cursorMode === "metadata"
					? "editable-overlay"
					: (normalizeCursorCaptureMode(request.cursor?.mode) ?? "editable-overlay");
			this.context.onStarted(session, identity.recordingId, cursorMode);
			return { success: true, recordingId: identity.recordingId, path: outputPath };
		} catch (error) {
			candidate?.discard();
			if (
				outputPath &&
				!(
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "CAPTURE_DESTINATION_EXISTS"
				)
			)
				await this.context.removeEmptyOutput(outputPath);
			return { success: false, error: String(error) };
		} finally {
			this.starting = false;
		}
	}
}
