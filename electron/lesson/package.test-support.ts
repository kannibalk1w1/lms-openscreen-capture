import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { newStep } from "../../src/lib/lesson/authoring";
import { imageFixture } from "../../src/lib/lesson/fixtures.test-support";
import { exportLessonRangeFile } from "./fileExport";
import { setup } from "./fileExport.test-support";
export async function fakePackageVideo(file: string, expected?: { frames: number; fps: number }) {
	const bytes = await fs.readFile(file);
	return {
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		samples: {
			sampleCount: expected?.frames ?? 45,
			durationSec: (expected?.frames ?? 45) / (expected?.fps ?? 30),
		},
		decoded: { frames: expected?.frames ?? 45 },
	} as Awaited<ReturnType<typeof import("./encodedVideo").validateRangeVideo>>;
}
export async function packageFixture(root: string) {
	const authoring = path.join(root, "authoring");
	await fs.mkdir(authoring);
	const f = await setup(authoring),
		outputDirectory = path.join(root, "output");
	await fs.mkdir(outputDirectory);
	const rendered = await exportLessonRangeFile(f.request, f.authority, f.render);
	if (rendered.status !== "materialized") throw new Error("fixture export refused");
	const image = await imageFixture();
	image.source.projectId = "PRIVATE_IMAGE_SOURCE";
	const lesson = {
		...f.lesson,
		extensions: { private: { journal: "PRIVATE_RAW_JOURNAL" } },
		assets: [image],
		steps: [
			{
				...f.step,
				instructions: "Public selected instructions",
				evidence: [
					{
						kind: "typing-section" as const,
						sessionId: "PRIVATE_EVIDENCE_SESSION",
						clock: "unmapped" as const,
						provenance: "observed" as const,
					},
				],
				imageId: image.id,
				imageAlt: "A safe selected illustration",
				code: { language: "plain", text: "PRIVATE_SELECTED_CODE" },
				mediaSelection: {
					...f.pin,
					previousSelections: [
						{ ...f.reference, projectId: "PRIVATE_PIN_HISTORY", documentSha256: "ab".repeat(32) },
					],
				},
			},
			{
				...newStep("Excluded"),
				instructions: "PRIVATE_EXCLUDED_INSTRUCTIONS",
				code: { language: "plain", text: "PRIVATE_EXCLUDED_CODE" },
			},
		],
	};
	await fs.writeFile(f.request.manifestPath, JSON.stringify(lesson));
	const request = {
		manifestPath: f.request.manifestPath,
		stepIds: [f.step.id],
		includeCode: false,
		imagePolicy: "exclude" as const,
		media: [
			{
				stepId: f.step.id,
				mediaPath: path.join(rendered.path, "range.mp4"),
				receiptPath: path.join(rendered.path, "range-export.json"),
			},
		],
		outputDirectory,
	};
	return { ...f, authoring, outputDirectory, request, rendered, lesson, image };
}
