import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { z } from "zod";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import { LessonDraftStore } from "../lesson/draftStore";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { grantLessonFile, type LessonFileGrant, replaceLessonFile } from "../lesson/lessonFile";
import { LessonService } from "../lesson/service";
import { renderOwnerJobs } from "./exportJobs";
import { NativeRenderBusyError, NativeRenderInvalidatedError } from "./nativeRenderJobs";
export function registerLessonHandlers(
	service: LessonService,
	authorizeFrame: (event: IpcMainInvokeEvent) => { projectId: string; assertCurrent: () => void },
	isEditorFrame: (event: IpcMainInvokeEvent) => boolean,
) {
	if (typeof authorizeFrame !== "function" || typeof isEditorFrame !== "function")
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
	// Lesson-guide routes serve the editor's own main frame only: recovery copies, opened lessons and
	// native file dialogs are never handed to another window or an embedded frame.
	const editorOnly =
		<T>(run: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>) =>
		(event: IpcMainInvokeEvent, ...args: unknown[]) => {
			if (!event?.sender || event.senderFrame !== event.sender.mainFrame || !isEditorFrame(event))
				return { success: false as const, code: "lesson-operation-failed" as const };
			return run(event, ...args);
		};
	// Native dialogs attach to the asking editor window, so they cannot open behind it.
	const saveDialog = (event: IpcMainInvokeEvent, options: Electron.SaveDialogOptions) => {
		const parent = BrowserWindow.fromWebContents(event.sender);
		return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
	};
	const openDialog = (event: IpcMainInvokeEvent, options: Electron.OpenDialogOptions) => {
		const parent = BrowserWindow.fromWebContents(event.sender);
		return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
	};
	const drafts = new LessonDraftStore(path.join(app.getPath("userData"), "lesson-recovery-copies"));
	ipcMain.handle(
		"lesson:draft-status",
		editorOnly(() => bounded(() => drafts.status())),
	);
	ipcMain.handle(
		"lesson:draft-save",
		editorOnly((_event, input) => bounded(() => drafts.save(input))),
	);
	ipcMain.handle(
		"lesson:draft-list",
		editorOnly(() => bounded(() => drafts.list())),
	);
	ipcMain.handle(
		"lesson:draft-read",
		editorOnly((_event, id) => bounded(() => drafts.read(id))),
	);
	ipcMain.handle(
		"lesson:draft-remove",
		editorOnly((_event, id) => bounded(() => drafts.remove(id))),
	);

	ipcMain.handle(
		"lesson:plan-range",
		editorOnly((_event, input) => bounded(() => service.planRange(input))),
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
	// One update permission per window, for the file its user last explicitly opened or saved.
	type Owner = NonNullable<IpcMainInvokeEvent["sender"]>;
	interface FileState {
		grant?: LessonFileGrant;
		saving: boolean;
		/** Bumped by every navigation, crash or close: anything begun before it is stale. */
		epoch: number;
		/** Bumped by every explicit open or new-copy save: an older one can no longer grant. */
		operation: number;
	}
	const files = new WeakMap<Owner, FileState>();
	// Created, with its lifetime listeners, before any picker or read is awaited, so a navigation,
	// crash or close while one is pending is always seen.
	const fileState = (event: IpcMainInvokeEvent | undefined) => {
		const owner = event?.sender;
		if (!owner || event.senderFrame !== owner.mainFrame) return null;
		let state = files.get(owner);
		if (!state) {
			const created: FileState = { saving: false, epoch: 0, operation: 0 };
			state = created;
			files.set(owner, created);
			for (const name of ["destroyed", "render-process-gone", "did-start-navigation"] as const)
				(owner as unknown as { on(name: string, listener: () => void): void }).on(name, () => {
					created.grant = undefined;
					created.epoch++;
				});
		}
		return state;
	};
	/** The asking window is still the same registered editor page, in its main frame. */
	const samePage = (event: IpcMainInvokeEvent, state: FileState, epoch: number) =>
		state.epoch === epoch &&
		!event.sender.isDestroyed() &&
		event.senderFrame === event.sender.mainFrame &&
		isEditorFrame(event);
	/** Starts an explicit open or new-copy save; true only while it is the window's latest one. */
	const beginFileOperation = (event: IpcMainInvokeEvent) => {
		const state = fileState(event);
		if (!state) throw new LessonOperationError("lesson-operation-failed");
		const epoch = state.epoch,
			operation = ++state.operation;
		const current = () => state.operation === operation && samePage(event, state, epoch);
		const assertCurrent = () => {
			if (!current()) throw new LessonOperationError("lesson-operation-failed");
		};
		return { state, assertCurrent };
	};
	/** Grants the file only to a still-current operation, and only for exactly the lesson it holds. */
	const remember = async (
		operation: ReturnType<typeof beginFileOperation>,
		target: string,
		lesson: unknown,
	) => {
		operation.assertCurrent();
		operation.state.grant = undefined;
		const granted = await grantLessonFile(target);
		operation.assertCurrent();
		// Only when the file on disk is exactly the lesson this window now holds.
		if (!granted || JSON.stringify(granted.lesson) !== JSON.stringify(lesson)) return undefined;
		operation.state.grant = granted.grant;
		return { token: granted.grant.token, path: target };
	};
	ipcMain.handle(
		"lesson:save",
		editorOnly((event, input) =>
			bounded(async () => {
				const operation = beginFileOperation(event);
				const saved = await service.saveEditable(input, async () => {
					// Validation may have taken a while: never show a picker for a page that has gone
					// or a request that a newer one superseded.
					operation.assertCurrent();
					const result = await saveDialog(event, {
						title: "Save a new editable lesson",
						defaultPath: path.join(app.getPath("documents"), "lesson.openscreen-lesson.json"),
						filters: [{ name: "OpenScreen lesson", extensions: ["json"] }],
					});
					// Nothing is written for a page that has gone or been superseded meanwhile.
					operation.assertCurrent();
					return result.canceled ? null : (result.filePath ?? null);
				});
				if (saved.status !== "saved") return saved;
				// The new copy exists either way; a page that changed since only gets no update permission.
				const file = await remember(operation, saved.path, saved.lesson).catch(() => undefined);
				return { status: saved.status, path: saved.path, ...(file ? { file } : {}) };
			}),
		),
	);
	ipcMain.handle("lesson:save-current", (event, input: unknown) =>
		bounded(async () => {
			const state = fileState(event),
				request = z.object({ token: z.string().uuid(), lesson: z.unknown() }).strict().parse(input),
				grant = state?.grant;
			if (
				!state ||
				!grant ||
				grant.token !== request.token ||
				state.saving ||
				!samePage(event, state, state.epoch)
			)
				throw new LessonOperationError("lesson-file-unavailable");
			const epoch = state.epoch;
			// Current only while this window keeps the same page and this exact permission.
			const current = () => state.grant === grant && samePage(event, state, epoch);
			state.saving = true;
			try {
				const replaced = await replaceLessonFile(grant, request.lesson, current);
				if (!replaced.currentAtCommit) {
					// Committed just before the context ended: the bytes are saved, but no permission
					// survives into the new context.
					if (state.grant === grant) state.grant = undefined;
					return { status: "saved" as const, path: grant.target };
				}
				state.grant = replaced.grant;
				return {
					status: "saved" as const,
					path: replaced.grant.target,
					file: { token: replaced.grant.token, path: replaced.grant.target },
				};
			} catch (error) {
				// A changed or missing file can never be updated through this permission again.
				if (state.grant === grant) state.grant = undefined;
				throw error;
			} finally {
				state.saving = false;
			}
		}),
	);
	ipcMain.handle(
		"lesson:open",
		editorOnly((event) =>
			bounded(async () => {
				const operation = beginFileOperation(event);
				const opened = await service.openEditable(async () => {
					const result = await openDialog(event, {
						title: "Open editable lesson",
						properties: ["openFile"],
						filters: [{ name: "OpenScreen lesson", extensions: ["json"] }],
					});
					// The file is not read for a page that has gone or been superseded meanwhile.
					operation.assertCurrent();
					return result.canceled ? null : (result.filePaths[0] ?? null);
				});
				if (opened.status !== "opened") return opened;
				const file = await remember(operation, opened.path, opened.lesson);
				return { status: opened.status, lesson: opened.lesson, ...(file ? { file } : {}) };
			}),
		),
	);
	ipcMain.handle(
		"lesson:export",
		editorOnly((event, input, ids) =>
			bounded(() =>
				service.exportGuide(input, ids, async () => {
					const result = await openDialog(event, {
						title: "Choose parent folder for a new offline guide",
						properties: ["openDirectory", "createDirectory"],
					});
					return result.canceled ? null : (result.filePaths[0] ?? null);
				}),
			),
		),
	);
}

/** Production editor wiring: callers cannot omit or substitute an optional frame hook.
 * The dirty-state provider is the same process callback used by the main handlers. */
export function registerEditorLessonHandlers(service: LessonService, isEditorDirty: () => boolean) {
	if (typeof isEditorDirty !== "function")
		throw new Error("Editor dirty-state provider is required.");
	registerLessonHandlers(
		service,
		(event) => editorRangeSessions.capture(event.sender, isEditorDirty),
		(event) => editorRangeSessions.isEditorPage(event.sender),
	);
}
