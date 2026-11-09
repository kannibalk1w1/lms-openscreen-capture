import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { DocumentService } from "./document-service";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "saved-lesson-project-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
it("reads saved lesson inputs without media relinking, source inspection, approval or writes", async () => {
	const doc = createEmptyDocument({ projectId: "p", title: "Exact saved" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Missing source",
			originalPath: path.join(root, "UNAPPROVED_MISSING.mp4"),
			cameraTrack: null,
			durationSec: 1,
			video: { codec: "h264", fps: 30, width: 64, height: 32 },
		},
	];
	const file = path.join(root, "p.openscreen"),
		bytes = JSON.stringify(doc);
	await fs.writeFile(file, bytes);
	const onRead = vi.fn(),
		service = new DocumentService(root, path.join(root, "registry"), onRead);
	const read = vi.spyOn(fs, "readFile"),
		stat = vi.spyOn(fs, "stat"),
		lstat = vi.spyOn(fs, "lstat"),
		write = vi.spyOn(fs, "writeFile"),
		list = vi.spyOn(fs, "readdir");
	expect(await service.getSavedProject("p")).toEqual(doc);
	expect(read.mock.calls.map(([file]) => file)).toEqual([file]);
	for (const operation of [onRead, stat, lstat, write, list])
		expect(operation).not.toHaveBeenCalled();
	expect(await fs.readFile(file, "utf8")).toBe(bytes);
});
it("rejects traversal before reads and refuses old documents without upgrading or rewriting", async () => {
	const service = new DocumentService(root, root),
		read = vi.spyOn(fs, "readFile");
	await expect(service.getSavedProject("../private")).rejects.toThrow();
	expect(read).not.toHaveBeenCalled();
	const legacy = JSON.stringify({ version: 1, videoPath: "private.mp4" });
	const file = path.join(root, "p.openscreen");
	await fs.writeFile(file, legacy);
	await expect(service.getSavedProject("p")).rejects.toThrow();
	expect(await fs.readFile(file, "utf8")).toBe(legacy);
});
it("shares serialization with saved project writes and returns the completed saved revision", async () => {
	const service = new DocumentService(root, root),
		doc = createEmptyDocument({ projectId: "p", title: "Before" });
	await service.saveProject(doc);
	const next = { ...doc, project: { ...doc.project, title: "After" } };
	const save = service.saveProject(next),
		read = service.getSavedProject("p");
	await save;
	expect((await read).project.title).toBe("After");
});
