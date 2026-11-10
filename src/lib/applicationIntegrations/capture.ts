import { z } from "zod";

export const MAX_APPLICATION_CAPTURE_BYTES = 8 * 1024 * 1024;
const identity = z.string().min(1).max(200);
const ms = z.number().int().nonnegative().max(86400000);
const boundedJson = (bytes: number) =>
	z.json().refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= bytes);
/** Offline evidence boundary, shared by application-specific decoders. No executable providers. */
export const applicationCaptureSchema = z
	.object({
		format: z.literal("openscreen-application-capture"),
		version: z.literal(1),
		adapterId: z.string().regex(/^[a-z][a-z0-9.-]{0,99}$/),
		instanceId: identity,
		sessionId: identity,
		scope: z.string().min(1).max(1000),
		clock: z.literal("unmapped"),
		coverage: z.enum(["sampled", "limited"]),
		stopReason: z.string().min(1).max(100),
		pollIntervalMs: z.number().int().min(1).max(60000),
		durationMs: ms,
		baseline: boundedJson(2 * 1024 * 1024),
		observations: z
			.array(
				z
					.object({
						id: identity,
						atMs: ms,
						type: z.string().min(1).max(100),
						label: z.string().min(1).max(300),
						payload: boundedJson(32768),
					})
					.strict(),
			)
			.max(10000),
	})
	.strict()
	.superRefine((capture, ctx) => {
		const ids = new Set<string>();
		let previous = 0;
		for (const observation of capture.observations) {
			if (
				ids.has(observation.id) ||
				observation.atMs < previous ||
				observation.atMs > capture.durationMs
			)
				ctx.addIssue({ code: "custom", message: "Duplicate or unordered application observation" });
			ids.add(observation.id);
			previous = observation.atMs;
		}
	});
export type ApplicationCapture = z.infer<typeof applicationCaptureSchema>;
export function validateApplicationCapture(input: unknown): ApplicationCapture {
	if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_APPLICATION_CAPTURE_BYTES)
		throw new Error("Application capture exceeds 8 MiB");
	return applicationCaptureSchema.parse(input);
}
export function parseApplicationCapture(source: string): ApplicationCapture {
	if (
		source.length > MAX_APPLICATION_CAPTURE_BYTES ||
		new TextEncoder().encode(source).byteLength > MAX_APPLICATION_CAPTURE_BYTES
	)
		throw new Error("Application capture exceeds 8 MiB");
	return validateApplicationCapture(JSON.parse(source));
}
