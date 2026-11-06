import { z } from "zod";

const rulerSpan = z
	.object({
		startSec: z.number().finite().nonnegative().max(86400),
		endSec: z.number().finite().positive().max(86400),
	})
	.strict()
	.refine((span) => span.endSec > span.startSec, "Choose a positive range");
export const lessonRangeRequestSchema = rulerSpan.safeExtend({
	projectId: z.string().min(1).max(200),
	documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type LessonRangeRequest = z.infer<typeof lessonRangeRequestSchema>;
export const lessonMediaSelectionSchema = z
	.object({
		version: z.literal(1),
		provenance: z.literal("authored-selection"),
		basis: z.literal("editor-ruler-seconds"),
		projectId: z.string().min(1).max(200),
		documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
		fingerprintKind: z.literal("render-inputs-v1"),
		startSec: z.number().finite().nonnegative().max(86400),
		endSec: z.number().finite().positive().max(86400),
		keptSpans: z.array(rulerSpan).min(1).max(128),
		programme: z
			.object({
				basis: z.literal("editor-programme-seconds"),
				startSec: z.number().finite().nonnegative().max(8640000),
				endSec: z.number().finite().positive().max(8640000),
			})
			.strict(),
	})
	.strict()
	.superRefine((selection, ctx) => {
		if (
			selection.endSec <= selection.startSec ||
			selection.programme.endSec <= selection.programme.startSec ||
			selection.keptSpans[0].startSec !== selection.startSec ||
			selection.keptSpans.at(-1)?.endSec !== selection.endSec ||
			selection.keptSpans.some(
				(span, index) =>
					span.startSec < selection.startSec ||
					span.endSec > selection.endSec ||
					(index > 0 && span.startSec < selection.keptSpans[index - 1].endSec),
			)
		)
			ctx.addIssue({ code: "custom", message: "Invalid bounded selection plan" });
	});
export type LessonMediaSelection = z.infer<typeof lessonMediaSelectionSchema>;
