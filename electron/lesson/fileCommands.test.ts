import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { type LessonManifest, parseLesson } from "../../src/lib/lesson/schema";
import { exportLessonFile, queryLessonFile } from "./fileCommands";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "selected-lesson-file-"));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const image = await imageFixture();
	const keep = {
		...newStep("First"),
		instructions: "PRIVATE_INSTRUCTIONS",
		imageId: image.id,
		imageAlt: "PRIVATE_ALT",
		code: { language: "plain", text: "PRIVATE_CODE" },
	};
	const omit = newStep("PRIVATE_OMITTED_STEP");
	const lesson: LessonManifest = {
		...newLesson("Selected lesson"),
		revision: 3,
		steps: [keep, omit],
		assets: [image],
		extensions: { "private.raw": "PRIVATE_EXTENSION" },
	};
	const manifestPath = path.join(root, "selected.json");
	const bytes = JSON.stringify(lesson);
	await fs.writeFile(manifestPath, bytes);
	return { manifestPath, lesson, keep, omit, bytes, image };
}
it("queries only the explicit file with bounded filters and a content-minimal summary", async () => {
	const source = await fixture();
	const result = await queryLessonFile({
		manifestPath: source.manifestPath,
		query: { title: "FIRST", source: "authored", status: "draft", problemsOnly: true },
	});
	expect(result).toMatchObject({
		lessonId: source.lesson.id,
		revision: 3,
		totalSteps: 2,
		matchingSteps: 1,
	});
	expect(result.steps[0]).toMatchObject({
		id: source.keep.id,
		number: 1,
		title: "First",
		hasImage: true,
		hasCode: true,
		sources: ["authored"],
		findings: ["draft"],
	});
	const json = JSON.stringify(result);
	for (const value of [
		source.manifestPath,
		source.image.base64,
		"PRIVATE_INSTRUCTIONS",
		"PRIVATE_ALT",
		"PRIVATE_CODE",
		"PRIVATE_EXTENSION",
		"PRIVATE_OMITTED_STEP",
		source.image.source.documentSha256,
	])
		expect(json).not.toContain(value);
	expect((await queryLessonFile({ manifestPath: source.manifestPath })).matchingSteps).toBe(2);
	expect(
		(await queryLessonFile({ manifestPath: source.manifestPath, query: { status: "reviewed" } }))
			.steps,
	).toEqual([]);
	expect(await fs.readFile(source.manifestPath, "utf8")).toBe(source.bytes);
	expect(await fs.readdir(root)).toEqual(["selected.json"]);
});
it("exports explicit selected steps through the existing projection and verified receipt without changing the source", async () => {
	const source = await fixture();
	source.lesson.output = {
		version: 1,
		preset: "large-print",
		language: "ar",
		direction: "rtl",
		includeImages: false,
		includeCode: false,
	};
	await fs.writeFile(source.manifestPath, JSON.stringify(source.lesson));
	const before = await fs.readFile(source.manifestPath);
	const request = {
		manifestPath: source.manifestPath,
		outputDirectory: root,
		stepIds: [source.keep.id],
	};
	const result = await exportLessonFile(request);
	expect(result).toMatchObject({ status: "exported", steps: 1, images: 0 });
	if (result.status !== "exported") throw new Error("Expected export");
	const derived = await parseLesson(
		await fs.readFile(path.join(result.path, "lesson.openscreen-lesson.json"), "utf8"),
	);
	expect(derived.derivedFrom).toEqual({
		id: source.lesson.id,
		revision: 3,
		stepIds: [source.keep.id],
	});
	expect(derived.steps).toHaveLength(1);
	expect(derived.steps[0].code).toBeUndefined();
	expect(derived.assets).toEqual([]);
	const all = (
		await Promise.all(
			(
				await fs.readdir(result.path)
			).map((file) => fs.readFile(path.join(result.path, file), "utf8")),
		)
	).join("\n");
	for (const omitted of [
		"PRIVATE_CODE",
		"PRIVATE_OMITTED_STEP",
		"PRIVATE_EXTENSION",
		"PRIVATE_ALT",
		source.image.base64,
	])
		expect(all).not.toContain(omitted);
	expect(all).toContain("PRIVATE_INSTRUCTIONS");
	expect(all).toContain("openscreen-guide-export");
	const another = await exportLessonFile(request);
	expect(another.path).not.toBe(result.path);
	expect(await fs.readFile(source.manifestPath)).toEqual(before);
});
it("refuses missing/duplicate/unknown selections, relative paths, unknown query keys and corrupt manifests before writing", async () => {
	const source = await fixture();
	const base = { manifestPath: source.manifestPath, outputDirectory: root };
	for (const stepIds of [
		undefined,
		[],
		[source.keep.id, source.keep.id],
		[crypto.randomUUID()],
		Array.from({ length: 201 }, () => crypto.randomUUID()),
	])
		await expect(exportLessonFile({ ...base, stepIds })).rejects.toThrow();
	for (const query of [
		{ title: "x".repeat(301) },
		{ status: "approved" },
		{ source: "godot" },
		{ problemsOnly: "yes" },
		{ arbitraryPath: root },
	])
		await expect(queryLessonFile({ manifestPath: source.manifestPath, query })).rejects.toThrow();
	await expect(queryLessonFile({ manifestPath: "relative.json" })).rejects.toThrow();
	await expect(
		queryLessonFile({ manifestPath: source.manifestPath, recoveryDirectory: root }),
	).rejects.toThrow();
	await fs.writeFile(source.manifestPath, '{"secret":"DO_NOT_ECHO"}');
	await expect(queryLessonFile({ manifestPath: source.manifestPath })).rejects.toThrow();
	await expect(exportLessonFile({ ...base, stepIds: [source.keep.id] })).rejects.toThrow();
	expect(await fs.readdir(root)).toEqual(["selected.json"]);
});
it("rejects oversized selected files without creating output", async () => {
	const source = await fixture();
	const file = await fs.open(source.manifestPath, "r+");
	await file.truncate(16 * 1024 * 1024 + 1);
	await file.close();
	await expect(queryLessonFile({ manifestPath: source.manifestPath })).rejects.toThrow();
	await expect(
		exportLessonFile({
			manifestPath: source.manifestPath,
			outputDirectory: root,
			stepIds: [source.keep.id],
		}),
	).rejects.toThrow();
	expect(await fs.readdir(root)).toEqual(["selected.json"]);
});

