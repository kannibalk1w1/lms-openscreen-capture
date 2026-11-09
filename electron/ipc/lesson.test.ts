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
}));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	dialog: { showOpenDialog: electron.open, showSaveDialog: electron.save },
	ipcMain: { handle: electron.handle },
}));
it("actual lesson IPC returns fixed errors without exposing source exception contents", async () => {
	const read = vi.fn(async () => {
		throw new Error("PRIVATE_LESSON_SOURCE_CANARY");
	});
	registerLessonHandlers(new LessonService(read, async () => null), () => ({
		projectId: "p",
		assertCurrent: () => undefined,
	}));
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
	);
	const callback = (channel: string) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1];
	try {
		expect((await callback("lesson:draft-status")()).result.copies).toBe(0);
		const lesson = {
			...newLesson(),
			steps: [{ ...newStep(), code: { language: "plain", text: "LOCAL_SOURCE_CANARY" } }],
		};
		const saved = await callback("lesson:draft-save")(null, lesson);
		expect(saved.success).toBe(true);
		const listing = await callback("lesson:draft-list")();
		expect(listing.result).toHaveLength(1);
		expect(JSON.stringify(listing)).not.toContain("LOCAL_SOURCE_CANARY");
		expect(
			(await callback("lesson:draft-read")(null, saved.result.id)).result.steps[0].code.text,
		).toBe("LOCAL_SOURCE_CANARY");
		const bad = await callback("lesson:draft-remove")(null, "../PRIVATE_PATH_CANARY");
		expect(bad).toEqual({ success: false, code: "lesson-operation-failed" });
		expect(JSON.stringify(bad)).not.toContain("PRIVATE_PATH_CANARY");
		expect((await callback("lesson:draft-read")(null, saved.result.id)).success).toBe(true);
		expect((await callback("lesson:draft-remove")(null, saved.result.id)).result.removed).toBe(
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
	registerLessonHandlers(new LessonService(read, async () => null), () => ({
		projectId: "p",
		assertCurrent: () => undefined,
	}));
	const plan = electron.handle.mock.calls.find(([name]) => name === "lesson:plan-range")![1];
	expect(
		await plan(null, { projectId: "p", documentSha256: "a".repeat(64), startSec: 2, endSec: 1 }),
	).toEqual({ success: false, code: "lesson-operation-failed" });
	expect(read).not.toHaveBeenCalled();
	expect(
		await plan(null, { projectId: "p", documentSha256: "a".repeat(64), startSec: 1, endSec: 2 }),
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
	);
	const route = (name: string) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1];
	const window = () => {
		const sender = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false });
		return { sender, senderFrame: sender.mainFrame };
	};
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
	// A caller with no window identity still opens, with no update permission.
	electron.open.mockResolvedValue({ canceled: false, filePaths: [copy] });
	const plain = await route("open")(undefined);
	expect(plain.result.file).toBeUndefined();
	await fs.rm(root, { recursive: true, force: true });
});
