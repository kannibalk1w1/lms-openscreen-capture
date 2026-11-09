import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AI_EDITION_OPEN_PROJECT_CHANNEL } from "../../src/native/contracts";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { rangeExportFixture } from "../lesson/rangeExport.test-support";
import { renderOwnerJobs } from "./exportJobs";
import { registerLessonWorkflow } from "./lessonWorkflow";

vi.mock("../lesson/encodedVideo", () => ({
	validateRangeVideo: vi.fn(async (file: string) => {
		const bytes = await fs.readFile(file);
		return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	}),
}));
const electron = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	pick: vi.fn(),
	getPath: vi.fn(),
	from: vi.fn(() => null),
}));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	ipcMain: { handle: electron.handle, on: electron.on },
	dialog: { showOpenDialog: electron.pick },
	BrowserWindow: { fromWebContents: electron.from },
}));
let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	electron.handle.mockClear();
	electron.on.mockClear();
	electron.pick.mockReset();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "step-export-"));
	electron.getPath.mockReturnValue(root);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function setup(nativeControls = true) {
	const f = await rangeExportFixture(root, nativeControls);
	let dirty = false,
		approved = true;
	const sourceBefore = await fs.readFile(f.source),
		projectFile = f.documents.filePathFor("p"),
		projectBefore = await fs.readFile(projectFile);
	registerLessonWorkflow({
		documents: f.documents,
		compositor: f.compositor,
		editorHasUnsavedChanges: () => dirty,
		readableApprovedPath: (source) => (approved && source === f.source ? source : null),
	});
	const sender = Object.assign(new EventEmitter(), {
		id: 1,
		mainFrame: {},
		getURL: (): string => "file:///editor",
		isDestroyed: () => false,
		send: vi.fn(),
	});
	editorRangeSessions.register(sender, sender.getURL());
	const event = { sender, senderFrame: sender.mainFrame };
	const select = (id: string, target = event) =>
		electron.on.mock.calls.find(([name]) => name === AI_EDITION_OPEN_PROJECT_CHANNEL)![1](
			target,
			id,
		);
	select("p");
	const callback = (name: string) =>
		electron.handle.mock.calls.find(([channel]) => channel === name)![1];
	electron.pick.mockResolvedValue({ canceled: false, filePaths: [root] });
	return {
		...f,
		sender,
		event,
		select,
		sourceBefore,
		projectFile,
		projectBefore,
		export: (request: unknown, target = event) => callback("lesson:range-export")(target, request),
		cancelExport: (id: unknown, target = event) =>
			callback("lesson:range-export-cancel")(target, id),
		frame: (input: unknown) => callback("lesson:frame")(event, input),
		setDirty: (value: boolean) => {
			dirty = value;
		},
		setApproved: (value: boolean) => {
			approved = value;
		},
	};
}
it("registered workflow exports only the pinned included step through cuts/speed, validates and preserves originals", async () => {
	const f = await setup(),
		snapshot = JSON.stringify(f.lesson),
		request = f.request();
	const result = await f.export(request);
	expect(result).toMatchObject({ success: true, result: { status: "materialized", frames: 45 } });
	expect(f.native).toHaveBeenCalledOnce();
	expect(validateRangeVideo).toHaveBeenCalled();
	const receipt = JSON.parse(
		await fs.readFile(path.join(result.result.path, "range-export.json"), "utf8"),
	);
	expect(receipt).toMatchObject({
		target: { lessonId: f.lesson.id, stepId: f.step.id, revision: f.lesson.revision },
		validation: "mp4-video-samples-and-full-frame-decode",
		mediaDecodedByValidator: true,
		encodedTimingVerified: true,
		audio: { timingVerified: false },
		output: { frames: 45 },
	});
	expect(receipt.selection.previousSelections).toEqual([]);
	expect(JSON.stringify(f.lesson)).toBe(snapshot);
	expect(await fs.readFile(f.source)).toEqual(f.sourceBefore);
	expect(await fs.readFile(f.projectFile)).toEqual(f.projectBefore);
	expect(f.sender.send.mock.calls.map(([, value]) => value.phase)).toContain("validating");
	const reopened = JSON.parse(JSON.stringify(f.lesson));
	expect((await f.export({ ...f.request(), lesson: reopened })).success).toBe(true);
});
it("picker cancellation precedes all source filesystem reads/resolution, native work and output", async () => {
	const f = await setup(),
		before = await fs.readdir(root),
		read = vi.spyOn(fs, "readFile"),
		resolve = vi.spyOn(fs, "realpath"),
		open = vi.spyOn(fs, "open");
	electron.pick.mockResolvedValueOnce({ canceled: true, filePaths: [] });
	expect(await f.export(f.request())).toEqual({ success: true, result: { status: "cancelled" } });
	expect(resolve).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	expect(read.mock.calls.some(([file]) => file === f.source)).toBe(false);
	expect(f.native).not.toHaveBeenCalled();
	expect(await fs.readdir(root)).toEqual(before);
});
it.each([
	"subframe",
	"foreign-project",
	"dirty",
	"unknown-window",
	"unattested",
	"not-included",
	"target-removed",
	"destination",
])("refuses %s without a picker or render", async (change) => {
	const f = await setup();
	let request: unknown = f.request(),
		target = f.event;
	if (change === "subframe") target = { ...target, senderFrame: {} };
	if (change === "foreign-project")
		request = {
			...f.request(),
			lesson: {
				...f.lesson,
				steps: [{ ...f.step, mediaSelection: { ...f.pin, projectId: "other" } }],
			},
		};
	if (change === "dirty") f.setDirty(true);
	if (change === "unknown-window")
		target = {
			sender: Object.assign(new EventEmitter(), {
				...f.sender,
				mainFrame: {},
				getURL: () => "file:///other",
			}),
			senderFrame: {},
		};
	if (change === "unattested")
		request = {
			...f.request(),
			lesson: { ...f.lesson, steps: [{ ...f.step, mediaSelection: f.reference }] },
		};
	if (change === "not-included") request = { ...f.request(), includedStepIds: [randomUUID()] };
	if (change === "target-removed") request = { ...f.request(), stepId: randomUUID() };
	if (change === "destination") request = { ...f.request(), destination: "/PRIVATE" };
	expect(await f.export(request, target)).toMatchObject({ success: false });
	expect(electron.pick).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
it("the production workflow's live dirty provider protects both still and range registrations", async () => {
	const f = await setup();
	f.setDirty(true);
	expect(await f.frame({ projectId: "p" })).toMatchObject({
		success: false,
		code: "project-changed",
	});
	expect(await f.export(f.request())).toMatchObject({ success: false, code: "project-changed" });
	f.setDirty(false);
	electron.pick.mockResolvedValueOnce({ canceled: true, filePaths: [] });
	expect((await f.export(f.request())).success).toBe(true);
});
it.each([
	"unapproved",
	"missing",
	"source-changed",
	"project-changed",
])("refuses %s after picker without native output or pin refresh", async (change) => {
	const f = await setup(),
		pinBefore = JSON.stringify(f.pin);
	if (change === "unapproved") f.setApproved(false);
	if (change === "missing") await fs.unlink(f.source);
	if (change === "source-changed") await fs.writeFile(f.source, "changed source");
	if (change === "project-changed")
		electron.pick.mockImplementationOnce(async () => {
			f.doc.legacyEditor = { ...f.doc.legacyEditor, padding: 77 };
			await f.documents.saveProject(f.doc);
			return { canceled: false, filePaths: [root] };
		});
	const result = await f.export(f.request());
	expect(result.success).toBe(false);
	expect(f.native).not.toHaveBeenCalled();
	expect(JSON.stringify(f.pin)).toBe(pinBefore);
	expect(JSON.stringify(result)).not.toContain(f.source);
});
it("cancels a pending picker without starting source work and binds cancellation to owner/channel/main frame", async () => {
	const f = await setup();
	let choose!: () => void;
	electron.pick.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				choose = () => resolve({ canceled: false, filePaths: [root] });
			}),
	);
	const request = f.request(),
		pending = f.export(request);
	await vi.waitFor(() => expect(electron.pick).toHaveBeenCalledOnce());
	const other = Object.assign(new EventEmitter(), {
		id: 1,
		mainFrame: {},
		isDestroyed: () => false,
	});
	expect(
		await f.cancelExport(request.operationId, {
			sender: other,
			senderFrame: other.mainFrame,
		} as typeof f.event),
	).toEqual({ success: true, result: false });
	expect((await f.cancelExport(request.operationId, { ...f.event, senderFrame: {} })).success).toBe(
		false,
	);
	expect(
		renderOwnerJobs.cancel(
			f.sender as unknown as import("electron").WebContents,
			request.operationId,
		),
	).toBe(false);
	expect(await f.cancelExport(randomUUID())).toEqual({ success: true, result: false });
	expect(await f.cancelExport(request.operationId)).toEqual({ success: true, result: true });
	choose();
	expect(await pending).toMatchObject({ success: false, code: "range-export-cancelled" });
	expect(f.native).not.toHaveBeenCalled();
});
it.each([
	"cancel",
	"navigation",
	"project-switch",
])("holds actual native ownership through %s, preserves incomplete files and permits retry", async (change) => {
	const f = await setup();
	let finish!: () => void;
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "partial mock MP4");
		return await new Promise((resolve) => {
			finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
		});
	});
	const request = f.request(),
		pending = f.export(request);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	if (change === "cancel") await f.cancelExport(request.operationId);
	else if (change === "navigation") f.sender.emit("did-start-navigation");
	else f.select("other");
	expect(await f.export(f.request())).toMatchObject({ success: false });
	finish();
	const result = await pending;
	expect(result.success).toBe(false);
	const directories = (await fs.readdir(root)).filter((name) => name.startsWith("lesson-range-"));
	expect(directories).toHaveLength(1);
	expect(await fs.readdir(path.join(root, directories[0]))).not.toContain("range-export.json");
	if (change === "cancel") expect(result.artifactPath).toBe(path.join(root, directories[0]));
	if (change === "project-switch") expect(result.artifactPath).toBeUndefined();
	f.select("p");
	expect((await f.export(f.request())).success).toBe(true);
});
it("cancellation during decode prevents receipt and keeps owned artifacts", async () => {
	const f = await setup();
	let finish!: () => void;
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file) => {
		const bytes = await fs.readFile(file);
		return await new Promise((resolve) => {
			finish = () =>
				resolve({
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				} as Awaited<ReturnType<typeof validateRangeVideo>>);
		});
	});
	const request = f.request(),
		pending = f.export(request);
	await vi.waitFor(() =>
		expect(f.sender.send.mock.calls.some(([, value]) => value.phase === "validating")).toBe(true),
	);
	await f.cancelExport(request.operationId);
	finish();
	const result = await pending;
	expect(result).toMatchObject({ success: false, code: "range-export-cancelled" });
	expect((await fs.readdir(result.artifactPath)).includes("range-export.json")).toBe(false);
});
it("a native failure is fixed/actionable with an authorized artifact directory and no raw diagnostic", async () => {
	const f = await setup();
	f.native.mockRejectedValueOnce(new Error("PRIVATE_NATIVE_PATH_CANARY"));
	const result = await f.export(f.request());
	expect(result).toMatchObject({ success: false, code: "range-export-incomplete" });
	expect(result.artifactPath).toContain("lesson-range-");
	expect(JSON.stringify(result)).not.toContain("PRIVATE_NATIVE_PATH_CANARY");
});
it.each([
	"source",
	"project",
	"dirty",
])("rechecks %s after actual native settlement before certification", async (change) => {
	const f = await setup();
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "mock selected MP4");
		if (change === "source") await fs.writeFile(f.source, "replacement");
		if (change === "project") {
			f.doc.legacyEditor = { ...f.doc.legacyEditor, padding: 77 };
			await f.documents.saveProject(f.doc);
		}
		if (change === "dirty") f.setDirty(true);
		return { frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 };
	});
	const result = await f.export(f.request());
	expect(result.success).toBe(false);
	const directory = (await fs.readdir(root)).find((name) => name.startsWith("lesson-range-"))!;
	expect(await fs.readdir(path.join(root, directory))).not.toContain("range-export.json");
});
it("a cancellation with unavailable native controls retains both leases until the actual helper settles", async () => {
	const f = await setup(false);
	let finish!: () => void;
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "partial");
		return new Promise((resolve) => {
			finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
		});
	});
	const request = f.request(),
		pending = f.export(request);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	expect(await f.cancelExport(request.operationId)).toMatchObject({ result: true });
	expect(await f.export(f.request())).toMatchObject({ success: false, code: "render-busy" });
	await expect(f.compositor.renderFrames([], "{}", 30, [0], 64)).rejects.toThrow(/already running/);
	finish();
	expect(await pending).toMatchObject({ success: false, code: "range-export-cancelled" });
	const directory = (await fs.readdir(root)).find((name) => name.startsWith("lesson-range-"))!;
	expect(await fs.readdir(path.join(root, directory))).not.toContain("range-export.json");
	expect((await f.export(f.request())).success).toBe(true);
});
it("a same-window normal export blocks before picker and a cross-window native lease refuses overlap", async () => {
	const f = await setup();
	let finish!: () => void;
	const normal = renderOwnerJobs.run(
		f.sender as unknown as import("electron").WebContents,
		randomUUID(),
		() => ({
			result: new Promise<void>((resolve) => {
				finish = resolve;
			}),
			cancel: () => false,
		}),
		() => undefined,
	);
	expect(await f.export(f.request())).toMatchObject({ success: false, code: "render-busy" });
	expect(electron.pick).not.toHaveBeenCalled();
	finish();
	await normal;
	f.native.mockImplementationOnce(
		async () =>
			new Promise((resolve) => {
				finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
			}),
	);
	const other = f.compositor.startExportMulti([], path.join(root, "normal.mp4"), "{}", {
		width: 64,
		height: 32,
		fps: 30,
		codec: "h264",
		bitrate: 4000000,
	});
	try {
		expect(await f.export(f.request())).toMatchObject({ success: false, code: "render-busy" });
		expect(f.native).toHaveBeenCalledOnce();
	} finally {
		finish();
		await other.result;
	}
	expect((await f.export(f.request())).success).toBe(true);
});
it.each(["darwin", "win32"])("fails closed on %s before picker/native work", async (platform) => {
	const f = await setup();
	vi.spyOn(process, "platform", "get").mockReturnValue(platform as NodeJS.Platform);
	expect(await f.export(f.request())).toMatchObject({
		success: false,
		code: "range-export-unsupported",
	});
	expect(electron.pick).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
it("pins the actual main registration to its required live dirty provider", async () => {
	const ts = await import("typescript"),
		source = await fs.readFile(path.resolve("electron/ipc/handlers.ts"), "utf8");
	const tree = ts.createSourceFile("handlers.ts", source, ts.ScriptTarget.Latest, true),
		calls: import("typescript").CallExpression[] = [];
	const visit = (node: import("typescript").Node) => {
		if (ts.isCallExpression(node) && node.expression.getText(tree) === "registerLessonWorkflow")
			calls.push(node);
		ts.forEachChild(node, visit);
	};
	visit(tree);
	expect(calls).toHaveLength(1);
	const argument = calls[0].arguments[0];
	expect(ts.isObjectLiteralExpression(argument)).toBe(true);
	if (!ts.isObjectLiteralExpression(argument)) throw new Error("missing production options");
	const binding = argument.properties.find(
		(property) => property.name?.getText(tree) === "editorHasUnsavedChanges",
	);
	expect(binding && ts.isShorthandPropertyAssignment(binding)).toBe(true);
});
it("cancellation during source hashing starts no native job and publishes no receipt", async () => {
	const f = await setup(),
		request = f.request(),
		open = fs.open.bind(fs);
	let cancelled = false;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const file = await open(...args);
		if (args[0] === f.source && !cancelled) {
			cancelled = true;
			await f.cancelExport(request.operationId);
		}
		return file;
	});
	expect(await f.export(request)).toMatchObject({ success: false, code: "range-export-cancelled" });
	expect(cancelled).toBe(true);
	expect(f.native).not.toHaveBeenCalled();
	expect((await fs.readdir(root)).some((name) => name.startsWith("lesson-range-"))).toBe(false);
});
it("the saved reader cannot return a different project's document", async () => {
	const f = await setup();
	vi.spyOn(f.documents, "getSavedProject").mockResolvedValue({
		...f.doc,
		project: { ...f.doc.project, id: "other" },
	});
	expect(await f.export(f.request())).toMatchObject({ success: false, code: "project-changed" });
	expect(electron.pick).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
it("the final publication check refuses authority invalidated after output hashing", async () => {
	const f = await setup(),
		chmod = fs.chmod.bind(fs);
	vi.spyOn(fs, "chmod").mockImplementation(async (...args) => {
		await chmod(...args);
		f.setDirty(true);
	});
	const result = await f.export(f.request());
	expect(result).toMatchObject({ success: false, code: "project-changed" });
	const directory = (await fs.readdir(root)).find((name) => name.startsWith("lesson-range-"))!;
	expect(await fs.readdir(path.join(root, directory))).not.toContain("range-export.json");
	expect(result.artifactPath).toBeUndefined();
});
it("refuses an excluded target even when another valid step is included", async () => {
	const f = await setup(),
		other = { ...f.step, id: randomUUID() };
	const request = {
		...f.request(),
		lesson: { ...f.lesson, steps: [f.step, other] },
		includedStepIds: [other.id],
	};
	expect(await f.export(request)).toMatchObject({ success: false, code: "range-target-changed" });
	expect(electron.pick).not.toHaveBeenCalled();
});
it("requires the canonical source grant independently of the lexical grant", async () => {
	const f = await setup(),
		realpath = fs.realpath.bind(fs),
		open = vi.spyOn(fs, "open");
	vi.spyOn(fs, "realpath").mockImplementation(async (...args) => {
		const result = await realpath(...args);
		f.setApproved(false);
		return result;
	});
	expect(await f.export(f.request())).toMatchObject({
		success: false,
		code: "range-export-source-unavailable",
	});
	expect(f.native).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
});