// Creating symlinks on Windows can require privileges absent from ordinary test runners.
it.skipIf(process.platform === "win32")(
	"rejects a selected source symlink (POSIX filesystem coverage)",
	async () => {
		const source = await fixture();
		const link = path.join(root, "link.json");
		await fs.symlink(source.manifestPath, link);
		await expect(queryLessonFile({ manifestPath: link })).rejects.toThrow();
		await expect(
			exportLessonFile({ manifestPath: link, outputDirectory: root, stepIds: [source.keep.id] }),
		).rejects.toThrow();
		expect(await fs.readFile(source.manifestPath, "utf8")).toBe(source.bytes);
		expect((await fs.readdir(root)).sort()).toEqual(["link.json", "selected.json"]);
	},
);
it("reports only the presence of an authored media selection without leaking its project or timing plan", async () => {
	const source = await fixture();
	source.lesson.steps[0].mediaSelection = {
		version: 1,
		provenance: "authored-selection",
		basis: "editor-ruler-seconds",
		projectId: "PRIVATE_RANGE_PROJECT",
		documentSha256: "b".repeat(64),
		fingerprintKind: "render-inputs-v1",
		startSec: 2,
		endSec: 4,
		keptSpans: [{ startSec: 2, endSec: 4 }],
		programme: { basis: "editor-programme-seconds", startSec: 2, endSec: 4 },
	};
	await fs.writeFile(source.manifestPath, JSON.stringify(source.lesson));
	const result = await queryLessonFile({ manifestPath: source.manifestPath });
	expect(result.steps[0].hasMediaSelection).toBe(true);
	expect(JSON.stringify(result)).not.toContain("PRIVATE_RANGE_PROJECT");
	expect(JSON.stringify(result)).not.toContain("keptSpans");
});
