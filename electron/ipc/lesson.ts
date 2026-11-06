import path from "node:path";
import { app, dialog, ipcMain } from "electron";
import { LessonService } from "../lesson/service";
export function registerLessonHandlers(service: LessonService) {
	const bounded = async <T>(run: () => Promise<T>) => {
		try {
			return { success: true as const, result: await run() };
		} catch {
			return { success: false as const, code: "lesson-operation-failed" as const };
		}
	};
	ipcMain.handle("lesson:frame", (_event, input: unknown) =>
		bounded(() => service.captureFrame(input)),
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
