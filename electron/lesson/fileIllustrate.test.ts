import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { jpegBase64 } from "../../src/lib/lesson/fixtures.test-support";
import { buildLessonSceneDescription } from "../../src/lib/lesson/frameSource";
import { parseLesson } from "../../src/lib/lesson/schema";
import * as sceneDescription from "../../src/native/sceneDescription";
import { buildNativeClipList } from "../../src/native/sceneDescription";
import { illustrateLessonStepFile } from "./fileIllustrate";
import {
	illustrationFixture,
	UNGRANTED_DEPENDENCIES,
	type UngrantedDependency,
} from "./fileIllustrate.test-support";
import { unsupportedRenderDependencies } from "./renderDependencies";

let root: string;
const authority = {
	assertCurrent() {
		/* Explicit test authority. */
	},
};
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-illustrate-"));
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));
async function fixture() {
	const source = path.join(root, "source.mp4"),
		ungranted = path.join(root, "other.mp4");
	await fs.writeFile(source, "video bytes");
	await fs.writeFile(ungranted, "other bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Project" });
	doc.assets = [
		{ id: "a", kind: "video", label: "Source", originalPath: source, cameraTrack: null },
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			origin: "user",
			wordRefs: [],
			reason: "fixture",
		},
	];
	// A screen-only project: the default wallpaper is an image and is refused (M42-1).
	doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	const step = { ...newStep("Add the enemy"), status: "reviewed" as const, instructions: "Kept" },
		lesson = { ...newLesson("L"), steps: [step, newStep("Other")] },
		manifestPath = path.join(root, "lesson.json"),
		projectPath = path.join(root, "project.openscreen"),
		raw = JSON.stringify(lesson);
	await fs.writeFile(manifestPath, raw);
	await fs.writeFile(projectPath, JSON.stringify(doc));
	const render = vi.fn(async (_clips: unknown, _scene: string, _fps: number, frames: number[]) => [
		{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") },
	]);
	const request = {
		manifestPath,
		projectPath,
		projectId: "p",
		stepId: step.id,
		rulerSec: 2.5,
		imageAlt: "The Scene dock with Enemy selected",
		sourcePaths: [source],
		outputPath: path.join(root, "illustrated.json"),
	};
	return { doc, step, raw, render, request, source, ungranted, manifestPath, projectPath };
}
it("attaches one composed frame to the chosen step in a new lesson copy and returns the step to draft", async () => {
	const f = await fixture(),
		result = await illustrateLessonStepFile(f.request, authority, f.render);
	expect(result).toMatchObject({
		status: "saved",
		path: f.request.outputPath,
		revision: 2,
		stepId: f.step.id,
		image: { width: 2, height: 2, rulerSec: 2.5 },
	});
	expect(f.render).toHaveBeenCalledTimes(1);
	expect(f.render.mock.calls[0][3]).toEqual([150]);
	const saved = await parseLesson(await fs.readFile(f.request.outputPath, "utf8"));
	expect(saved.steps[0]).toMatchObject({
		id: f.step.id,
		instructions: "Kept",
		status: "draft",
		imageId: result.image.id,
		imageAlt: "The Scene dock with Enemy selected",
	});
	expect(saved.assets).toHaveLength(1);
	expect(saved.assets[0].source).toMatchObject({ projectId: "p", rulerSec: 2.5 });
	expect(saved.steps[1].imageId).toBeUndefined();
	expect(await fs.readFile(f.manifestPath, "utf8")).toBe(f.raw);
	expect((await fs.stat(f.request.outputPath)).mode & 0o777).toBe(0o600);
	// A second illustration of the same step replaces the first image instead of accumulating.
	const again = await illustrateLessonStepFile(
		{
			...f.request,
			manifestPath: f.request.outputPath,
			outputPath: path.join(root, "again.json"),
			rulerSec: 3,
		},
		authority,
		f.render,
	);
	const replaced = await parseLesson(await fs.readFile(again.path, "utf8"));
	expect(replaced.assets.map((asset) => asset.id)).toEqual([again.image.id]);
});
it.each([
	"ungranted-source",
	"symlinked-source",
	"unknown-step",
	"wrong-project-id",
	"trimmed-time",
	"blank-alt",
	"existing-output",
	"extra-field",
	"no-frame",
])("refuses %s without rendering an unapproved frame or writing a lesson", async (kind) => {
	const f = await fixture();
	let request: Record<string, unknown> = f.request;
	if (kind === "ungranted-source") request = { ...f.request, sourcePaths: [f.ungranted] };
	if (kind === "symlinked-source") {
		await fs.rename(f.source, f.source + ".real");
		await fs.symlink(f.source + ".real", f.source);
	}
	if (kind === "unknown-step") request = { ...f.request, stepId: crypto.randomUUID() };
	if (kind === "wrong-project-id") request = { ...f.request, projectId: "other" };
	if (kind === "trimmed-time") request = { ...f.request, rulerSec: 11 };
	if (kind === "blank-alt") request = { ...f.request, imageAlt: "   " };
	if (kind === "existing-output") await fs.writeFile(f.request.outputPath, "KEEP");
	if (kind === "extra-field") request = { ...f.request, status: "reviewed" };
	if (kind === "no-frame") f.render.mockResolvedValueOnce([]);
	await expect(illustrateLessonStepFile(request, authority, f.render)).rejects.toThrow();
	if (!["existing-output", "no-frame"].includes(kind)) expect(f.render).not.toHaveBeenCalled();
	if (kind === "existing-output")
		expect(await fs.readFile(f.request.outputPath, "utf8")).toBe("KEEP");
	else await expect(fs.stat(f.request.outputPath)).rejects.toThrow();
	expect(await fs.readFile(f.manifestPath, "utf8")).toBe(f.raw);
});
it("refuses a cancelled request before rendering, and a project file that changes while the frame is rendering", async () => {
	const f = await fixture();
	await expect(
		illustrateLessonStepFile(f.request, { ...authority, signal: AbortSignal.abort() }, f.render),
	).rejects.toThrow();
	expect(f.render).not.toHaveBeenCalled();
	f.render.mockImplementationOnce(async (_c, _s, _f, frames) => {
		await fs.appendFile(f.projectPath, " ");
		return [{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") }];
	});
	await expect(illustrateLessonStepFile(f.request, authority, f.render)).rejects.toThrow();
	expect(f.render).toHaveBeenCalledTimes(1);
	await expect(fs.stat(f.request.outputPath)).rejects.toThrow();
});

// M42-1: nothing but granted screen sources may reach the renderer.
it("the screen-only fixture has no unsupported dependency and each canary adds exactly its own kind", async () => {
	const kinds: Record<UngrantedDependency, string[]> = {
		webcam: ["webcam"],
		"image-background": ["image-background"],
		"image-annotation": ["image-annotation"],
		"added-audio": ["added-audio"],
		"webcam-effect": ["webcam-effect"],
		"cursor-sidecar": [],
	};
	const found = async (add: UngrantedDependency[]) => {
		const dir = await fs.mkdtemp(path.join(root, "kind-"));
		const { doc } = await illustrationFixture(dir, add);
		return unsupportedRenderDependencies(
			buildNativeClipList(doc),
			buildLessonSceneDescription(doc),
		);
	};
	expect(await found([])).toEqual([]);
	for (const dependency of UNGRANTED_DEPENDENCIES)
		expect(await found([dependency])).toEqual(kinds[dependency]);
	// A click sound cannot be authored from a document in this process; pin its guard on the scene.
	const { doc } = await illustrationFixture(await fs.mkdtemp(path.join(root, "kind-")));
	expect(
		unsupportedRenderDependencies(buildNativeClipList(doc), {
			...buildLessonSceneDescription(doc),
			clickSound: { downPath: "/SECRET_DOWN.wav", upPath: "/SECRET_UP.wav", hits: [] },
		}),
	).toEqual(["click-sound"]);
});
it.each([
	...UNGRANTED_DEPENDENCIES.map((dependency) => [dependency]),
	["webcam", "image-background", "image-annotation"],
	[...UNGRANTED_DEPENDENCIES],
] as UngrantedDependency[][])("refuses %s before any render, with the fixed code, no output and unchanged inputs", async (...add) => {
	const f = await illustrationFixture(root, add),
		render = vi.fn(async () => null);
	const failure = await illustrateLessonStepFile(f.request, authority, render).catch(
		(error) => error,
	);
	expect(failure).toBeInstanceOf(LessonOperationError);
	expect(failure.code).toBe("illustration-unsupported");
	expect(String(failure.message)).not.toMatch(/SECRET|private/);
	expect(render).not.toHaveBeenCalled();
	await expect(fs.stat(f.request.outputPath)).rejects.toThrow();
	expect(await fs.readFile(f.manifestPath, "utf8")).toBe(f.raw);
	expect(await fs.readFile(f.projectPath, "utf8")).toBe(f.project);
	// The canary files were never created: the refusal cannot have depended on reading them.
	await expect(fs.stat(path.join(root, "private"))).rejects.toThrow();
});
it("a dependency refusal comes before the screen grant check and before any source file is touched", async () => {
	const f = await illustrationFixture(root, ["image-background"]),
		render = vi.fn(async () => null),
		lstat = vi.spyOn(fs, "lstat");
	// Even with no usable grant at all, the answer is the unsupported project, not a grant error.
	const failure = await illustrateLessonStepFile(
		{ ...f.request, sourcePaths: [f.manifestPath] },
		authority,
		render,
	).catch((error) => error);
	expect(failure.code).toBe("illustration-unsupported");
	expect(lstat.mock.calls.map(([target]) => String(target))).not.toContain(
		`${f.source}.cursor.json`,
	);
	vi.restoreAllMocks();
});
it.each([
	{ webcamPath: "/SECRET_CAMERA.mp4" },
	{ screenPath: "/SECRET_SCREEN.mp4" },
])("refuses at the renderer boundary if the native arguments ever carry %j", async (tamper) => {
	const f = await illustrationFixture(root),
		native = vi.fn(async (_c: unknown, _s: string, _f: number, frames: number[]) => [
			{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") },
		]);
	// A project that changes between the check and the render is caught by the pinned-file check
	// first; this drives the last guard directly through the service's own renderer hook.
	const original = sceneDescription.buildNativeClipList;
	let builds = 0;
	vi.spyOn(sceneDescription, "buildNativeClipList").mockImplementation((document) => {
		const built = original(document);
		// The fourth build is the one inside captureFrame whose result is handed to the renderer.
		return ++builds === 4 ? built.map((clip) => ({ ...clip, ...tamper })) : built;
	});
	const failure = await illustrateLessonStepFile(f.request, authority, native).catch(
		(error) => error,
	);
	vi.restoreAllMocks();
	expect(failure).toBeInstanceOf(LessonOperationError);
	expect(failure.code).toBe("illustration-unsupported");
	expect(builds).toBe(4);
	expect(native).not.toHaveBeenCalled();
	await expect(fs.stat(f.request.outputPath)).rejects.toThrow();
});
