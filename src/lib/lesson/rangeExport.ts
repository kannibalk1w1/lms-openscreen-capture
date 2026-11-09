import { z } from "zod";
import type { LessonErrorCode, LessonResult } from "./api";
import type { LessonManifest } from "./schema";
export const lessonRangeExportRequestSchema = z
	.object({
		operationId: z.string().uuid(),
		lesson: z.unknown(),
		stepId: z.string().uuid(),
		includedStepIds: z.array(z.string().uuid()).min(1).max(200),
	})
	.strict();
export interface LessonRangeExportRequest {
	operationId: string;
	lesson: LessonManifest;
	stepId: string;
	includedStepIds: string[];
}
export type LessonRangeExportPhase =
	| "choosing-destination"
	| "checking-source"
	| "rendering"
	| "validating";
export const lessonRangeExportProgressSchema = z
	.object({
		operationId: z.string().uuid(),
		phase: z.enum(["choosing-destination", "checking-source", "rendering", "validating"]),
		frames: z.number().int().min(0).max(3600).optional(),
		totalFrames: z.number().int().min(1).max(3600).optional(),
	})
	.strict()
	.refine(
		(value) =>
			value.frames === undefined ||
			value.totalFrames === undefined ||
			value.frames <= value.totalFrames,
	);
export type LessonRangeExportProgress = z.infer<typeof lessonRangeExportProgressSchema>;
export type LessonRangeExportResult =
	| {
			success: true;
			result:
				| { status: "cancelled" }
				| {
						status: "materialized";
						path: string;
						frames: number;
						nativeReportedDurationSec: number;
				  };
	  }
	| { success: false; code: LessonErrorCode; artifactPath?: string };
export interface LessonRangeExportApi {
	lessonRangeExport?: (input: LessonRangeExportRequest) => Promise<LessonRangeExportResult>;
	lessonRangeExportCancel?: (id: string) => Promise<LessonResult<boolean>>;
	onLessonRangeExportProgress?: (
		callback: (progress: LessonRangeExportProgress) => void,
	) => () => void;
}
