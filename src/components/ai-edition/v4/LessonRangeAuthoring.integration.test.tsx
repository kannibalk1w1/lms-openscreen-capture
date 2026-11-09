// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonApi } from "@/lib/lesson/api";
import { validateLesson } from "@/lib/lesson/schema";
import { DocumentService } from "../../../../electron/ai-edition/document-service";
import { registerLessonHandlers } from "../../../../electron/ipc/lesson";
import { registerRangeAuthoringHandlers } from "../../../../electron/ipc/rangeAuthoring";
import { EditorRangeSessions } from "../../../../electron/lesson/editorRangeSession";
import { RangeAuthoringService } from "../../../../electron/lesson/rangeAuthoring";
import { LessonService } from "../../../../electron/lesson/service";
import { LessonGuideDialog } from "./LessonGuideDialog";

const electron = vi.hoisted(() => ({
	handle: vi.fn(),
	save: vi.fn(),
	open: vi.fn(),
	getPath: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: { handle: electron.handle },
	app: { getPath: electron.getPath },
	dialog: { showSaveDialog: electron.save, showOpenDialog: electron.open },
}));
const rangeControl = vi.hoisted(() => ({
	props: null as null | {
		onAttach: (startSec: number, endSec: number) => void;
	},
}));
vi.mock("./LessonRangeControls", async () => {
	const actual =
		await vi.importActual<typeof import("./LessonRangeControls")>("./LessonRangeControls");
	return {
		LessonRangeControls: (props: Parameters<typeof actual.LessonRangeControls>[0]) => {
			rangeControl.props = props;
			return <actual.LessonRangeControls {...props} />;
		},
	};
});
let root: string;
beforeEach(async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	electron.handle.mockClear();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-ui-"));
	electron.getPath.mockReturnValue(root);
});
afterEach(async () => {
	cleanup();
	useProjectStore.getState().clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
function show() {
	return render(
		<I18nProvider>
			<LessonGuideDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
}
async function fixture() {
	const source = path.join(root, "screen.mp4");
	await fs.copyFile(path.resolve("electron/lesson/__fixtures__/range-video.mp4"), source);
	const doc = createEmptyDocument({ projectId: "p", title: "Generic project" });
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
	useProjectStore.setState({ projectId: "p", document: doc, dirty: false });
	const owner = Object.assign(new EventEmitter(), {
		getURL: () => "file:///editor",
		isDestroyed: () => false,
		mainFrame: {},
	});
	const event = { sender: owner, senderFrame: owner.mainFrame };
	const sessions = new EditorRangeSessions();
	sessions.register(owner, owner.getURL());
	sessions.select(owner, "p");
	const projectFile = path.join(root, "p.openscreen");
	await fs.writeFile(projectFile, JSON.stringify(doc));
	const documents = new DocumentService(root, root);
	const read = vi.fn(() => documents.getSavedProject("p")),
		renderFrames = vi.fn(async () => null);
	let allowed = true;
	registerRangeAuthoringHandlers(new RangeAuthoringService(read), (event) => ({
		...sessions.capture(event.sender, () => useProjectStore.getState().dirty),
		canReadSource: (p) => allowed && p === source,
	}));
	registerLessonHandlers(new LessonService(read, renderFrames));
	const invoke = (channel: string, ...args: unknown[]) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1](event, ...args);
	const plan = vi.fn((input: Parameters<NonNullable<LessonApi["lessonPlanRange"]>>[0]) =>
		new LessonService(read, renderFrames)
			.planRange(input)
			.then((result) => ({ success: true as const, result })),
	);
	const api: LessonApi = {
		lessonPlanRange: plan,
		lessonConfirmRange: (input) => invoke("lesson:confirm-range", input),
		lessonCancelRange: (id) => invoke("lesson:cancel-range", id),
		lessonSave: (input) => invoke("lesson:save", input),
		lessonOpen: () => invoke("lesson:open"),
	};
	const confirm = vi.fn(api.lessonConfirmRange!),
		cancel = vi.fn(api.lessonCancelRange!);
	vi.stubGlobal("electronAPI", { ...api, lessonConfirmRange: confirm, lessonCancelRange: cancel });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Ruler end (seconds)"), { target: { value: "1" } });
	return {
		source,
		projectFile,
		doc,
		owner,
		sessions,
		read,
		renderFrames,
		confirm,
		plan,
		cancel,
		setAllowed: (value: boolean) => {
			allowed = value;
		},
	};
}
const confirmButton = () =>
	screen.getByRole("button", { name: "Confirm current source and attach range" });
const saveButton = () => screen.getByRole("button", { name: "Save new editable copy" });
const refreshButton = () =>
	screen.getByRole("button", { name: "Refresh range and current source" });
it("uses real UI/IPC/service/files to confirm, save/reopen and explicitly refresh with history and no native rendering", async () => {
	const f = await fixture(),
		original = JSON.stringify(f.doc),
		originalSource = await fs.readFile(f.source);
	fireEvent.click(confirmButton());
	await screen.findByText(/Current source confirmed and attached/);
	expect(f.confirm).toHaveBeenCalledOnce();
	expect(f.confirm.mock.calls[0][0].intent).toBe("author-current");
	const firstFile = path.join(root, "first.json");
	electron.save.mockResolvedValueOnce({ canceled: false, filePath: firstFile });
	fireEvent.click(saveButton());
	await screen.findByText(`Editable copy saved: ${firstFile}`);
	const firstBytes = await fs.readFile(firstFile, "utf8"),
		first = await validateLesson(JSON.parse(firstBytes));
	expect(first.steps[0].mediaSelection?.version).toBe(2);
	cleanup();
	show();
	electron.open.mockResolvedValueOnce({ canceled: false, filePaths: [firstFile] });
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByText("Editable lesson opened.");
	expect(refreshButton()).toBeDefined();
	expect(f.confirm).toHaveBeenCalledOnce();
	// Reopen makes no automatic source observation. Refresh is a separate explicit action.
	await fs.appendFile(f.source, Buffer.from([0, 0, 0, 0]));
	fireEvent.click(refreshButton());
	await screen.findByText(/Current source confirmed and attached/);
	const secondFile = path.join(root, "second.json");
	electron.save.mockResolvedValueOnce({ canceled: false, filePath: secondFile });
	fireEvent.click(saveButton());
	await screen.findByText(`Editable copy saved: ${secondFile}`);
	const second = await validateLesson(JSON.parse(await fs.readFile(secondFile, "utf8")));
	const a = first.steps[0].mediaSelection,
		b = second.steps[0].mediaSelection;
	if (a?.version !== 2 || b?.version !== 2) throw new Error("Expected confirmed selections");
	expect(b.identity.sources[0].sha256).not.toBe(a.identity.sources[0].sha256);
	expect(b.previousSelections.at(-1)).toMatchObject({ identity: a.identity });
	expect(await fs.readFile(firstFile, "utf8")).toBe(firstBytes);
	expect((await fs.readFile(f.source)).subarray(0, originalSource.length)).toEqual(originalSource);
	expect(JSON.stringify(f.doc)).toBe(original);
	expect(await fs.readFile(f.projectFile, "utf8")).toBe(original);
	expect(f.renderFrames).not.toHaveBeenCalled();
});
it("cancels a pending real service read, ignores its late completion, and permits a fresh confirmation", async () => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	fireEvent.click(confirmButton());
	await waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	expect((saveButton() as HTMLButtonElement).closest("fieldset")?.disabled).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Cancel source confirmation" }));
	await act(async () => {
		release();
	});
	await screen.findByText("Source confirmation cancelled; the lesson range was not changed.");
	expect(f.cancel).toHaveBeenCalledOnce();
	expect(confirmButton()).toBeDefined();
	fireEvent.click(confirmButton());
	await screen.findByText(/Current source confirmed and attached/);
});
it.each([
	"dirty",
	"other-project",
	"document-replaced",
])("ignores source confirmation when renderer target becomes %s", async (change) => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	fireEvent.click(confirmButton());
	await waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	await act(async () => {
		useProjectStore.setState(
			change === "dirty"
				? { dirty: true }
				: change === "other-project"
					? { projectId: "other" }
					: { document: structuredClone(f.doc) },
		);
		release();
	});
	await waitFor(() =>
		expect(screen.queryByRole("button", { name: "Cancel source confirmation" })).toBeNull(),
	);
	expect(confirmButton()).toBeDefined();
	expect(screen.queryByText(/Current source confirmed and attached/)).toBeNull();
});
it("reports source authorization failure without raw paths and permits explicit retry", async () => {
	const f = await fixture();
	f.setAllowed(false);
	fireEvent.click(confirmButton());
	const alert = await screen.findByText(/A source video is missing or has not been approved/);
	expect(alert.textContent).toContain("missing or has not been approved");
	expect(alert.textContent).not.toContain(root);
	expect(confirmButton()).toBeDefined();
	f.setAllowed(true);
	fireEvent.click(confirmButton());
	await screen.findByText(/Current source confirmed and attached/);
});
it("cancels on dialog unmount, so no late pin can attach to a newly opened lesson", async () => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	fireEvent.click(confirmButton());
	await waitFor(() => expect(f.read).toHaveBeenCalledOnce());
	cleanup();
	expect(f.cancel).toHaveBeenCalledOnce();
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	await act(async () => {
		release();
	});
	expect(confirmButton()).toBeDefined();
	expect(screen.queryByText(/Current source confirmed and attached/)).toBeNull();
});
it("requires an included step and a saved project before starting source reads", async () => {
	const f = await fixture();
	fireEvent.click(screen.getByLabelText("Include step 1"));
	expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByLabelText("Include step 1"));
	act(() => useProjectStore.setState({ dirty: true }));
	fireEvent.click(confirmButton());
	await screen.findByText(/Save and reload the current video project/);
	expect(f.read).not.toHaveBeenCalled();
	expect(f.confirm).not.toHaveBeenCalled();
});

