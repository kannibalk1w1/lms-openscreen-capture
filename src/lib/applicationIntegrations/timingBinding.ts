import { z } from "zod";
import { recordingClockSchema } from "../recordingFlags";
import {
	applicationAssociationSchema,
	applicationAssociationSpanSchema,
	resolveApplicationObservations,
} from "./association";
import { validateApplicationCapture } from "./capture";

const ms = z.number().int().nonnegative().max(86400000);
/** Authored timing annotation only. It never authorizes media access or changes the source clock. */
export const applicationTimingBindingSchema = z
	.object({
		version: z.literal(1),
		method: z.literal("manual-two-point"),
		sourceAssetId: z.string().min(1).max(200),
		source: applicationAssociationSchema.shape.source,
		applicationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		recordingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		recordingSessionId: z.string().uuid(),
		recordingClock: z.literal("recording-control-active-ms"),
		applicationTimeMs: ms,
		mediaTimeMs: ms,
		span: applicationAssociationSpanSchema,
	})
	.strict()
	.superRefine((binding, ctx) => {
		const span = binding.span;
		if (
			binding.applicationTimeMs < span.applicationStartMs ||
			binding.applicationTimeMs >= span.applicationEndMs ||
			binding.mediaTimeMs < span.recordingStartMs ||
			binding.mediaTimeMs >= span.recordingEndMs
		)
			ctx.addIssue({ code: "custom", message: "Timing annotation exceeds its manual span" });
		const ratio =
			(binding.applicationTimeMs - span.applicationStartMs) /
			(span.applicationEndMs - span.applicationStartMs);
		const expected = Math.min(
			span.recordingEndMs - 1,
			Math.floor(span.recordingStartMs + ratio * (span.recordingEndMs - span.recordingStartMs)),
		);
		if (binding.mediaTimeMs !== expected)
			ctx.addIssue({
				code: "custom",
				message: "Timing annotation does not match manual calibration",
			});
	});
export class ApplicationTimingSourceChangedError extends Error {}

export type ApplicationTimingBinding = z.infer<typeof applicationTimingBindingSchema>;

/** Snapshot before awaiting; retain only selected, successfully mapped timing annotations. */
export async function createApplicationTimingBindings(
	captureInput: unknown,
	recordingClockInput: unknown,
	planInput: unknown,
	sourceAssetIdInput: string,
	observationIdsInput: readonly string[],
): Promise<Map<string, ApplicationTimingBinding>> {
	const capture = validateApplicationCapture(captureInput);
	const clock = recordingClockSchema.parse(recordingClockInput);
	const plan = applicationAssociationSchema.parse(planInput);
	const sourceAssetId = z.string().min(1).max(200).parse(sourceAssetIdInput);
	const ids = z.array(z.string().min(1).max(200)).max(200).parse(observationIdsInput);
	const results = await resolveApplicationObservations(capture, clock, plan, ids);
	const observations = new Map(
		capture.observations.map((observation) => [observation.id, observation]),
	);
	const bindings = new Map<string, ApplicationTimingBinding>();
	for (let index = 0; index < ids.length; index++) {
		const result = results[index],
			observation = observations.get(ids[index]);
		if (result.status === "unmapped") {
			if (result.reason !== "unmapped-gap" && result.reason !== "end-of-capture")
				throw new ApplicationTimingSourceChangedError(
					"Timing source or observation changed; recalibrate before saving",
				);
			continue;
		}
		if (!observation) throw new Error("Missing application observation");
		const span = plan.spans.find(
			(candidate) =>
				observation.atMs >= candidate.applicationStartMs &&
				observation.atMs < candidate.applicationEndMs,
		);
		if (!span) throw new Error("Missing manual timing span");
		bindings.set(
			observation.id,
			applicationTimingBindingSchema.parse({
				version: 1,
				method: result.method,
				sourceAssetId,
				source: plan.source,
				applicationFingerprint: plan.applicationFingerprint,
				recordingFingerprint: plan.recordingFingerprint,
				recordingSessionId: result.recordingSessionId,
				recordingClock: plan.recordingClock,
				applicationTimeMs: observation.atMs,
				mediaTimeMs: result.mediaTimeMs,
				span,
			}),
		);
	}
	return bindings;
}
