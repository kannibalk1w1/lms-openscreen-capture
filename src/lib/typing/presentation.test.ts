import { expect, it } from "vitest";
import { buildSceneDescription } from "../../native/sceneDescription";
import { createEmptyDocument, documentSchema } from "../ai-edition/schema";
import { TypingCapture } from "./capture";
import { codePanelForRegion, highlightGdscript } from "./presentation";
import { codePresentationSchema } from "./presentationSchema";

it("reuses the GDScript grammar without changing source or interpreting markup", () => {
	const source =
		'@export var hp = 10\n# comment\nfunc _ready():\n\tprint("<safe> 😀")\nawait ready';
	const tokens = highlightGdscript(source, "dark");
	expect(tokens.map((t) => t.text).join("")).toBe(source);
	expect(new Set(tokens.map((t) => t.color)).size).toBeGreaterThan(3);
	expect(
		highlightGdscript(source, "light")
			.map((t) => t.text)
			.join(""),
	).toBe(source);
});
function fixture() {
	const doc = createEmptyDocument({ title: "Code", projectId: "p" });
	const c = new TypingCapture("var hp = 10\n", () => 0, "take");
	c.observe('var hp = 20\nprint("😀")', [], "insertText");
	const take = c.finish();
	doc.typingTakes = [take];
	return {
		doc,
		take,
		data: codePresentationSchema.parse({ takeId: take.id, sectionId: take.sections[0].id }),
	};
}
it("compiles independent clean and faithful presentations while preserving original evidence", () => {
	const { doc, data, take } = fixture(),
		original = JSON.stringify(take.events);
	const clean = codePanelForRegion(doc, data, 2, 5)!;
	expect(clean.frames).toHaveLength(1);
	expect(clean.frames[0].tokens.map((t) => t.text).join("")).toContain("hp = 20");
	const faithful = codePanelForRegion(doc, { ...data, mode: "faithful" }, 2, 5)!;
	expect(faithful.frames).toHaveLength(2);
	expect(JSON.stringify(take.events)).toBe(original);
});
it("persists styling and projects code into the native scene with a source clock", () => {
	const { doc, data } = fixture();
	doc.assets = [
		{
			id: "a",
			kind: "video",
			originalPath: "/clip.mp4",
			label: "Clip",
			durationSec: 10,
			cameraTrack: null,
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 2,
			sourceEndSec: 8,
			timelineStartSec: 0,
			timelineEndSec: 6,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	doc.annotations = [
		{
			id: "code",
			type: "image",
			content: "Code",
			clipId: "c",
			sourceStartSec: 3,
			sourceEndSec: 6,
			startMs: 1000,
			endMs: 4000,
			space: "frame",
			position: { x: 20, y: 15 },
			size: { width: 60, height: 70 },
			style: {} as never,
			zIndex: 1,
			codeData: { ...data, blurBackground: false, pauseBackground: false },
		},
	];
	const saved = documentSchema.parse(JSON.parse(JSON.stringify(doc)));
	const native = buildSceneDescription(saved).annotations.find((a) => a.kind === "code")!;
	expect(native).toMatchObject({
		x: 0.2,
		y: 0.15,
		w: 0.6,
		h: 0.7,
		codePanel: { originSec: 3, durationSec: 3, blurBackground: false, pauseBackground: false },
	});
});
