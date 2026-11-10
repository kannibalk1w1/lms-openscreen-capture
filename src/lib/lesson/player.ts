/** Shared contract between the read-only lesson player window and main. No filesystem paths. */
export const LESSON_PLAYER_MEDIA_SCHEME = "openscreen-lesson-media";
/** Playback speeds the player offers, and the only ones a saved place may hold. */
export const LESSON_PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export type LessonPlayerCode =
	| "lesson-player-unavailable"
	| "lesson-player-busy"
	| "lesson-player-limit"
	| "lesson-package-invalid"
	| "lesson-package-cancelled"
	| "lesson-package-unsupported"
	| "lesson-package-tool-unavailable"
	| "lesson-progress-unavailable"
	| "lesson-progress-full"
	| "lesson-progress-cancelled";

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
	/** Opaque capability token for this open package; required for its saved-place actions. */
	token: string;
	title: string;
	lessonRef?: string;
	steps: LessonPlayerStep[];
	/** What opening checked: local readback and full video decode, never audio. */
	checks: { videos: number; audioChecked: false; authenticity: "local-readback-not-signature" };
}

/** A learner-saved place in the open package. Main adds the package fingerprint itself. */
export interface LessonPlayerPlace {
	stepId: string;
	timeSec: number;
	speed: number;
	loop: boolean;
}

export interface LessonPlayerApi {
	open(): Promise<LessonPlayerResult<LessonPlayerView | { status: "cancelled" }>>;
	cancel(): Promise<void>;
	close(): Promise<void>;
	/** Explicit learner actions only; nothing is saved automatically. */
	savePlace?(
		token: string,
		place: LessonPlayerPlace,
	): Promise<LessonPlayerResult<{ status: "saved" }>>;
	restorePlace?(
		token: string,
	): Promise<
		LessonPlayerResult<{ status: "restored"; place: LessonPlayerPlace } | { status: "none" }>
	>;
	clearPlace?(token: string): Promise<LessonPlayerResult<{ status: "cleared"; removed: boolean }>>;
	clearAllPlaces?(): Promise<LessonPlayerResult<{ status: "cleared-all" }>>;
}

export const lessonPlayerMediaUrl = (token: string, stepId: string) =>
	`${LESSON_PLAYER_MEDIA_SCHEME}://${token}/${stepId}`;
