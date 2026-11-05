import { describe, expect, it } from "vitest";
import {
	decideButtonCollection,
	disabledCapturePrivacyPolicy,
	normalizeCapturePrivacyPolicy,
} from "./capturePrivacy";

describe("button evidence privacy policy", () => {
	it("fails closed for missing, malformed, future and oversized policies", () => {
		for (const value of [
			undefined,
			null,
			{},
			{ version: 2, buttonScope: "global" },
			{
				version: 1,
				buttonScope: "global",
				allowedApplications: [],
				excludedApplications: [],
				extra: true,
			},
			{
				version: 1,
				buttonScope: "global",
				allowedApplications: Array(33).fill("app"),
				excludedApplications: [],
			},
		]) {
			expect(decideButtonCollection(normalizeCapturePrivacyPolicy(value), null).allowed).toBe(
				false,
			);
		}
	});
	it("requires explicit global consent and suppresses when exclusions cannot be enforced", () => {
		const policy = { ...disabledCapturePrivacyPolicy(), buttonScope: "global" as const };
		expect(decideButtonCollection(policy, null)).toMatchObject({ allowed: true, scope: "global" });
		expect(
			decideButtonCollection({ ...policy, excludedApplications: ["private.app"] }, null),
		).toMatchObject({ allowed: false, reason: "application-unknown" });
		expect(decideButtonCollection(policy, null, true)).toMatchObject({
			allowed: false,
			reason: "suppressed",
		});
	});
	it("keeps allowlists and exclusions independent of optional adapters and video source", () => {
		const policy = {
			...disabledCapturePrivacyPolicy(),
			buttonScope: "applications" as const,
			allowedApplications: ["teaching.app", "private.app"],
			excludedApplications: ["private.app"],
		};
		expect(decideButtonCollection(policy, null)).toMatchObject({
			allowed: false,
			reason: "application-unknown",
		});
		expect(decideButtonCollection(policy, "other.app").allowed).toBe(false);
		expect(decideButtonCollection(policy, "private.app")).toMatchObject({
			allowed: false,
			reason: "application-excluded",
		});
		expect(decideButtonCollection(policy, "teaching.app")).toMatchObject({
			allowed: true,
			scope: "applications",
		});
	});
});
