import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderProjectedLessonGuide } from "../../src/lib/lesson/export";
import { type LessonManifest, parseLesson, validateLesson } from "../../src/lib/lesson/schema";
import { validateRangeVideo } from "./encodedVideo";
import { createLessonPackage, inspectLessonPackage, verifyLessonPackage } from "./package";
import { fakePackageVideo, packageFixture } from "./package.test-support";
import {
	type PortablePackageManifest,
	packageManifestSchema,
	packageReceiptSchema,
} from "./packageContracts";

// Native/decoder doubles are used only by the reused authoring fixture. These
// verify-side privacy cases have no video dependency and exercise the real service.
vi.mock("./encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
let root: string;
const authority = {
	assertCurrent: () => {
		/* Explicit selected fixture package. */
	},
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "package-privacy-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

type Forgery =
	| "media-pins-and-refresh-history"
	| "source-evidence"
	| "extensions"
	| "manifest-code-excluded"
	| "authored-code-excluded"
	| "manifest-images-excluded"
	| "authored-images-excluded";
/** Produce a coherent re-signed envelope, deliberately leaving only one policy violated. */
async function resignedPrivacyForgery(kind: Forgery) {
	const f = await packageFixture(root),
		created = await createLessonPackage(
			{ ...f.request, includeCode: true, imagePolicy: "include-external-provenance", media: [] },
			authority,
		),
		original = await inspectLessonPackage({ directory: created.path }, authority);
	expect(original.summary.status).toBe("verified");
	expect(original.lesson.steps[0].code?.text).toBe("PRIVATE_SELECTED_CODE");
	expect(original.lesson.assets[0].source).toEqual(f.image.source);
	const lesson: LessonManifest = structuredClone(original.lesson),
		manifest: PortablePackageManifest = structuredClone(original.manifest);
	if (kind === "media-pins-and-refresh-history")
		lesson.steps[0].mediaSelection = structuredClone(f.lesson.steps[0].mediaSelection);
	if (kind === "source-evidence")
		lesson.steps[0].evidence = structuredClone(f.lesson.steps[0].evidence);
	if (kind === "extensions")
		lesson.extensions = {
			private: { journal: "PRIVATE_RAW_JOURNAL", source: "PRIVATE_EXTENSION_SOURCE" },
		};
	if (kind === "manifest-code-excluded") manifest.scope.code = "excluded";
	if (kind === "authored-code-excluded") lesson.output = { ...lesson.output!, includeCode: false };
	if (kind === "manifest-images-excluded") manifest.scope.images = "exclude";
	if (kind === "authored-images-excluded")
		lesson.output = { ...lesson.output!, includeImages: false };
	// The existing lesson schema accepts the data; package policy must reject it.
	// Canonical schema order avoids an incidental editable-JSON projection mismatch.
	const canonical = await validateLesson(lesson),
		before = await renderProjectedLessonGuide(original.lesson),
		after = await renderProjectedLessonGuide(canonical);
	expect(after.html).toBe(before.html);
	expect(after.markdown).toBe(before.markdown);
	const editable = path.join(created.path, "lesson.openscreen-lesson.json");
	await fs.writeFile(editable, JSON.stringify(canonical, null, 2) + "\n");
	for (const item of manifest.files) {
		const bytes = await fs.readFile(path.join(created.path, item.path));
		item.bytes = bytes.length;
		item.sha256 = hash(bytes);
	}
	packageManifestSchema.parse(manifest);
	const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
	await fs.writeFile(path.join(created.path, "lesson-package.json"), bytes);
	const receiptPath = path.join(created.path, "package-receipt.json"),
		receipt = packageReceiptSchema.parse(JSON.parse(await fs.readFile(receiptPath, "utf8")));
	receipt.manifest = { bytes: bytes.length, sha256: hash(bytes) };
	await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
	// Check actual stored bytes, not just the in-memory objects used to sign them.
	const storedManifest = await fs.readFile(path.join(created.path, "lesson-package.json")),
		storedReceipt = packageReceiptSchema.parse(JSON.parse(await fs.readFile(receiptPath, "utf8")));
	expect(storedReceipt.manifest).toEqual({
		bytes: storedManifest.length,
		sha256: hash(storedManifest),
	});
	for (const item of manifest.files) {
		const actual = await fs.readFile(path.join(created.path, item.path));
		expect({ bytes: actual.length, sha256: hash(actual) }).toEqual({
			bytes: item.bytes,
			sha256: item.sha256,
		});
	}
	const storedLesson = await parseLesson(await fs.readFile(editable, "utf8"));
	expect(storedLesson).toEqual(canonical);
	if (kind === "media-pins-and-refresh-history") {
		expect(storedLesson.steps[0].mediaSelection?.version).toBe(2);
		expect(JSON.stringify(storedLesson)).toContain("PRIVATE_PIN_HISTORY");
		expect(JSON.stringify(storedLesson)).toContain(f.pin.identity.sources[0].sha256);
	}
	if (kind === "source-evidence")
		expect(JSON.stringify(storedLesson)).toContain("PRIVATE_EVIDENCE_SESSION");
	if (kind === "extensions") expect(JSON.stringify(storedLesson)).toContain("PRIVATE_RAW_JOURNAL");
	// Reopen is independent of original authoring paths; no missing-source failure may mask policy.
	await fs.rename(f.authoring, f.authoring + ".offline");
	return { directory: created.path, lesson: storedLesson, manifest };
}

it.each<Forgery>([
	"media-pins-and-refresh-history",
	"source-evidence",
	"extensions",
	"manifest-code-excluded",
	"authored-code-excluded",
	"manifest-images-excluded",
	"authored-images-excluded",
])("verify rejects coherent re-signed privacy forgery: %s", async (kind) => {
	const forged = await resignedPrivacyForgery(kind);
	await expect(
		verifyLessonPackage({ directory: forged.directory }, authority),
	).rejects.toHaveProperty("code", "lesson-package-invalid");
});

it("benign explicit code inclusion verifies while media pins, evidence and extensions remain excluded", async () => {
	const f = await packageFixture(root),
		created = await createLessonPackage(
			{ ...f.request, includeCode: true, imagePolicy: "exclude", media: [] },
			authority,
		),
		verified = await inspectLessonPackage({ directory: created.path }, authority);
	expect(verified.summary.status).toBe("verified");
	expect(verified.manifest.scope.code).toBe("included");
	expect(verified.lesson.output?.includeCode).toBe(true);
	expect(verified.lesson.steps[0].code?.text).toBe("PRIVATE_SELECTED_CODE");
	expect(verified.lesson.steps[0].mediaSelection).toBeUndefined();
	expect(verified.lesson.steps[0].evidence).toEqual([]);
	expect(verified.lesson.extensions).toBeUndefined();
	expect(verified.lesson.assets).toEqual([]);
});
it("benign explicit illustration provenance verifies without importing source projects or pin history", async () => {
	const f = await packageFixture(root),
		created = await createLessonPackage(
			{ ...f.request, includeCode: false, imagePolicy: "include-external-provenance", media: [] },
			authority,
		);
	await fs.rename(f.authoring, f.authoring + ".offline");
	const verified = await inspectLessonPackage({ directory: created.path }, authority);
	expect(verified.summary.status).toBe("verified");
	expect(verified.manifest.scope.images).toBe("include-external-provenance");
	expect(verified.lesson.output?.includeImages).toBe(true);
	expect(verified.lesson.assets[0].source).toEqual(f.image.source);
	expect(verified.lesson.steps[0].code).toBeUndefined();
	expect(verified.lesson.steps[0].mediaSelection).toBeUndefined();
	expect(verified.lesson.steps[0].evidence).toEqual([]);
	expect(verified.lesson.extensions).toBeUndefined();
	expect(JSON.stringify(verified.lesson)).not.toContain("PRIVATE_PIN_HISTORY");
});
