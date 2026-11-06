import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
	projectRawTimelineSecToPlayback,
	readSpeedRegions,
} from "../../src/lib/ai-edition/document/timeline";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { keptRawSpans } from "../../src/lib/ai-edition/timeline/programme-time";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { renderLessonGuide } from "../../src/lib/lesson/export";
import {
	buildLessonSceneDescription,
	lessonRenderFingerprint,
} from "../../src/lib/lesson/frameSource";
import {
	decodeImage,
	jpegDimensions,
	type LessonImage,
	parseLesson,
	sha256,
	validateLesson,
} from "../../src/lib/lesson/schema";
import type { CompositorClipInput } from "../../src/native/contracts";
import { buildNativeClipList } from "../../src/native/sceneDescription";
export type LessonRenderFrames = (
	clips: CompositorClipInput[],
	scene: string,
	fps: number,
	frames: number[],
	maxWidth: number,
) => Promise<Array<{ index: number; width: number; height: number; jpeg: Buffer }> | null>;
const frameRequest = z
	.object({
		projectId: z.string().min(1).max(200),
		rulerSec: z.number().finite().nonnegative().max(86400),
		documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export class LessonService {
	private rendering = false;
	constructor(
		private readonly readDocument: (id: string) => Promise<AxcutDocument>,
		private readonly renderFrames: LessonRenderFrames,
	) {}
	async captureFrame(input: unknown): Promise<LessonImage> {
		if (this.rendering) throw new LessonOperationError("render-busy");
		const request = frameRequest.parse(input);
		this.rendering = true;
		try {
			const doc = await this.readDocument(request.projectId);
			const digest = await lessonRenderFingerprint(doc);
			if (doc.project.id !== request.projectId || digest !== request.documentSha256)
				throw new LessonOperationError("project-changed");
			const visible = keptRawSpans(doc.timeline.clips, doc.timeline.trimRanges).some(
				(span) => request.rulerSec >= span.startSec && request.rulerSec < span.endSec,
			);
			if (!visible) throw new LessonOperationError("frame-unavailable");
			const paths = new Map(doc.assets.map((asset) => [asset.id, asset.originalPath]));
			if (doc.timeline.clips.some((clip) => !paths.get(clip.assetId)))
				throw new Error("Project source is missing");
			const programmeSec = projectRawTimelineSecToPlayback(
				doc.timeline.clips,
				doc.timeline.trimRanges,
				request.rulerSec,
				readSpeedRegions(doc),
			);
			const index = Math.floor(programmeSec * 60 + 1e-6);
			const frames = await this.renderFrames(
				buildNativeClipList(doc),
				JSON.stringify(buildLessonSceneDescription(doc)),
				60,
				[index],
				1280,
			);
			const frame = frames?.find((frame) => frame.index === index);
			if (!frame || frame.jpeg.length > 1024 * 1024)
				throw new Error("Native lesson frame unavailable or too large");
			const size = jpegDimensions(frame.jpeg);
			if (
				size.width !== frame.width ||
				size.height !== frame.height ||
				size.width > 4096 ||
				size.height > 4096 ||
				size.width * size.height > 8388608
			)
				throw new Error("Invalid native frame");
			return {
				id: randomUUID(),
				mime: "image/jpeg",
				base64: frame.jpeg.toString("base64"),
				sha256: await sha256(frame.jpeg),
				width: frame.width,
				height: frame.height,
				source: {
					...request,
					fingerprintKind: "render-inputs-v1",
					basis: "editor-ruler-seconds",
					precision: "60fps-floor",
				},
			};
		} finally {
			this.rendering = false;
		}
	}
	async saveEditable(input: unknown, pickPath: () => Promise<string | null>) {
		const lesson = await validateLesson(input);
		const target = await pickPath();
		if (!target) return { status: "cancelled" as const };
		// New paths only: never replace a user's lesson, project or existing export.
		await fs.writeFile(target, JSON.stringify(lesson, null, 2) + "\n", { flag: "wx", mode: 0o600 });
		return { status: "saved" as const, path: target };
	}
	async openEditable(pickPath: () => Promise<string | null>) {
		const target = await pickPath();
		if (!target) return { status: "cancelled" as const };
		if (!(await fs.lstat(target)).isFile()) throw new Error("Choose a regular lesson file");
		const file = await fs.open(
			target,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
		);
		try {
			const stat = await file.stat();
			if (!stat.isFile()) throw new Error("Choose a regular lesson file");
			if (stat.size > 16 * 1024 * 1024) throw new Error("Lesson file exceeds limit");
			const buffer = Buffer.alloc(16 * 1024 * 1024 + 1);
			let count = 0;
			while (count < buffer.length) {
				const read = await file.read(buffer, count, buffer.length - count, null);
				if (!read.bytesRead) break;
				count += read.bytesRead;
			}
			if (count > 16 * 1024 * 1024) throw new Error("Lesson file exceeds limit");
			const lesson = await parseLesson(buffer.subarray(0, count).toString("utf8"));
			return { status: "opened" as const, lesson };
		} finally {
			await file.close();
		}
	}
	async exportGuide(input: unknown, ids: unknown, pickDirectory: () => Promise<string | null>) {
		const selection = z.array(z.string().uuid()).min(1).max(200).parse(ids);
		const output = await renderLessonGuide(await validateLesson(input), selection);
		const parent = await pickDirectory();
		if (!parent) return { status: "cancelled" as const };
		const directory = path.join(parent, `lesson-${randomUUID()}`);
		await fs.mkdir(directory, { mode: 0o700 });
		const files = new Map<string, Uint8Array>([
			["index.html", new TextEncoder().encode(output.html)],
			["lesson.md", new TextEncoder().encode(output.markdown)],
			[
				"lesson.openscreen-lesson.json",
				new TextEncoder().encode(JSON.stringify(output.lesson, null, 2) + "\n"),
			],
		]);
		for (const image of output.lesson.assets)
			files.set(`assets/${image.id}.jpg`, decodeImage(image));
		if (output.lesson.assets.length)
			await fs.mkdir(path.join(directory, "assets"), { mode: 0o700 });
		const inventory = [];
		for (const [relative, bytes] of files) {
			await fs.writeFile(path.join(directory, relative), bytes, { flag: "wx", mode: 0o600 });
			inventory.push({ path: relative, bytes: bytes.length, sha256: await sha256(bytes) });
		}
		// Verify actual bytes before writing the completion receipt; failed folders remain inspectable.
		for (const item of inventory) {
			const bytes = await fs.readFile(path.join(directory, item.path));
			if (bytes.length !== item.bytes || (await sha256(bytes)) !== item.sha256)
				throw new Error("Guide write verification failed");
		}
		const report = {
			format: "openscreen-guide-export",
			version: 1,
			lessonId: output.lesson.id,
			revision: output.lesson.revision,
			derivedFrom: output.lesson.derivedFrom,
			stepIds: output.lesson.steps.map((step) => step.id),
			files: inventory,
			complete: true,
			limits: [
				"Author-selected material; no automatic privacy redaction or achievement attestation",
				"Native screenshots are composed frame samples; review before sharing",
			],
		};
		await fs.writeFile(
			path.join(directory, "export-report.json"),
			JSON.stringify(report, null, 2) + "\n",
			{ flag: "wx", mode: 0o600 },
		);
		return {
			status: "exported" as const,
			path: directory,
			steps: output.lesson.steps.length,
			images: output.lesson.assets.length,
		};
	}
}
