// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonRangeExportProgress } from "@/lib/lesson/rangeExport";
import { registerLessonWorkflow } from "../../../../electron/ipc/lessonWorkflow";
import { editorRangeSessions } from "../../../../electron/lesson/editorRangeSession";
import { rangeExportFixture } from "../../../../electron/lesson/rangeExport.test-support";
import { LessonGuideDialog } from "./LessonGuideDialog";

const electron = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	pick: vi.fn(),
	save: vi.fn(),
	getPath: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	ipcMain: { handle: electron.handle, on: electron.on },
	dialog: { showOpenDialog: electron.pick, showSaveDialog: electron.save },
	BrowserWindow: { fromWebContents: () => null },
}));
vi.mock("../../../../electron/lesson/encodedVideo", () => ({
	validateRangeVideo: vi.fn(async (file: string) => {
		const b = await fs.readFile(file);
		return { bytes: b.length, sha256: createHash("sha256").update(b).digest("hex") };
	}),
}));
const controls = vi.hoisted(() => ({ onExport: null as null | (() => void) }));
vi.mock("./LessonRangeControls", async () => {
	const actual =
		await vi.importActual<typeof import("./LessonRangeControls")>("./LessonRangeControls");
	return {
		LessonRangeControls: (props: Parameters<typeof actual.LessonRangeControls>[0]) => {
			controls.onExport = props.onExport;
			return <actual.LessonRangeControls {...props} />;
		},
	};
});
let root: string;
beforeEach(async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	electron.handle.mockClear();
	electron.on.mockClear();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-export-ui-"));
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
async function fixture(legacy = false) {
	const f = await rangeExportFixture(root);
	if (legacy) f.lesson.steps[0].mediaSelection = f.reference;
	useProjectStore.setState({ projectId: "p", document: f.doc, dirty: false });
	registerLessonWorkflow({
		documents: f.documents,
		compositor: f.compositor,
		editorHasUnsavedChanges: () => useProjectStore.getState().dirty,
		readableApprovedPath: (s) => (s === f.source ? s : null),
	});
	let listener: ((p: LessonRangeExportProgress) => void) | undefined;
	const sender = Object.assign(new EventEmitter(), {
		getURL: () => "file:///editor",
		mainFrame: {},
		isDestroyed: () => false,
		send: (_c: string, p: LessonRangeExportProgress) => listener?.(p),
	});
	editorRangeSessions.register(sender, sender.getURL());
	editorRangeSessions.select(sender, "p");
	const event = { sender, senderFrame: sender.mainFrame };
	const invoke = async (c: string, ...args: unknown[]) =>
		electron.handle.mock.calls.find(([n]) => n === c)![1](event, ...args);
	const exportStep = vi.fn((input: unknown) => invoke("lesson:range-export", input)),
		cancel = vi.fn((id: string) => invoke("lesson:range-export-cancel", id));
	vi.stubGlobal("electronAPI", {
		lessonOpen: () => invoke("lesson:open"),
		lessonRangeExport: exportStep,
		lessonRangeExportCancel: cancel,
		onLessonRangeExportProgress: (cb: typeof listener) => {
			listener = cb;
			return () => {
				listener = undefined;
			};
		},
	});
	const lessonFile = path.join(root, "lesson.json");
	await fs.writeFile(lessonFile, JSON.stringify(f.lesson));
	electron.pick.mockResolvedValueOnce({ canceled: false, filePaths: [lessonFile] });
	const view = show();
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByDisplayValue("Selected step");
	electron.pick.mockResolvedValue({ canceled: false, filePaths: [root] });
	return {
		...f,
		exportStep,
		cancel,
		sender,
		view,
		progress: (p: LessonRangeExportProgress) => listener?.(p),
	};
}
const exportButton = () => screen.getByRole("button", { name: "Export this step’s MP4" });
it("uses the real UI/registered workflow to export a confirmed included step and repeat after reopen", async () => {
	const f = await fixture();
	fireEvent.click(exportButton());
	await screen.findByText(/MP4 video checked and saved in:/);
	expect(f.native).toHaveBeenCalledOnce();
	expect(f.exportStep.mock.calls[0][0]).toMatchObject({
		stepId: f.step.id,
		includedStepIds: [f.step.id],
	});
	fireEvent.click(exportButton());
	await waitFor(() => expect(f.native).toHaveBeenCalledTimes(2));
	await waitFor(() => expect((exportButton() as HTMLButtonElement).disabled).toBe(false));
});
it("keeps unattested and excluded steps unavailable even through a direct stale handler call", async () => {
	const f = await fixture(true);
	expect((exportButton() as HTMLButtonElement).disabled).toBe(true);
	act(() => controls.onExport?.());
	await waitFor(() => expect(screen.getAllByRole("alert").some((el) => el.textContent)).toBe(true));
	expect(f.exportStep).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
it("cancels the picker without media/output changes", async () => {
	const f = await fixture(),
		before = await fs.readdir(root);
	electron.pick.mockResolvedValueOnce({ canceled: true, filePaths: [] });
	fireEvent.click(exportButton());
	await screen.findByText(/MP4 export cancelled/);
	expect(f.native).not.toHaveBeenCalled();
	expect(await fs.readdir(root)).toEqual(before);
});
it("shows real phases/counts, rejects invalid/foreign progress, and waits for cancelled native work", async () => {
	const f = await fixture();
	let finish!: () => void;
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "partial");
		return new Promise((resolve) => {
			finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
		});
	});
	fireEvent.click(exportButton());
	await waitFor(() => expect(typeof finish).toBe("function"));
	const input = f.exportStep.mock.calls[0][0] as { operationId: string };
	act(() =>
		f.progress({ operationId: input.operationId, phase: "rendering", frames: 12, totalFrames: 45 }),
	);
	expect(screen.getByText(/12 of 45/)).toBeTruthy();
	act(() =>
		f.progress({
			operationId: input.operationId,
			phase: "rendering",
			frames: 999,
			totalFrames: 45,
		}),
	);
	expect(screen.queryByText(/999/)).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Cancel MP4 export" }));
	await screen.findByText(/Waiting for current work to finish/);
	expect(f.cancel).toHaveBeenCalledOnce();
	await act(async () => {
		finish();
	});
	await waitFor(() => expect(screen.getAllByRole("alert").some((el) => el.textContent)).toBe(true));
	expect(screen.queryByText(/MP4 video checked and saved in:/)).toBeNull();
});
it.each([
	"dirty",
	"project",
	"unmount",
])("invalidates %s while native work is pending and ignores late success", async (change) => {
	const f = await fixture();
	let finish!: () => void;
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "partial");
		return new Promise((resolve) => {
			finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
		});
	});
	fireEvent.click(exportButton());
	await waitFor(() => expect(typeof finish).toBe("function"));
	act(() => {
		if (change === "unmount") f.view.unmount();
		else useProjectStore.setState(change === "dirty" ? { dirty: true } : { projectId: "other" });
	});
	await waitFor(() => expect(f.cancel).toHaveBeenCalledOnce());
	await act(async () => {
		finish();
	});
	expect(screen.queryByText(/MP4 video checked and saved in:/)).toBeNull();
});
it("shows fixed source-change guidance without implicit refresh", async () => {
	const f = await fixture();
	await fs.writeFile(f.source, "changed");
	fireEvent.click(exportButton());
	await waitFor(() => expect(screen.getAllByRole("alert").some((el) => el.textContent)).toBe(true));
	expect(f.native).not.toHaveBeenCalled();
	expect(screen.queryByText(/MP4 video checked and saved in:/)).toBeNull();
});
it("ignores a late transport success after the current project snapshot changes even if cancellation is ignored", async () => {
	const f = await fixture();
	let finish!: () => void;
	f.exportStep.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = () =>
					resolve({
						success: true,
						result: {
							status: "materialized",
							path: "STALE_OUTPUT_CANARY",
							frames: 45,
							nativeReportedDurationSec: 1.5,
						},
					});
			}),
	);
	fireEvent.click(exportButton());
	await waitFor(() => expect(f.exportStep).toHaveBeenCalledOnce());
	act(() => useProjectStore.setState({ dirty: true }));
	await waitFor(() => expect(f.cancel).toHaveBeenCalledOnce());
	await act(async () => {
		finish();
	});
	expect(screen.queryByText(/STALE_OUTPUT_CANARY/)).toBeNull();
});
it("a previously captured export callback cannot export a step after exclusion", async () => {
	const f = await fixture(),
		stale = controls.onExport!;
	fireEvent.click(screen.getByRole("button", { name: "Clear export selection" }));
	expect((exportButton() as HTMLButtonElement).disabled).toBe(true);
	act(() => stale());
	await waitFor(() =>
		expect((screen.getByLabelText("Lesson title") as HTMLInputElement).disabled).toBe(false),
	);
	expect(f.exportStep).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
