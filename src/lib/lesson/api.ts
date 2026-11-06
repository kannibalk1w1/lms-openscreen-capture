import type { LessonImage, LessonManifest } from "./schema";
export type LessonResult<T> =
	| { success: true; result: T }
	| { success: false; code: "lesson-operation-failed" };
export interface LessonApi {
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
