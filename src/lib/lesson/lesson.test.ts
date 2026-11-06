import { expect, it } from "vitest";
import { createEmptyDocument } from "../ai-edition/schema";
import { TypingCapture } from "../typing/capture";
import { draftLessonSteps, moveStep, newLesson, newStep, reviseLesson } from "./authoring";
import { renderLessonGuide } from "./export";
import { imageFixture } from "./fixtures.test-support";
import { parseLesson, validateLesson } from "./schema";

it("keeps stable identities through reorder/revision and portable roundtrip with optional extensions", async () => {
	const a = newStep("First"),
		b = newStep("Second");
	const lesson = {
		...newLesson("Universal"),
		steps: [a, b],
		extensions: { "org.example": { note: "retained" } },
	};
	const next = moveStep(lesson, b.id, -1);
	expect(next.steps.map((step) => step.id)).toEqual([b.id, a.id]);
	expect(next.revision).toBe(1);
	expect(next.id).toBe(lesson.id);
	expect(await parseLesson(JSON.stringify(next))).toEqual(next);
});
it("works with Godot absent and drafts only neutral labels, preserving independent clock provenance", () => {
	const doc = createEmptyDocument({ projectId: "p", title: "Generic" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Recording",
			originalPath: "/PRIVATE_SOURCE_PATH.mp4",
			cameraTrack: null,
			recordingFlags: [{ id: "flag", timeMs: 12, label: "Explain" }],
		},
	];
	const [step] = draftLessonSteps(doc);
	expect(step.title).toBe("Explain");
	expect(step.evidence[0]).toMatchObject({ clock: "recording-control-active-ms", atMs: 12 });
	expect(JSON.stringify(step)).not.toContain("PRIVATE_SOURCE_PATH");
	expect(step).not.toHaveProperty("source");
});
it.each([
	"version",
	"unknown-field",
	"duplicate",
	"missing-image",
	"oversize",
])("rejects %s manifests", async (kind) => {
	const step = newStep();
	const lesson: unknown = { ...newLesson(), steps: [step] };
	if (kind === "version") Object.assign(lesson as object, { version: 2 });
	if (kind === "unknown-field") Object.assign(lesson as object, { unexpected: true });
	if (kind === "duplicate") Object.assign(lesson as object, { steps: [step, step] });
	if (kind === "missing-image") step.imageId = crypto.randomUUID();
	if (kind === "oversize") step.instructions = "x".repeat(12001);
	await expect(validateLesson(lesson)).rejects.toThrow();
});
it("verifies JPEG dimensions and content hash rather than trusting imported metadata", async () => {
	const image = await imageFixture();
	const lesson = { ...newLesson(), assets: [image] };
	expect((await validateLesson(lesson)).assets).toHaveLength(1);
	await expect(
		validateLesson({ ...lesson, assets: [{ ...image, width: 4096 }] }),
	).rejects.toThrow();
	await expect(
		validateLesson({ ...lesson, assets: [{ ...image, sha256: "0".repeat(64) }] }),
	).rejects.toThrow();
	await expect(
		validateLesson({ ...lesson, assets: [{ ...image, mime: "image/svg+xml" }] }),
	).rejects.toThrow();
});
it("escapes HTML/Markdown payloads and exports only selected step dependencies without hidden extensions", async () => {
	const image = await imageFixture(),
		other = await imageFixture();
	const keep = {
		...newStep('<img src=x onerror="evil()">'),
		instructions: "[click](javascript:evil())\n<script>CANARY</script>",
		imageId: image.id,
		imageAlt: '" onerror="evil()',
		code: { language: "plain", text: "</code><script>evil()</script>" },
	};
	const drop = { ...newStep("PRIVATE_OMITTED_STEP"), imageId: other.id };
	const lesson = {
		...newLesson("Guide <script>"),
		steps: [keep, drop],
		assets: [image, other],
		extensions: { "private.raw": "PRIVATE_EXTENSION" },
	};
	const output = await renderLessonGuide(lesson, [keep.id]);
	expect(output.lesson.steps).toHaveLength(1);
	expect(output.lesson.assets.map((asset) => asset.id)).toEqual([image.id]);
	expect(output.html).not.toContain("<script>");
	expect(output.html).toContain("&lt;script&gt;");
	expect(output.html).toContain("Content-Security-Policy");
	expect(output.markdown).toContain(`assets/${image.id}.jpg`);
	expect(JSON.stringify(output)).not.toContain("PRIVATE_OMITTED_STEP");
	expect(JSON.stringify(output)).not.toContain("PRIVATE_EXTENSION");
	expect(output.html).not.toContain("https://");
});
it("requires a nonempty unique valid export selection", async () => {
	const lesson = reviseLesson(newLesson(), { steps: [newStep()] });
	await expect(renderLessonGuide(lesson, [])).rejects.toThrow();
	await expect(renderLessonGuide(lesson, [crypto.randomUUID()])).rejects.toThrow();
	await expect(
		renderLessonGuide(lesson, [lesson.steps[0].id, lesson.steps[0].id]),
	).rejects.toThrow();
});
it("keeps undescribed illustrations editable but requires alternative text before learner export", async () => {
	const image = await imageFixture(),
		step = { ...newStep(), imageId: image.id };
	const lesson = { ...newLesson(), steps: [step], assets: [image] };
	expect((await validateLesson(lesson)).steps).toHaveLength(1);
	await expect(renderLessonGuide(lesson, [step.id])).rejects.toThrow("Describe");
});
it("gives exported subsets a fresh identity with explicit parent/selection lineage", async () => {
	const a = newStep("A"),
		b = newStep("B"),
		original = { ...newLesson(), revision: 7, steps: [a, b] };
	const output = await renderLessonGuide(original, [b.id]);
	expect(output.lesson.id).not.toBe(original.id);
	expect(output.lesson.revision).toBe(0);
	expect(output.lesson.derivedFrom).toEqual({ id: original.id, revision: 7, stepIds: [b.id] });
	const reopened = await parseLesson(JSON.stringify(output.lesson));
	const edited = reviseLesson(reopened, { title: "Derived edit" });
	const next = await renderLessonGuide(edited, [b.id]);
	expect(next.lesson.derivedFrom).toEqual({ id: edited.id, revision: 1, stepIds: [b.id] });
	expect(original.revision).toBe(7);
});
it("preserves apostrophes, literal setext lines and instruction hard breaks in Markdown", async () => {
	const step = { ...newStep("Don't <panic>"), instructions: "It's literal\n===\n---\nFinal line" };
	const output = await renderLessonGuide({ ...newLesson(), steps: [step] }, [step.id]);
	expect(output.markdown).toContain("Don't &lt;panic&gt;");
	expect(output.markdown).not.toContain("&#39;");
	expect(output.markdown).toContain("It's literal  \n\\=\\=\\=  \n\\-\\-\\-  \nFinal line");
});

it("drafts the maximum valid 220-character typing section identity without truncation", () => {
	const doc = createEmptyDocument({ projectId: "p", title: "Long section identity" }),
		capture = new TypingCapture("x", () => 0, "t");
	capture.observe("xy", [], "insertText");
	const take = capture.finish();
	take.sections[0].id = "s".repeat(220);
	doc.typingTakes = [take];
	const [draft] = draftLessonSteps(doc);
	expect(draft.evidence[0].eventId).toBe(take.sections[0].id);
	expect(() => reviseLesson(newLesson(), { steps: [draft] })).not.toThrow();
});
