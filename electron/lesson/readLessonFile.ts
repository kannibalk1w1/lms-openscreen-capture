import { constants } from "node:fs";
import fs from "node:fs/promises";
import { MAX_LESSON_BYTES, parseLesson } from "../../src/lib/lesson/schema";
export async function readLessonFile(target: string) {
	if (!(await fs.lstat(target)).isFile()) throw new Error("Choose a regular lesson file");
	const file = await fs.open(
		target,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
	);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || stat.size > MAX_LESSON_BYTES) throw new Error("Invalid lesson file");
		const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_LESSON_BYTES + 1));
		let count = 0;
		while (count < buffer.length) {
			const read = await file.read(buffer, count, buffer.length - count, null);
			if (!read.bytesRead) break;
			count += read.bytesRead;
		}
		if (count > MAX_LESSON_BYTES || count > stat.size)
			throw new Error("Lesson changed or exceeds limit");
		return await parseLesson(buffer.subarray(0, count).toString("utf8"));
	} finally {
		await file.close();
	}
}
