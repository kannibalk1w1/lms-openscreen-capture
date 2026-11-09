import { reviseLesson } from "./authoring";
import { type LessonManifest, validateLesson } from "./schema";
/** Existing lesson model, all steps demoted: unchanged media does not attest edited teaching text. */
export function beginPackageEdit(lesson: LessonManifest) {
	return reviseLesson(lesson, {
		steps: lesson.steps.map((s) => ({ ...s, status: "draft" as const })),
	});
}
/** Allow text/alt/existing code text and order only. IDs, complete membership, assets and policy stay exact. */
export async function validatePackageEdit(original: LessonManifest, input: unknown) {
	const draft = await validateLesson(input);
	if (draft.steps.length !== original.steps.length || draft.revision < original.revision)
		throw new Error("package-edit-unsupported");
	const expected = await validateLesson({
		...original,
		title: draft.title,
		revision: draft.revision,
		steps: draft.steps.map((step) => {
			const previous = original.steps.find((s) => s.id === step.id);
			if (!previous) throw new Error("package-edit-unsupported");
			return {
				...previous,
				title: step.title,
				instructions: step.instructions,
				imageAlt: step.imageAlt,
				code: previous.code ? { ...previous.code, text: step.code?.text } : undefined,
				status: "draft",
			};
		}),
	});
	if (JSON.stringify(expected) !== JSON.stringify(draft))
		throw new Error("package-edit-unsupported");
	return draft;
}
