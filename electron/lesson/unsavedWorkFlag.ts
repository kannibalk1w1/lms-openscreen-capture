/**
 * Main's copy of "the Lesson guide holds unsaved work", used only to ask before the editor window
 * closes. Only the current editor window's own renderer may set it, and only to a strict boolean.
 * Deliberately separate from project dirtiness, which lesson media authority reads.
 */
export function createLessonUnsavedWorkFlag(
	currentEditor: () => { isDestroyed(): boolean; webContents: unknown } | null,
) {
	let unsaved = false;
	return {
		get: () => unsaved,
		reset() {
			unsaved = false;
		},
		set(sender: unknown, value: unknown) {
			const editor = currentEditor();
			if (editor && !editor.isDestroyed() && sender === editor.webContents)
				unsaved = value === true;
		},
	};
}
