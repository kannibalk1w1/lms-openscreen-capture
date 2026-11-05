import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { disabledCapturePrivacyPolicy } from "../../src/lib/capturePrivacy";
import { readCapturePolicyReceipt, writeCapturePolicyReceipt } from "./capturePolicyReceipt";

it("reopens an exact private receipt and never overwrites prior source evidence", () => {
	const root = mkdtempSync(join(tmpdir(), "capture-policy-receipt-"));
	try {
		const video = join(root, "take.mp4");
		const receipt = {
			version: 1 as const,
			policy: disabledCapturePrivacyPolicy(),
			applicationIdentity: "unavailable" as const,
			collectionAllowedAtStart: false,
			suppressedAtStart: false,
		};
		const file = writeCapturePolicyReceipt(video, receipt);
		expect(readCapturePolicyReceipt(video)).toEqual(receipt);
		if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(() =>
			writeCapturePolicyReceipt(video, { ...receipt, collectionAllowedAtStart: true }),
		).toThrow();
		expect(readCapturePolicyReceipt(video)).toEqual(receipt);
		writeFileSync(file, "x".repeat(65537));
		expect(() => readCapturePolicyReceipt(video)).toThrow("too large");
		expect(readFileSync(file, "utf8").length).toBe(65537);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
