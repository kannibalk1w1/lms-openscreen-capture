import { z } from "zod";

const applicationIds = z.array(z.string().trim().min(1).max(256)).max(32);

/** Bounded button-evidence policy. It does not authorize text, video or audio. */
export const capturePrivacyPolicySchema = z
	.object({
		version: z.literal(1),
		buttonScope: z.enum(["off", "global", "applications"]),
		allowedApplications: applicationIds,
		excludedApplications: applicationIds,
	})
	.strict();

export type CapturePrivacyPolicy = z.infer<typeof capturePrivacyPolicySchema>;

export function disabledCapturePrivacyPolicy(): CapturePrivacyPolicy {
	return { version: 1, buttonScope: "off", allowedApplications: [], excludedApplications: [] };
}

/** Missing, future or malformed policy never authorizes collection. */
export function normalizeCapturePrivacyPolicy(value: unknown): CapturePrivacyPolicy {
	const parsed = capturePrivacyPolicySchema.safeParse(value);
	return parsed.success ? parsed.data : disabledCapturePrivacyPolicy();
}

export interface ButtonCollectionDecision {
	allowed: boolean;
	scope: "none" | "global" | "applications";
	reason:
		| "disabled"
		| "explicit-global"
		| "application-allowed"
		| "application-excluded"
		| "application-not-allowed"
		| "application-unknown"
		| "suppressed";
}

/** Application identity must come from an attesting producer, never video selection. */
export function decideButtonCollection(
	policy: CapturePrivacyPolicy,
	applicationId: string | null,
	suppressed = false,
): ButtonCollectionDecision {
	if (suppressed) return { allowed: false, scope: "none", reason: "suppressed" };
	if (policy.buttonScope === "off") return { allowed: false, scope: "none", reason: "disabled" };
	if (applicationId && policy.excludedApplications.includes(applicationId))
		return { allowed: false, scope: "none", reason: "application-excluded" };
	if (
		!applicationId &&
		(policy.buttonScope === "applications" || policy.excludedApplications.length > 0)
	)
		return { allowed: false, scope: "none", reason: "application-unknown" };
	if (policy.buttonScope === "global")
		return { allowed: true, scope: "global", reason: "explicit-global" };
	if (applicationId && policy.allowedApplications.includes(applicationId))
		return { allowed: true, scope: "applications", reason: "application-allowed" };
	return { allowed: false, scope: "none", reason: "application-not-allowed" };
}
