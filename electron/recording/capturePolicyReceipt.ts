import { readFileSync, statSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { capturePrivacyPolicySchema, decideButtonCollection } from "../../src/lib/capturePrivacy";

const receiptSchema = z
	.object({
		version: z.literal(1),
		policy: capturePrivacyPolicySchema,
		applicationIdentity: z.literal("unavailable"),
		collectionAllowedAtStart: z.boolean(),
		suppressedAtStart: z.boolean(),
	})
	.strict()
	.refine(
		(receipt) =>
			receipt.collectionAllowedAtStart ===
			decideButtonCollection(receipt.policy, null, receipt.suppressedAtStart).allowed,
		"Policy receipt decision is inconsistent",
	);
export type CapturePolicyReceipt = z.infer<typeof receiptSchema>;

/** A new source gets a new receipt; never replace a prior recording's policy. */
export function writeCapturePolicyReceipt(
	videoPath: string,
	receipt: CapturePolicyReceipt,
): string {
	const target = `${videoPath}.capture-policy.json`;
	writeFileSync(target, `${JSON.stringify(receiptSchema.parse(receipt), null, 2)}\n`, {
		flag: "wx",
		mode: 0o600,
	});
	return target;
}

export function readCapturePolicyReceipt(videoPath: string): CapturePolicyReceipt {
	const target = `${videoPath}.capture-policy.json`;
	if (statSync(target).size > 65536) throw new Error("Capture policy receipt is too large");
	return receiptSchema.parse(JSON.parse(readFileSync(target, "utf8")));
}
