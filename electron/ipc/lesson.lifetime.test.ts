import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { LessonService } from "../lesson/service";
import { registerEditorLessonHandlers } from "./lesson";

// Production registration and service with the real file helpers; tests can only hold them at a gate.
const hooks = vi.hoisted(() => ({
	beforeGrant: null as null | (() => Promise<void>),
	beforeReplace: null as null | (() => Promise<void>),
	wrapCurrent: null as null | ((isCurrent: () => boolean) => () => boolean),
}));
vi.mock("../lesson/lessonFile", async (importOriginal) => {
	const real = await importOriginal<typeof import("../lesson/lessonFile")>();
	return {
		...real,
		grantLessonFile: async (...args: Parameters<typeof real.grantLessonFile>) => {
			await hooks.beforeGrant?.();
			return real.grantLessonFile(...args);
		},
		replaceLessonFile: async (
			grant: Parameters<typeof real.replaceLessonFile>[0],
			input: unknown,
			isCurrent: () => boolean,
		) => {
			await hooks.beforeReplace?.();
			return real.replaceLessonFile(grant, input, hooks.wrapCurrent?.(isCurrent) ?? isCurrent);
		},
	};
});
// Counts the service's own read of a picked lesson file, passing it through unchanged.
const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../lesson/readLessonFile", async (importOriginal) => {
	const real = await importOriginal<typeof import("../lesson/readLessonFile")>();
	return {
		readLessonFile: (...args: Parameters<typeof real.readLessonFile>) => {
			reads.count++;
			return real.readLessonFile(...args);
		},
	};
});
const electron = vi.hoisted(() => ({
	handle: vi.fn(),
	open: vi.fn(),
	save: vi.fn(),
	userData: "/disposable",
}));
vi.mock("electron", () => ({
	app: { getPath: () => electron.userData },
	BrowserWindow: { fromWebContents: () => null },
	dialog: { showOpenDialog: electron.open, showSaveDialog: electron.save },
	ipcMain: { handle: electron.handle },
}));

const EDITOR = "file:///app/index.html?windowType=editor";
let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-lifetime-"));
	electron.userData = path.join(root, "user-data");
	electron.handle.mockClear();
	electron.open.mockReset();
	electron.save.mockReset();
	hooks.beforeGrant = hooks.beforeReplace = hooks.wrapCurrent = null;
	reads.count = 0;
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
/** One registered editor window through the production wiring; its URL and life can change. */
function editorWindow() {
	let url = EDITOR,
		destroyed = false;
	const sender = Object.assign(new EventEmitter(), {
		mainFrame: {},
		getURL: () => url,
		isDestroyed: () => destroyed,
	});
	editorRangeSessions.register(sender, url);
	registerEditorLessonHandlers(
		new LessonService(
			async () => {
				throw new Error("no project");
			},
			async () => null,
		),
		() => false,
	);
	const route = (name: string, ...input: unknown[]) =>
		electron.handle.mock.calls.find(([value]) => value === `lesson:${name}`)![1](
			{ sender, senderFrame: sender.mainFrame },
			...input,
		);
	return {
		route,
		sender,
		/** Each way a page context ends, as Electron reports it. */
		end(kind: string) {
			if (kind === "hash-navigation") url = `${EDITOR}#foreign-context`;
			if (kind === "document-navigation") url = "file:///elsewhere/foreign.html";
			if (kind === "destroyed") destroyed = true;
			sender.emit(
				kind === "hash-navigation" || kind === "document-navigation"
					? "did-start-navigation"
					: kind,
			);
		},
		/** The same window showing the editor again (reload after a crash, or navigating back). */
		returnToEditor() {
			url = EDITOR;
		},
	};
}
async function lessonFile(name: string, title: string) {
	const lesson = { ...newLesson(title), steps: [newStep("One")] },
		target = path.join(root, name);
	await fs.writeFile(target, JSON.stringify(lesson));
	return { lesson, target, bytes: await fs.readFile(target, "utf8") };
}
const opened = (result: { success: boolean; result?: { file?: { token: string } } }) => {
	expect(result).toMatchObject({ success: true, result: { status: "opened" } });
	return result.result!.file!.token;
};
const STALE_OPEN = { success: false, code: "lesson-operation-failed" };
const NO_PERMISSION = { success: false, code: "lesson-file-unavailable" };
const ENDINGS = [
	"hash-navigation",
	"document-navigation",
	"render-process-gone",
	"destroyed",
] as const;

