import { expect, it } from "vitest";
import { TypingCapture } from "./capture";
import { importTypingFiles, importTypingTake } from "./import";
import {
	createTypingPlayback,
	exportTypingBundle,
	exportTypingPlayback,
	exportTypingSection,
	replayTypingFile,
	serializePortableTypingFile,
	typingBundleSchema,
	typingPlaybackFileSchema,
} from "./portable";
import { MAX_TYPING_EVENTS } from "./schema";

function take(initial: string, values: string[], id = "take") {
	let now = 0;
	const capture = new TypingCapture(initial, () => now, id);
	for (const value of values) {
		now += 100;
		capture.observe(value, [], "insertText");
	}
	return capture.finish();
}

it("bundles independent starting buffers in the requested order and imports every member", () => {
	const first = take("original A", ["edited A"], "a");
	const second = take("original B", ["edited B"], "b");
	const original = JSON.stringify([first, second]);
	const bundle = exportTypingBundle(
		[
			{ take: second, sectionId: second.sections[0].id },
			{ take: first, sectionId: first.sections[0].id },
		],
		"captured-edits",
		"lesson",
	);
	const files = importTypingFiles(serializePortableTypingFile(bundle));
	expect(files.map((file) => file.take.initialText)).toEqual(["original B", "original A"]);
	expect(
		bundle.entries.map((entry) => replayTypingFile(entry, entry.section.take.initialText)),
	).toEqual(["edited B", "edited A"]);
	expect(() => replayTypingFile(bundle.entries[1], "edited B")).toThrow("starting text");
	expect(() => importTypingTake(serializePortableTypingFile(bundle))).toThrow(
		"multiple independent",
	);
	expect(JSON.stringify([first, second])).toBe(original);
});

it("retains corrections in evidence while clean playback reveals only the net Unicode change", () => {
	const captured = take("head\nold😀\ntail", ["head\nwrong\ntail", "head\n日本語😀\ntail"]);
	captured.sections[0].speed = 2;
	const file = exportTypingSection(captured, captured.sections[0].id);
	const recipe = exportTypingPlayback(file, "clean");
	expect(recipe.section.take.events).toEqual(file.take.events);
	expect(recipe.operations.some((op) => op.inserted.includes("wrong"))).toBe(false);
	expect(recipe.operations.map((op) => op.atMs)).toEqual([0, 0, 17, 33]);
	expect(replayTypingFile(recipe, file.take.initialText, 0)).toBe("head\n日😀\ntail");
	expect(replayTypingFile(recipe, file.take.initialText, 17)).toBe("head\n日本😀\ntail");
	expect(replayTypingFile(recipe, file.take.initialText)).toBe(file.finalText);
	expect(importTypingFiles(serializePortableTypingFile(recipe))[0].mode).toBe("clean");
});

it("handles clean deletion, correction back to the baseline and Unicode code-point offsets", () => {
	for (const [initial, values] of [
		["a😀b", ["ab"]],
		["a😀b", ["wrong", "a😀b"]],
		["a😀b", ["a😀日本語b"]],
	] as [string, string[]][]) {
		const captured = take(initial, values);
		const file = exportTypingSection(captured, captured.sections[0].id);
		const recipe = exportTypingPlayback(file, "clean");
		expect(replayTypingFile(recipe, initial)).toBe(file.finalText);
		if (values.at(-1) === initial) expect(recipe.operations).toEqual([]);
	}
});

it("supports forward progress and backwards seek without revalidating/replaying all previous states", () => {
	const captured = take("", ["wrong", "abc"]);
	const file = exportTypingSection(captured, captured.sections[0].id);
	for (const mode of ["captured-edits", "clean"] as const) {
		const recipe = exportTypingPlayback(file, mode);
		const player = createTypingPlayback(recipe, file.take.initialText);
		recipe.operations[0].inserted = "changed after validation";
		expect(player.advanceTo(Infinity)).toEqual({ text: "abc", complete: true });
		expect(player.advanceTo(0).text).toBe(mode === "clean" ? "a" : "wrong");
		expect(player.advanceTo(Infinity).text).toBe("abc");
		expect(() => player.advanceTo(-1)).toThrow("time");
	}
});

it("bounds large clean pastes, preserves every code point and can seek directly to the end", () => {
	const text = "😀日本語".repeat(20000);
	const captured = take("", [text]);
	const file = exportTypingSection(captured, captured.sections[0].id);
	const recipe = exportTypingPlayback(file, "clean");
	expect(recipe.operations.length).toBeLessThanOrEqual(MAX_TYPING_EVENTS);
	expect(recipe.operations.map((op) => op.inserted).join("")).toBe(text);
	expect(replayTypingFile(recipe, "")).toBe(text);
});

it("rejects tampered clean operations before starting playback", () => {
	const captured = take("old", ["wrong", "new"]);
	const recipe = exportTypingPlayback(
		exportTypingSection(captured, captured.sections[0].id),
		"clean",
	);
	recipe.operations[1].atMs = 999;
	expect(typingPlaybackFileSchema.safeParse(recipe).success).toBe(false);
	expect(() => replayTypingFile(recipe, "old")).toThrow();
});

it("rejects empty/duplicate/oversized bundles and validates every member before import", () => {
	const captured = take("old", ["new"]);
	const choice = { take: captured, sectionId: captured.sections[0].id };
	expect(() => exportTypingBundle([])).toThrow();
	expect(() => exportTypingBundle([choice, choice])).toThrow("Duplicate");
	expect(() => exportTypingBundle(Array.from({ length: 21 }, () => choice))).toThrow("1–20");
	const other = take("other", ["changed"], "other");
	const bundle = exportTypingBundle([choice, { take: other, sectionId: other.sections[0].id }]);
	bundle.entries[1].section.finalText = "wrong";
	expect(() => importTypingFiles(JSON.stringify(bundle))).toThrow();
});

it("keeps mixed playback styles and original provenance through bundle re-export", () => {
	const captured = take("baseline", ["corrected"]);
	const bundle = exportTypingBundle(
		[{ take: captured, sectionId: captured.sections[0].id }],
		"clean",
		"source-project",
	);
	const imported = importTypingFiles(serializePortableTypingFile(bundle))[0];
	const next = exportTypingBundle(
		[{ take: imported.take, sectionId: imported.take.sections[0].id }],
		imported.mode,
		"different-project",
	);
	expect(next.entries[0].section.source).toEqual(bundle.entries[0].section.source);
	expect(next.entries[0].mode).toBe("clean");
	const other = take("other", ["text"], "other");
	next.entries.push(exportTypingPlayback(exportTypingSection(other, other.sections[0].id)));
	expect(importTypingFiles(serializePortableTypingFile(next)).map((entry) => entry.mode)).toEqual([
		"clean",
		"captured-edits",
	]);
});

it("enforces the total bundle operation budget independently of per-member limits", () => {
	const value = "a".repeat(30000);
	const a = take("", [value], "a"),
		b = take("", [value], "b");
	const recipeA = exportTypingPlayback(exportTypingSection(a, a.sections[0].id), "clean");
	const recipeB = exportTypingPlayback(exportTypingSection(b, b.sections[0].id), "clean");
	const result = typingBundleSchema.safeParse({
		format: "openscreen-typing-bundle",
		version: 1,
		entries: [recipeA, recipeB],
	});
	expect(result.success).toBe(false);
});
