import path from "node:path";
import { z } from "zod";
import { emptyLessonQuery, lessonQuerySchema } from "../../src/lib/lesson/review";
import { lmsReferenceSchema } from "../../src/lib/lesson/schema";

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
const title = z.string().min(1).max(300);
/** A brand-new lesson file at an explicit new path. */
export const createLessonFileSchema = z
	.object({ outputPath: absolutePath, title, lessonRef: lmsReferenceSchema.optional() })
	.strict();
export const newLessonStepSchema = z
	.object({
		title,
		instructions: z.string().max(12000).optional(),
		slideRef: lmsReferenceSchema.optional(),
		code: z
			.object({ language: z.string().max(40), text: z.string().min(1).max(40000) })
			.strict()
			.optional(),
	})
	.strict();
/** Appends draft steps and writes a new editable copy; the selected file is never changed. */
export const addLessonStepsFileSchema = z
	.object({
		manifestPath: absolutePath,
		outputPath: absolutePath,
		steps: z.array(newLessonStepSchema).min(1).max(50),
	})
	.strict();
export type CreateLessonFileRequest = z.infer<typeof createLessonFileSchema>;
export type AddLessonStepsFileRequest = z.infer<typeof addLessonStepsFileSchema>;
export type QueryLessonFileRequest = z.infer<typeof queryLessonFileSchema>;
export type ExportLessonFileRequest = z.infer<typeof exportLessonFileSchema>;
