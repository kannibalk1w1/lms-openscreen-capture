import type { AxcutDocument } from "../ai-edition/schema";
import {
	type LessonImage,
	type LessonManifest,
	type LessonStep,
	lessonManifestSchema,
	MAX_LESSON_BYTES,
} from "./schema";
export function newLesson(title = "Untitled lesson"): LessonManifest {
	return {
		format: "openscreen-lesson",
		version: 1,
		id: crypto.randomUUID(),
		revision: 0,
		title,
		steps: [],
		assets: [],
	};
}
export function newStep(title = "New step"): LessonStep {
	return {
		id: crypto.randomUUID(),
		title,
		instructions: "",
		status: "draft",
		evidence: [],
		imageAlt: "",
	};
}
export function reviseLesson(
	lesson: LessonManifest,
	change: Partial<Pick<LessonManifest, "title" | "steps" | "assets" | "output">>,
): LessonManifest {
	return lessonManifestSchema.parse({ ...lesson, ...change, revision: lesson.revision + 1 });
}
export function moveStep(lesson: LessonManifest, id: string, direction: -1 | 1): LessonManifest {
	const steps = [...lesson.steps],
		index = steps.findIndex((step) => step.id === id),
		next = index + direction;
	if (index < 0 || next < 0 || next >= steps.length) return lesson;
	[steps[index], steps[next]] = [steps[next], steps[index]];
	return reviseLesson(lesson, { steps });
}
/** Metadata-only neutral drafts. No adapter, raw key reconstruction or clock projection. */
export function draftLessonSteps(document: AxcutDocument): LessonStep[] {
	const steps: LessonStep[] = [];
	for (const asset of document.assets) {
		for (const flag of asset.recordingFlags ?? []) {
			steps.push({
				...newStep(flag.label || "Review recording flag"),
				evidence: [
					{
						kind: "recording-flag",
						assetId: asset.id,
						eventId: flag.id,
						sessionId: asset.recordingClock?.sessionId,
						clock: "recording-control-active-ms",
						atMs: flag.timeMs,
						provenance: "observed",
					},
				],
			});
			if (steps.length >= 200) return steps;
		}
	}
	for (const take of document.typingTakes ?? []) {
		for (const section of take.sections) {
			steps.push({
				...newStep(section.label || take.title),
				evidence: [
					{
						kind: "typing-section",
						takeId: take.id,
						eventId: section.id,
						clock: "typing-session-elapsed-ms",
						provenance: "observed",
					},
				],
			});
			if (steps.length >= 200) return steps;
		}
	}
	return steps;
}

export interface IllustrationRequest {
	lessonId: string;
	stepId: string;
	revision: number;
	imageId?: string;
}
/** Apply a validated response to the current lesson, preserving edits made during rendering. */
export function attachLessonIllustration(
	current: LessonManifest,
	request: IllustrationRequest,
	image: LessonImage,
): LessonManifest {
	const step = current.steps.find((step) => step.id === request.stepId);
	if (
		current.id !== request.lessonId ||
		current.revision < request.revision ||
		!step ||
		step.imageId !== request.imageId
	)
		return current;
	if (current.assets.some((asset) => asset.id === image.id))
		throw new Error("Illustration identity already exists");
	const steps = current.steps.map((step) =>
		step.id === request.stepId ? { ...step, imageId: image.id, status: "draft" as const } : step,
	);
	const assets = [
		...current.assets.filter(
			(asset) => asset.id !== request.imageId || steps.some((step) => step.imageId === asset.id),
		),
		image,
	];
	const next = reviseLesson(current, { steps, assets });
	if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_LESSON_BYTES)
		throw new Error("Lesson exceeds limit");
	return next;
}

/** Attach to current authored state; a replaced/removed/changed target refuses the stale plan. */
export function attachLessonMediaSelection(
	current: LessonManifest,
	request: {
		lessonId: string;
		stepId: string;
		revision: number;
		previous?: import("./mediaSelection").LessonMediaSelection;
	},
	selection: import("./mediaSelection").LessonMediaSelection,
): LessonManifest {
	const step = current.steps.find((value) => value.id === request.stepId);
	if (
		current.id !== request.lessonId ||
		current.revision < request.revision ||
		!step ||
		JSON.stringify(step.mediaSelection) !== JSON.stringify(request.previous) ||
		(step.mediaSelection?.version === 2 && selection.version === 1)
	)
		return current;
	const next = reviseLesson(current, {
		steps: current.steps.map((value) =>
			value.id === step.id
				? { ...value, mediaSelection: selection, status: "draft" as const }
				: value,
		),
	});
	if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_LESSON_BYTES)
		throw new Error("Lesson exceeds limit");
	return next;
}
