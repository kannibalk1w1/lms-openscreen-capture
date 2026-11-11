import path from "node:path";
import { z } from "zod";
import { lessonHandoffSchema, lessonVerificationSchema } from "../../src/lib/lesson/schema";

const absolutePath = z
	.string()
	.min(1)
	.max(4096)
	.refine((v) => path.isAbsolute(v));
const stepId = z.string().uuid();
const reason = z.string().trim().min(1).max(2000);
export const lessonWorkflowChangeSchema = z.discriminatedUnion("operation", [
	z
		.object({
			operation: z.literal("replace"),
			stepId,
			sourcePath: absolutePath,
			sourceStepId: stepId,
			reason,
		})
		.strict(),
	z.object({ operation: z.literal("restore"), stepId, retakeId: stepId, reason }).strict(),
	z
		.object({
			operation: z.literal("verify"),
			stepId,
			check: lessonVerificationSchema.pick({ expected: true, observed: true, outcome: true }),
		})
		.strict(),
	z
		.object({
			operation: z.literal("handoff"),
			handoff: lessonHandoffSchema.omit({ id: true, lessonRevision: true }),
		})
		.strict(),
]);
export const lessonWorkflowFileSchema = z
	.object({
		manifestPath: absolutePath,
		outputPath: absolutePath,
		expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		change: lessonWorkflowChangeSchema,
	})
	.strict();
