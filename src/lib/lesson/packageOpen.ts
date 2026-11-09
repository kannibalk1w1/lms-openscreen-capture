import type { LessonManifest } from "./schema";
export type PackageOpenCode =
	| "lesson-package-invalid"
	| "lesson-package-cancelled"
	| "lesson-package-unsupported"
	| "lesson-package-tool-unavailable"
	| "lesson-package-busy"
	| "lesson-package-video-copy-unsupported"
	| "destination-exists"
	| "lesson-package-destination-invalid"
	| "lesson-package-video-selection-invalid"
	| "lesson-package-edit-unsupported";
export type PackageOpenResult<T> =
	| { success: true; result: T }
	| { success: false; code: PackageOpenCode; capability?: "retained" | "reopen-required" };
export interface OpenedLessonPackage {
	status: "opened";
	token: string;
	snapshotSha256: string;
	lesson: LessonManifest;
	videos: Array<{ stepId: string; frames: number; durationSec: number }>;
	images: "exclude" | "include-external-provenance";
}
export interface LessonPackageOpenApi {
	lessonPackageOpen?: (
		operationId: string,
	) => Promise<PackageOpenResult<OpenedLessonPackage | { status: "cancelled" }>>;
	lessonPackageCopy?: (input: {
		operationId: string;
		token: string;
	}) => Promise<PackageOpenResult<{ status: "saved"; path: string } | { status: "cancelled" }>>;
	lessonPackageReseal?: (input: {
		operationId: string;
		token: string;
		lesson: LessonManifest;
	}) => Promise<
		PackageOpenResult<
			| {
					status: "packaged";
					path: string;
					lessonId: string;
					steps: number;
					images: number;
					videos: number;
			  }
			| { status: "cancelled" }
		>
	>;
	lessonPackageCancel?: (operationId: string) => Promise<boolean>;
	lessonPackageRelease?: (token: string) => Promise<boolean>;
}
/** Separate from inspection: the editor's own lesson, with folders chosen in native dialogs only. */
export interface LessonPackageCreateApi {
	lessonPackageCreate?: (input: {
		operationId: string;
		lesson: LessonManifest;
		stepIds: string[];
		includeCode: boolean;
		imagePolicy: "exclude" | "include-external-provenance";
		includeVideos: boolean;
	}) => Promise<
		PackageOpenResult<
			| { status: "packaged"; path: string; steps: number; images: number; videos: number }
			| { status: "cancelled" }
		>
	>;
}
