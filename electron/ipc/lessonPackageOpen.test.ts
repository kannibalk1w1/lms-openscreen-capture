import { randomUUID, webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { parseLesson } from "../../src/lib/lesson/schema";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { createLessonPackage } from "../lesson/package";
import { fakePackageVideo, packageFixture } from "../lesson/package.test-support";
import { readSelectedFileSnapshot } from "../lesson/selectedFile";
import { registerLessonWorkflow } from "./lessonWorkflow";

const host = vi.hoisted(() => ({
	handle: vi.fn(),
	open: vi.fn(),
	save: vi.fn(),
	getPath: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: { handle: host.handle, on: vi.fn() },
	dialog: { showOpenDialog: host.open, showSaveDialog: host.save },
	app: { getPath: host.getPath },
	BrowserWindow: { fromWebContents: () => null },
}));
vi.mock("../lesson/encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
let root: string, directory: string, dirty: boolean;
let routes: Map<string, (event: IpcMainInvokeEvent, ...input: unknown[]) => Promise<unknown>>;
function caller(registered = true) {
	const owner = Object.assign(new EventEmitter(), {
		mainFrame: {},
		getURL: () => "file:///editor",
		isDestroyed: () => false,
	});
	if (registered) {
		editorRangeSessions.register(owner, owner.getURL());
		editorRangeSessions.select(owner, "p");
	}
	return {
		owner,
		event: { sender: owner, senderFrame: owner.mainFrame } as unknown as IpcMainInvokeEvent,
	};
}
let current: ReturnType<typeof caller>;
const invoke = (route: string, ...input: unknown[]) =>
	routes.get(`lesson:package-${route}`)!(current.event, ...input);
const open = async () => {
	const result = (await invoke("open", randomUUID())) as {
		success: boolean;
		result: { token: string; lesson: ReturnType<typeof newLesson>; videos: unknown[] };
	};
	expect(result.success).toBe(true);
	return result.result;
};
const copy = (token: string, operationId = randomUUID()) => invoke("copy", { operationId, token });
beforeEach(async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "package-open-"));
	const step = {
			...newStep("Portable title"),
			instructions: "<script>never execute</script>",
			code: { language: "plain", text: "safe selected code" },
		},
		image = await imageFixture();
	const lesson = {
		...newLesson(),
		title: "Selected lesson",
		assets: [image],
		steps: [{ ...step, imageId: image.id, imageAlt: "Selected image" }],
	};
	const selected = path.join(root, "selected.json");
	await fs.writeFile(selected, JSON.stringify(lesson));
	const result = await createLessonPackage(
		{
			manifestPath: selected,
			stepIds: [step.id],
			includeCode: true,
			imagePolicy: "include-external-provenance",
			media: [],
			outputDirectory: root,
		},
		{
			assertCurrent() {
				/* Explicit fixture authority. */
			},
		},
	);
	directory = result.path;
	await fs.rename(selected, selected + ".unavailable");
	host.handle.mockClear();
	host.getPath.mockReturnValue(root);
	host.open.mockReset().mockResolvedValue({ canceled: false, filePaths: [directory] });
	host.save
		.mockReset()
		.mockResolvedValue({ canceled: false, filePath: path.join(root, "new.json") });
	dirty = false;
	registerLessonWorkflow({
		documents: { getProject: vi.fn(), getSavedProject: vi.fn(), markOpenInEditor: vi.fn() },
		compositor: { renderFrames: vi.fn(), startExportMulti: vi.fn() },
		editorHasUnsavedChanges: () => dirty,
		readableApprovedPath: vi.fn(),
	});
	routes = new Map(host.handle.mock.calls.map(([name, handler]) => [name, handler]));
	current = caller();
});
afterEach(async () => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
it("production workflow opens a moved static package and creates a new editable copy without changing package bytes", async () => {
	const before = await fs.readFile(path.join(directory, "lesson.openscreen-lesson.json")),
		receipt = await fs.readFile(path.join(directory, "package-receipt.json"));
	const opened = await open();
	expect(JSON.stringify(opened)).not.toContain(directory);
	expect(opened.lesson.assets).toHaveLength(1);
	expect(opened.lesson.steps[0].code?.text).toBe("safe selected code");
	expect(await copy(opened.token)).toMatchObject({
		success: true,
		result: { status: "saved", path: path.join(root, "new.json") },
	});
	const saved = await parseLesson(await fs.readFile(path.join(root, "new.json"), "utf8"));
	expect(saved.id).not.toBe(opened.lesson.id);
	expect(saved.derivedFrom?.id).toBe(opened.lesson.id);
	expect(saved.steps).toEqual(opened.lesson.steps);
	expect(saved.assets).toEqual(opened.lesson.assets);
	expect(await fs.readFile(path.join(directory, "lesson.openscreen-lesson.json"))).toEqual(before);
	expect(await fs.readFile(path.join(directory, "package-receipt.json"))).toEqual(receipt);
});
it.each([
	"unregistered",
	"subframe",
	"dirty",
	"no-project",
])("refuses %s before picker or filesystem reads through production workflow", async (kind) => {
	if (kind === "unregistered") current = caller(false);
	if (kind === "subframe")
		current.event = { ...current.event, senderFrame: {} } as IpcMainInvokeEvent;
	if (kind === "dirty") dirty = true;
	if (kind === "no-project") editorRangeSessions.select(current.owner, null);
	expect(await invoke("open", randomUUID())).toMatchObject({ success: false });
	expect(host.open).not.toHaveBeenCalled();
});
it("refuses extra path arguments rather than importing caller-chosen files", async () => {
	expect(await invoke("open", { operationId: randomUUID(), directory })).toMatchObject({
		success: false,
	});
	expect(host.open).not.toHaveBeenCalled();
});
it("cancelled picker does not inspect a nonexistent directory or create output", async () => {
	host.open.mockResolvedValue({ canceled: true, filePaths: ["/does-not-exist"] });
	expect(await invoke("open", randomUUID())).toEqual({
		success: true,
		result: { status: "cancelled" },
	});
	expect(host.save).not.toHaveBeenCalled();
});
it.each([
	"project",
	"navigation",
	"crash",
	"destroyed",
	"dirty",
])("refuses stale %s during native directory picker and allows a later operation", async (kind) => {
	let settle!: (choice: unknown) => void;
	host.open.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	);
	const pending = invoke("open", randomUUID());
	if (kind === "project") editorRangeSessions.select(current.owner, "other");
	else if (kind === "dirty") dirty = true;
	else
		current.owner.emit(
			kind === "navigation"
				? "did-start-navigation"
				: kind === "crash"
					? "render-process-gone"
					: "destroyed",
		);
	settle({ canceled: false, filePaths: [directory] });
	expect(await pending).toMatchObject({ success: false });
	dirty = false;
	editorRangeSessions.select(current.owner, "p");
	expect(await invoke("open", randomUUID())).toMatchObject({ success: true });
});
it("owned cancellation holds busy until the picker settles and refuses foreign and old IDs", async () => {
	let settle!: (choice: unknown) => void;
	host.open.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	);
	const id = randomUUID(),
		pending = invoke("open", id),
		other = caller();
	expect(await routes.get("lesson:package-cancel")!(other.event, id)).toBe(false);
	expect(await invoke("cancel", randomUUID())).toBe(false);
	expect(await invoke("cancel", id)).toBe(true);
	expect(await invoke("open", randomUUID())).toMatchObject({
		success: false,
		code: "lesson-package-busy",
	});
	settle({ canceled: false, filePaths: [directory] });
	expect(await pending).toMatchObject({ success: false, code: "lesson-package-cancelled" });
	await open();
	expect(await invoke("cancel", id)).toBe(false);
});
it("capability is owner-bound and revocation prevents further copies", async () => {
	const opened = await open(),
		owner = current,
		other = caller();
	current = other;
	expect(await copy(opened.token)).toMatchObject({ success: false });
	expect(host.save).not.toHaveBeenCalled();
	current = owner;
	expect(await invoke("release", randomUUID())).toBe(false);
	expect(await invoke("release", opened.token)).toBe(true);
	expect(await copy(opened.token)).toMatchObject({ success: false });
	expect(host.save).not.toHaveBeenCalled();
});
it("static copy picker cancellation causes no revalidation reads or outputs", async () => {
	const opened = await open();
	host.save.mockResolvedValue({ canceled: true });
	// The package can disappear while the user cancels: cancellation must still succeed.
	await fs.rename(directory, directory + ".offline");
	expect(await copy(opened.token)).toEqual({ success: true, result: { status: "cancelled" } });
	expect(await fs.readdir(root)).not.toContain("new.json");
});
it.each([
	"mutate",
	"same-byte-inode",
	"ancestor-symlink",
])("refuses %s after open, preserving existing destination and suppressing paths", async (kind) => {
	const opened = await open();
	const editable = path.join(directory, "lesson.openscreen-lesson.json"),
		original = readSelectedFileSnapshot(editable, 32 * 1024 * 1024);
	if (kind === "mutate") await fs.appendFile(editable, " ");
	if (kind === "same-byte-inode") {
		await fs.rename(editable, editable + ".old");
		await fs.writeFile(editable, original.bytes);
		await fs.unlink(editable + ".old");
	}
	if (kind === "ancestor-symlink") {
		await fs.rename(directory, directory + ".real");
		await fs.symlink(directory + ".real", directory);
	}
	const target = path.join(root, "new.json");
	await fs.writeFile(target, "EXISTING");
	const response = await copy(opened.token);
	expect(response).toMatchObject({ success: false });
	expect(JSON.stringify(response)).not.toContain(root);
	expect(await fs.readFile(target, "utf8")).toBe("EXISTING");
});
it("refuses tampered guide before returning any lesson snapshot", async () => {
	await fs.appendFile(path.join(directory, "index.html"), "tamper");
	expect(await invoke("open", randomUUID())).toEqual({
		success: false,
		code: "lesson-package-invalid",
	});
});
it("never writes within the imported package", async () => {
	const opened = await open(),
		before = await fs.readdir(directory);
	host.save.mockResolvedValue({ canceled: false, filePath: path.join(directory, "new.json") });
	expect(await copy(opened.token)).toMatchObject({ success: false });
	expect(await fs.readdir(directory)).toEqual(before);
});
it("never overwrites an existing editable file", async () => {
	const opened = await open(),
		target = path.join(root, "new.json");
	await fs.writeFile(target, "EXISTING");
	expect(await copy(opened.token)).toEqual({ success: false, code: "destination-exists" });
	expect(await fs.readFile(target, "utf8")).toBe("EXISTING");
});
it("rejects output directory symlink and leaves its target unchanged", async () => {
	const opened = await open(),
		real = path.join(root, "real"),
		link = path.join(root, "alias");
	await fs.mkdir(real);
	await fs.symlink(real, link);
	host.save.mockResolvedValue({ canceled: false, filePath: path.join(link, "new.json") });
	expect(await copy(opened.token)).toMatchObject({ success: false });
	expect(await fs.readdir(real)).toEqual([]);
});
it("stale copy picker response cannot publish", async () => {
	const opened = await open();
	let settle!: (choice: unknown) => void;
	host.save.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	);
	const pending = copy(opened.token);
	editorRangeSessions.select(current.owner, "other");
	settle({ canceled: false, filePath: path.join(root, "new.json") });
	expect(await pending).toMatchObject({ success: false });
	expect(await fs.readdir(root)).not.toContain("new.json");
});

