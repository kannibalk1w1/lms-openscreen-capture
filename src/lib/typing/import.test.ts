import { expect, it } from "vitest";
import { sectionPlayback, TypingCapture } from "./capture";
import { importTypingTake } from "./import";

function journal() {
	const sessionId = "godot-test";
	return [
		{
			event: "typing-start",
			producer: "godot-codeedit",
			initialText: "a😀",
			documentName: "res://lesson.gd",
			startedAt: "2026-11-05T12:00:00Z",
			offsetEncoding: "unicode-code-points",
			atMs: 0,
		},
		{ event: "typing-snapshot", text: "a😀", selections: [{ anchor: 2, focus: 2 }], atMs: 0 },
		{
			event: "typing-key",
			key: "V",
			code: "86",
			pressed: true,
			ctrl: true,
			shift: false,
			alt: false,
			meta: false,
			repeat: false,
			atMs: 10,
		},
		{
			event: "typing-snapshot",
			text: 'a😀\n\tprint("日本語")',
			selections: [{ anchor: 18, focus: 18 }],
			atMs: 10,
		},
		{ event: "typing-stop", coverage: "complete", atMs: 20 },
	].map((line, sequence) => ({ ...line, schemaVersion: 1, sessionId, sequence }));
}
it("imports actual Godot snapshots as text edits, preserving keys separately", () => {
	const lines = journal();
	const snapshot = lines[3] as { text?: string; selections?: { anchor: number; focus: number }[] };
	const size = Array.from(snapshot.text!).length;
	snapshot.selections = [{ anchor: size, focus: size }];
	const take = importTypingTake(lines.map((line) => JSON.stringify(line)).join("\n"));
	expect(take.producer).toBe("godot-codeedit");
	expect(take.events.find((e) => e.event === "key")).toMatchObject({ key: "V", ctrl: true });
	expect(take.events.find((e) => e.event === "text-edit")).toMatchObject({
		start: 2,
		inserted: '\n\tprint("日本語")',
		inputType: "observed-text-change",
	});
	expect(sectionPlayback(take, take.sections[0]).finalText).toBe(snapshot.text);
});
it("rejects truncated, mixed-session, skipped-sequence and post-stop journals", () => {
	for (const lines of [
		journal().slice(0, -1),
		journal().map((line, i) => (i === 2 ? { ...line, sessionId: "other" } : line)),
		journal().filter((_, i) => i !== 2),
		[...journal(), journal()[1]],
	]) {
		expect(() => importTypingTake(lines.map((line) => JSON.stringify(line)).join("\n"))).toThrow();
	}
});
it("roundtrips portable take JSON without assuming ScriptWriter compatibility", () => {
	const capture = new TypingCapture("", () => 0, "portable");
	capture.observe("text", [], "insertText");
	const take = capture.finish();
	expect(importTypingTake(JSON.stringify(take))).toEqual(take);
});
