import type { LessonManifest, LessonStep } from "./schema";
export type LessonFinding = "draft" | "empty-instructions" | "missing-alt" | "empty-title";
export interface LessonQuery {
	title: string;
	status: "all" | "draft" | "reviewed";
	source: "all" | "authored" | "recording-flag" | "typing-section";
	problemsOnly: boolean;
}
export const emptyLessonQuery = (): LessonQuery => ({
	title: "",
	status: "all",
	source: "all",
	problemsOnly: false,
});
export function stepFindings(step: LessonStep): LessonFinding[] {
	const result: LessonFinding[] = [];
	if (step.status === "draft") result.push("draft");
	if (!step.title.trim()) result.push("empty-title");
	if (!step.instructions.trim()) result.push("empty-instructions");
	if (step.imageId && !step.imageAlt.trim()) result.push("missing-alt");
	return result;
}
/** Read-only bounded query over authored lesson data. No application access or collection. */
export function queryLesson(lesson: LessonManifest, query: LessonQuery) {
	const title = query.title.slice(0, 300).normalize("NFKC").toLowerCase();
	return lesson.steps.filter((step) => {
		if (title && !step.title.normalize("NFKC").toLowerCase().includes(title)) return false;
		if (query.status !== "all" && step.status !== query.status) return false;
		if (query.source !== "all") {
			const sourceMatches =
				query.source === "authored"
					? step.evidence.length === 0 ||
						step.evidence.some((evidence) => evidence.kind === "authored")
					: step.evidence.some((evidence) => evidence.kind === query.source);
			if (!sourceMatches) return false;
		}
		if (query.problemsOnly && !stepFindings(step).length) return false;
		return true;
	});
}
export function lessonReview(lesson: LessonManifest) {
	return {
		total: lesson.steps.length,
		reviewed: lesson.steps.filter((step) => step.status === "reviewed").length,
		findings: lesson.steps.flatMap((step) =>
			stepFindings(step).map((kind) => ({ stepId: step.id, kind })),
		),
	};
}
