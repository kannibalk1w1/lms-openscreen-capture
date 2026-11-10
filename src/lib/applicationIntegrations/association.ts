import { z } from "zod";
import { type RecordingClock, recordingClockSchema } from "../recordingFlags";
import { type ApplicationCapture, validateApplicationCapture } from "./capture";

const MAX_MS = 86400000;
const identity = z.string().min(1).max(200);
export const applicationAssociationSpanSchema = z
	.object({
		id: z.string().uuid(),
		segmentId: identity,
		applicationStartMs: z.number().int().nonnegative().max(MAX_MS),
		applicationEndMs: z.number().int().positive().max(MAX_MS),
		recordingStartMs: z.number().int().nonnegative().max(MAX_MS),
		recordingEndMs: z.number().int().positive().max(MAX_MS),
	})
	.strict()
	.refine(
		(span) =>
			span.applicationEndMs > span.applicationStartMs &&
			span.recordingEndMs > span.recordingStartMs,
		"Association spans must have positive ranges",
	);

export type ApplicationAssociationSpan = z.infer<typeof applicationAssociationSpanSchema>;
export const applicationAssociationSchema = z
	.object({
		format: z.literal("openscreen-application-association"),
		version: z.literal(1),
		source: z
			.object({
				adapterId: z.string().regex(/^[a-z][a-z0-9.-]{0,99}$/),
				instanceId: identity,
				sessionId: identity,
				scope: z.string().min(1).max(1000),
			})
			.strict(),
		applicationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		recordingSessionId: z.string().uuid(),
		recordingClock: z.literal("recording-control-active-ms"),
		recordingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		spans: z.array(applicationAssociationSpanSchema).max(128),
	})
	.strict()
	.superRefine((plan, ctx) => {
		const ids = new Set<string>();
		let applicationEnd = -1;
		let recordingEnd = -1;
		for (const [index, span] of plan.spans.entries()) {
			if (ids.has(span.id))
				ctx.addIssue({
					code: "custom",
					path: ["spans", index, "id"],
					message: "Duplicate span id",
				});
			ids.add(span.id);
			if (span.applicationStartMs < applicationEnd)
				ctx.addIssue({
					code: "custom",
					path: ["spans", index],
					message: "Application spans overlap or are unordered",
				});
			if (span.recordingStartMs < recordingEnd)
				ctx.addIssue({
					code: "custom",
					path: ["spans", index],
					message: "Recording spans overlap or are unordered",
				});
			applicationEnd = span.applicationEndMs;
			recordingEnd = span.recordingEndMs;
		}
	});

export type ApplicationAssociation = z.infer<typeof applicationAssociationSchema>;
export type ApplicationObservationResolution =
	| {
			status: "mapped";
			method: "manual-two-point";
			recordingSessionId: string;
			segmentId: string;
			mediaTimeMs: number;
	  }
	| { status: "unmapped"; reason: string };

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

