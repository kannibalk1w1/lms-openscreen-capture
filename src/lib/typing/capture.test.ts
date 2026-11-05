import { describe, expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "../ai-edition/schema";
import { applyTextEdit, sectionPlayback, TypingCapture, textChange } from "./capture";
import { typingTakeSchema } from "./schema";

function fixture() {
	let now = 0;
	const capture = new TypingCapture("var hp = 10\n", () => now, "take");
	const change = (value: string, inputType = "insertText") => {
		now += 100;
		capture.observe(
			value,
			[{ anchor: Array.from(value).length, focus: Array.from(value).length }],
			inputType,
		);
	};
	return {
		capture,
		change,
		advance: (ms: number) => {
			now += ms;
		},
	};
}
function finalText(take: ReturnType<TypingCapture["finish"]>) {
	return take.events.reduce(
		(text, event) => (event.event === "text-edit" ? applyTextEdit(text, event) : text),
		take.initialText,
	);
}
describe("actual text capture", () => {
	it("roundtrips paste, replacement, undo/redo, tabs, emoji and Unicode through project save/reopen", () => {
		const { capture, change, advance } = fixture();
		const pasted = 'var hp = 10\n\tprint("😀")\n';
		change(pasted, "insertFromPaste");
		change(pasted.replace("hp", "health"), "insertReplacementText");
		change(pasted, "historyUndo");
		change(pasted.replace("hp", "health"), "historyRedo");
		capture.boundary("composition-start");
		change('var health = 10\n\tprint("日本語😀")\n', "insertCompositionText");
		capture.boundary("composition-end");
		capture.pause();
		advance(5000);
		capture.observe("must not appear", [], "insertText");
		capture.select([{ anchor: 0, focus: 0 }]);
		capture.resume();
		change('var health = 20\n\tprint("日本語😀")\n');
		advance(2000);
		change('var health = 20\n\tprint("日本語😀")\n# end');
		const take = capture.finish("Lesson", "script.gd");
		expect(finalText(take)).toBe('var health = 20\n\tprint("日本語😀")\n# end');
		expect(take.sections).toHaveLength(3);
		expect(take.durationMs).toBe(2700);
		const doc = createEmptyDocument({ title: "Typing", projectId: "p" });
		doc.typingTakes = [take];
		expect(documentSchema.parse(JSON.parse(JSON.stringify(doc))).typingTakes).toEqual([take]);
		expect(take.events.filter((e) => e.event === "text-edit").map((e) => e.inputType)).toContain(
			"historyUndo",
		);
	});
	it("replays each section from its actual starting buffer and edits pacing without mutating evidence", () => {
		const { capture, change, advance } = fixture();
		change("abc");
		advance(2000);
		change("abcd");
		change("abcde");
		const take = capture.finish();
		const evidence = JSON.stringify(take.events);
		const replay = sectionPlayback(take, { ...take.sections[1], speed: 2, label: "Teach slowly" });
		expect(replay.beforeText).toBe("abc");
		expect(replay.frames.map((f) => f.atMs)).toEqual([0, 50]);
		expect(replay.finalText).toBe("abcde");
		expect(JSON.stringify(take.events)).toBe(evidence);
	});
	it("uses code-point offsets and reconstructs arbitrary contiguous observed changes", () => {
		const samples = ["", "a😀b", "日本語\n\t", "e\u0301", "👩‍💻abc"];
		for (const before of samples)
			for (const after of samples) {
				const patch = textChange(before, after);
				expect(
					applyTextEdit(before, {
						event: "text-edit",
						id: "e",
						sequence: 0,
						atMs: 0,
						inputType: "observed-text-change",
						selections: [],
						...patch,
					}),
				).toBe(after);
			}
		expect(textChange("a😀b", "a界b")).toEqual({ start: 1, removed: "😀", inserted: "界" });
	});
	it("rejects mismatched edits, invalid selections, duplicate IDs, missing stop and overlapping sections", () => {
		const { capture, change } = fixture();
		change("abc");
		const take = capture.finish();
		const edit = take.events.find((e) => e.event === "text-edit")!;
		for (const modified of [
			{ ...take, events: take.events.map((e) => (e === edit ? { ...e, removed: "wrong" } : e)) },
			{
				...take,
				events: take.events.map((e) =>
					e === edit ? { ...e, selections: [{ anchor: 999, focus: 999 }] } : e,
				),
			},
			{ ...take, events: take.events.map((e) => ({ ...e, id: "same" })) },
			{ ...take, events: take.events.slice(0, -1) },
			{ ...take, sections: [...take.sections, ...take.sections] },
		])
			expect(typingTakeSchema.safeParse(modified).success).toBe(false);
	});
});
it("ends with valid limited evidence when text or elapsed-time limits are reached", () => {
	let now = 0;
	const capture = new TypingCapture("", () => now, "limit");
	expect(() => capture.observe("x".repeat(200001), [], "insertText")).toThrow();
	now = 86400001;
	expect(() => capture.observe("x", [], "insertText")).toThrow();
	const take = capture.finish("Limited", "Pad", "limited");
	expect(take.coverage).toBe("limited");
	expect(take.durationMs).toBe(86400000);
	expect(take.events).toHaveLength(1);
});
it("reserves a stop event when the event limit is reached", () => {
	const capture = new TypingCapture("", () => 0, "event-limit");
	const key = {
		key: "a",
		code: "KeyA",
		pressed: true,
		ctrl: false,
		alt: false,
		meta: false,
		shift: false,
		repeat: true,
	};
	for (let i = 0; i < 9999; i++) capture.key(key);
	expect(() => capture.key(key)).toThrow();
	expect(capture.finish("Limit", "Pad", "limited").events).toHaveLength(10000);
});