it("blocks direct reference-handler calls over a pin and ignores pre-pin stale callbacks without losing history", async () => {
	const f = await fixture(),
		staleAttach = rangeControl.props!.onAttach;
	fireEvent.click(confirmButton());
	await screen.findByText(/Current source confirmed and attached/);
	const attach = screen.getByRole("button", { name: "Attach range from saved project" });
	expect((attach as HTMLButtonElement).disabled).toBe(true);
	await act(async () => rangeControl.props!.onAttach(0, 1));
	await screen.findByText(/The lesson step or its saved range changed/);
	expect(f.plan).not.toHaveBeenCalled();
	await act(async () => staleAttach(0, 1));
	await waitFor(() => expect(f.plan).toHaveBeenCalledOnce());
	await waitFor(() => expect(screen.queryByText("Working…")).toBeNull());
	const file = path.join(root, "still-confirmed.json");
	electron.save.mockResolvedValueOnce({ canceled: false, filePath: file });
	fireEvent.click(saveButton());
	await screen.findByText(`Editable copy saved: ${file}`);
	const lesson = await validateLesson(JSON.parse(await fs.readFile(file, "utf8")));
	expect(lesson.steps[0].mediaSelection).toMatchObject({
		version: 2,
		previousSelections: [{ version: 1 }],
	});
});
