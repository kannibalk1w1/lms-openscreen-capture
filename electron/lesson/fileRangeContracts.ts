import path from "node:path";
import { z } from "zod";

const absolute = z
	.string()
	.min(1)
	.max(4096)
	.refine((value) => path.isAbsolute(value));
/** Every filesystem authority is explicit; project/lesson declarations grant no source access. */
export const confirmLessonFileRangeSchema = z
	.object({
		manifestPath: absolute,
		projectPath: absolute,
		outputPath: absolute,
		projectId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
		stepId: z.string().uuid(),
		startSec: z.number().finite().min(0).max(86400),
		endSec: z.number().finite().min(0).max(86400),
		sourcePaths: z
			.array(absolute)
			.min(1)
			.max(8)
			.refine((paths) => new Set(paths).size === paths.length),
		intent: z.enum(["author-current", "refresh-current"]),
	})
	.strict()
	.refine((value) => value.endSec > value.startSec);
export type ConfirmLessonFileRangeRequest = z.infer<typeof confirmLessonFileRangeSchema>;