async function videoPackage() {
	const fixtureRoot = path.join(root, "video-fixture");
	await fs.mkdir(fixtureRoot);
	const f = await packageFixture(fixtureRoot);
	const created = await createLessonPackage(f.request, {
		assertCurrent() {
			/* Explicit fixture input. */
		},
	});
	host.open.mockResolvedValue({ canceled: false, filePaths: [created.path] });
	return { ...f, directory: created.path };
}
it("retains video bindings in inspection and refuses editable copy before save picker", async () => {
	const f = await videoPackage(),
		opened = await open();
	expect(opened.videos).toEqual([{ stepId: f.step.id, frames: 45, durationSec: 1.5 }]);
	expect(await copy(opened.token)).toEqual({
		success: false,
		code: "lesson-package-video-copy-unsupported",
	});
	expect(host.save).not.toHaveBeenCalled();
});
it("cancellation during video decode holds the owned operation until actual decoder settlement", async () => {
	await videoPackage();
	let settle!: () => void;
	let started!: () => void;
	const entered = new Promise<void>((resolve) => {
		started = resolve;
	});
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file, expected) => {
		started();
		await new Promise<void>((resolve) => {
			settle = resolve;
		});
		return fakePackageVideo(file, expected);
	});
	const id = randomUUID(),
		pending = invoke("open", id);
	await entered;
	expect(await invoke("cancel", id)).toBe(true);
	expect(await invoke("open", randomUUID())).toMatchObject({
		success: false,
		code: "lesson-package-busy",
	});
	settle();
	expect(await pending).toMatchObject({ success: false, code: "lesson-package-cancelled" });
	expect(await invoke("open", randomUUID())).toMatchObject({ success: true });
});
it("source replacement while video decode is pending never returns a checked snapshot", async () => {
	const f = await videoPackage();
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file, expected) => {
		const evidence = await fakePackageVideo(file, expected);
		const named = path.join(f.directory, "lesson.openscreen-lesson.json");
		const bytes = await fs.readFile(named);
		await fs.rename(named, named + ".old");
		await fs.writeFile(named, bytes);
		await fs.unlink(named + ".old");
		return evidence;
	});
	expect(await invoke("open", randomUUID())).toEqual({
		success: false,
		code: "lesson-package-invalid",
	});
});
it("decoder failure yields a fixed response with no paths or snapshot", async () => {
	await videoPackage();
	vi.mocked(validateRangeVideo).mockRejectedValueOnce(new Error("PRIVATE_RAW_PATH stderr"));
	expect(await invoke("open", randomUUID())).toEqual({
		success: false,
		code: "lesson-package-invalid",
	});
});

