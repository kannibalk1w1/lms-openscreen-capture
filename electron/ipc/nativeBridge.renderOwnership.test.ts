import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { AI_EDITION_OPEN_PROJECT_CHANNEL, NATIVE_BRIDGE_CHANNEL } from "../../src/native/contracts";
import { LessonService } from "../lesson/service";
import type { CompositorViewAddon } from "../native/compositor-view/addon";
import { CompositorViewService } from "../native-bridge/services/compositorViewService";
import { registerLessonHandlers } from "./lesson";
import { type NativeBridgeContext, registerNativeBridgeHandlers } from "./nativeBridge";

const state = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	exportMulti: vi.fn(),
	renderFrames: vi.fn(),
	cancel: vi.fn(() => true),
}));
vi.mock("electron", () => ({
	app: { getAppPath: () => "", getPath: () => "/fixture", isPackaged: false },
	ipcMain: { handle: state.handle, on: state.on, removeHandler: vi.fn() },
	shell: {},
}));
vi.mock("../native-bridge/services/aiEditionService", () => ({ AiEditionService: class {} }));
vi.mock("../native-bridge/services/compositorViewService", async () => {
	const actual = await vi.importActual<
		typeof import("../native-bridge/services/compositorViewService")
	>("../native-bridge/services/compositorViewService");
	return {
		...actual,
		CompositorViewService: class extends actual.CompositorViewService {
			constructor() {
				super({
					addon: {
						exportMulti: state.exportMulti,
						renderFrames: state.renderFrames,
						createMp4ExportControl: () => ({}),
						cancelMp4Export: state.cancel,
					} as unknown as CompositorViewAddon,
				});
			}
		},
	};
});
function owner() {
	return Object.assign(new EventEmitter(), {
		id: 7,
		mainFrame: {},
		isDestroyed: () => false,
		send: vi.fn(),
	});
}
const stats = { frames: 1, fps: 30, wallS: 1, videoDurationS: 1 / 30 };
function setup() {
	registerNativeBridgeHandlers({
		getPlatform: () => "linux",
		getAiEditionDocuments: () => ({}),
		getAiEditionLlmConfig: () => ({}),
	} as unknown as NativeBridgeContext);
	const handler = state.handle.mock.calls.find(([name]) => name === NATIVE_BRIDGE_CHANNEL)![1];
	return (
		sender: ReturnType<typeof owner>,
		action: string,
		payload: unknown,
		frame = sender.mainFrame,
	) => handler({ sender, senderFrame: frame }, { domain: "compositor", action, payload });
}
beforeEach(() => {
	state.handle.mockClear();
	state.on.mockClear();
	state.exportMulti.mockReset();
	state.renderFrames.mockReset();
	state.cancel.mockClear();
});
it("serializes real production bridge and lesson-still registrations across compositor instances", async () => {
	const invoke = setup(),
		a = owner(),
		b = owner();
	let finish!: (n: typeof stats) => void;
	state.exportMulti.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const exportId = randomUUID(),
		running = invoke(a, "exportMulti", { clips: [], outPath: "/fixture/a.mp4", exportId });
	await vi.waitFor(() => expect(state.exportMulti).toHaveBeenCalledOnce());
	const doc = createEmptyDocument({ projectId: "p", title: "Fixture" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "screen",
			originalPath: "/fixture/screen.mp4",
			cameraTrack: null,
			durationSec: 1,
			video: { codec: "h264", fps: 30, width: 64, height: 32 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 1,
			timelineStartSec: 0,
			timelineEndSec: 1,
			origin: "user",
			reason: "test",
			wordRefs: [],
		},
	];
	const service = new CompositorViewService();
	registerLessonHandlers(
		new LessonService(
			async () => doc,
			(...args) => service.renderFrames(...args),
		),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
	);
	const still = state.handle.mock.calls.find(([name]) => name === "lesson:frame")![1];
	const input = { projectId: "p", rulerSec: 0, documentSha256: await lessonRenderFingerprint(doc) };
	expect(await still({ sender: b, senderFrame: b.mainFrame }, input)).toEqual({
		success: false,
		code: "render-busy",
	});
	expect(state.renderFrames).not.toHaveBeenCalled();
	expect(await invoke(b, "cancelExport", { exportId })).toMatchObject({
		data: { accepted: false },
	});
	expect(await invoke(a, "cancelExport", { exportId }, {})).toMatchObject({
		ok: false,
		error: { code: "INVALID_REQUEST" },
	});
	expect(state.cancel).not.toHaveBeenCalled();
	finish(stats);
	expect(await running).toMatchObject({ ok: true });
	const image = await imageFixture();
	state.renderFrames.mockResolvedValue([
		{
			index: 0,
			width: image.width,
			height: image.height,
			jpeg: Buffer.from(image.base64, "base64"),
		},
	]);
	expect(await still({ sender: b, senderFrame: b.mainFrame }, input)).toMatchObject({
		success: true,
	});
});
it("owns legacy no-ID CLI exports and invalidates project switches without freeing native work early", async () => {
	const invoke = setup(),
		a = owner(),
		b = owner();
	let finish!: (n: typeof stats) => void;
	state.exportMulti.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const running = invoke(a, "exportMulti", { clips: [], outPath: "/fixture/cli.mp4" });
	await vi.waitFor(() => expect(state.exportMulti).toHaveBeenCalledOnce());
	const project = state.on.mock.calls.find(
		([name]) => name === AI_EDITION_OPEN_PROJECT_CHANNEL,
	)![1];
	project({ sender: a, senderFrame: a.mainFrame }, "other");
	expect(
		await invoke(b, "exportMulti", {
			clips: [],
			outPath: "/fixture/b.mp4",
			exportId: randomUUID(),
		}),
	).toMatchObject({ ok: false });
	expect(state.exportMulti).toHaveBeenCalledOnce();
	finish(stats);
	expect(await running).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
	state.exportMulti.mockResolvedValueOnce(stats);
	expect(
		await invoke(b, "exportMulti", {
			clips: [],
			outPath: "/fixture/b.mp4",
			exportId: randomUUID(),
		}),
	).toMatchObject({ ok: true });
});
it("old IDs and wrong owners cannot cancel a later operation; failed jobs release normally", async () => {
	const invoke = setup(),
		a = owner(),
		b = owner();
	const oldId = randomUUID();
	state.exportMulti.mockRejectedValueOnce(new Error("native failure"));
	expect(await invoke(a, "exportMulti", { clips: [], exportId: oldId })).toMatchObject({
		ok: false,
	});
	let finish!: (n: typeof stats) => void;
	state.exportMulti.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const nextId = randomUUID(),
		next = invoke(a, "exportMulti", { clips: [], exportId: nextId });
	await vi.waitFor(() => expect(state.exportMulti).toHaveBeenCalledTimes(2));
	expect(await invoke(a, "cancelExport", { exportId: oldId })).toMatchObject({
		data: { accepted: false },
	});
	expect(await invoke(b, "cancelExport", { exportId: nextId })).toMatchObject({
		data: { accepted: false },
	});
	finish(stats);
	expect(await next).toMatchObject({ ok: true });
	expect(await invoke(a, "exportMulti", { clips: [], exportId: oldId })).toMatchObject({
		ok: false,
	});
	expect(state.exportMulti).toHaveBeenCalledTimes(2);
});

it("a still's project context is rechecked after native rendering and lifecycle cannot certify stale images", async () => {
	setup();
	const sender = owner();
	let current = true,
		finish!: (value: null) => void;
	const service = {
		captureFrame: vi.fn(
			() =>
				new Promise<null>((resolve) => {
					finish = resolve;
				}),
		),
	};
	registerLessonHandlers(service as unknown as LessonService, () => ({
		projectId: "p",
		assertCurrent: () => {
			if (!current) throw new Error("stale");
		},
	}));
	const handler = state.handle.mock.calls.find(([name]) => name === "lesson:frame")![1];
	const pending = handler({ sender, senderFrame: sender.mainFrame }, { projectId: "p" });
	current = false;
	sender.emit("did-start-navigation");
	finish(null);
	expect(await pending).toMatchObject({ success: false });
});
