import { z } from "zod";

export const MAX_LESSON_SOURCE_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_LESSON_SOURCES = 8;
export const MAX_SOURCE_IDENTITY_HISTORY = 8;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const rulerSpan = z
	.object({
		startSec: z.number().finite().nonnegative().max(86400),
		endSec: z.number().finite().positive().max(86400),
	})
	.strict()
	.refine((span) => span.endSec > span.startSec, "Choose a positive range");
export const lessonRangeRequestSchema = rulerSpan.safeExtend({
	projectId: z.string().min(1).max(200),
	documentSha256: digest,
});
export type LessonRangeRequest = z.infer<typeof lessonRangeRequestSchema>;
const geometry = z
	.object({
		provenance: z.literal("authored-selection"),
		basis: z.literal("editor-ruler-seconds"),
		projectId: z.string().min(1).max(200),
		documentSha256: digest,
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
	.strict();
function checkGeometry(selection: z.infer<typeof geometry>, ctx: z.RefinementCtx) {
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
}
const sourcePin = z
	.object({
		role: z.literal("screen"),
		bindings: z.array(digest).min(1).max(32),
		bytes: z.number().int().positive().max(MAX_LESSON_SOURCE_BYTES),
		sha256: digest,
	})
	.strict();
export const lessonSourceIdentitySchema = z
	.object({
		version: z.literal(1),
		observationId: z.string().uuid(),
		basis: z.enum(["explicit-author-current", "explicit-refresh-current"]),
		sources: z.array(sourcePin).min(1).max(MAX_LESSON_SOURCES),
	})
	.strict()
	.superRefine((identity, ctx) => {
		const bindings = identity.sources.flatMap((source) => source.bindings);
		if (
			new Set(bindings).size !== bindings.length ||
			bindings.length > 32 ||
			identity.sources.reduce((sum, source) => sum + source.bytes, 0) > MAX_LESSON_SOURCE_BYTES
		)
			ctx.addIssue({ code: "custom", message: "Invalid source identity coverage or size" });
	});
const legacy = geometry.extend({ version: z.literal(1) });
const content = geometry.extend({ version: z.literal(2), identity: lessonSourceIdentitySchema });
export const lessonMediaSelectionV1Schema = legacy.superRefine(checkGeometry);
// Flat snapshots preserve older geometry/content observations without recursive growth.
export const lessonSelectionSnapshotSchema = z
	.discriminatedUnion("version", [legacy, content])
	.superRefine(checkGeometry);
export const lessonMediaSelectionV2Schema = content
	.extend({
		previousSelections: z.array(lessonSelectionSnapshotSchema).max(MAX_SOURCE_IDENTITY_HISTORY),
	})
	.superRefine(checkGeometry)
	.superRefine((selection, ctx) => {
		const ids = [
			selection.identity.observationId,
			...selection.previousSelections.flatMap((previous) =>
				previous.version === 2 ? [previous.identity.observationId] : [],
			),
		];
		if (new Set(ids).size !== ids.length)
			ctx.addIssue({ code: "custom", message: "Duplicate source observation" });
	});
export const lessonMediaSelectionSchema = z.discriminatedUnion("version", [
	lessonMediaSelectionV1Schema,
	lessonMediaSelectionV2Schema,
]);
export type LessonMediaSelection = z.infer<typeof lessonMediaSelectionSchema>;
export type LessonMediaSelectionV1 = z.infer<typeof lessonMediaSelectionV1Schema>;
export type LessonMediaSelectionV2 = z.infer<typeof lessonMediaSelectionV2Schema>;
export type LessonSourceIdentity = z.infer<typeof lessonSourceIdentitySchema>;
export function mediaSelectionReference(selection: LessonMediaSelection): LessonMediaSelectionV1 {
	if (selection.version === 1) return selection;
	const { identity: _identity, previousSelections: _history, ...reference } = selection;
	return { ...reference, version: 1 };
}
export function mediaSelectionSnapshot(selection: LessonMediaSelection) {
	if (selection.version === 1) return selection;
	const { previousSelections: _history, ...snapshot } = selection;
	return snapshot;
}
