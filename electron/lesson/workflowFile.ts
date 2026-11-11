import fs from "node:fs/promises";
import { MAX_LESSON_BYTES } from "../../src/lib/lesson/schema";
import {
	recordLessonHandoff,
	recordRunVerification,
	replaceLessonStep,
	restoreLessonStep,
} from "../../src/lib/lesson/workflow";
import { readLessonFile } from "./readLessonFile";
import { lessonWorkflowFileSchema } from "./workflowContracts";

/** Explicit files only; original lessons and projects are never written. */
export async function applyLessonWorkflowFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const request = lessonWorkflowFileSchema.parse(input);
	assertCurrent();
	const lesson = await readLessonFile(request.manifestPath);
	assertCurrent();
	if (lesson.revision !== request.expectedRevision) throw new Error("Lesson revision changed");
	const change = request.change;
	let next;
	if (change.operation === "replace") {
		const source = await readLessonFile(change.sourcePath);
		assertCurrent();
		next = await replaceLessonStep(
			lesson,
			change.stepId,
			source,
			change.sourceStepId,
			change.reason,
		);
	} else if (change.operation === "restore") {
		next = await restoreLessonStep(lesson, change.stepId, change.retakeId, change.reason);
	} else if (change.operation === "verify") {
		next = await recordRunVerification(lesson, change.stepId, change.check);
	} else next = await recordLessonHandoff(lesson, change.handoff);
	const bytes = Buffer.from(JSON.stringify(next, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES) throw new Error("Lesson exceeds limit");
	assertCurrent();
	await fs.writeFile(request.outputPath, bytes, { flag: "wx", mode: 0o600 });
	assertCurrent();
	return {
		status: "saved" as const,
		path: request.outputPath,
		lessonId: next.id,
		revision: next.revision,
		operation: change.operation,
	};
}
