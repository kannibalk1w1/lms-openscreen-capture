import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import type { LessonManifest } from "../../src/lib/lesson/schema";
import { DocumentService } from "../ai-edition/document-service";
import type { CompositorViewAddon } from "../native/compositor-view/addon";
import { CompositorViewService } from "../native-bridge/services/compositorViewService";
import { planLessonRange } from "./rangePlan";
import { captureLessonSourceIdentity } from "./sourceIdentity";
/** Synthetic metadata/native/decoder fixtures isolate authorization and receipt control. */
export async function rangeExportFixture(root: string, nativeControls = true) {
	const source = path.join(root, "PRIVATE_SOURCE.mp4");
	await fs.writeFile(source, "original source bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Generic range fixture" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "screen",
			originalPath: source,
			cameraTrack: null,
			durationSec: 5,
			video: { codec: "h264", fps: 30, width: 640, height: 360 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 5,
			timelineStartSec: 0,
			timelineEndSec: 5,
			origin: "user",
			reason: "fixture",
			wordRefs: [],
		},
	];
	doc.timeline.trimRanges = [
		{ id: "cut", assetId: "a", clipId: "c", startSec: 1, endSec: 2, origin: "user", reason: "cut" },
	];
	doc.legacyEditor = {
		aspectRatio: "16:9",
		wallpaper: "#ffffff",
		speedRegions: [{ id: "speed", startMs: 2000, endMs: 4000, speed: 2 }],
	};
	const documents = new DocumentService(path.join(root, "projects"), root);
	const saved = await documents.saveProject(doc),
		reference = await planLessonRange(saved, {
			projectId: "p",
			documentSha256: await lessonRenderFingerprint(saved),
			startSec: 0.5,
			endSec: 4,
		});
	const pin = await captureLessonSourceIdentity({
		selection: reference,
		intent: "author-current",
		readDocument: (id) => documents.getSavedProject(id),
	});
	const step = { ...newStep("Selected step"), mediaSelection: pin },
		lesson: LessonManifest = { ...newLesson("Fixture lesson"), steps: [step] };
	const native = vi.fn(async (_clips: unknown, target: string) => {
		await fs.writeFile(target, "mock selected MP4");
		return { frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 };
	});
	const cancel = vi.fn(() => true),
		frames = vi.fn(async () => null);
	const compositor = new CompositorViewService({
		addon: {
			exportMulti: native,
			...(nativeControls ? { createMp4ExportControl: () => ({}), cancelMp4Export: cancel } : {}),
			renderFrames: frames,
		} as unknown as CompositorViewAddon,
	});
	const request = () => ({
		operationId: randomUUID(),
		lesson,
		stepId: step.id,
		includedStepIds: [step.id],
	});
	return {
		source,
		doc: saved,
		documents,
		pin,
		reference,
		step,
		lesson,
		native,
		cancel,
		compositor,
		request,
	};
}
