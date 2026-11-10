import {
	type ApplicationCapture,
	validateApplicationCapture,
} from "../applicationIntegrations/capture";
import { newStep } from "./authoring";
import { type LessonManifest, lessonManifestSchema, MAX_LESSON_BYTES } from "./schema";

/** Explicit author choice; preserved observations are offline data, never executable resources. */
export function appendApplicationDrafts(
	lesson: LessonManifest,
	input: ApplicationCapture,
	selected: string[],
): LessonManifest {
	const journal = validateApplicationCapture(input);
	const ids = new Set(selected);
	const observations = journal.observations.filter((observation) => ids.has(observation.id));
	if (
		!ids.size ||
		ids.size !== selected.length ||
		observations.length !== ids.size ||
		lesson.steps.length + observations.length > 200
	)
		throw new Error("Invalid scene draft selection");
	const additions = observations.map((observation) => ({
		...newStep(observation.label.slice(0, 300)),
		instructions: `Observed in ${journal.scope} at ${observation.atMs} ms on an independent application clock.\n${observation.label}.\nReview the before/after evidence and write the teaching instructions. Sampled observations (fallback polling ${journal.pollIntervalMs} ms); intermediate changes may be missing.${journal.coverage === "limited" ? " Capture ended at a limit." : ""}`,
		evidence: [
			{
				kind: "application-observation" as const,
				eventId: observation.id,
				sessionId: journal.sessionId,
				clock: "unmapped" as const,
				atMs: observation.atMs,
				provenance: "observed" as const,
				application: {
					adapterId: journal.adapterId,
					instanceId: journal.instanceId,
					scope: journal.scope,
					type: observation.type,
					payload: observation.payload,
				},
			},
		],
	}));
	const next = lessonManifestSchema.parse({
		...lesson,
		revision: lesson.revision + 1,
		steps: [...lesson.steps, ...additions],
	});
	if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_LESSON_BYTES)
		throw new Error("Lesson exceeds 16 MiB");
	return next;
}
