import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { attachLessonIllustration, reviseLesson } from "../../src/lib/lesson/authoring";
import {
	buildLessonSceneDescription,
	lessonRenderFingerprint,
} from "../../src/lib/lesson/frameSource";
import { MAX_LESSON_BYTES, validateLesson } from "../../src/lib/lesson/schema";
import { buildNativeClipList } from "../../src/native/sceneDescription";
import { RangeMediaError } from "./rangeErrors";
import { unsupportedRenderDependencies } from "./renderDependencies";
import { openSelectedLessonContext } from "./selectedLessonContext";
import { LessonService } from "./service";
import { requireNoCursorSidecar } from "./sourceFiles";

const absolute = z
	.string()
	.min(1)
	.max(4096)
	.refine((value) => path.isAbsolute(value));
export const illustrateLessonStepFileSchema = z
	.object({
		manifestPath: absolute,
		projectPath: absolute,
		projectId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
		stepId: z.string().uuid(),
		rulerSec: z.number().finite().nonnegative().max(86400),
		imageAlt: z
			.string()
			.max(1000)
			.refine((value) => value.trim().length > 0),
		sourcePaths: z
			.array(absolute)
			.min(1)
			.max(8)
			.refine((paths) => new Set(paths).size === paths.length),
		outputPath: absolute,
	})
	.strict();
export type IllustrateLessonStepFileRequest = z.infer<typeof illustrateLessonStepFileSchema>;
export type LessonFrameRenderer = ConstructorParameters<typeof LessonService>[1];
/**
 * Headless form of the editor's "Illustrate from current saved playhead": one composed frame of an
 * explicitly selected saved project, attached to one step and saved as a new lesson copy.
 * Every screen source the project plays must be named by the caller; nothing is discovered or relinked.
 * Any other file-bearing dependency (webcam, image background or annotation, added audio, click
 * sound, webcam effect, recorded cursor file) is refused before rendering.
 */
export async function illustrateLessonStepFile(
	input: unknown,
	authority: { signal?: AbortSignal; assertCurrent(): void },
	renderFrames: LessonFrameRenderer,
) {
	const check = () => {
		authority.assertCurrent();
		if (authority.signal?.aborted) throw new Error("cancelled");
	};
	check();
	const request = illustrateLessonStepFileSchema.parse(input);
	const context = await openSelectedLessonContext(request, check);
	const step = context.lesson.steps.find((value) => value.id === request.stepId);
	if (!step) throw new Error("Unknown step");
	// What the renderer would be handed, computed from the pinned project bytes only.
	const clips = buildNativeClipList(context.document),
		scene = buildLessonSceneDescription(context.document);
	// The same file named with redundant segments is still the file the caller granted.
	const granted = new Set(request.sourcePaths.map((value) => path.resolve(value)));
	const isGranted = (source: string | undefined) =>
		!!source && path.isAbsolute(source) && granted.has(path.resolve(source));
	// Refuse by kind, before any filesystem or native access, every dependency that is not a
	// granted screen source. Nothing is granted implicitly, substituted or dropped from the picture.
	if (!clips.length || unsupportedRenderDependencies(clips, scene).length)
		throw new LessonOperationError("illustration-unsupported");
	const sources = new Map(context.document.assets.map((asset) => [asset.id, asset.originalPath]));
	const screens = new Set<string>();
	for (const source of [
		...context.document.timeline.clips.map((clip) => sources.get(clip.assetId)),
		...clips.map((clip) => clip.screenPath),
	]) {
		if (!isGranted(source)) throw new Error("Source not granted");
		screens.add(path.resolve(source!));
	}
	for (const source of screens) {
		if (realpathSync(source) !== source) throw new Error("Source not granted");
		// The renderer would read a recorded cursor file beside a source without being asked to.
		await requireNoCursorSidecar(source, authority.signal).catch((error) => {
			if (error instanceof RangeMediaError && error.code === "range-media-cancelled") throw error;
			throw new LessonOperationError("illustration-unsupported");
		});
	}
	check();
	// Last line of defence on the exact native arguments: only granted screens, nothing else.
	const guarded: LessonFrameRenderer = (nativeClips, sceneJson, ...rest) => {
		check();
		if (
			!nativeClips.length ||
			nativeClips.some((clip) => !isGranted(clip.screenPath)) ||
			unsupportedRenderDependencies(nativeClips, JSON.parse(sceneJson)).length
		)
			throw new LessonOperationError("illustration-unsupported");
		return renderFrames(nativeClips, sceneJson, ...rest);
	};
	const image = await new LessonService(context.readDocument, guarded).captureFrame({
		projectId: request.projectId,
		rulerSec: request.rulerSec,
		documentSha256: await lessonRenderFingerprint(context.document),
	});
	context.assertCurrent();
	const attached = attachLessonIllustration(
		context.lesson,
		{
			lessonId: context.lesson.id,
			stepId: step.id,
			revision: context.lesson.revision,
			imageId: step.imageId,
		},
		image,
	);
	if (attached === context.lesson) throw new Error("Illustration target changed");
	// The caller describes the picture; the step is draft, so a person still reviews pixels and text.
	const next = await validateLesson(
		reviseLesson(attached, {
			steps: attached.steps.map((value) =>
				value.id === step.id ? { ...value, imageAlt: request.imageAlt } : value,
			),
		}),
	);
	const bytes = Buffer.from(JSON.stringify(next, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES) throw new Error("Lesson exceeds limit");
	context.assertCurrent();
	await fs.writeFile(request.outputPath, bytes, { flag: "wx", mode: 0o600 });
	return {
		status: "saved" as const,
		path: request.outputPath,
		lessonId: next.id,
		revision: next.revision,
		stepId: step.id,
		image: {
			id: image.id,
			width: image.width,
			height: image.height,
			sha256: image.sha256,
			rulerSec: request.rulerSec,
		},
	};
}
