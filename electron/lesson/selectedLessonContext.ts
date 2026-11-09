import { documentSchema } from "../../src/lib/ai-edition/schema";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { MAX_LESSON_BYTES, parseLesson } from "../../src/lib/lesson/schema";
import { readSelectedFileSnapshot } from "./selectedFile";
/** Explicit saved-file authority shared by confirmation and export, never getProject/relink/grants. */
export async function openSelectedLessonContext(
	request: { manifestPath: string; projectPath: string; projectId: string },
	check: () => void,
) {
	check();
	const lessonSnapshot = readSelectedFileSnapshot(request.manifestPath, MAX_LESSON_BYTES),
		projectSnapshot = readSelectedFileSnapshot(request.projectPath, 16 * 1024 * 1024);
	const lessonBytes = lessonSnapshot.bytes,
		projectBytes = projectSnapshot.bytes;
	const lesson = await parseLesson(lessonBytes.toString("utf8"));
	check();
	const document = documentSchema.parse(JSON.parse(projectBytes.toString("utf8")));
	if (document.project.id !== request.projectId) throw new LessonOperationError("project-changed");
	const assertCurrent = () => {
		check();
		const currentLesson = readSelectedFileSnapshot(request.manifestPath, MAX_LESSON_BYTES),
			currentProject = readSelectedFileSnapshot(request.projectPath, 16 * 1024 * 1024);
		if (
			currentLesson.identity !== lessonSnapshot.identity ||
			!currentLesson.bytes.equals(lessonBytes)
		)
			throw new LessonOperationError("range-target-changed");
		if (
			currentProject.identity !== projectSnapshot.identity ||
			!currentProject.bytes.equals(projectBytes)
		)
			throw new LessonOperationError("project-changed");
	};
	const readDocument = async (id: string) => {
		assertCurrent();
		if (id !== request.projectId) throw new LessonOperationError("project-changed");
		return document;
	};
	return { lesson, document, assertCurrent, readDocument };
}
