import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import type { LessonService } from "../lesson/service";
import { registerEditorLessonHandlers, registerLessonHandlers } from "./lesson";

const electron = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("electron", () => ({
	app: { getPath: () => "/fixture" },
	ipcMain: { handle: electron.handle },
	dialog: {},
}));
beforeEach(() => electron.handle.mockClear());
afterEach(() => vi.restoreAllMocks());
function owner() {
	return Object.assign(new EventEmitter(), {
		id: 1,
		mainFrame: {},
		getURL: () => "file:///app?windowType=editor",
		isDestroyed: () => false,
	});
}
async function setup(registered = true) {
	const sender = owner(),
		image = await imageFixture(),
		captureFrame = vi.fn(async (_input: unknown) => image);
	let dirty = false;
	if (registered) {
		editorRangeSessions.register(sender, sender.getURL());
		editorRangeSessions.select(sender, "p");
	}
	registerEditorLessonHandlers({ captureFrame } as unknown as LessonService, () => dirty);
	const frame = electron.handle.mock.calls.find(([name]) => name === "lesson:frame")![1];
	return {
		sender,
		image,
		captureFrame,
		frame,
		invoke: (input: unknown, senderFrame = sender.mainFrame) =>
			frame({ sender, senderFrame }, input),
		setDirty: (value: boolean) => {
			dirty = value;
		},
	};
}
it("requires the frame authorizer and the production dirty provider before installing handlers", () => {
	const service = {} as LessonService;
	expect(() => Reflect.apply(registerLessonHandlers, undefined, [service])).toThrow(
		"authorization is required",
	);
	expect(() => Reflect.apply(registerEditorLessonHandlers, undefined, [service])).toThrow(
		"provider is required",
	);
	expect(electron.handle).not.toHaveBeenCalled();
});
it("actual production registration refuses an unregistered caller, and its dirty provider is live", async () => {
	const foreign = await setup(false);
	expect(await foreign.invoke({ projectId: "p" })).toEqual({
		success: false,
		code: "project-changed",
	});
	expect(foreign.captureFrame).not.toHaveBeenCalled();
	electron.handle.mockClear();
	const f = await setup();
	f.setDirty(true);
	expect(await f.invoke({ projectId: "p" })).toEqual({ success: false, code: "project-changed" });
	expect(f.captureFrame).not.toHaveBeenCalled();
	f.setDirty(false);
	expect(await f.invoke({ projectId: "p" })).toEqual({ success: true, result: f.image });
});
it("independently refuses a registered owner's subframe before invoking the service", async () => {
	const f = await setup();
	expect(await f.invoke({ projectId: "p" }, {})).toEqual({
		success: false,
		code: "project-changed",
	});
	expect(f.captureFrame).not.toHaveBeenCalled();
});
it("independently binds the request project to the registered editor before the service", async () => {
	const f = await setup();
	for (const input of [{ projectId: "other" }, {}, null])
		expect(await f.invoke(input)).toEqual({ success: false, code: "project-changed" });
	expect(f.captureFrame).not.toHaveBeenCalled();
});
it.each([
	"reselect",
	"dirty",
])("rechecks authority after a pending render when %s changes without relying on registry invalidation", async (change) => {
	const f = await setup();
	let finish!: (image: typeof f.image) => void;
	f.captureFrame.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = f.invoke({ projectId: "p" });
	if (change === "reselect") editorRangeSessions.select(f.sender, "p");
	else f.setDirty(true);
	finish(f.image);
	expect(await pending).toEqual({ success: false, code: "project-changed" });
});
it("maps logical owner invalidation to project-changed even while session authority itself remains current", async () => {
	const f = await setup();
	let finish!: (image: typeof f.image) => void;
	f.captureFrame.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = f.invoke({ projectId: "p" });
	f.sender.emit("did-start-navigation");
	finish(f.image);
	expect(await pending).toEqual({ success: false, code: "project-changed" });
});
