import type { LessonMediaSelection, LessonRangeRequest } from "./mediaSelection";
import type { LessonImage, LessonManifest } from "./schema";
export type LessonErrorCode =
	| "lesson-operation-failed"
	| "project-changed"
	| "frame-unavailable"
	| "illustration-unsupported"
	| "range-unavailable"
	| "range-target-changed"
	| "range-source-unavailable"
	| "range-source-unsupported"
	| "range-source-changed"
	| "range-source-cancelled"
	| "render-busy"
	| "range-export-unattested"
	| "range-export-unsupported"
	| "range-export-changed"
	| "range-export-incomplete"
	| "range-export-tool-unavailable"
	| "range-export-cancelled"
	| "range-export-source-unavailable"
	| "destination-exists"
	| "lesson-file-changed"
	| "lesson-file-unavailable"
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
/** Opaque permission for one explicitly chosen file, plus its path for display only. */
export interface LessonFileHandle {
	token: string;
	path: string;
}
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
	) => Promise<
		LessonResult<
			{ status: "saved"; path: string; file?: LessonFileHandle } | { status: "cancelled" }
		>
	>;
	/** Update the file main last opened or saved for this window; the renderer names no path. */
	lessonSaveCurrent?: (input: {
		token: string;
		lesson: LessonManifest;
	}) => Promise<LessonResult<{ status: "saved"; path: string; file: LessonFileHandle }>>;
	lessonOpen?: () => Promise<
		LessonResult<
			| { status: "opened"; lesson: LessonManifest; file?: LessonFileHandle }
			| { status: "cancelled" }
		>
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

/** Fixed transport wording for a refused headless illustration; names kinds, never paths. */
export const illustrationUnsupportedMessage =
	"Headless illustration supports screen-only projects. This project uses a webcam, an image background, an image annotation, added audio, a click sound, a webcam effect or a recorded cursor file beside a source video, so nothing was rendered or saved. Remove those from a copy of the project, or illustrate this step in the editor.";
/** Fixed transport wording; the editor uses its matching translated catalog key. */
export const rangeExportToolUnavailableMessage =
	"The video verification tool is unavailable. Reinstall or update OpenScreen, or ask your administrator to check the configured FFmpeg tool, then retry. Unverified files are kept; this is not a completed export.";
