import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { disabledCapturePrivacyPolicy } from "../../src/lib/capturePrivacy";
import type { NativeLinuxRecordingRequest } from "../../src/lib/nativeLinuxRecording";
import { AppSettingsStore } from "../app-settings";
import type { LinuxCaptureConfig } from "../native-bridge/capture/linuxNativeCaptureSession";
import { LinuxCaptureStartup } from "./linuxCaptureStartup";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
class FakeSession {
	suppressed = false;
	discarded = false;
	buttonReaderStarted: boolean | null = null;
	readonly cursorMode = "metadata" as const;
	readonly grantedSourceKind = "window" as const;
	constructor(readonly config: LinuxCaptureConfig) {}
	async start() {
		this.buttonReaderStarted =
			this.config.capturePrivacyPolicy?.buttonScope === "global" && !this.suppressed;
	}
	async waitUntilSourceSelected() {
		return undefined;
	}
	async waitUntilCapturing() {
		return undefined;
	}
	arm() {
		return undefined;
	}
	discard() {
		this.discarded = true;
	}
	suppressButtonEvidence() {
		this.suppressed = true;
	}
}
const request: NativeLinuxRecordingRequest = {
	recordingId: 7,
	video: { fps: 30 },
	cursor: { mode: "editable-overlay" },
	audio: { system: { enabled: false }, microphone: { enabled: false, gain: 1 } },
};
async function fixture() {
	const root = await fs.mkdtemp(path.join(tmpdir(), "linux-start-privacy-"));
	roots.push(root);
	const store = new AppSettingsStore(root);
	store.setRecordingPreferences({
		capturePrivacyPolicy: { ...disabledCapturePrivacyPolicy(), buttonScope: "global" },
	});
	let release: () => void = () => undefined;
	const barrier = new Promise<void>((resolve) => {
		release = resolve;
	});
	const handlers = new Map<
		string,
		(event: unknown, request: NativeLinuxRecordingRequest) => Promise<unknown>
	>();
	const sessions: FakeSession[] = [];
	let active: FakeSession | null = null;
	const mkdir = vi.fn(async () => {
		await barrier;
		await fs.mkdir(path.join(root, "recordings"), { recursive: true });
	});
	const onStarted = vi.fn((session: FakeSession) => {
		active = session;
	});
	const manager = new LinuxCaptureStartup({
		handle: (channel, handler) => {
			handlers.set(channel, handler);
		},
		platform: () => "linux",
		helperAvailable: () => true,
		readPolicy: () => store.getSnapshot().recording.capturePrivacyPolicy,
		mkdir,
		recordingsDir: path.join(root, "recordings"),
		filePrefix: "recording-",
		maxCursorSamples: 100,
		createSession: (config) => {
			const session = new FakeSession(config);
			sessions.push(session);
			return session;
		},
		active: () => active,
		onCandidate: () => undefined,
		onStarted,
		removeEmptyOutput: async () => undefined,
	});
	manager.register();
	return { store, manager, sessions, release, handlers, mkdir, onStarted };
}
it.each([
	"prepare",
	"start",
])("the actual %s IPC callback rechecks a durable reduction across mkdir before starting readers", async (mode) => {
	const f = await fixture();
	const pending = f.handlers.get(`${mode}-native-linux-recording`)!(undefined, request);
	expect(f.mkdir).toHaveBeenCalledTimes(1);
	f.store.setRecordingPreferences({ capturePrivacyPolicy: disabledCapturePrivacyPolicy() });
	f.manager.requestPolicy(disabledCapturePrivacyPolicy());
	f.release();
	expect(await pending).toMatchObject({ success: true });
	expect(f.sessions).toHaveLength(1);
	expect(f.sessions[0].config.capturePrivacyPolicy?.buttonScope).toBe("off");
	expect(f.sessions[0].buttonReaderStarted).toBe(false);
	expect(f.onStarted).toHaveBeenCalledTimes(mode === "start" ? 1 : 0);
});
it.each([
	"prepare",
	"start",
])("the actual %s IPC callback honors a failed-save revocation while no candidate exists", async (mode) => {
	const f = await fixture();
	const pending = f.handlers.get(`${mode}-native-linux-recording`)!(undefined, request);
	f.manager.requestPolicy(disabledCapturePrivacyPolicy()); // durable save failed: old global remains
	f.release();
	expect(await pending).toMatchObject({ success: true });
	expect(f.store.getSnapshot().recording.capturePrivacyPolicy?.buttonScope).toBe("global");
	expect(f.sessions[0].suppressed).toBe(true);
	expect(f.sessions[0].buttonReaderStarted).toBe(false);
	expect(f.onStarted).toHaveBeenCalledTimes(mode === "start" ? 1 : 0);
});
it("cancels a pending prepare before mkdir completes without creating a helper", async () => {
	const f = await fixture();
	const pending = f.handlers.get("prepare-native-linux-recording")!(undefined, request);
	await f.handlers.get("cancel-native-linux-prepare")!(undefined, request);
	f.release();
	expect(await pending).toMatchObject({ success: false, reason: "cancelled" });
	expect(f.sessions).toHaveLength(0);
});
it("a successful later authorization affects a new session but never reenables an existing take", async () => {
	const f = await fixture();
	f.manager.requestPolicy(disabledCapturePrivacyPolicy());
	f.release();
	await f.handlers.get("prepare-native-linux-recording")!(undefined, request);
	expect(f.sessions[0].suppressed).toBe(true);
	const global = { ...disabledCapturePrivacyPolicy(), buttonScope: "global" as const };
	f.store.setRecordingPreferences({ capturePrivacyPolicy: global });
	f.manager.confirmPolicy(global);
	await f.handlers.get("start-native-linux-recording")!(undefined, { ...request, recordingId: 8 });
	expect(f.sessions[0].discarded).toBe(true);
	expect(f.sessions[1].buttonReaderStarted).toBe(true);
});
