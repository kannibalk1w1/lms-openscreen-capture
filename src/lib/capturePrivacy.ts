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

const receiptFields = {
	policy: capturePrivacyPolicySchema,
	applicationIdentity: z.literal("unavailable"),
	collectionAllowedAtStart: z.boolean(),
	suppressedAtStart: z.boolean(),
};
export const capturePrivacyReceiptSchema = z
	.discriminatedUnion("version", [
		z.object({ version: z.literal(1), ...receiptFields }).strict(),
		z.object({ version: z.literal(2), captureId: z.string().uuid(), ...receiptFields }).strict(),
		z
			.object({
				version: z.literal(3),
				captureId: z.string().uuid().optional(),
				policy: z
					.object({
						version: z.literal(1),
						buttonScope: z.enum(["off", "global", "applications"]),
						excludedApplicationsConfigured: z.boolean(),
					})
					.strict(),
				applicationIdentity: z.literal("unavailable"),
				collectionAllowedAtStart: z.boolean(),
				suppressedAtStart: z.boolean(),
			})
			.strict(),
	])
	.refine(
		(receipt) =>
			receipt.collectionAllowedAtStart ===
			(receipt.version === 3
				? !receipt.suppressedAtStart &&
					receipt.policy.buttonScope === "global" &&
					!receipt.policy.excludedApplicationsConfigured
				: decideButtonCollection(receipt.policy, null, receipt.suppressedAtStart).allowed),
		"Policy receipt decision is inconsistent",
	);
export type CapturePrivacyReceipt = z.infer<typeof capturePrivacyReceiptSchema>;
export const capturePrivacyBindingSchema = z
	.object({
		version: z.literal(1),
		captureId: z.string().uuid(),
		sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export type CapturePrivacyBinding = z.infer<typeof capturePrivacyBindingSchema>;
export const captureRecoveryReasonSchema = z.enum([
	"invalid",
	"pending",
	"interrupted",
	"mismatch",
	"conflict",
	"unavailable",
]);
export type CaptureRecoveryReason = z.infer<typeof captureRecoveryReasonSchema>;
export const capturePrivacyInspectionSchema = z
	.object({
		status: z.enum([
			"missing",
			"legacy",
			"pending",
			"invalid",
			"mismatch",
			"bound",
			"unavailable",
			"interrupted",
			"conflict",
		]),
		journalPresent: z.boolean(),
		recoveredFrom: captureRecoveryReasonSchema.optional(),
		receipt: capturePrivacyReceiptSchema.optional(),
		binding: capturePrivacyBindingSchema.optional(),
	})
	.strict();
export type CapturePrivacyInspection = z.infer<typeof capturePrivacyInspectionSchema>;

/** Optional enrichment must never prevent generic project media from reopening. */
export const optionalCapturePrivacyInspectionSchema = z.preprocess((value) => {
	if (value === undefined) return undefined;
	const parsed = capturePrivacyInspectionSchema.safeParse(value);
	return parsed.success
		? {
				...parsed.data,
				...(parsed.data.receipt
					? { receipt: minimizeCapturePrivacyReceipt(parsed.data.receipt) }
					: {}),
			}
		: { status: "invalid", journalPresent: false };
}, capturePrivacyInspectionSchema.optional());

export function summarizeCapturePrivacyPolicy(policy: CapturePrivacyPolicy) {
	return {
		version: 1 as const,
		buttonScope: policy.buttonScope,
		excludedApplicationsConfigured: policy.excludedApplications.length > 0,
	};
}

/** Persist/export the declared decision without leaking application identifiers. */
export function minimizeCapturePrivacyReceipt(
	receipt: CapturePrivacyReceipt,
): CapturePrivacyReceipt {
	if (receipt.version === 3) return receipt;
	return {
		version: 3,
		...(receipt.version === 2 ? { captureId: receipt.captureId } : {}),
		policy: summarizeCapturePrivacyPolicy(receipt.policy),
		applicationIdentity: receipt.applicationIdentity,
		collectionAllowedAtStart: receipt.collectionAllowedAtStart,
		suppressedAtStart: receipt.suppressedAtStart,
	};
}

/** Recovery exclusions survive fresh neighboring artifacts until a separate review decision. */
export function captureEvidencePackagingDecision(
	inspection: CapturePrivacyInspection,
): { allowed: true } | { allowed: false; recoveredFrom: CaptureRecoveryReason } {
	if (inspection.recoveredFrom) return { allowed: false, recoveredFrom: inspection.recoveredFrom };
	switch (inspection.status) {
		case "bound":
		case "legacy":
		case "missing":
			return { allowed: true };
		case "invalid":
		case "pending":
		case "interrupted":
		case "mismatch":
		case "conflict":
		case "unavailable":
			return { allowed: false, recoveredFrom: inspection.status };
		default:
			return { allowed: false, recoveredFrom: "invalid" };
	}
}
