import { expect, it } from "vitest";
import { createEmptyDocument } from "../ai-edition/schema";
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
