import { expect, it } from "vitest";
import { createLessonUnsavedWorkFlag } from "./unsavedWorkFlag";

it("accepts the flag only from the current, live editor window and only as a strict boolean", () => {
	const editorContents = {},
		otherContents = {};
	let editor: { isDestroyed(): boolean; webContents: unknown } | null = {
		isDestroyed: () => false,
		webContents: editorContents,
	};
	const flag = createLessonUnsavedWorkFlag(() => editor);
	expect(flag.get()).toBe(false);
	// Another window (the HUD, a notes window, a previous editor) cannot make closing ask, or stop it asking.
	flag.set(otherContents, true);
	expect(flag.get()).toBe(false);
	flag.set(editorContents, true);
	expect(flag.get()).toBe(true);
	flag.set(otherContents, false);
	expect(flag.get()).toBe(true);
	// Truthy values that are not `true` clear it instead of setting it.
	flag.set(editorContents, "yes");
	expect(flag.get()).toBe(false);
	flag.set(editorContents, true);
	// A destroyed or absent editor is not a sender to believe.
	editor = { isDestroyed: () => true, webContents: editorContents };
	flag.set(editorContents, false);
	expect(flag.get()).toBe(true);
	editor = null;
	flag.set(editorContents, false);
	expect(flag.get()).toBe(true);
	flag.reset();
	expect(flag.get()).toBe(false);
});
