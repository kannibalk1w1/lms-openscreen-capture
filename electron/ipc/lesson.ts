import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { app, dialog, ipcMain } from "electron";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import { LessonDraftStore } from "../lesson/draftStore";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { LessonService } from "../lesson/service";
import { renderOwnerJobs } from "./exportJobs";
import { NativeRenderBusyError, NativeRenderInvalidatedError } from "./nativeRenderJobs";
export function registerLessonHandlers(
	service: LessonService,
	authorizeFrame: (event: IpcMainInvokeEvent) => { projectId: string; assertCurrent: () => void },
) {
	if (typeof authorizeFrame !== "function")
		throw new Error("Lesson frame authorization is required.");
	const bounded = async <T>(run: () => Promise<T>) => {
		try {
			return { success: true as const, result: await run() };
		} catch (error) {
			const code: LessonErrorCode =
				error instanceof NativeRenderInvalidatedError
					? "project-changed"
					: error instanceof NativeRenderBusyError
						? "render-busy"
						: error instanceof LessonOperationError
							? error.code
							: error instanceof Error && "code" in error && error.code === "EEXIST"
								? "destination-exists"
								: "lesson-operation-failed";
			return { success: false as const, code };
		}
	};
	const drafts = new LessonDraftStore(path.join(app.getPath("userData"), "lesson-recovery-copies"));
	ipcMain.handle("lesson:draft-status", () => bounded(() => drafts.status()));
	ipcMain.handle("lesson:draft-save", (_event, input: unknown) =>
		bounded(() => drafts.save(input)),
	);
	ipcMain.handle("lesson:draft-list", () => bounded(() => drafts.list()));
	ipcMain.handle("lesson:draft-read", (_event, id: unknown) => bounded(() => drafts.read(id)));
	ipcMain.handle("lesson:draft-remove", (_event, id: unknown) => bounded(() => drafts.remove(id)));

	ipcMain.handle("lesson:plan-range", (_event, input: unknown) =>
		bounded(() => service.planRange(input)),
	);
	ipcMain.handle("lesson:frame", (event, input: unknown) =>
		bounded(async () => {
			if (!event?.sender || event.senderFrame !== event.sender.mainFrame)
				throw new LessonOperationError("project-changed");
			const authority = authorizeFrame(event);
			if (
				!input ||
				typeof input !== "object" ||
				!("projectId" in input) ||
				input.projectId !== authority.projectId
			)
				throw new LessonOperationError("project-changed");
			return renderOwnerJobs.run(
				event.sender,
				randomUUID(),
				() => ({
					result: service.captureFrame(input).then((image) => {
						authority.assertCurrent();
						return image;
					}),
					cancel: () => false,
				}),
				() => undefined,
				"lesson-frame",
			);
		}),
	);
	ipcMain.handle("lesson:save", (_event, input: unknown) =>
		bounded(() =>
			service.saveEditable(input, async () => {
				const result = await dialog.showSaveDialog({
					title: "Save a new editable lesson",
					defaultPath: path.join(app.getPath("documents"), "lesson.openscreen-lesson.json"),
					filters: [{ name: "OpenScreen lesson", extensions: ["json"] }],
				});
				return result.canceled ? null : (result.filePath ?? null);
			}),
		),
	);
	ipcMain.handle("lesson:open", () =>
		bounded(() =>
			service.openEditable(async () => {
				const result = await dialog.showOpenDialog({
					title: "Open editable lesson",
					properties: ["openFile"],
					filters: [{ name: "OpenScreen lesson", extensions: ["json"] }],
				});
				return result.canceled ? null : (result.filePaths[0] ?? null);
			}),
		),
	);
	ipcMain.handle("lesson:export", (_event, input: unknown, ids: unknown) =>
		bounded(() =>
			service.exportGuide(input, ids, async () => {
				const result = await dialog.showOpenDialog({
					title: "Choose parent folder for a new offline guide",
					properties: ["openDirectory", "createDirectory"],
				});
				return result.canceled ? null : (result.filePaths[0] ?? null);
			}),
		),
	);
}

/** Production editor wiring: callers cannot omit or substitute an optional frame hook.
 * The dirty-state provider is the same process callback used by the main handlers. */
export function registerEditorLessonHandlers(service: LessonService, isEditorDirty: () => boolean) {
	if (typeof isEditorDirty !== "function")
		throw new Error("Editor dirty-state provider is required.");
	registerLessonHandlers(service, (event) =>
		editorRangeSessions.capture(event.sender, isEditorDirty),
	);
}
