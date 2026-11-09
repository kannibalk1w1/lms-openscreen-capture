/** Unsaved lesson-guide work in this window, kept apart from video-project dirtiness. */
const parts = { lesson: false, package: false };
export const hasLessonUnsavedWork = () => parts.lesson || parts.package;
export function setLessonUnsavedWork(part: keyof typeof parts, unsaved: boolean) {
	if (parts[part] === unsaved) return;
	parts[part] = unsaved;
	// Main only learns a boolean, so that closing the window can ask first.
	window.electronAPI?.setLessonUnsavedWork?.(hasLessonUnsavedWork());
}
