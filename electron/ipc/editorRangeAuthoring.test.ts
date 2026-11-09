import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { AI_EDITION_OPEN_PROJECT_CHANNEL } from "../../src/native/contracts";
import { DocumentService } from "../ai-edition/document-service";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { registerEditorRangeAuthoring } from "./editorRangeAuthoring";

const electron = vi.hoisted(() => ({ handle: vi.fn(), on: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: electron }));
let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	electron.handle.mockClear();
	electron.on.mockClear();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "editor-range-wiring-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = path.join(root, "screen.mp4");
	await fs.writeFile(source, "fixture source");
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
	await fs.writeFile(path.join(root, "p.openscreen"), JSON.stringify(doc));
	const onRead = vi.fn(),
		documents = new DocumentService(root, root, onRead);
	const saved = vi.spyOn(documents, "getSavedProject"),
		opened = vi.spyOn(documents, "getProject"),
		marker = vi.spyOn(documents, "markOpenInEditor");
	let dirty = false,
		allowed = false,
		url = "file:///app/index.html?windowType=editor";
	const readableApprovedPath = vi.fn((sourcePath: string) =>
		allowed && sourcePath === source ? sourcePath : null,
	);
	registerEditorRangeAuthoring({
		documents,
		editorHasUnsavedChanges: () => dirty,
		readableApprovedPath,
	});
	const sender = Object.assign(new EventEmitter(), {
		mainFrame: {},
		getURL: () => url,
		isDestroyed: () => false,
	});
	const event = { sender, senderFrame: sender.mainFrame };
	editorRangeSessions.register(sender, url);
	const select = (id: unknown, target = event) =>
		electron.on.mock.calls.find(([name]) => name === AI_EDITION_OPEN_PROJECT_CHANNEL)![1](
			target,
			id,
		);
	const confirm = (input: unknown, target = event) =>
		electron.handle.mock.calls.find(([name]) => name === "lesson:confirm-range")![1](target, input);
	const step = newStep(),
		request = {
			operationId: randomUUID(),
			lesson: { ...newLesson(), steps: [step] },
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
		saved,
		opened,
		marker,
		onRead,
		readableApprovedPath,
		sender,
		event,
		select,
		confirm,
		request,
		setDirty: (value: boolean) => {
			dirty = value;
		},
		setAllowed: (value: boolean) => {
			allowed = value;
		},
		setURL: (value: string) => {
			url = value;
		},
	};
}
it("uses the production registration's saved reader, dirty callback, approval callback and main-frame selection", async () => {
	const f = await fixture();
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	f.select("p", { ...f.event, senderFrame: {} });
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	f.select("p");
	f.setDirty(true);
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	expect(f.saved).not.toHaveBeenCalled();
	f.setDirty(false);
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "range-source-unavailable" });
	expect(f.readableApprovedPath).toHaveBeenCalledWith(f.source);
	f.setAllowed(true);
	expect(await f.confirm(f.request)).toMatchObject({ success: true, result: { version: 2 } });
	expect(f.saved).toHaveBeenCalledWith("p");
	expect(f.opened).not.toHaveBeenCalled();
	expect(f.onRead).not.toHaveBeenCalled();
});
it.each([
	"render-process-gone",
	"did-start-navigation",
])("invalidates through the actual production %s listener and requires reselect", async (name) => {
	const f = await fixture();
	f.setAllowed(true);
	f.select("p");
	f.sender.emit(name);
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	f.select("p");
	expect((await f.confirm(f.request)).success).toBe(true);
});
it("keeps hash navigation fail-closed until exact URL restoration AND explicit project reselect", async () => {
	const f = await fixture();
	f.setAllowed(true);
	f.select("p");
	f.setURL("file:///app/index.html?windowType=editor#anchor");
	f.sender.emit(
		"did-start-navigation",
		{},
		"file:///app/index.html?windowType=editor#anchor",
		true,
		true,
	);
	f.select("p");
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	f.setURL("file:///app/index.html?windowType=editor");
	expect(await f.confirm(f.request)).toEqual({ success: false, code: "project-changed" });
	f.select("p");
	expect((await f.confirm(f.request)).success).toBe(true);
});
it("preserves marker ownership when an older sender is destroyed", async () => {
	const f = await fixture();
	f.select("p");
	const other = Object.assign(new EventEmitter(), {
		mainFrame: {},
		getURL: () => "file:///app/index.html?windowType=editor",
		isDestroyed: () => false,
	});
	editorRangeSessions.register(other, other.getURL());
	f.select("p", { sender: other, senderFrame: other.mainFrame });
	f.marker.mockClear();
	f.sender.emit("destroyed");
	expect(f.marker).not.toHaveBeenCalled();
	other.emit("destroyed");
	expect(f.marker).toHaveBeenCalledWith(null);
});
