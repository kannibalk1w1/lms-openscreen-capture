import { expect, it } from "vitest";
import { newLesson, newStep, reviseLesson } from "./authoring";
import { renderLessonGuide } from "./export";
import { imageFixture } from "./fixtures.test-support";
import { defaultLessonOutput, guideAppearance, lessonOutput, lessonOutputSchema } from "./output";
import { emptyLessonQuery, lessonReview, queryLesson, stepFindings } from "./review";
import { parseLesson, validateLesson } from "./schema";

it("keeps old manifests unchanged while resolving explicit standard output defaults", async () => {
	const source = newLesson();
	expect(await parseLesson(JSON.stringify(source))).toEqual(source);
	expect(source.output).toBeUndefined();
	expect(lessonOutput(source)).toEqual(defaultLessonOutput());
});
it.each([
	"standard",
	"large-print",
	"high-contrast",
] as const)("persists a versioned %s reading preset without any application capability", async (preset) => {
	const source = reviseLesson(newLesson(), {
		output: { ...defaultLessonOutput(), preset, language: "ar", direction: "rtl" },
	});
	expect((await parseLesson(JSON.stringify(source))).output).toEqual(source.output);
	expect(guideAppearance(lessonOutput(source)).fontSize).toBe(
		preset === "large-print" ? 24 : preset === "high-contrast" ? 20 : 18,
	);
});
it.each([
	{ version: 2 },
	{ language: 'en" onload="x' },
	{ language: "bad_tag" },
	{ preset: "url(https://example.com)" },
	{ direction: "unknown" },
	{ extra: true },
])("rejects unsupported or executable profile input %j", async (extra) => {
	await expect(
		validateLesson({ ...newLesson(), output: { ...defaultLessonOutput(), ...extra } }),
	).rejects.toThrow();
});
it("canonicalizes the language tag without translating authored text", () => {
	expect(lessonOutputSchema.parse({ ...defaultLessonOutput(), language: "EN-us" }).language).toBe(
		"en-US",
	);
});
it("omits code, image pixels/descriptions/dependencies from derived output while preserving the source", async () => {
	const image = await imageFixture(),
		step = {
			...newStep("Keep"),
			instructions: "Read this",
			imageId: image.id,
			imageAlt: "PRIVATE_ALT_CANARY",
			code: { language: "plain", text: "PRIVATE_CODE_CANARY" },
		};
	const source = {
		...newLesson(),
		steps: [step],
		assets: [image],
		output: { ...defaultLessonOutput(), includeImages: false, includeCode: false },
	};
	const output = await renderLessonGuide(source, [step.id]);
	expect(output.lesson.assets).toEqual([]);
	expect(output.lesson.steps[0].imageId).toBeUndefined();
	expect(output.lesson.steps[0].code).toBeUndefined();
	expect(JSON.stringify(output)).not.toContain("PRIVATE_ALT_CANARY");
	expect(JSON.stringify(output)).not.toContain("PRIVATE_CODE_CANARY");
	expect(JSON.stringify(output)).not.toContain(image.base64);
	expect(source.steps[0].imageId).toBe(image.id);
	expect(source.steps[0].code.text).toBe("PRIVATE_CODE_CANARY");
	expect((await parseLesson(JSON.stringify(output.lesson))).output).toEqual(source.output);
});
it("marks language/direction and keeps the visible caption out of the accessibility tree", async () => {
	const image = await imageFixture(),
		step = { ...newStep("درس"), instructions: "مثال", imageId: image.id, imageAlt: "وصف الصورة" };
	const output = await renderLessonGuide(
		{
			...newLesson("درس"),
			steps: [step],
			assets: [image],
			output: { ...defaultLessonOutput(), preset: "large-print", language: "ar", direction: "rtl" },
		},
		[step.id],
	);
	expect(output.html).toContain('<html lang="ar" dir="rtl">');
	expect(output.html).toContain("font:24px/1.8");
	expect(output.html).toContain('<figcaption aria-hidden="true">');
	expect(output.html).toContain('class="status" lang="en" dir="ltr"');
	expect(output.html).not.toContain("<script");
});
it("labels derived and parent revisions distinctly in Markdown (review12 N12-1)", async () => {
	const step = newStep(),
		output = await renderLessonGuide({ ...newLesson(), revision: 7, steps: [step] }, [step.id]);
	expect(output.markdown).toContain("Derived lesson revision 0; source revision 7.");
});
it("prevents leading indentation from becoming a Markdown code block while preserving literal text", async () => {
	const step = { ...newStep(), instructions: "Don't panic\n\n    literal line\n\tliteral tab" };
	const output = await renderLessonGuide({ ...newLesson(), steps: [step] }, [step.id]);
	expect(output.markdown).toContain("&#32;&#32;&#32;&#32;literal line");
	expect(output.markdown).toContain("&#9;literal tab");
	expect(output.markdown).not.toMatch(/^ {4}\S/m);
	expect(output.markdown).toContain("Don't panic");
});
it("queries existing titles/status/source kinds without altering evidence or revision", () => {
	const authored = {
			...newStep("EXPLAIN"),
			instructions: "Clear instructions",
			status: "reviewed" as const,
		},
		flag = {
			...newStep("Review flag"),
			evidence: [
				{
					kind: "recording-flag" as const,
					clock: "recording-control-active-ms" as const,
					provenance: "observed" as const,
					eventId: "flag",
				},
			],
		};
	const source = { ...newLesson(), steps: [authored, flag] },
		before = JSON.stringify(source);
	expect(
		queryLesson(source, { ...emptyLessonQuery(), title: "explain" }).map((step) => step.id),
	).toEqual([authored.id]);
	expect(
		queryLesson(source, { ...emptyLessonQuery(), status: "draft", source: "recording-flag" }),
	).toEqual([flag]);
	expect(queryLesson(source, { ...emptyLessonQuery(), source: "authored" })).toEqual([authored]);
	expect(queryLesson(source, { ...emptyLessonQuery(), problemsOnly: true })).toEqual([flag]);
	expect(lessonReview(source).reviewed).toBe(1);
	expect(stepFindings(flag)).toEqual(["draft", "empty-instructions"]);
	expect(JSON.stringify(source)).toBe(before);
});
it("documents NFKC plus lowercase matching without claiming full Unicode case folding", () => {
	const german = newStep("Straße"),
		turkish = newStep("İstanbul"),
		source = { ...newLesson(), steps: [german, turkish] };
	expect(queryLesson(source, { ...emptyLessonQuery(), title: "STRASSE" })).toEqual([]);
	expect(queryLesson(source, { ...emptyLessonQuery(), title: "istanbul" })).toEqual([]);
	expect(queryLesson(source, { ...emptyLessonQuery(), title: "STRAßE" })).toEqual([german]);
});
