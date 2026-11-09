import { randomUUID, webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { beginPackageEdit } from "../../src/lib/lesson/packageEdit";
import { parseLesson } from "../../src/lib/lesson/schema";
import { AI_EDITION_OPEN_PROJECT_CHANNEL } from "../../src/native/contracts";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { createLessonPackage, inspectLessonPackage } from "../lesson/package";
import { fakePackageVideo, packageFixture } from "../lesson/package.test-support";
import { readSelectedFileSnapshot } from "../lesson/selectedFile";
import { registerLessonWorkflow } from "./lessonWorkflow";

const host = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	open: vi.fn(),
	save: vi.fn(),
	getPath: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: { handle: host.handle, on: host.on },
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
	host.on.mockClear();
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

/** Exercise the actual main production selection listener, including session replacement.
 * This is not a second authority implementation or a direct select() substitute. */
function selectThroughProduction(projectId: string | null) {
	const registrations = host.on.mock.calls.filter(
		([name]) => name === AI_EDITION_OPEN_PROJECT_CHANNEL,
	);
	expect(registrations).toHaveLength(1);
	registrations[0][1](current.event, projectId);
}
async function packageBytes() {
	const files = [
		"lesson-package.json",
		"package-receipt.json",
		"lesson.openscreen-lesson.json",
		"index.html",
		"lesson.md",
	];
	const lesson = await parseLesson(
		await fs.readFile(path.join(directory, "lesson.openscreen-lesson.json"), "utf8"),
	);
	for (const image of lesson.assets) files.push(`assets/${image.id}.jpg`);
	return Promise.all(
		files.map(async (name) => [name, await fs.readFile(path.join(directory, name))] as const),
	);
}
it.each([
	["same-project reselect", ["p"]],
	["different project", ["other"]],
	["different project then original project", ["other", "p"]],
	["closed then reopened same project", [null, "p"]],
] as const)("open-time capability refuses %s before any save picker, with fresh-open recovery", async (_kind, selections) => {
	const authoredPath = path.join(root, "current-authored-work.json"),
		authored = Buffer.from(
			JSON.stringify({ ...newLesson("Unsaved authored work"), steps: [newStep("Keep this step")] }),
		);
	await fs.writeFile(authoredPath, authored);
	const opened = await open(),
		before = await packageBytes(),
		rootNames = await fs.readdir(root);
	for (const id of selections) selectThroughProduction(id);
	expect(await copy(opened.token)).toEqual({ success: false, code: "lesson-package-invalid" });
	expect(host.save).not.toHaveBeenCalled();
	expect(await fs.readdir(root)).toEqual(rootNames);
	expect(await packageBytes()).toEqual(before);
	expect(await fs.readFile(authoredPath)).toEqual(authored);
	// Returning to the original ID cannot resurrect a previous capability or session.
	selectThroughProduction("p");
	expect(await copy(opened.token)).toEqual({ success: false, code: "lesson-package-invalid" });
	expect(host.save).not.toHaveBeenCalled();
	const fresh = await open();
	expect(fresh.token).not.toBe(opened.token);
	expect(await copy(fresh.token)).toMatchObject({
		success: true,
		result: { status: "saved", path: path.join(root, "new.json") },
	});
	expect(host.save).toHaveBeenCalledTimes(1);
	const saved = await parseLesson(await fs.readFile(path.join(root, "new.json"), "utf8"));
	expect(saved.steps).toEqual(fresh.lesson.steps);
	expect(saved.assets).toEqual(fresh.lesson.assets);
	expect(await packageBytes()).toEqual(before);
	expect(await fs.readFile(authoredPath)).toEqual(authored);
});
it("open-time capability refuses the live dirty provider before copy and recovers only after a fresh open", async () => {
	const opened = await open(),
		before = await packageBytes();
	dirty = true;
	expect(await copy(opened.token)).toEqual({ success: false, code: "lesson-package-invalid" });
	expect(host.save).not.toHaveBeenCalled();
	dirty = false;
	selectThroughProduction("p");
	expect(await copy(opened.token)).toMatchObject({ success: false });
	expect(host.save).not.toHaveBeenCalled();
	const fresh = await open();
	expect(await copy(fresh.token)).toMatchObject({ success: true, result: { status: "saved" } });
	expect(await packageBytes()).toEqual(before);
});

// Reseal uses the same capability, production registration and actual shared package writer.
async function edited(
	token: string,
	lesson: Awaited<ReturnType<typeof open>>["lesson"],
	operationId = randomUUID(),
) {
	return invoke("reseal", { token, operationId, lesson });
}
it("reseals changed text and order with every existing JPEG/video binding, without source projects or receipt forgery", async () => {
	const f = await videoPackage();
	// The existing fixture has one selected video step; add a second selected step in a new package.
	const second = f.lesson.steps[1];
	const originalManifest = await fs.readFile(f.request.manifestPath);
	const withTwo = await createLessonPackage(
		{
			...f.request,
			stepIds: [f.step.id, second.id],
			includeCode: true,
			imagePolicy: "include-external-provenance",
		},
		{
			assertCurrent() {
				/* Explicit fixture. */
			},
		},
	);
	directory = withTwo.path;
	host.open.mockResolvedValue({ canceled: false, filePaths: [directory] });
	const opened = await open(),
		before = await packageBytes();
	await fs.rename(f.authoring, f.authoring + ".unavailable");
	const draft = beginPackageEdit(opened.lesson);
	draft.title = "Corrected derived title";
	draft.steps.reverse();
	const videoStep = draft.steps.find((s) => s.id === f.step.id)!;
	videoStep.instructions = "Corrected instructions requiring review";
	videoStep.code!.text = "Updated code";
	videoStep.imageAlt = "Corrected image description";
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	const response = (await edited(opened.token, draft)) as {
		success: boolean;
		result: { path: string };
	};
	expect(response.success).toBe(true);
	const sealed = await inspectLessonPackage(
		{ directory: response.result.path },
		{
			assertCurrent() {
				/* Explicit output. */
			},
		},
	);
	expect(sealed.lesson.title).toBe(draft.title);
	expect(sealed.lesson.steps.map((s) => s.id)).toEqual(draft.steps.map((s) => s.id));
	expect(sealed.lesson.steps.every((s) => s.status === "draft")).toBe(true);
	expect(sealed.lesson.derivedFrom).toMatchObject({
		id: opened.lesson.id,
		revision: opened.lesson.revision,
	});
	expect(sealed.lesson.assets).toEqual(opened.lesson.assets);
	expect(sealed.manifest.scope).toEqual(
		(
			await inspectLessonPackage(
				{ directory },
				{
					assertCurrent() {
						/* Source. */
					},
				},
			)
		).manifest.scope,
	);
	expect(sealed.manifest.videos).toHaveLength(1);
	expect(sealed.manifest.videos[0].stepId).toBe(f.step.id);
	expect(
		await fs.readFile(path.join(response.result.path, sealed.manifest.videos[0].path)),
	).toEqual(await fs.readFile(path.join(directory, sealed.manifest.videos[0].path)));
	expect(await packageBytes()).toEqual(before);
	expect(await fs.readFile(path.join(f.authoring + ".unavailable", "lesson.json"))).toEqual(
		originalManifest,
	);
});
it.each([
	"step-id",
	"remove-step",
	"add-step",
	"pin",
	"evidence",
	"extensions",
	"asset",
	"policy",
	"approval",
	"new-code",
])("reseal refuses unsupported %s without invoking destination picker", async (kind) => {
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson),
		before = await packageBytes();
	if (kind === "step-id") draft.steps[0].id = randomUUID();
	if (kind === "remove-step") draft.steps = [];
	if (kind === "add-step") draft.steps.push(newStep("Extra"));
	if (kind === "pin")
		(draft.steps[0] as Record<string, unknown>).mediaSelection = { unexpected: true };
	if (kind === "evidence")
		draft.steps[0].evidence = [{ kind: "authored", clock: "unmapped", provenance: "authored" }];
	if (kind === "extensions") draft.extensions = { private: { journal: "PRIVATE_JOURNAL" } };
	if (kind === "asset") draft.assets[0].source.projectId = "REPLACED_PRIVATE_SOURCE";
	if (kind === "policy") draft.output!.includeImages = false;
	if (kind === "approval") draft.steps[0].status = "reviewed";
	if (kind === "new-code") {
		draft.steps[0].code!.language = "new-language";
	}
	host.open.mockClear();
	expect(await edited(opened.token, draft)).toMatchObject({ success: false });
	expect(host.open).not.toHaveBeenCalled();
	expect(await packageBytes()).toEqual(before);
});
it("reseal picker cancel reads no source bytes and creates no outputs", async () => {
	const opened = await open(),
		before = await fs.readdir(root);
	host.open.mockResolvedValue({ canceled: true });
	await fs.rename(directory, directory + ".offline");
	expect(await edited(opened.token, beginPackageEdit(opened.lesson))).toEqual({
		success: true,
		result: { status: "cancelled" },
	});
	expect((await fs.readdir(root)).filter((s) => !s.endsWith(".offline"))).toEqual(
		before.filter((s) => s !== path.basename(directory)),
	);
});
it.each([
	"reselect",
	"foreign",
	"subframe",
	"dirty",
	"wrong-token",
])("reseal refuses %s capability before picker", async (kind) => {
	const opened = await open();
	host.open.mockClear();
	if (kind === "reselect") selectThroughProduction("p");
	if (kind === "foreign") current = caller();
	if (kind === "subframe")
		current.event = { ...current.event, senderFrame: {} } as IpcMainInvokeEvent;
	if (kind === "dirty") dirty = true;
	expect(
		await edited(
			kind === "wrong-token" ? randomUUID() : opened.token,
			beginPackageEdit(opened.lesson),
		),
	).toMatchObject({ success: false });
	expect(host.open).not.toHaveBeenCalled();
});
it.each([
	"session",
	"release",
	"cancel",
	"asset",
])("reseal refuses %s changes during destination picker before output", async (kind) => {
	const opened = await open(),
		id = randomUUID();
	let settle!: (value: unknown) => void;
	host.open.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	);
	const pending = edited(opened.token, beginPackageEdit(opened.lesson), id);
	await vi.waitFor(() => expect(settle).toBeDefined());
	if (kind === "session") selectThroughProduction("p");
	if (kind === "release") await invoke("release", opened.token);
	if (kind === "cancel") await invoke("cancel", id);
	if (kind === "asset") await fs.appendFile(path.join(directory, "index.html"), "tampered");
	const before = await fs.readdir(root);
	settle({ canceled: false, filePaths: [root] });
	expect(await pending).toMatchObject({ success: false });
	expect(await fs.readdir(root)).toEqual(before);
});
it("reseal cancellation during actual decoder promise holds busy, prevents receipt and preserves private incomplete output", async () => {
	const f = await videoPackage();
	directory = f.directory;
	const opened = await open();
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	let settle!: () => void, entered!: () => void;
	const decoding = new Promise<void>((resolve) => {
		entered = resolve;
	});
	// Input revalidation succeeds; hold the separate output verification decode.
	vi.mocked(validateRangeVideo).mockImplementation(async (file, expected) => {
		if (!file.startsWith(directory + path.sep)) {
			entered();
			await new Promise<void>((resolve) => {
				settle = resolve;
			});
		}
		return fakePackageVideo(file, expected);
	});
	const id = randomUUID(),
		pending = edited(opened.token, beginPackageEdit(opened.lesson), id);
	await decoding;
	expect(await invoke("cancel", id)).toBe(true);
	expect(await invoke("open", randomUUID())).toEqual({
		success: false,
		code: "lesson-package-busy",
	});
	settle();
	expect(await pending).toMatchObject({ success: false, code: "lesson-package-cancelled" });
	const outputs = (await fs.readdir(root)).filter(
		(s) => s.startsWith("lesson-package-") && path.join(root, s) !== directory,
	);
	expect(outputs).toHaveLength(2); // Original static fixture plus the incomplete new derivative.
	const incomplete = [];
	for (const name of outputs) {
		try {
			await fs.access(path.join(root, name, "package-receipt.json"));
		} catch {
			incomplete.push(name);
		}
	}
	expect(incomplete).toHaveLength(1);
	expect(await fs.readdir(path.join(root, incomplete[0]))).toContain("lesson-package.json");
});
it.each([
	"source-replace",
	"project",
	"crash",
	"output-corrupt",
])("reseal refuses %s during output decode without publishing a receipt", async (kind) => {
	const f = await videoPackage();
	directory = f.directory;
	const opened = await open();
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	let output: string | undefined;
	vi.mocked(validateRangeVideo).mockImplementation(async (file, expected) => {
		const result = await fakePackageVideo(file, expected);
		if (!file.startsWith(directory + path.sep)) {
			output = path.dirname(path.dirname(file));
			if (kind === "project") selectThroughProduction("p");
			if (kind === "crash") current.owner.emit("render-process-gone");
			if (kind === "output-corrupt") await fs.appendFile(file, "tampered during decode");
			if (kind === "source-replace") {
				const named = path.join(directory, "lesson.openscreen-lesson.json"),
					bytes = await fs.readFile(named);
				await fs.rename(named, named + ".old");
				await fs.writeFile(named, bytes);
				await fs.unlink(named + ".old");
			}
		}
		return result;
	});
	expect(await edited(opened.token, beginPackageEdit(opened.lesson))).toMatchObject({
		success: false,
	});
	expect(output).toBeDefined();
	await expect(fs.access(path.join(output!, "package-receipt.json"))).rejects.toThrow();
});
it("reseal rejects destination symlinks and the source package itself without modifying it", async () => {
	const opened = await open(),
		before = await packageBytes(),
		alias = path.join(root, "alias");
	await fs.symlink(root, alias);
	host.open.mockResolvedValueOnce({ canceled: false, filePaths: [alias] });
	expect(await edited(opened.token, beginPackageEdit(opened.lesson))).toMatchObject({
		success: false,
	});
	host.open.mockResolvedValue({ canceled: false, filePaths: [directory] });
	const fresh = await open();
	host.open.mockResolvedValueOnce({ canceled: false, filePaths: [directory] });
	expect(await edited(fresh.token, beginPackageEdit(fresh.lesson))).toMatchObject({
		success: false,
	});
	expect(await packageBytes()).toEqual(before);
});
it.each([
	"code",
	"image",
])("reseal cannot resurrect excluded %s from an imported draft", async (kind) => {
	const included = await open();
	const excluded = await createLessonPackage(
		{
			manifestPath: path.join(root, "selected.json.unavailable"),
			stepIds: included.lesson.steps.map((s) => s.id),
			includeCode: false,
			imagePolicy: "exclude",
			media: [],
			outputDirectory: root,
		},
		{
			assertCurrent() {
				/* Explicit fixture. */
			},
		},
	);
	host.open.mockResolvedValue({ canceled: false, filePaths: [excluded.path] });
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson);
	if (kind === "code") draft.steps[0].code = { language: "plain", text: "PRIVATE_EXCLUDED_CODE" };
	else {
		draft.assets = included.lesson.assets;
		draft.steps[0].imageId = draft.assets[0].id;
		draft.steps[0].imageAlt = "Resurrected";
	}
	host.open.mockClear();
	expect(await edited(opened.token, draft)).toMatchObject({ success: false });
	expect(host.open).not.toHaveBeenCalled();
});
it("reseal refuses a decoder failure on copied output even when input inspection succeeds", async () => {
	const f = await videoPackage();
	directory = f.directory;
	const opened = await open();
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	vi.mocked(validateRangeVideo).mockImplementation(async (file, expected) => {
		if (!file.startsWith(directory + path.sep)) throw new Error("INVALID_OUTPUT_DECODE");
		return fakePackageVideo(file, expected);
	});
	expect(await edited(opened.token, beginPackageEdit(opened.lesson))).toMatchObject({
		success: false,
	});
	const dirs = (await fs.readdir(root)).filter((n) => n.startsWith("lesson-package-"));
	let incomplete = 0;
	for (const name of dirs) {
		try {
			await fs.access(path.join(root, name, "package-receipt.json"));
		} catch {
			incomplete++;
		}
	}
	expect(incomplete).toBe(1);
});
it("reseal source identity failure cannot silently regain authority after bytes are restored", async () => {
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson),
		named = path.join(directory, "index.html"),
		bytes = await fs.readFile(named);
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	await fs.appendFile(named, "tamper");
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		capability: "reopen-required",
	});
	await fs.writeFile(named, bytes);
	host.open.mockClear();
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		capability: "reopen-required",
	});
	expect(host.open).not.toHaveBeenCalled();
	host.open.mockResolvedValue({ canceled: false, filePaths: [directory] });
	const fresh = await open();
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	expect(await edited(fresh.token, draft)).toMatchObject({
		success: true,
		result: { status: "packaged" },
	});
});
it("unsupported reseal edits refuse before picker while keeping the unchanged capability for explicit corrected retry", async () => {
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson);
	draft.steps[0].status = "reviewed";
	host.open.mockClear();
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		code: "lesson-package-edit-unsupported",
		capability: "retained",
	});
	expect(host.open).not.toHaveBeenCalled();
	draft.steps[0].status = "draft";
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	expect(await edited(opened.token, draft)).toMatchObject({
		success: true,
		result: { status: "packaged" },
	});
});
it("a dirty reseal refusal revokes the old main capability until an explicit fresh open", async () => {
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson);
	dirty = true;
	host.open.mockClear();
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		capability: "reopen-required",
	});
	dirty = false;
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		capability: "reopen-required",
	});
	expect(host.open).not.toHaveBeenCalled();
	const fresh = await open();
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	expect(await edited(fresh.token, draft)).toMatchObject({ success: true });
});
it("cancel during picker does not inspect the missing source after native cancellation; retry still verifies the original frozen identity", async () => {
	const opened = await open(),
		draft = beginPackageEdit(opened.lesson),
		id = randomUUID();
	let settle!: (value: unknown) => void;
	host.open.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve;
			}),
	);
	const pending = edited(opened.token, draft, id);
	await vi.waitFor(() => expect(settle).toBeDefined());
	await invoke("cancel", id);
	await fs.rename(directory, directory + ".missing");
	settle({ canceled: true });
	expect(await pending).toMatchObject({
		success: false,
		code: "lesson-package-cancelled",
		capability: "retained",
	});
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	expect(await edited(opened.token, draft)).toMatchObject({
		success: false,
		capability: "reopen-required",
	});
});
