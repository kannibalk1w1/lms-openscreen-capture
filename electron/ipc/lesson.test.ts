import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { LessonService } from "../lesson/service";
import { registerLessonHandlers } from "./lesson";

const electron = vi.hoisted(() => ({
	handle: vi.fn(),
	open: vi.fn(),
	save: vi.fn(),
	getPath: vi.fn(() => "/disposable"),
	from: vi.fn((_sender: unknown): unknown => null),
}));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	BrowserWindow: { fromWebContents: electron.from },
	dialog: { showOpenDialog: electron.open, showSaveDialog: electron.save },
	ipcMain: { handle: electron.handle },
}));
// Stands in for the production "registered editor window still on its own page" check.
const editors = new WeakSet<object>();
const isEditor = (event: { sender: object }) => editors.has(event.sender);
const editorEvent = () => {
	const sender = Object.assign(new EventEmitter(), {
		id: 1,
		mainFrame: {},
		isDestroyed: () => false,
	});
	editors.add(sender);
	return { sender, senderFrame: sender.mainFrame };
};
it("actual lesson IPC returns fixed errors without exposing source exception contents", async () => {
	const read = vi.fn(async () => {
		throw new Error("PRIVATE_LESSON_SOURCE_CANARY");
	});
	registerLessonHandlers(
		new LessonService(read, async () => null),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const frame = electron.handle.mock.calls.find(([name]) => name === "lesson:frame")![1];
	const sender = Object.assign(new EventEmitter(), {
		id: 1,
		mainFrame: {},
		isDestroyed: () => false,
	});
	const result = await frame(
		{ sender, senderFrame: sender.mainFrame },
		{ projectId: "p", rulerSec: 1, documentSha256: "a".repeat(64) },
	);
	expect(result).toEqual({ success: false, code: "lesson-operation-failed" });
	expect(JSON.stringify(result)).not.toContain("PRIVATE");
});

it("routes explicit local recovery operations through the real bounded store with fixed failures", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-draft-ipc-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	registerLessonHandlers(
		new LessonService(
			async () => {
				throw new Error("no project");
			},
			async () => null,
		),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const callback = (channel: string) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1];
	const editor = editorEvent();
	try {
		expect((await callback("lesson:draft-status")(editor)).result.copies).toBe(0);
		const lesson = {
			...newLesson(),
			steps: [{ ...newStep(), code: { language: "plain", text: "LOCAL_SOURCE_CANARY" } }],
		};
		const saved = await callback("lesson:draft-save")(editor, lesson);
		expect(saved.success).toBe(true);
		const listing = await callback("lesson:draft-list")(editor);
		expect(listing.result).toHaveLength(1);
		expect(JSON.stringify(listing)).not.toContain("LOCAL_SOURCE_CANARY");
		expect(
			(await callback("lesson:draft-read")(editor, saved.result.id)).result.steps[0].code.text,
		).toBe("LOCAL_SOURCE_CANARY");
		const bad = await callback("lesson:draft-remove")(editor, "../PRIVATE_PATH_CANARY");
		expect(bad).toEqual({ success: false, code: "lesson-operation-failed" });
		expect(JSON.stringify(bad)).not.toContain("PRIVATE_PATH_CANARY");
		expect((await callback("lesson:draft-read")(editor, saved.result.id)).success).toBe(true);
		expect((await callback("lesson:draft-remove")(editor, saved.result.id)).result.removed).toBe(
			true,
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
		electron.getPath.mockReturnValue("/disposable");
	}
});
it("range planning IPC validates the request before project reads and hides raw errors", async () => {
	const read = vi.fn(async () => {
		throw new Error("PRIVATE_RANGE_PROJECT_ERROR");
	});
	electron.handle.mockClear();
	registerLessonHandlers(
		new LessonService(read, async () => null),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const plan = electron.handle.mock.calls.find(([name]) => name === "lesson:plan-range")![1];
	const editor = editorEvent();
	expect(
		await plan(editor, { projectId: "p", documentSha256: "a".repeat(64), startSec: 2, endSec: 1 }),
	).toEqual({ success: false, code: "lesson-operation-failed" });
	expect(read).not.toHaveBeenCalled();
	expect(
		await plan(editor, { projectId: "p", documentSha256: "a".repeat(64), startSec: 1, endSec: 2 }),
	).toEqual({ success: false, code: "lesson-operation-failed" });
	expect(read).toHaveBeenCalledTimes(1);
});

it("updates only the file this window explicitly opened, through a main-held permission and never a renderer path", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-file-ipc-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	registerLessonHandlers(
		new LessonService(
			async () => {
				throw new Error("no project");
			},
			async () => null,
		),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const window = editorEvent;
	const editor = window(),
		other = window(),
		target = path.join(root, "lesson.json"),
		victim = path.join(root, "victim.json"),
		lesson = { ...newLesson("Opened"), steps: [newStep("One")] };
	await fs.writeFile(target, JSON.stringify(lesson));
	await fs.writeFile(victim, JSON.stringify(lesson));
	electron.open.mockResolvedValue({ canceled: false, filePaths: [target] });
	const opened = await route("open")(editor);
	expect(opened).toMatchObject({
		success: true,
		result: { status: "opened", file: { path: target } },
	});
	const token = opened.result.file.token,
		edited = { ...lesson, revision: 1, title: "Edited" };
	const save = (event: unknown, input: unknown) => route("save-current")(event, input);
	const refused = { success: false, code: "lesson-file-unavailable" };
	// No permission for another window, a sub-frame, a wrong token or a renderer-named path.
	expect(await save(other, { token, lesson: edited })).toEqual(refused);
	expect(await save({ ...editor, senderFrame: {} }, { token, lesson: edited })).toEqual(refused);
	expect(await save(editor, { token: crypto.randomUUID(), lesson: edited })).toEqual(refused);
	expect(await save(editor, { token, lesson: edited, path: victim })).toEqual({
		success: false,
		code: "lesson-operation-failed",
	});
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Opened");
	expect(await save(editor, { token, lesson: edited })).toMatchObject({
		success: true,
		result: { status: "saved", path: target, file: { token, path: target } },
	});
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Edited");
	expect(JSON.parse(await fs.readFile(victim, "utf8")).title).toBe("Opened");
	// A file changed elsewhere is kept, and the spent permission cannot be used again.
	const elsewhere = JSON.stringify({ ...edited, title: "Changed elsewhere" });
	await fs.writeFile(target, elsewhere);
	const later = { ...edited, revision: 2, title: "Later" };
	expect(await save(editor, { token, lesson: later })).toEqual({
		success: false,
		code: "lesson-file-changed",
	});
	expect(await save(editor, { token, lesson: later })).toEqual(refused);
	expect(await fs.readFile(target, "utf8")).toBe(elsewhere);
	// Saving a new copy grants that new file; navigation revokes it.
	const copy = path.join(root, "copy.json");
	electron.save.mockResolvedValue({ canceled: false, filePath: copy });
	const saved = await route("save")(editor, later);
	expect(saved).toMatchObject({ success: true, result: { status: "saved", path: copy } });
	expect(saved.result.lesson).toBeUndefined();
	const final = { ...later, revision: 3, title: "Final" };
	expect(await save(editor, { token: saved.result.file.token, lesson: final })).toMatchObject({
		success: true,
	});
	expect(JSON.parse(await fs.readFile(copy, "utf8")).title).toBe("Final");
	editor.sender.emit("did-start-navigation");
	expect(
		await save(editor, { token: saved.result.file.token, lesson: { ...final, revision: 4 } }),
	).toEqual(refused);
	expect((await fs.readdir(root)).sort()).toEqual(["copy.json", "lesson.json", "victim.json"]);
	// A caller with no window identity is refused before any picker.
	electron.open.mockClear();
	expect(await route("open")(undefined)).toEqual({
		success: false,
		code: "lesson-operation-failed",
	});
	expect(electron.open).not.toHaveBeenCalled();
	await fs.rm(root, { recursive: true, force: true });
});

it("grants no file permission when the file on disk is not the lesson the window was given", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-file-race-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	const target = path.join(root, "lesson.json"),
		given = { ...newLesson("Read first"), steps: [newStep("One")] },
		// The file changed between the read that produced `given` and the grant snapshot.
		newer = JSON.stringify({ ...given, revision: 5, title: "Written by someone else since" });
	await fs.writeFile(target, newer);
	const service = new LessonService(
		async () => {
			throw new Error("no project");
		},
		async () => null,
	);
	service.openEditable = async () => ({ status: "opened" as const, path: target, lesson: given });
	registerLessonHandlers(
		service,
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const editor = editorEvent();
	const opened = await route("open")(editor);
	expect(opened).toMatchObject({ success: true, result: { status: "opened", lesson: given } });
	expect(opened.result.file).toBeUndefined();
	// With no permission, nothing this window sends can replace the newer bytes.
	expect(
		await route("save-current")(editor, {
			token: crypto.randomUUID(),
			lesson: { ...given, revision: 9 },
		}),
	).toEqual({ success: false, code: "lesson-file-unavailable" });
	expect(await fs.readFile(target, "utf8")).toBe(newer);
	// The same window opening an unchanged file is granted as usual.
	await fs.writeFile(target, JSON.stringify(given));
	expect((await route("open")(editor)).result.file).toMatchObject({ path: target });
	await fs.rm(root, { recursive: true, force: true });
});

it("refuses lesson-guide routes from any frame but a registered editor's main frame, before dialogs, recovery copies or project reads", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-route-authority-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	electron.open.mockReset();
	electron.save.mockReset();
	const read = vi.fn(async () => {
		throw new Error("no project");
	});
	const service = new LessonService(read, async () => null);
	const calls = {
		save: vi.spyOn(service, "saveEditable"),
		open: vi.spyOn(service, "openEditable"),
		export: vi.spyOn(service, "exportGuide"),
		plan: vi.spyOn(service, "planRange"),
	};
	registerLessonHandlers(
		service,
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const lesson = { ...newLesson("Guarded"), steps: [newStep("One")] };
	const requests: [string, unknown[]][] = [
		["draft-status", []],
		["draft-save", [lesson]],
		["draft-list", []],
		["draft-read", [crypto.randomUUID()]],
		["draft-remove", [crypto.randomUUID()]],
		["plan-range", [{ projectId: "p", documentSha256: "a".repeat(64), startSec: 1, endSec: 2 }]],
		["save", [lesson]],
		["open", []],
		["export", [lesson, [lesson.steps[0].id]]],
	];
	const editor = editorEvent();
	const stranger = Object.assign(new EventEmitter(), {
		mainFrame: {},
		isDestroyed: () => false,
	});
	const senders = [
		undefined,
		null,
		{ sender: stranger, senderFrame: stranger.mainFrame },
		{ ...editor, senderFrame: {} },
		{ ...editor, senderFrame: undefined },
	];
	try {
		for (const event of senders)
			for (const [name, args] of requests)
				expect(await route(name)(event, ...args), `${name} ${senders.indexOf(event)}`).toEqual({
					success: false,
					code: "lesson-operation-failed",
				});
		expect(electron.open).not.toHaveBeenCalled();
		expect(electron.save).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
		for (const spy of Object.values(calls)) expect(spy).not.toHaveBeenCalled();
		expect(await fs.readdir(root)).toEqual([]);
		// Positive control: the registered editor's main frame reaches the same routes.
		expect((await route("draft-status")(editor)).success).toBe(true);
		electron.open.mockResolvedValue({ canceled: true, filePaths: [] });
		expect(await route("open")(editor)).toEqual({ success: true, result: { status: "cancelled" } });
		expect(electron.open).toHaveBeenCalledTimes(1);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
		electron.getPath.mockReturnValue("/disposable");
	}
});

it.each([
	"destroyed",
	"render-process-gone",
	"did-start-navigation",
])("a window's file permission ends with its page context on %s, including a save still in flight", async (lifecycle) => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-file-lifecycle-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	registerLessonHandlers(
		new LessonService(
			async () => {
				throw new Error("no project");
			},
			async () => null,
		),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const editor = editorEvent(),
		target = path.join(root, "lesson.json"),
		lesson = { ...newLesson("Opened"), steps: [newStep("One")] };
	await fs.writeFile(target, JSON.stringify(lesson));
	try {
		electron.open.mockResolvedValue({ canceled: false, filePaths: [target] });
		const token = (await route("open")(editor)).result.file.token;
		// The context ends while a save is being written: the write keeps its own outcome only.
		const pending = route("save-current")(editor, {
			token,
			lesson: { ...lesson, revision: 1, title: "In flight" },
		});
		editor.sender.emit(lifecycle);
		const finished = await pending;
		expect(finished).toMatchObject({ success: true, result: { status: "saved" } });
		const refused = { success: false, code: "lesson-file-unavailable" };
		for (const reuse of [token, finished.result.file.token])
			expect(
				await route("save-current")(editor, {
					token: reuse,
					lesson: { ...lesson, revision: 2, title: "After the context ended" },
				}),
			).toEqual(refused);
		expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("In flight");
		// A fresh explicit open in the same window is the only way back to an update permission.
		const again = await route("open")(editor);
		expect(
			await route("save-current")(editor, {
				token: again.result.file.token,
				lesson: { ...lesson, revision: 2, title: "Reopened" },
			}),
		).toMatchObject({ success: true });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
		electron.getPath.mockReturnValue("/disposable");
	}
});

it("attaches the save, open and export dialogs to the asking editor window", async () => {
	electron.handle.mockClear();
	electron.open.mockReset();
	electron.save.mockReset();
	electron.open.mockResolvedValue({ canceled: true, filePaths: [] });
	electron.save.mockResolvedValue({ canceled: true });
	registerLessonHandlers(
		new LessonService(
			async () => {
				throw new Error("no project");
			},
			async () => null,
		),
		() => ({ projectId: "p", assertCurrent: () => undefined }),
		isEditor,
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const editor = editorEvent(),
		window = { id: "editor-window" };
	electron.from.mockImplementation((sender) => (sender === editor.sender ? window : null));
	const lesson = { ...newLesson("Parented"), steps: [newStep("One")] };
	for (const result of [
		await route("save")(editor, lesson),
		await route("open")(editor),
		await route("export")(editor, lesson, [lesson.steps[0].id]),
	])
		expect(result).toEqual({ success: true, result: { status: "cancelled" } });
	expect(electron.save.mock.calls.map((call) => call[0])).toEqual([window]);
	expect(electron.open.mock.calls.map((call) => call[0])).toEqual([window, window]);
	electron.from.mockImplementation(() => null);
});
