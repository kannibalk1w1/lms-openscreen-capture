import type { LessonManifest } from "./schema";

export const LESSON_MAPPING_FILE = "lesson-mapping.json";
/** True when the author recorded any LMS destination for this lesson or its steps. */
export const hasLmsReferences = (lesson: LessonManifest) =>
	!!lesson.lessonRef || lesson.steps.some((step) => !!step.slideRef);
/** Authored step-to-slide mapping for the files of one exported guide or package. No inference. */
export function lessonMapping(
	lesson: LessonManifest,
	videos: Array<{ stepId: string; path: string; frames: number; durationSec: number }> = [],
) {
	return {
		format: "openscreen-lesson-mapping" as const,
		version: 1 as const,
		lessonId: lesson.id,
		lessonTitle: lesson.title,
		...(lesson.lessonRef ? { lessonRef: lesson.lessonRef } : {}),
		...(lesson.derivedFrom
			? { sourceLesson: { id: lesson.derivedFrom.id, revision: lesson.derivedFrom.revision } }
			: {}),
		guide: "index.html",
		meaning:
			"author-entered references; not checked against any LMS; unmapped steps have no slideRef" as const,
		steps: lesson.steps.map((step, index) => {
			const image = lesson.assets.find((asset) => asset.id === step.imageId),
				video = videos.find((item) => item.stepId === step.id);
			return {
				number: index + 1,
				stepId: step.id,
				title: step.title,
				status: step.status,
				...(step.slideRef ? { slideRef: step.slideRef } : {}),
				guideAnchor: `index.html#step-${step.id}`,
				...(image ? { image: { path: `assets/${image.id}.jpg`, alt: step.imageAlt } } : {}),
				...(video
					? { video: { path: video.path, frames: video.frames, durationSec: video.durationSec } }
					: {}),
				hasCode: !!step.code,
			};
		}),
	};
}
export const lessonMappingBytes = (...args: Parameters<typeof lessonMapping>) =>
	new TextEncoder().encode(JSON.stringify(lessonMapping(...args), null, 2) + "\n");
