import { expect, it } from "vitest";
import { newLesson, newStep, reviseLesson } from "./authoring";
import { projectLesson, renderLessonGuide } from "./export";
import { imageFixture } from "./fixtures.test-support";
import { hasLmsReferences, lessonMapping } from "./mapping";
import { validateLesson } from "./schema";

it("lists each step with only its authored slide reference and the files that exist for it", async () => {
	const image = await imageFixture(),
		mapped = {
			...newStep("Add the enemy"),
			slideRef: "RPG-L1 slide 12",
			imageId: image.id,
			imageAlt: "Scene dock",
			status: "reviewed" as const,
		},
		unmapped = { ...newStep("Run it"), code: { language: "gdscript", text: "pass" } },
		lesson = await validateLesson({
			...newLesson("Enemy"),
			lessonRef: "RPG Course 1 / Lesson 1",
			steps: [mapped, unmapped],
			assets: [image],
		});
	expect(hasLmsReferences(lesson)).toBe(true);
	expect(hasLmsReferences(await validateLesson(newLesson()))).toBe(false);
	const mapping = lessonMapping(lesson, [
		{ stepId: unmapped.id, path: `media/${unmapped.id}.mp4`, frames: 45, durationSec: 1.5 },
	]);
	expect(mapping).toMatchObject({
		format: "openscreen-lesson-mapping",
		version: 1,
		lessonId: lesson.id,
		lessonRef: "RPG Course 1 / Lesson 1",
		guide: "index.html",
	});
	expect(mapping.steps).toEqual([
		{
			number: 1,
			stepId: mapped.id,
			title: "Add the enemy",
			status: "reviewed",
			slideRef: "RPG-L1 slide 12",
			guideAnchor: `index.html#step-${mapped.id}`,
			image: { path: `assets/${image.id}.jpg`, alt: "Scene dock" },
			hasCode: false,
		},
		{
			number: 2,
			stepId: unmapped.id,
			title: "Run it",
			status: "draft",
			guideAnchor: `index.html#step-${unmapped.id}`,
			video: { path: `media/${unmapped.id}.mp4`, frames: 45, durationSec: 1.5 },
			hasCode: true,
		},
	]);
});
it("keeps references through revision and projection, renumbers by export order and escapes them in guides", async () => {
	const first = { ...newStep("One"), slideRef: "S1" },
		second = { ...newStep("Two"), slideRef: '<b>"S2"</b> & *more*' },
		lesson = reviseLesson(
			{ ...newLesson("L"), steps: [first, second] },
			{ lessonRef: "<i>Course</i>" },
		);
	const projected = await projectLesson(lesson, [second.id]);
	expect(projected.lessonRef).toBe("<i>Course</i>");
	expect(lessonMapping(projected).steps).toMatchObject([
		{ number: 1, stepId: second.id, slideRef: '<b>"S2"</b> & *more*' },
	]);
	expect(lessonMapping(projected).sourceLesson).toEqual({ id: lesson.id, revision: 1 });
	const guide = await renderLessonGuide(lesson, [second.id]);
	expect(guide.html).toContain("LMS slide: </span>&lt;b&gt;&quot;S2&quot;&lt;/b&gt; &amp; *more*");
	expect(guide.html).toContain("LMS lesson: </span>&lt;i&gt;Course&lt;/i&gt;");
	expect(guide.html).not.toContain("<b>");
	expect(guide.markdown).toContain("LMS slide: &lt;b&gt;");
	expect(guide.markdown).not.toContain("S1");
	const none = { ...newLesson("L"), steps: [newStep("One")] };
	const unreferenced = await renderLessonGuide(none, [none.steps[0].id]);
	expect(unreferenced.html + unreferenced.markdown).not.toMatch(/LMS (slide|lesson)/);
});
it.each([
	"",
	"two\nlines",
	"tab\there",
	"x".repeat(201),
	"nul\u0000",
])("refuses the unusable reference %j at lesson and step level", async (reference) => {
	await expect(validateLesson({ ...newLesson(), lessonRef: reference })).rejects.toThrow();
	await expect(
		validateLesson({ ...newLesson(), steps: [{ ...newStep(), slideRef: reference }] }),
	).rejects.toThrow();
});
