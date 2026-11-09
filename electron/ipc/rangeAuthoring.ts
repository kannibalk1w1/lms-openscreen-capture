import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import type { RangeAuthoringAuthority, RangeAuthoringService } from "../lesson/rangeAuthoring";
import { RangeMediaError } from "../lesson/rangeErrors";

export function registerRangeAuthoringHandlers(
	service: RangeAuthoringService,
	authorize: (event: IpcMainInvokeEvent) => RangeAuthoringAuthority,
) {
	const bounded = async <T>(run: () => Promise<T> | T) => {
		try {
			return { success: true as const, result: await run() };
		} catch (error) {
			let code: LessonErrorCode = "lesson-operation-failed";
			if (error instanceof LessonOperationError) code = error.code;
			else if (error instanceof RangeMediaError) {
				code =
					error.code === "range-media-cancelled"
						? "range-source-cancelled"
						: error.code === "range-media-changed"
							? "range-source-changed"
							: "range-source-unsupported";
			}
			return { success: false as const, code };
		}
	};
	const watched = new WeakSet<object>();
	ipcMain.handle("lesson:confirm-range", (event, input: unknown) =>
		bounded(() => {
			if (event.senderFrame !== event.sender.mainFrame)
				throw new LessonOperationError("project-changed");
			const authority = authorize(event);
			if (!watched.has(event.sender)) {
				watched.add(event.sender);
				const cancel = () => service.cancelOwner(event.sender);
				event.sender.on("destroyed", cancel);
				event.sender.on("render-process-gone", cancel);
				event.sender.on("did-start-navigation", cancel);
			}
			return service.confirm(input, authority);
		}),
	);
	ipcMain.handle("lesson:cancel-range", (event, id: unknown) =>
		bounded(() => {
			if (event.senderFrame !== event.sender.mainFrame)
				throw new LessonOperationError("project-changed");
			// Cancellation grants no reads and remains available after project navigation.
			return service.cancel(event.sender, id);
		}),
	);
}
