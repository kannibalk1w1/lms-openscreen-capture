import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { attachLessonIllustration, reviseLesson } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { MAX_LESSON_BYTES, validateLesson } from "../../src/lib/lesson/schema";
import { openSelectedLessonContext } from "./selectedLessonContext";
import { LessonService } from "./service";

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
 * Every source file the project plays must be named by the caller; nothing is discovered or relinked.
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
	const sources = new Map(context.document.assets.map((asset) => [asset.id, asset.originalPath]));
	// The same file named with redundant segments is still the file the caller granted.
	const granted = new Set(request.sourcePaths.map((value) => path.resolve(value)));
	for (const clip of context.document.timeline.clips) {
		const source = sources.get(clip.assetId);
		if (
			!source ||
			!path.isAbsolute(source) ||
			!granted.has(path.resolve(source)) ||
			realpathSync(source) !== path.resolve(source)
		)
			throw new Error("Source not granted");
	}
	check();
	const image = await new LessonService(context.readDocument, renderFrames).captureFrame({
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