async function fingerprint(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(canonical(value));
	const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateCapture(input: unknown): ApplicationCapture {
	return validateApplicationCapture(input);
}

function validateClock(input: unknown): RecordingClock {
	return recordingClockSchema.parse(input);
}

function validateSpans(input: unknown, capture: ApplicationCapture, clock: RecordingClock) {
	const spans = z.array(applicationAssociationSpanSchema).max(128).parse(input);
	const ids = new Set<string>();
	let applicationEnd = -1;
	let recordingEnd = -1;
	for (const span of spans) {
		if (ids.has(span.id)) throw new Error("Duplicate association span id");
		ids.add(span.id);
		if (span.applicationStartMs < applicationEnd || span.recordingStartMs < recordingEnd)
			throw new Error("Association spans must be ordered and nonoverlapping");
		if (span.applicationEndMs > capture.durationMs)
			throw new Error("Application span exceeds capture duration");
		const segment = clock.segments.find((candidate) => candidate.id === span.segmentId);
		if (!segment || span.recordingStartMs < segment.startMs || span.recordingEndMs > segment.endMs)
			throw new Error("Recording span must fit inside its named recording segment");
		applicationEnd = span.applicationEndMs;
		recordingEnd = span.recordingEndMs;
	}
	return spans;
}

/**
 * Creates an explicit offline association. The control clock describes active recording controls,
 * not encoder timestamps; this plan never claims native media synchronization.
 */
export async function createApplicationAssociation(
	captureInput: unknown,
	recordingClockInput: unknown,
	spansInput: unknown,
): Promise<ApplicationAssociation> {
	const capture = validateCapture(captureInput);
	const recordingClock = validateClock(recordingClockInput);
	const spans = validateSpans(spansInput, capture, recordingClock);
	return applicationAssociationSchema.parse({
		format: "openscreen-application-association",
		version: 1,
		source: {
			adapterId: capture.adapterId,
			instanceId: capture.instanceId,
			sessionId: capture.sessionId,
			scope: capture.scope,
		},
		applicationFingerprint: await fingerprint(capture),
		recordingSessionId: recordingClock.sessionId,
		recordingClock: recordingClock.clock,
		recordingFingerprint: await fingerprint(recordingClock),
		spans,
	});
}

/** Resolves only a point explicitly covered by a validated manual two-point span. */
export async function resolveApplicationObservation(
	captureInput: unknown,
	recordingClockInput: unknown,
	planInput: unknown,
	observationId: string,
): Promise<ApplicationObservationResolution> {
	const [resolution] = await resolveApplicationObservations(
		captureInput,
		recordingClockInput,
		planInput,
		[observationId],
	);
	return resolution;
}

/** Resolves a group of points after validating and fingerprinting each source only once. */
export async function resolveApplicationObservations(
	captureInput: unknown,
	recordingClockInput: unknown,
	planInput: unknown,
	observationIdsInput: readonly string[],
): Promise<ApplicationObservationResolution[]> {
	const capture = validateCapture(captureInput);
	const recordingClock = validateClock(recordingClockInput);
	const plan = applicationAssociationSchema.parse(planInput);
	const observationIds = z.array(z.string().min(1).max(200)).max(10000).parse(observationIdsInput);
	const source = plan.source;
	let mismatch: string | undefined;
	if (source.adapterId !== capture.adapterId) mismatch = "wrong-adapter";
	else if (source.instanceId !== capture.instanceId) mismatch = "wrong-instance";
	else if (source.sessionId !== capture.sessionId) mismatch = "wrong-session";
	else if (source.scope !== capture.scope) mismatch = "wrong-scope";
	else if (plan.recordingSessionId !== recordingClock.sessionId)
		mismatch = "recording-session-mismatch";
	else if (plan.recordingClock !== recordingClock.clock) mismatch = "recording-clock-mismatch";
	else if (plan.applicationFingerprint !== (await fingerprint(capture)))
		mismatch = "evidence-changed";
	else if (plan.recordingFingerprint !== (await fingerprint(recordingClock)))
		mismatch = "recording-metadata-changed";
	if (mismatch) return observationIds.map(() => ({ status: "unmapped", reason: mismatch }));
	validateSpans(plan.spans, capture, recordingClock);
	const observations = new Map(
		capture.observations.map((observation) => [observation.id, observation]),
	);
	return observationIds.map((observationId) => {
		const observation = observations.get(observationId);
		if (!observation) return { status: "unmapped", reason: "observation-missing" };
		if (observation.atMs === capture.durationMs)
			return { status: "unmapped", reason: "end-of-capture" };
		const span = plan.spans.find(
			(candidate) =>
				observation.atMs >= candidate.applicationStartMs &&
				observation.atMs < candidate.applicationEndMs,
		);
		if (!span) return { status: "unmapped", reason: "unmapped-gap" };
		const ratio =
			(observation.atMs - span.applicationStartMs) /
			(span.applicationEndMs - span.applicationStartMs);
		return {
			status: "mapped",
			method: "manual-two-point",
			recordingSessionId: recordingClock.sessionId,
			segmentId: span.segmentId,
			// Persist whole milliseconds without rounding onto a pause/right boundary.
			mediaTimeMs: Math.min(
				span.recordingEndMs - 1,
				Math.floor(span.recordingStartMs + ratio * (span.recordingEndMs - span.recordingStartMs)),
			),
		};
	});
}
