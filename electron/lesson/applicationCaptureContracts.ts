import path from "node:path";
import { z } from "zod";

const absolutePath = z.string().min(1).max(4096).refine(path.isAbsolute, "Choose an absolute path");
const observationId = z.string().min(1).max(200);
export const inspectApplicationCaptureFileSchema = z
	.object({
		capturePath: absolutePath,
		offset: z.number().int().min(0).max(10000).default(0),
		limit: z.number().int().min(1).max(200).default(200),
	})
	.strict();
export const draftApplicationCaptureFileSchema = z
	.object({
		capturePath: absolutePath,
		outputPath: absolutePath,
		title: z.string().min(1).max(300),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
		observationIds: z
			.array(observationId)
			.min(1)
			.max(200)
			.refine((ids) => new Set(ids).size === ids.length, "Choose unique observation IDs"),
	})
	.strict()
	.refine(
		(request) => path.resolve(request.capturePath) !== path.resolve(request.outputPath),
		"Output must be a new path separate from the selected capture",
	);
export type InspectApplicationCaptureFileRequest = z.infer<
	typeof inspectApplicationCaptureFileSchema
>;
export type DraftApplicationCaptureFileRequest = z.infer<typeof draftApplicationCaptureFileSchema>;
