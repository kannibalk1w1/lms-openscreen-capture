import type { LessonMediaSelection, LessonRangeRequest } from "./mediaSelection";
import type { LessonImage, LessonManifest } from "./schema";
export type LessonErrorCode =
	| "lesson-operation-failed"
	| "project-changed"
	| "frame-unavailable"
	| "range-unavailable"
	| "range-target-changed"
	| "range-source-unavailable"
	| "range-source-unsupported"
	| "range-source-changed"
	| "range-source-cancelled"
	| "render-busy"
	| "destination-exists"
	| "local-draft-limit"
	| "local-draft-unavailable";
export class LessonOperationError extends Error {
	constructor(readonly code: LessonErrorCode) {
		super(code);
	}
}
export type LessonResult<T> =
	| { success: true; result: T }
	| { success: false; code: LessonErrorCode };
export interface LessonApi {
	lessonConfirmRange?: (input: {
		operationId: string;
		lesson: LessonManifest;
		stepId: string;
		range: LessonRangeRequest;
		intent: "author-current" | "refresh-current";
	}) => Promise<LessonResult<LessonMediaSelection>>;
	lessonCancelRange?: (operationId: string) => Promise<LessonResult<boolean>>;
	lessonPlanRange?: (input: LessonRangeRequest) => Promise<LessonResult<LessonMediaSelection>>;
	lessonFrame?: (input: {
		projectId: string;
		rulerSec: number;
		documentSha256: string;
	}) => Promise<LessonResult<LessonImage>>;
	lessonSave?: (
		input: LessonManifest,
	) => Promise<LessonResult<{ status: "saved"; path: string } | { status: "cancelled" }>>;
	lessonOpen?: () => Promise<
		LessonResult<{ status: "opened"; lesson: LessonManifest } | { status: "cancelled" }>
	>;
	lessonExport?: (
		input: LessonManifest,
		ids: string[],
	) => Promise<
		LessonResult<
			{ status: "exported"; path: string; steps: number; images: number } | { status: "cancelled" }
		>
	>;
}
