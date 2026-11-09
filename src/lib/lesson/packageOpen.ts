import type { LessonManifest } from "./schema";
export type PackageOpenCode =
	| "lesson-package-invalid"
	| "lesson-package-cancelled"
	| "lesson-package-unsupported"
	| "lesson-package-tool-unavailable"
	| "lesson-package-busy"
	| "lesson-package-video-copy-unsupported"
	| "destination-exists";
export type PackageOpenResult<T> =
	| { success: true; result: T }
	| { success: false; code: PackageOpenCode };
export interface OpenedLessonPackage {
	status: "opened";
	token: string;
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
	lessonPackageCancel?: (operationId: string) => Promise<boolean>;
	lessonPackageRelease?: (token: string) => Promise<boolean>;
}
