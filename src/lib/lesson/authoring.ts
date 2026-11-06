import type { AxcutDocument } from "../ai-edition/schema";
import { type LessonManifest, type LessonStep, lessonManifestSchema } from "./schema";
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
	change: Partial<Pick<LessonManifest, "title" | "steps" | "assets">>,
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
