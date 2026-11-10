/** Shared contract between the read-only lesson player window and main. No filesystem paths. */
export const LESSON_PLAYER_MEDIA_SCHEME = "openscreen-lesson-media";

export type LessonPlayerCode =
	| "lesson-player-unavailable"
	| "lesson-player-busy"
	| "lesson-player-limit"
	| "lesson-package-invalid"
	| "lesson-package-cancelled"
	| "lesson-package-unsupported"
	| "lesson-package-tool-unavailable";

export type LessonPlayerResult<T> =
	| { success: true; result: T }
	| { success: false; code: LessonPlayerCode };

export interface LessonPlayerStep {
	id: string;
	title: string;
	instructions: string;
	code?: { language: string; text: string };
	/** A JPEG embedded in the verified lesson, as a data URL. */
	image?: { src: string; alt: string; width: number; height: number };
	/** The step's verified MP4, served only through the window's own capability. */
	video?: { src: string; durationSec: number; width: number; height: number };
}

export interface LessonPlayerView {
	status: "opened";
	title: string;
	lessonRef?: string;
	steps: LessonPlayerStep[];
	/** What opening checked: local readback and full video decode, never audio. */
	checks: { videos: number; audioChecked: false; authenticity: "local-readback-not-signature" };
}

export interface LessonPlayerApi {
	open(): Promise<LessonPlayerResult<LessonPlayerView | { status: "cancelled" }>>;
	cancel(): Promise<void>;
	close(): Promise<void>;
}

export const lessonPlayerMediaUrl = (token: string, stepId: string) =>
	`${LESSON_PLAYER_MEDIA_SCHEME}://${token}/${stepId}`;
