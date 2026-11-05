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
		expect(() => readCapturePolicyReceipt(video)).toThrow("oversized");
		expect(readFileSync(file, "utf8").length).toBe(65537);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// These use actual files: a policy declaration alone must never bind a new video to old evidence.
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, symlinkSync, unlinkSync } from "node:fs";
import {
	bindCapturePolicyToMedia,
	inspectCapturePrivacy,
	reserveCaptureDestination,
} from "./capturePolicyReceipt";

it("binds completed bytes, reopens embedded metadata without sidecars and detects changed media", async () => {
	const root = mkdtempSync(join(tmpdir(), "capture-binding-"));
	try {
		const video = join(root, "take.mp4");
		const captureId = randomUUID();
		const release = reserveCaptureDestination(video, captureId);
		expect((await inspectCapturePrivacy(video)).status).toBe("pending");
		const receipt = {
			version: 2 as const,
			captureId,
			policy: disabledCapturePrivacyPolicy(),
			applicationIdentity: "unavailable" as const,
			collectionAllowedAtStart: false,
			suppressedAtStart: false,
		};
		writeCapturePolicyReceipt(video, receipt);
		writeFileSync(video, "completed media");
		release();
		expect((await inspectCapturePrivacy(video)).status).toBe("pending");
		await bindCapturePolicyToMedia(video, captureId);
		const bound = await inspectCapturePrivacy(video);
		expect(bound.status).toBe("bound");
		const copy = join(root, "copy.mp4");
		copyFileSync(video, copy);
		expect((await inspectCapturePrivacy(copy, bound)).status).toBe("bound");
		writeFileSync(copy, "different media");
		expect((await inspectCapturePrivacy(copy, bound)).status).toBe("mismatch");
		writeFileSync(`${video}.events.ndjson`, "PRIVATE_CANARY");
		expect((await inspectCapturePrivacy(video)).status).toBe("conflict");
		expect(JSON.stringify(await inspectCapturePrivacy(video))).not.toContain("PRIVATE_CANARY");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it.each([
	"",
	".capture-policy.json",
	".capture-policy.binding.json",
	".events.ndjson",
	".cursor.json",
	".flags.json",
])("preserves an existing destination %s before capture", (suffix) => {
	const root = mkdtempSync(join(tmpdir(), "capture-collision-"));
	try {
		const video = join(root, "take.mp4");
		writeFileSync(video + suffix, "prior evidence");
		expect(() => reserveCaptureDestination(video, randomUUID())).toThrow("already contains");
		expect(readFileSync(video + suffix, "utf8")).toBe("prior evidence");
		expect(existsSync(`${video}.capture-policy.lock`)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("rejects concurrent reservation and releases only its own lock", () => {
	const root = mkdtempSync(join(tmpdir(), "capture-lock-"));
	try {
		const video = join(root, "take.mp4");
		const release = reserveCaptureDestination(video, randomUUID());
		expect(() => reserveCaptureDestination(video, randomUUID())).toThrow("already contains");
		writeFileSync(`${video}.capture-policy.lock`, "other owner");
		release();
		expect(readFileSync(`${video}.capture-policy.lock`, "utf8")).toBe("other owner");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("reports malformed, oversized and linked receipts without retaining their contents", async () => {
	const root = mkdtempSync(join(tmpdir(), "capture-invalid-"));
	try {
		const video = join(root, "take.mp4");
		const target = `${video}.capture-policy.json`;
		for (const contents of ["PRIVATE_CANARY", "PRIVATE_CANARY".repeat(6000)]) {
			writeFileSync(target, contents);
			expect(await inspectCapturePrivacy(video)).toEqual({
				status: "invalid",
				journalPresent: false,
			});
		}
		unlinkSync(target);
		writeFileSync(join(root, "private.json"), "PRIVATE_CANARY");
		symlinkSync(join(root, "private.json"), target);
		expect(await inspectCapturePrivacy(video)).toEqual({
			status: "invalid",
			journalPresent: false,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
