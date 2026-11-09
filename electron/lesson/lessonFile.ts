import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fsyncSync,
	openSync,
	renameSync,
	unlinkSync,
	writeSync,
} from "node:fs";
import path from "node:path";
import { LessonOperationError } from "../../src/lib/lesson/api";
import {
	type LessonManifest,
	MAX_LESSON_BYTES,
	parseLesson,
	validateLesson,
} from "../../src/lib/lesson/schema";
import { readSelectedFileSnapshot } from "./selectedFile";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Main-held permission to update one file the user explicitly opened or saved. Never a renderer path. */
export interface LessonFileGrant {
	token: string;
	target: string;
	identity: string;
	sha256: string;
	lessonId: string;
	revision: number;
}
/** Null when the selected path cannot be pinned (for example through a symlink): no update permission. */
export async function grantLessonFile(
	target: string,
	expected?: Uint8Array,
): Promise<{ grant: LessonFileGrant; lesson: LessonManifest } | null> {
	try {
		const snapshot = readSelectedFileSnapshot(target, MAX_LESSON_BYTES);
		if (expected && !snapshot.bytes.equals(expected)) return null;
		const lesson = await parseLesson(snapshot.bytes.toString("utf8"));
		return {
			lesson,
			grant: {
				token: randomUUID(),
				target,
				identity: snapshot.identity,
				sha256: digest(snapshot.bytes),
				lessonId: lesson.id,
				revision: lesson.revision,
			},
		};
	} catch {
		return null;
	}
}
/** Atomic private replacement of the granted file only while it is still exactly what was last read. */
export async function replaceLessonFile(
	grant: LessonFileGrant,
	input: unknown,
): Promise<LessonFileGrant> {
	const lesson = await validateLesson(input);
	// A different or older lesson must not overwrite the opened file's later content.
	if (lesson.id !== grant.lessonId || lesson.revision < grant.revision)
		throw new LessonOperationError("lesson-file-changed");
	const bytes = Buffer.from(JSON.stringify(lesson, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES) throw new LessonOperationError("lesson-operation-failed");
	const assertUnchanged = () => {
		try {
			const now = readSelectedFileSnapshot(grant.target, MAX_LESSON_BYTES);
			if (now.identity === grant.identity && digest(now.bytes) === grant.sha256) return;
		} catch {
			/* Missing, replaced by a link or unreadable: the same conflict for the author. */
		}
		throw new LessonOperationError("lesson-file-changed");
	};
	assertUnchanged();
	const stage = path.join(
		path.dirname(grant.target),
		`.${path.basename(grant.target)}.${randomUUID()}.partial`,
	);
	const fd = openSync(
		stage,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
		0o600,
	);
	try {
		try {
			for (let at = 0; at < bytes.length; ) at += writeSync(fd, bytes, at, bytes.length - at);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		const written = readSelectedFileSnapshot(stage, MAX_LESSON_BYTES);
		if (!written.bytes.equals(bytes)) throw new LessonOperationError("lesson-operation-failed");
		await parseLesson(written.bytes.toString("utf8"));
		// One turn: the target is still the granted content and the stage is still ours, then replace.
		assertUnchanged();
		if (readSelectedFileSnapshot(stage, MAX_LESSON_BYTES).identity !== written.identity)
			throw new LessonOperationError("lesson-operation-failed");
		renameSync(stage, grant.target);
	} catch (error) {
		try {
			unlinkSync(stage);
		} catch {
			/* Already renamed or never created. */
		}
		throw error;
	}
	const after = readSelectedFileSnapshot(grant.target, MAX_LESSON_BYTES);
	if (!after.bytes.equals(bytes)) throw new LessonOperationError("lesson-file-changed");
	return { ...grant, identity: after.identity, sha256: digest(bytes), revision: lesson.revision };
}
