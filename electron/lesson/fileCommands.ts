import fs from "node:fs/promises";
import { newLesson, newStep, reviseLesson } from "../../src/lib/lesson/authoring";
import { queryLesson, stepFindings } from "../../src/lib/lesson/review";
import { type LessonManifest, MAX_LESSON_BYTES, validateLesson } from "../../src/lib/lesson/schema";
import {
	addLessonStepsFileSchema,
	createLessonFileSchema,
	exportLessonFileSchema,
	queryLessonFileSchema,
	removeLessonStepFileSchema,
	updateLessonStepFileSchema,
} from "./fileContracts";
import { readLessonFile } from "./readLessonFile";
import { LessonService } from "./service";

/** Minimal authored metadata and LMS destination labels, never instructions, code, images, extensions or source paths. */
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
		...(lesson.lessonRef ? { lessonRef: lesson.lessonRef } : {}),
		totalSteps: lesson.steps.length,
		matchingSteps: matches.length,
		steps: matches.map((step) => ({
			id: step.id,
			number: lesson.steps.findIndex((value) => value.id === step.id) + 1,
			title: step.title,
			status: step.status,
			...(step.slideRef ? { slideRef: step.slideRef } : {}),
			sources: [
				...new Set(step.evidence.length ? step.evidence.map((value) => value.kind) : ["authored"]),
			],
			hasMediaSelection: !!step.mediaSelection,
			sourceIdentityStatus: step.mediaSelection
				? step.mediaSelection.version === 2
					? "content-pinned"
					: "legacy-unattested"
				: null,
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
/** New files only: an existing lesson, project or export is never replaced. */
async function writeNewLesson(target: string, lesson: LessonManifest) {
	const bytes = Buffer.from(JSON.stringify(lesson, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES) throw new Error("Lesson exceeds limit");
	await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
}
/** Headless start of the same editable lesson the editor authors; no project or media access. */
export async function createLessonFile(input: unknown) {
	const request = createLessonFileSchema.parse(input);
	const lesson = await validateLesson({
		...newLesson(request.title),
		...(request.lessonRef ? { lessonRef: request.lessonRef } : {}),
	});
	await writeNewLesson(request.outputPath, lesson);
	return {
		status: "created" as const,
		path: request.outputPath,
		lessonId: lesson.id,
		revision: lesson.revision,
	};
}
/** Appends authored draft steps and saves a new editable copy; every added step needs human review. */
export async function addLessonStepsFile(input: unknown) {
	const request = addLessonStepsFileSchema.parse(input);
	const lesson = await readLessonFile(request.manifestPath);
	const added = request.steps.map((step) => ({
		...newStep(step.title),
		instructions: step.instructions ?? "",
		...(step.slideRef ? { slideRef: step.slideRef } : {}),
		...(step.code ? { code: step.code } : {}),
	}));
	const next = await validateLesson(reviseLesson(lesson, { steps: [...lesson.steps, ...added] }));
	await writeNewLesson(request.outputPath, next);
	return {
		status: "saved" as const,
		path: request.outputPath,
		lessonId: next.id,
		revision: next.revision,
		totalSteps: next.steps.length,
		addedSteps: added.map((step) => ({
			id: step.id,
			number: next.steps.findIndex((value) => value.id === step.id) + 1,
			title: step.title,
		})),
	};
}
/** Same rule as the editor: changed teaching text returns the step to draft; a destination label does not. */
export async function updateLessonStepFile(input: unknown) {
	const request = updateLessonStepFileSchema.parse(input);
	const lesson = await readLessonFile(request.manifestPath);
	const { title, instructions, slideRef, code } = request.changes;
	if (!lesson.steps.some((step) => step.id === request.stepId)) throw new Error("Unknown step");
	const steps = lesson.steps.map((step) => {
		if (step.id !== request.stepId) return step;
		const content = title !== undefined || instructions !== undefined || code !== undefined;
		return {
			...step,
			...(title !== undefined ? { title } : {}),
			...(instructions !== undefined ? { instructions } : {}),
			...(slideRef !== undefined ? { slideRef: slideRef ?? undefined } : {}),
			...(code !== undefined ? { code: code ?? undefined } : {}),
			status: content ? ("draft" as const) : step.status,
		};
	});
	const next = await validateLesson(reviseLesson(lesson, { steps }));
	await writeNewLesson(request.outputPath, next);
	const step = next.steps.find((value) => value.id === request.stepId)!;
	return {
		status: "saved" as const,
		path: request.outputPath,
		lessonId: next.id,
		revision: next.revision,
		step: { id: step.id, title: step.title, status: step.status },
	};
}
/** Removes one step and any illustration no remaining step uses, as the editor does. */
export async function removeLessonStepFile(input: unknown) {
	const request = removeLessonStepFileSchema.parse(input);
	const lesson = await readLessonFile(request.manifestPath);
	if (!lesson.steps.some((step) => step.id === request.stepId)) throw new Error("Unknown step");
	const steps = lesson.steps.filter((step) => step.id !== request.stepId);
	const next = await validateLesson(
		reviseLesson(lesson, {
			steps,
			assets: lesson.assets.filter((asset) => steps.some((step) => step.imageId === asset.id)),
		}),
	);
	await writeNewLesson(request.outputPath, next);
	return {
		status: "saved" as const,
		path: request.outputPath,
		lessonId: next.id,
		revision: next.revision,
		totalSteps: next.steps.length,
	};
}
