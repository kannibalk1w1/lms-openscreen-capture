import {
	projectRawTimelineSecToPlayback,
	readSpeedRegions,
} from "../../src/lib/ai-edition/document/timeline";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { keptRawSpans } from "../../src/lib/ai-edition/timeline/programme-time";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import {
	lessonMediaSelectionV1Schema,
	lessonRangeRequestSchema,
} from "../../src/lib/lesson/mediaSelection";

/** Metadata only: no media file read, encoding, clock inference or recording control. */
export async function planLessonRange(doc: AxcutDocument, input: unknown) {
	const request = lessonRangeRequestSchema.parse(input);
	if (
		doc.project.id !== request.projectId ||
		(await lessonRenderFingerprint(doc)) !== request.documentSha256
	)
		throw new LessonOperationError("project-changed");
	// An unprobed earlier clip can shift the programme clock too. Refuse rather than guess.
	if (
		!doc.timeline.clips.length ||
		doc.timeline.clips.some(
			(clip) => clip.sourceEndSec == null || clip.sourceEndSec <= clip.sourceStartSec,
		)
	)
		throw new LessonOperationError("range-unavailable");
	const kept = keptRawSpans(doc.timeline.clips, doc.timeline.trimRanges);
	if (kept.some((span, index) => index > 0 && span.startSec < kept[index - 1].endSec))
		throw new LessonOperationError("range-unavailable");
	if (
		!kept.some((span) => request.startSec >= span.startSec && request.startSec < span.endSec) ||
		!kept.some((span) => request.endSec > span.startSec && request.endSec <= span.endSec)
	)
		throw new LessonOperationError("range-unavailable");
	const spans = kept
		.map((span) => ({
			startSec: Math.max(span.startSec, request.startSec),
			endSec: Math.min(span.endSec, request.endSec),
		}))
		.filter((span) => span.endSec > span.startSec);
	if (!spans.length || spans.length > 128) throw new LessonOperationError("range-unavailable");
	const speed = readSpeedRegions(doc);
	return lessonMediaSelectionV1Schema.parse({
		...request,
		version: 1,
		provenance: "authored-selection",
		basis: "editor-ruler-seconds",
		fingerprintKind: "render-inputs-v1",
		keptSpans: spans,
		programme: {
			basis: "editor-programme-seconds",
			startSec: projectRawTimelineSecToPlayback(
				doc.timeline.clips,
				doc.timeline.trimRanges,
				request.startSec,
				speed,
			),
			endSec: projectRawTimelineSecToPlayback(
				doc.timeline.clips,
				doc.timeline.trimRanges,
				request.endSec,
				speed,
			),
		},
	});
}