it("wrong token from the same owner cannot save or open a destination picker", async () => {
	await open();
	expect(await copy(randomUUID())).toMatchObject({ success: false });
	expect(host.save).not.toHaveBeenCalled();
});
it.each([
	"cancel",
	"source-replace",
	"project",
])("refuses %s after staging before publication; retains only an incomplete private stage", async (kind) => {
	const opened = await open(),
		id = randomUUID(),
		write = fs.writeFile.bind(fs);
	vi.spyOn(fs, "writeFile").mockImplementation(async (file, ...args) => {
		await write(file, ...args);
		if (String(file).includes(".lesson-copy-") && String(file).endsWith(".partial")) {
			if (kind === "cancel") await invoke("cancel", id);
			else if (kind === "project") editorRangeSessions.select(current.owner, "other");
			else {
				const named = path.join(directory, "lesson.openscreen-lesson.json"),
					bytes = await fs.readFile(named);
				await fs.rename(named, named + ".old");
				await write(named, bytes);
				await fs.unlink(named + ".old");
			}
		}
	});
	expect(await copy(opened.token, id)).toMatchObject({ success: false });
	expect(await fs.readdir(root)).not.toContain("new.json");
	const stages = (await fs.readdir(root)).filter(
		(name) => name.startsWith(".lesson-copy-") && name.endsWith(".partial"),
	);
	expect(stages).toHaveLength(1);
	expect((await fs.stat(path.join(root, stages[0]))).mode & 0o777).toBe(0o600);
});
