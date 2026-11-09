import { afterEach, expect, it, vi } from "vitest";
import { hasLessonUnsavedWork, setLessonUnsavedWork } from "./unsavedWork";

afterEach(() => {
	setLessonUnsavedWork("lesson", false);
	setLessonUnsavedWork("package", false);
	vi.unstubAllGlobals();
});
it("reports unsaved work while either the lesson or a package draft is unsaved, and tells main only on change", () => {
	const send = vi.fn();
	vi.stubGlobal("window", { electronAPI: { setLessonUnsavedWork: send } });
	expect(hasLessonUnsavedWork()).toBe(false);
	setLessonUnsavedWork("lesson", true);
	setLessonUnsavedWork("lesson", true);
	setLessonUnsavedWork("package", true);
	setLessonUnsavedWork("lesson", false);
	expect(hasLessonUnsavedWork()).toBe(true);
	setLessonUnsavedWork("package", false);
	expect(hasLessonUnsavedWork()).toBe(false);
	expect(send.mock.calls.map(([value]) => value)).toEqual([true, true, true, false]);
});
