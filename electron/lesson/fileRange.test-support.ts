import fs from "node:fs/promises";
import path from "node:path";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
export async function fixture(directory: string) {
	const source = path.join(directory, "source.mp4"),
		projectPath = path.join(directory, "project.openscreen"),
		manifestPath = path.join(directory, "lesson.json");
	await fs.writeFile(source, "synthetic source bytes");
	const document = createEmptyDocument({ projectId: "project", title: "Generic fixture" });
	document.assets = [
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
	document.timeline.clips = [
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
	document.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	const step = newStep("Step"),
		lesson = {
			...newLesson("Private lesson"),
			steps: [{ ...step, instructions: "PRIVATE_CODE_CANARY" }],
		};
	await fs.writeFile(projectPath, JSON.stringify(document));
	await fs.writeFile(manifestPath, JSON.stringify(lesson));
	return {
		document,
		lesson,
		source,
		projectPath,
		manifestPath,
		request: {
			manifestPath,
			projectPath,
			outputPath: path.join(directory, "confirmed.json"),
			projectId: "project",
			stepId: step.id,
			startSec: 0.5,
			endSec: 4,
			sourcePaths: [source],
			intent: "author-current" as const,
		},
	};
}
