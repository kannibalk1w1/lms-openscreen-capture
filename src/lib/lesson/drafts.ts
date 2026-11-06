import type { LessonManifest } from "./schema";
export const MAX_LOCAL_DRAFTS = 20;
export const MAX_LOCAL_DRAFT_BYTES = 64 * 1024 * 1024;
export interface LocalDraftStatus {
	path: string;
	limited: boolean;
	copies: number;
	bytes: number;
	maxCopies: number;
	maxBytes: number;
}
export interface LocalDraftEntry {
	id: string;
	title: string;
	revision: number;
	bytes: number;
	savedAt: string;
	readable: boolean;
}
export interface LocalDraftApi {
	lessonDraftStatus?: () => Promise<import("./api").LessonResult<LocalDraftStatus>>;
	lessonDraftSave?: (
		lesson: LessonManifest,
	) => Promise<
		import("./api").LessonResult<{ id: string; path: string; lessonId: string; revision: number }>
	>;
	lessonDraftList?: () => Promise<import("./api").LessonResult<LocalDraftEntry[]>>;
	lessonDraftRead?: (id: string) => Promise<import("./api").LessonResult<LessonManifest>>;
	lessonDraftRemove?: (id: string) => Promise<import("./api").LessonResult<{ removed: boolean }>>;
}
