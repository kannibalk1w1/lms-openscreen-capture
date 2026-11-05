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

it("imports compact Godot edit/selection records while validating replacement preconditions", () => {
	const header = journal()[0];
	const records = [
		header,
		{
			event: "typing-edit",
			atMs: 10,
			start: 1,
			removed: "😀",
			inserted: "界\n\t",
			selections: [{ anchor: 4, focus: 4 }],
		},
		{ event: "typing-selection", atMs: 20, selections: [{ anchor: 0, focus: 1 }] },
		{ event: "typing-stop", atMs: 30 },
	].map((record, sequence) => ({
		...record,
		schemaVersion: 1,
		sessionId: header.sessionId,
		sequence,
	}));
	const encode = () => records.map((r) => JSON.stringify(r)).join("\n");
	const take = importTypingTake(encode());
	expect(sectionPlayback(take, take.sections[0]).finalText).toBe("a界\n\t");
	expect(take.events[1]).toMatchObject({
		event: "selection",
		selections: [{ anchor: 0, focus: 1 }],
	});
	Object.assign(records[1], { removed: "wrong" });
	expect(() => importTypingTake(encode())).toThrow("precondition");
});

it("retains 4,000 Godot character edits and both key edges within the bounded evidence budget", () => {
	const header = { ...journal()[0], initialText: "" };
	const records: object[] = [header];
	const append = (record: object) =>
		records.push({
			...record,
			schemaVersion: 1,
			sessionId: header.sessionId,
			sequence: records.length,
		});
	for (let i = 0; i < 4000; i++) {
		const key = {
			event: "typing-key",
			atMs: i,
			key: "A",
			code: "65",
			ctrl: false,
			shift: false,
			alt: false,
			meta: false,
			repeat: false,
		};
		append({ ...key, pressed: true });
		append({
			event: "typing-edit",
			atMs: i,
			start: i,
			removed: "",
			inserted: "a",
			selections: [{ anchor: i + 1, focus: i + 1 }],
		});
		append({ ...key, pressed: false });
	}
	append({ event: "typing-stop", atMs: 4000 });
	const source = records.map((r) => JSON.stringify(r)).join("\n");
	expect(new TextEncoder().encode(source).length).toBeLessThan(8 * 1024 * 1024);
	const take = importTypingTake(source);
	expect(take.coverage).toBe("complete");
	expect(take.events.filter((e) => e.event === "key")).toHaveLength(8000);
	expect(take.events.filter((e) => e.event === "text-edit")).toHaveLength(4000);
	expect(sectionPlayback(take, take.sections[0]).finalText).toBe("a".repeat(4000));
});
