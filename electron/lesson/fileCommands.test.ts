import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { type LessonManifest, parseLesson } from "../../src/lib/lesson/schema";
import {
	exportLessonFile,
	moveLessonStepFile,
	queryLessonFile,
	removeLessonStepFile,
	updateLessonStepFile,
} from "./fileCommands";

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
	expect(result.steps[0].hasMediaSelection).toBe(false);
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
it("edits and removes a step into new files, demoting changed teaching text but not a relabelled destination", async () => {
	const image = await imageFixture(),
		kept = { ...newStep("Kept"), status: "reviewed" as const, slideRef: "old" },
		illustrated = {
			...newStep("Illustrated"),
			status: "reviewed" as const,
			imageId: image.id,
			imageAlt: "Alt",
			code: { language: "plain", text: "old code" },
		},
		source = path.join(root, "selected.json"),
		raw = JSON.stringify({ ...newLesson("L"), steps: [kept, illustrated], assets: [image] });
	await fs.writeFile(source, raw);
	const out = (name: string) => path.join(root, name);
	const read = async (name: string) => parseLesson(await fs.readFile(out(name), "utf8"));
	// A destination label alone keeps the review status.
	expect(
		await updateLessonStepFile({
			manifestPath: source,
			outputPath: out("a.json"),
			stepId: kept.id,
			changes: { slideRef: "slide 3" },
		}),
	).toMatchObject({ status: "saved", revision: 1, step: { id: kept.id, status: "reviewed" } });
	expect((await read("a.json")).steps[0]).toMatchObject({
		slideRef: "slide 3",
		status: "reviewed",
	});
	// Changed teaching text needs review again; null clears optional fields.
	await updateLessonStepFile({
		manifestPath: out("a.json"),
		outputPath: out("b.json"),
		stepId: illustrated.id,
		changes: { title: "Renamed", instructions: "New text", code: null },
	});
	await updateLessonStepFile({
		manifestPath: out("b.json"),
		outputPath: out("c.json"),
		stepId: kept.id,
		changes: { slideRef: null },
	});
	const edited = await read("c.json");
	expect(edited.steps[1]).toMatchObject({
		title: "Renamed",
		instructions: "New text",
		status: "draft",
	});
	expect(edited.steps[1].code).toBeUndefined();
	expect(edited.steps[1].imageId).toBe(image.id);
	expect(edited.steps[0].slideRef).toBeUndefined();
	expect(edited.steps[0].status).toBe("reviewed");
	// Removing the illustrated step also drops its now unused image.
	expect(
		await removeLessonStepFile({
			manifestPath: out("c.json"),
			outputPath: out("d.json"),
			stepId: illustrated.id,
		}),
	).toMatchObject({ status: "saved", totalSteps: 1 });
	const removed = await read("d.json");
	expect(removed.steps.map((step) => step.id)).toEqual([kept.id]);
	expect(removed.assets).toEqual([]);
	// Unknown step, empty change, unknown field, existing output: refused, nothing written or changed.
	for (const request of [
		{ stepId: crypto.randomUUID(), changes: { title: "X" } },
		{ stepId: kept.id, changes: {} },
		{ stepId: kept.id, changes: { status: "reviewed" } },
		{ stepId: kept.id, changes: { title: "" } },
	])
		await expect(
			updateLessonStepFile({ manifestPath: source, outputPath: out("e.json"), ...request }),
		).rejects.toThrow();
	await expect(
		updateLessonStepFile({
			manifestPath: source,
			outputPath: out("a.json"),
			stepId: kept.id,
			changes: { title: "Overwrite" },
		}),
	).rejects.toThrow();
	await expect(
		removeLessonStepFile({
			manifestPath: source,
			outputPath: out("e.json"),
			stepId: crypto.randomUUID(),
		}),
	).rejects.toThrow();
	expect((await fs.readdir(root)).sort()).toEqual([
		"a.json",
		"b.json",
		"c.json",
		"d.json",
		"selected.json",
	]);
	expect(await fs.readFile(source, "utf8")).toBe(raw);
});
it("moves a step to a position in a new file, changing only the order", async () => {
	const steps = ["A", "B", "C"].map((title) => ({
			...newStep(title),
			status: "reviewed" as const,
			instructions: `Text ${title}`,
		})),
		source = path.join(root, "selected.json"),
		raw = JSON.stringify({ ...newLesson("L"), steps });
	await fs.writeFile(source, raw);
	const moved = await moveLessonStepFile({
		manifestPath: source,
		outputPath: path.join(root, "moved.json"),
		stepId: steps[2].id,
		position: 1,
	});
	expect(moved.order.map((step) => step.title)).toEqual(["C", "A", "B"]);
	const saved = await parseLesson(await fs.readFile(moved.path, "utf8"));
	expect(saved.revision).toBe(1);
	expect([...saved.steps].sort((a, b) => a.title.localeCompare(b.title))).toEqual(
		(await parseLesson(raw)).steps,
	);
	for (const request of [
		{ stepId: steps[0].id, position: 4 },
		{ stepId: steps[0].id, position: 0 },
		{ stepId: crypto.randomUUID(), position: 1 },
		{ stepId: steps[0].id, position: 1.5 },
	])
		await expect(
			moveLessonStepFile({
				manifestPath: source,
				outputPath: path.join(root, "x.json"),
				...request,
			}),
		).rejects.toThrow();
	await expect(
		moveLessonStepFile({
			manifestPath: source,
			outputPath: moved.path,
			stepId: steps[0].id,
			position: 2,
		}),
	).rejects.toThrow();
	expect((await fs.readdir(root)).sort()).toEqual(["moved.json", "selected.json"]);
	expect(await fs.readFile(source, "utf8")).toBe(raw);
});
