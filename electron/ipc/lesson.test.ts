import { expect, it, vi } from "vitest";
import { LessonService } from "../lesson/service";
import { registerLessonHandlers } from "./lesson";

const electron = vi.hoisted(() => ({ handle: vi.fn(), open: vi.fn(), save: vi.fn() }));
vi.mock("electron", () => ({
	app: { getPath: () => "/disposable" },
	dialog: { showOpenDialog: electron.open, showSaveDialog: electron.save },
	ipcMain: { handle: electron.handle },
}));
it("actual lesson IPC returns fixed errors without exposing source exception contents", async () => {
	const read = vi.fn(async () => {
		throw new Error("PRIVATE_LESSON_SOURCE_CANARY");
	});
	registerLessonHandlers(new LessonService(read, async () => null));
	const frame = electron.handle.mock.calls.find(([name]) => name === "lesson:frame")![1];
	const result = await frame(null, { projectId: "p", rulerSec: 1, documentSha256: "a".repeat(64) });
	expect(result).toEqual({ success: false, code: "lesson-operation-failed" });
	expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
