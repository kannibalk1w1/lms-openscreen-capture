import { queryLesson, stepFindings } from "../../src/lib/lesson/review";
import { exportLessonFileSchema, queryLessonFileSchema } from "./fileContracts";
import { readLessonFile } from "./readLessonFile";
import { LessonService } from "./service";

/** Minimal authored metadata, never instructions, code, images, extensions or source paths. */
export async function queryLessonFile(input: unknown) {
	const request = queryLessonFileSchema.parse(input);
	const lesson = await readLessonFile(request.manifestPath);
	const matches = queryLesson(lesson, request.query);
	return {
		format: "openscreen-lesson-query" as const,
		version: 1 as const,
		lessonId: lesson.id,
		revision: lesson.revision,
		title: lesson.title,
		totalSteps: lesson.steps.length,
		matchingSteps: matches.length,
		steps: matches.map((step) => ({
			id: step.id,
			number: lesson.steps.findIndex((value) => value.id === step.id) + 1,
			title: step.title,
			status: step.status,
			sources: [
				...new Set(step.evidence.length ? step.evidence.map((value) => value.kind) : ["authored"]),
			],
			hasMediaSelection: !!step.mediaSelection,
			hasImage: !!step.imageId,
			hasCode: !!step.code,
			findings: stepFindings(step),
		})),
	};
}
/** Reuses the GUI's validated, selected, new-folder-only output pipeline. */
export async function exportLessonFile(input: unknown) {
	const request = exportLessonFileSchema.parse(input);
	const lesson = await readLessonFile(request.manifestPath);
	const unavailable = async (): Promise<never> => {
		throw new Error("Portable lesson output does not access projects or render media");
	};
	const service = new LessonService(unavailable, unavailable);
	return service.exportGuide(lesson, request.stepIds, async () => request.outputDirectory);
}
