import path from "node:path";
import { z } from "zod";
import { emptyLessonQuery, lessonQuerySchema } from "../../src/lib/lesson/review";

// Selected file only: no app-data lookup, directory scan, recovery-store API or media access.
const absolutePath = z
	.string()
	.min(1)
	.max(4096)
	.refine((value) => path.isAbsolute(value), "Choose an absolute path");
export const queryLessonFileSchema = z
	.object({
		manifestPath: absolutePath,
		query: lessonQuerySchema.default(emptyLessonQuery),
	})
	.strict();
export const exportLessonFileSchema = z
	.object({
		manifestPath: absolutePath,
		outputDirectory: absolutePath,
		stepIds: z
			.array(z.string().uuid())
			.min(1)
			.max(200)
			.refine((ids) => new Set(ids).size === ids.length, "Choose unique steps"),
	})
	.strict();
export type QueryLessonFileRequest = z.infer<typeof queryLessonFileSchema>;
export type ExportLessonFileRequest = z.infer<typeof exportLessonFileSchema>;
