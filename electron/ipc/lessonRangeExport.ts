import { BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { lessonRangeExportRequestSchema } from "../../src/lib/lesson/rangeExport";
import type { RangeAuthoringAuthority } from "../lesson/rangeAuthoring";
import { LessonRangeExportError, type LessonRangeExportService } from "../lesson/rangeExport";
import { renderOwnerJobs } from "./exportJobs";
import { NativeRenderBusyError, NativeRenderInvalidatedError } from "./nativeRenderJobs";

export function registerLessonRangeExportHandlers(
	service: LessonRangeExportService,
	authorize: (event: IpcMainInvokeEvent) => RangeAuthoringAuthority,
) {
	ipcMain.handle("lesson:range-export", async (event, input: unknown) => {
		try {
			if (event.senderFrame !== event.sender.mainFrame)
				throw new LessonOperationError("project-changed");
			const authority = authorize(event),
				request = lessonRangeExportRequestSchema.parse(input);
			const result = await renderOwnerJobs.run(
				event.sender,
				request.operationId,
				() =>
					service.start(
						input,
						authority,
						async () => {
							const options = {
								title: "Choose a folder for this step's new MP4 export",
								properties: ["openDirectory", "createDirectory"] as Array<
									"openDirectory" | "createDirectory"
								>,
							};
							const parent = BrowserWindow.fromWebContents(event.sender);
							const choice = parent
								? await dialog.showOpenDialog(parent, options)
								: await dialog.showOpenDialog(options);
							return choice.canceled ? null : (choice.filePaths[0] ?? null);
						},
						(progress) => {
							try {
								authority.assertCurrent();
								if (!event.sender.isDestroyed())
									event.sender.send("lesson:range-export-progress", progress);
							} catch {
								renderOwnerJobs.invalidate(event.sender);
							}
						},
					),
				() => undefined,
				"lesson-range",
			);
			return { success: true as const, result };
		} catch (error) {
			if (error instanceof LessonRangeExportError)
				return {
					success: false as const,
					code: error.code,
					...(error.artifactPath ? { artifactPath: error.artifactPath } : {}),
				};
			return {
				success: false as const,
				code:
					error instanceof NativeRenderBusyError
						? "render-busy"
						: error instanceof NativeRenderInvalidatedError
							? "range-export-cancelled"
							: error instanceof LessonOperationError
								? error.code
								: "lesson-operation-failed",
			};
		}
	});
	ipcMain.handle("lesson:range-export-cancel", (event, input: unknown) => {
		try {
			if (event.senderFrame !== event.sender.mainFrame)
				throw new LessonOperationError("project-changed");
			const id = lessonRangeExportRequestSchema.shape.operationId.parse(input);
			return {
				success: true as const,
				result: renderOwnerJobs.cancel(event.sender, id, "lesson-range"),
			};
		} catch {
			return { success: false as const, code: "lesson-operation-failed" };
		}
	});
}