it.each(
	ENDINGS,
)("an open whose picker is still pending when the page context ends (%s) grants nothing and reads nothing", async (ending) => {
	const w = editorWindow(),
		file = await lessonFile("lesson.json", "Original"),
		picker = deferred<unknown>();
	electron.open.mockReturnValueOnce(picker.promise);
	const pending = w.route("open");
	w.end(ending);
	picker.resolve({ canceled: false, filePaths: [file.target] });
	expect(await pending).toEqual(STALE_OPEN);
	// The file picked for a page that has gone is never even read.
	expect(reads.count).toBe(0);
	// The returned nothing cannot be turned into a write by any token.
	expect(
		await w.route("save-current", {
			token: crypto.randomUUID(),
			lesson: { ...file.lesson, revision: 1, title: "Overwrite" },
		}),
	).toEqual(NO_PERMISSION);
	expect(await fs.readFile(file.target, "utf8")).toBe(file.bytes);
	// Positive control: only a fresh explicit open on a valid editor page restores permission.
	w.returnToEditor();
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [file.target] });
	if (ending === "destroyed") {
		expect(await w.route("open")).toEqual(STALE_OPEN);
		return;
	}
	const token = opened(await w.route("open"));
	expect(
		await w.route("save-current", {
			token,
			lesson: { ...file.lesson, revision: 1, title: "Fresh open saved" },
		}),
	).toMatchObject({ success: true, result: { status: "saved" } });
	expect(JSON.parse(await fs.readFile(file.target, "utf8")).title).toBe("Fresh open saved");
});

it.each(
	ENDINGS,
)("an open whose file read and hash are still pending when the page context ends (%s) grants nothing", async (ending) => {
	const w = editorWindow(),
		file = await lessonFile("lesson.json", "Original"),
		gate = deferred<void>();
	hooks.beforeGrant = () => gate.promise;
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [file.target] });
	const pending = w.route("open");
	await vi.waitFor(() => expect(electron.open).toHaveBeenCalledTimes(1));
	await new Promise((done) => setTimeout(done, 20));
	w.end(ending);
	gate.resolve();
	expect(await pending).toEqual(STALE_OPEN);
	expect(await fs.readFile(file.target, "utf8")).toBe(file.bytes);
});

it("an older pending open can neither replace nor revoke a newer open's permission", async () => {
	const w = editorWindow(),
		older = await lessonFile("older.json", "Older"),
		newer = await lessonFile("newer.json", "Newer"),
		olderPicker = deferred<unknown>();
	electron.open.mockReturnValueOnce(olderPicker.promise);
	const olderOpen = w.route("open");
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [newer.target] });
	const newerToken = opened(await w.route("open"));
	olderPicker.resolve({ canceled: false, filePaths: [older.target] });
	expect(await olderOpen).toEqual(STALE_OPEN);
	expect(
		await w.route("save-current", {
			token: newerToken,
			lesson: { ...newer.lesson, revision: 1, title: "Newer saved" },
		}),
	).toMatchObject({ success: true });
	expect(JSON.parse(await fs.readFile(newer.target, "utf8")).title).toBe("Newer saved");
	expect(await fs.readFile(older.target, "utf8")).toBe(older.bytes);
});

it.each(
	ENDINGS,
)("a same-file save not yet committed when the page context ends (%s) leaves the original bytes and certifies nothing", async (ending) => {
	const w = editorWindow(),
		file = await lessonFile("lesson.json", "Original"),
		gate = deferred<void>();
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [file.target] });
	const token = opened(await w.route("open"));
	hooks.beforeReplace = () => gate.promise;
	const pending = w.route("save-current", {
		token,
		lesson: { ...file.lesson, revision: 1, title: "Stale save" },
	});
	w.end(ending);
	gate.resolve();
	expect(await pending).toEqual(NO_PERMISSION);
	expect(await fs.readFile(file.target, "utf8")).toBe(file.bytes);
	expect((await fs.readdir(root)).filter((name) => name.includes(".partial"))).toEqual([]);
});

it("a page that changed without any lifecycle event still cannot use or certify its permission", async () => {
	const w = editorWindow(),
		file = await lessonFile("lesson.json", "Original"),
		gate = deferred<void>();
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [file.target] });
	const token = opened(await w.route("open"));
	hooks.beforeReplace = () => gate.promise;
	const pending = w.route("save-current", {
		token,
		lesson: { ...file.lesson, revision: 1, title: "Stale save" },
	});
	// Only the page check can see this: the registered editor URL no longer matches.
	w.sender.getURL = () => "file:///elsewhere/foreign.html";
	gate.resolve();
	expect(await pending).toEqual(NO_PERMISSION);
	expect(await fs.readFile(file.target, "utf8")).toBe(file.bytes);
});

it("a same-file save overtaken by a newer completed open is refused before it replaces anything", async () => {
	const w = editorWindow(),
		first = await lessonFile("first.json", "First"),
		second = await lessonFile("second.json", "Second"),
		gate = deferred<void>();
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [first.target] });
	const firstToken = opened(await w.route("open"));
	hooks.beforeReplace = () => gate.promise;
	const staleSave = w.route("save-current", {
		token: firstToken,
		lesson: { ...first.lesson, revision: 1, title: "Stale completion" },
	});
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [second.target] });
	const secondToken = opened(await w.route("open"));
	gate.resolve();
	expect(await staleSave).toEqual(NO_PERMISSION);
	expect(await fs.readFile(first.target, "utf8")).toBe(first.bytes);
	hooks.beforeReplace = null;
	expect(
		await w.route("save-current", {
			token: secondToken,
			lesson: { ...second.lesson, revision: 1, title: "Second saved" },
		}),
	).toMatchObject({ success: true });
});

