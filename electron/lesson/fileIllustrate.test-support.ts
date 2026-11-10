import fs from "node:fs/promises";
import path from "node:path";
import {
	annotationRegionSchema,
	createAudioTrack,
	createEmptyDocument,
} from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";

/** One file-bearing dependency the caller did not, and cannot, grant. */
export const UNGRANTED_DEPENDENCIES = [
	"webcam",
	"image-background",
	"image-annotation",
	"added-audio",
	"webcam-effect",
	"cursor-sidecar",
] as const;
export type UngrantedDependency = (typeof UNGRANTED_DEPENDENCIES)[number];
/** A screen-only project and lesson on disk, with optional canary dependencies that are never created
 *  as files: a correct refusal must not need to read them. */
export async function illustrationFixture(root: string, add: readonly UngrantedDependency[] = []) {
	const source = path.join(root, "screen.mp4"),
		secret = (name: string) => path.join(root, "private", name);
	await fs.writeFile(source, "video bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Project" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Source",
			originalPath: source,
			cameraTrack: add.includes("webcam")
				? { sourcePath: secret("SECRET_CAMERA.mp4"), startMs: 0, offsetMs: 0, visible: true }
				: null,
		},
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
	doc.legacyEditor = {
		aspectRatio: "16:9",
		wallpaper: add.includes("image-background") ? secret("SECRET_BG.jpg") : "#ffffff",
		...(add.includes("webcam-effect")
			? { webcamBackgroundMode: "custom", webcamWallpaper: secret("SECRET_EFFECT_BG.jpg") }
			: {}),
	};
	if (add.includes("image-annotation"))
		doc.annotations = [
			annotationRegionSchema.parse({
				id: "note",
				type: "image",
				content: secret("SECRET_ANNOTATION.png"),
				startMs: 0,
				endMs: 9000,
				position: { x: 10, y: 10 },
				size: { width: 30, height: 30 },
				style: {},
				zIndex: 1,
			}),
		];
	if (add.includes("added-audio")) {
		doc.assets.push({
			id: "music",
			kind: "audio",
			label: "Music",
			originalPath: secret("SECRET_AUDIO.wav"),
			cameraTrack: null,
		} as (typeof doc.assets)[number]);
		doc.audioTracks = [createAudioTrack({ assetId: "music", durationSec: 5 })];
	}
	if (add.includes("cursor-sidecar")) await fs.writeFile(`${source}.cursor.json`, "SECRET_CURSOR");
	const step = { ...newStep("Shown"), status: "reviewed" as const, instructions: "Kept" },
		lesson = { ...newLesson("L"), steps: [step, newStep("Other")] },
		manifestPath = path.join(root, "lesson.json"),
		projectPath = path.join(root, "project.openscreen"),
		raw = JSON.stringify(lesson),
		project = JSON.stringify(doc);
	await fs.writeFile(manifestPath, raw);
	await fs.writeFile(projectPath, project);
	return {
		doc,
		step,
		raw,
		project,
		source,
		manifestPath,
		projectPath,
		request: {
			manifestPath,
			projectPath,
			projectId: "p",
			stepId: step.id,
			rulerSec: 2.5,
			imageAlt: "Described frame",
			sourcePaths: [source],
			outputPath: path.join(root, "illustrated.json"),
		},
	};
}
