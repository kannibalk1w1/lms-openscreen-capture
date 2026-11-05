import { z } from "zod";

const identity = z.string().min(1).max(200);
export const integrationSettingsSchema = z
	.object({
		version: z.literal(1),
		enabledAdapterIds: z.array(z.literal("godot-codeedit")).max(1),
	})
	.strict();
export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>;
export const disabledIntegrationSettings = (): IntegrationSettings => ({
	version: 1,
	enabledAdapterIds: [],
});
export function normalizeIntegrationSettings(value: unknown): IntegrationSettings {
	const parsed = integrationSettingsSchema.safeParse(value);
	return parsed.success ? parsed.data : disabledIntegrationSettings();
}
export const integrationDescriptorSchema = z
	.object({
		id: identity,
		version: identity,
		contractVersion: z.literal(1),
		label: z.string().min(1).max(200),
		capabilities: z.array(identity).min(1).max(32),
		supportedApplicationVersions: z.array(identity).max(32),
		mode: z.literal("selected-file"),
	})
	.strict();
export type IntegrationDescriptor = z.infer<typeof integrationDescriptorSchema>;
export const integrationScopeSchema = z
	.object({ kind: z.literal("selected-file"), artifactId: identity })
	.strict();
export const integrationSessionSchema = z
	.object({
		version: z.literal(1),
		adapterId: identity,
		instanceId: identity,
		sessionId: identity,
		capability: identity,
		scope: integrationScopeSchema,
	})
	.strict();
export type IntegrationSession = z.infer<typeof integrationSessionSchema>;
export const integrationObservationSchema = integrationSessionSchema
	.extend({
		sequence: z.number().int().nonnegative().max(50000),
		type: identity,
		clock: z
			.object({
				id: identity,
				tickMs: z.number().finite().nonnegative().max(86400000),
				relation: z.literal("unmapped"),
			})
			.strict(),
		provenance: z.enum(["observed", "inferred"]),
		payload: z.json(),
	})
	.strict();
export type IntegrationObservation = z.infer<typeof integrationObservationSchema>;
export type IntegrationState =
	| "disabled"
	| "available-offline"
	| "unavailable"
	| "connecting"
	| "incompatible"
	| "error";
export interface IntegrationStatus {
	descriptor: IntegrationDescriptor;
	enabled: boolean;
	state: IntegrationState;
	activeSessions: number;
	error?:
		| "start-failed"
		| "timeout"
		| "invalid-observation"
		| "capacity"
		| "stopped"
		| "contract-mismatch";
}
export const GODOT_JOURNAL_DESCRIPTOR: IntegrationDescriptor = {
	id: "godot-codeedit",
	version: "1",
	contractVersion: 1,
	label: "Godot typing journal",
	capabilities: ["typing.journal-import"],
	supportedApplicationVersions: ["4.7.1"],
	mode: "selected-file",
};
