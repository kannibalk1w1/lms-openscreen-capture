import fs from "node:fs/promises";
import path from "node:path";
import { createLessonFileLifecycle } from "./fileLifecycle";
import { rangeExportFixture } from "./rangeExport.test-support";
export async function setup(directory: string, controls = true) {
	const f = await rangeExportFixture(directory, controls),
		manifestPath = path.join(directory, "lesson.json");
	await fs.writeFile(manifestPath, JSON.stringify(f.lesson));
	const request = {
		manifestPath,
		projectPath: f.documents.filePathFor("p"),
		projectId: "p",
		stepId: f.step.id,
		includedStepIds: [f.step.id],
		sourcePaths: [f.source],
		outputDirectory: directory,
	};
	const lifecycle = createLessonFileLifecycle();
	const render = (...args: Parameters<typeof f.compositor.startExportMulti>) =>
		f.compositor.startExportMulti(...args);
	const authority = {
		owner: lifecycle.owner,
		assertCurrent: () => {
			/* Explicit authorized saved files. */
		},
	};
	return { ...f, request, lifecycle, render, authority };
}
