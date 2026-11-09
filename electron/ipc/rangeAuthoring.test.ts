import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { EditorRangeSessions } from "../lesson/editorRangeSession";
import { RangeAuthoringService } from "../lesson/rangeAuthoring";
import { registerRangeAuthoringHandlers } from "./rangeAuthoring";

const electron = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: electron.handle } }));
let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	electron.handle.mockClear();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-ipc-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = path.join(root, "screen.mp4");
	await fs.writeFile(source, "source bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Fixture" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "screen",
			originalPath: source,
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
			reason: "fixture",
			wordRefs: [],
		},
	];
	doc.legacyEditor = { aspectRatio: "2:1", wallpaper: "#ffffff" };
	const sessions = new EditorRangeSessions(),
		sender = Object.assign(new EventEmitter(), {
			getURL: () => "file:///app?windowType=editor",
			isDestroyed: () => false,
			mainFrame: {},
		});
	const event = { sender, senderFrame: sender.mainFrame };
	sessions.register(sender, sender.getURL());
	sessions.select(sender, "p");
	const read = vi.fn(async () => doc),
		service = new RangeAuthoringService(read);
	registerRangeAuthoringHandlers(service, (event) => ({
		...sessions.capture(event.sender, () => false),
		canReadSource: (p) => p === source,
	}));
	const callback = (channel: string) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1];
	const step = newStep(),
		lesson = { ...newLesson(), steps: [step] };
	const request = {
		operationId: randomUUID(),
		lesson,
		stepId: step.id,
		intent: "author-current",
		range: {
			projectId: "p",
			documentSha256: await lessonRenderFingerprint(doc),
			startSec: 0,
			endSec: 1,
		},
	};
	return {
		source,
		doc,
		read,
		service,
		sessions,
		sender,
		event,
		request,
		confirm: callback("lesson:confirm-range"),
		cancel: callback("lesson:cancel-range"),
	};
}
it("actual handler/service confirms and refuses foreign frames, unknown editors, paths and stale projects before reads", async () => {
	const f = await fixture();
	expect(await f.confirm({ ...f.event, senderFrame: {} }, f.request)).toEqual({
		success: false,
		code: "project-changed",
	});
	const unknown = Object.assign(new EventEmitter(), {
		getURL: () => "file:///app?windowType=editor",
		isDestroyed: () => false,
		mainFrame: {},
	});
	expect(await f.confirm({ sender: unknown, senderFrame: unknown.mainFrame }, f.request)).toEqual({
		success: false,
		code: "project-changed",
	});
	expect(await f.confirm(f.event, { ...f.request, destination: "/PRIVATE_PATH" })).toEqual({
		success: false,
		code: "lesson-operation-failed",
	});
	expect(
		await f.confirm(f.event, { ...f.request, range: { ...f.request.range, projectId: "other" } }),
	).toEqual({ success: false, code: "project-changed" });
	expect(f.read).not.toHaveBeenCalled();
	const result = await f.confirm(f.event, f.request);
	expect(result).toMatchObject({
		success: true,
		result: { version: 2, identity: { basis: "explicit-author-current" } },
	});
	expect(JSON.stringify(result)).not.toContain(f.source);
});
it.each([
	"destroyed",
	"render-process-gone",
	"did-start-navigation",
])("cancels active reads on %s and permits repeat calls afterward", async (name) => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	const pending = f.confirm(f.event, f.request);
	await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	f.sender.emit(name);
	release();
	expect(await pending).toEqual({ success: false, code: "range-source-cancelled" });
	expect((await f.confirm(f.event, { ...f.request, operationId: randomUUID() })).success).toBe(
		true,
	);
	expect(f.sender.listenerCount(name)).toBe(1);
});
it("keeps errors fixed, serializes actual requests, and authenticates cancellation ownership", async () => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	const pending = f.confirm(f.event, f.request);
	await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	expect(await f.confirm(f.event, { ...f.request, operationId: randomUUID() })).toEqual({
		success: false,
		code: "render-busy",
	});
	const stranger = { mainFrame: {} };
	expect(
		await f.cancel({ sender: stranger, senderFrame: stranger.mainFrame }, f.request.operationId),
	).toEqual({ success: true, result: false });
	expect(await f.cancel(f.event, f.request.operationId)).toEqual({ success: true, result: true });
	release();
	expect(await pending).toEqual({ success: false, code: "range-source-cancelled" });
	f.read.mockRejectedValueOnce(new Error("PRIVATE_SOURCE_CANARY"));
	expect(await f.confirm(f.event, f.request)).toEqual({
		success: false,
		code: "lesson-operation-failed",
	});
	await fs.unlink(f.source);
	expect(await f.confirm(f.event, f.request)).toEqual({
		success: false,
		code: "range-source-unavailable",
	});
});
it.each([
	1, 2, 4,
])("returns no pin when the project is replaced during read %s, including same-project reopen", async (readNumber) => {
	const f = await fixture();
	f.read.mockImplementation(async () => {
		if (f.read.mock.calls.length === readNumber) f.sessions.select(f.sender, "p");
		return f.doc;
	});
	expect(await f.confirm(f.event, f.request)).toEqual({ success: false, code: "project-changed" });
});

it("rejects cancellation from an owner's subframe without cancelling its active operation", async () => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	const pending = f.confirm(f.event, f.request);
	await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	expect(await f.cancel({ ...f.event, senderFrame: {} }, f.request.operationId)).toEqual({
		success: false,
		code: "project-changed",
	});
	release();
	expect((await pending).success).toBe(true);
});