it("a save committed just before the page context ended is reported as saved, with no further permission", async () => {
	const w = editorWindow(),
		file = await lessonFile("lesson.json", "Original");
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [file.target] });
	const token = opened(await w.route("open"));
	// The context ends after the rename, at the post-commit consultation.
	let calls = 0;
	hooks.wrapCurrent = (isCurrent) => () => {
		if (++calls === 4) w.end("hash-navigation");
		return isCurrent();
	};
	const result = await w.route("save-current", {
		token,
		lesson: { ...file.lesson, revision: 1, title: "Committed" },
	});
	expect(result).toEqual({ success: true, result: { status: "saved", path: file.target } });
	expect(JSON.parse(await fs.readFile(file.target, "utf8")).title).toBe("Committed");
	hooks.wrapCurrent = null;
	expect(
		await w.route("save-current", {
			token,
			lesson: { ...file.lesson, revision: 2, title: "After" },
		}),
	).toEqual(NO_PERMISSION);
});

it("a new-copy save writes nothing when the page context ends during its picker", async () => {
	const w = editorWindow(),
		picker = deferred<unknown>(),
		target = path.join(root, "copy.json");
	electron.save.mockReturnValueOnce(picker.promise);
	const pending = w.route("save", { ...newLesson("Copy"), steps: [newStep("One")] });
	w.end("hash-navigation");
	picker.resolve({ canceled: false, filePath: target });
	expect(await pending).toEqual(STALE_OPEN);
	await expect(fs.stat(target)).rejects.toThrow();
});

it("a new copy written just before the page context ended is reported saved, without update permission", async () => {
	const w = editorWindow(),
		target = path.join(root, "copy.json"),
		gate = deferred<void>();
	electron.save.mockResolvedValueOnce({ canceled: false, filePath: target });
	hooks.beforeGrant = () => gate.promise;
	const lesson = { ...newLesson("Copy"), steps: [newStep("One")] };
	const pending = w.route("save", lesson);
	await vi.waitFor(async () => expect((await fs.stat(target)).isFile()).toBe(true));
	w.end("hash-navigation");
	gate.resolve();
	expect(await pending).toEqual({ success: true, result: { status: "saved", path: target } });
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Copy");
});

/** Holds the n-th real WebCrypto digest (asynchronous lesson image validation) until released. */
function gateDigest(at: number) {
	const entered = deferred<void>(),
		release = deferred<void>(),
		real = crypto.subtle.digest.bind(crypto.subtle);
	let count = 0;
	const spy = vi
		.spyOn(crypto.subtle, "digest")
		.mockImplementation(async (...args: Parameters<typeof real>) => {
			const bytes = await real(...args);
			if (++count === at) {
				entered.resolve();
				await release.promise;
			}
			return bytes;
		});
	return { entered, release, restore: () => spy.mockRestore() };
}
it.each([
	"hash-navigation",
	"render-process-gone",
	"superseded",
])("a new-copy save whose image validation is still running never opens a picker once %s", async (change) => {
	const w = editorWindow(),
		lesson = { ...newLesson("Copy"), steps: [newStep("One")], assets: [await imageFixture()] },
		gate = gateDigest(1);
	electron.save.mockResolvedValue({ canceled: true });
	try {
		const pending = w.route("save", lesson);
		await gate.entered.promise;
		if (change === "superseded") {
			electron.open.mockResolvedValueOnce({ canceled: true, filePaths: [] });
			expect(await w.route("open")).toEqual({ success: true, result: { status: "cancelled" } });
		} else w.end(change);
		gate.release.resolve();
		expect(await pending).toEqual(STALE_OPEN);
		expect(electron.save).not.toHaveBeenCalled();
		expect(await fs.readdir(root)).toEqual([]);
	} finally {
		gate.restore();
	}
});
it("the same gated new-copy save, left current, opens its picker once (positive control)", async () => {
	const w = editorWindow(),
		lesson = { ...newLesson("Copy"), steps: [newStep("One")], assets: [await imageFixture()] },
		gate = gateDigest(1);
	electron.save.mockResolvedValue({ canceled: true });
	try {
		const pending = w.route("save", lesson);
		await gate.entered.promise;
		gate.release.resolve();
		expect(await pending).toEqual({ success: true, result: { status: "cancelled" } });
		expect(electron.save).toHaveBeenCalledTimes(1);
	} finally {
		gate.restore();
	}
});
