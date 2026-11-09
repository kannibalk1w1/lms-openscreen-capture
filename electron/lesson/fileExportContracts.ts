import path from "node:path";
import { z } from "zod";

const absolute = z
	.string()
	.min(1)
	.max(4096)
	.refine((value) => path.isAbsolute(value));
export const exportLessonRangeFileSchema = z
	.object({
		manifestPath: absolute,
		projectPath: absolute,
		projectId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
		stepId: z.string().uuid(),
		includedStepIds: z.array(z.string().uuid()).length(1),
		sourcePaths: z
			.array(absolute)
			.min(1)
			.max(8)
			.refine((paths) => new Set(paths).size === paths.length),
		outputDirectory: absolute,
	})
	.strict()
	.refine((value) => value.includedStepIds[0] === value.stepId);
export type ExportLessonRangeFileRequest = z.infer<typeof exportLessonRangeFileSchema>;
