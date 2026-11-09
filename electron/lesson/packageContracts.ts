import path from "node:path";
import { z } from "zod";

const absolute = z
	.string()
	.min(1)
	.max(4096)
	.refine((value) => path.isAbsolute(value));
export const PACKAGE_MAX_BYTES = 256 * 1024 * 1024;
export const PACKAGE_MAX_FILES = 64;
export function portablePackagePath(value: string) {
	return (
		value.length <= 180 &&
		!value.includes("\\") &&
		value
			.split("/")
			.every(
				(part) =>
					part.length <= 80 &&
					/^[a-z0-9][a-z0-9._-]*$/.test(part) &&
					!part.endsWith(".") &&
					!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
					part !== "." &&
					part !== "..",
			)
	);
}
export const packageFileSchema = z
	.object({
		path: z.string().refine(portablePackagePath),
		bytes: z.number().int().min(1).max(PACKAGE_MAX_BYTES),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export const packageVideoSchema = z
	.object({
		stepId: z.string().uuid(),
		path: z.string().refine(portablePackagePath),
		width: z.number().int().min(2).max(1280),
		height: z.number().int().min(2).max(1280),
		fps: z.literal(30),
		frames: z.number().int().min(1).max(3600),
		durationSec: z
			.number()
			.finite()
			.min(1 / 30)
			.max(120),
		audio: z
			.object({ streamMetadataVerified: z.literal(false), timingVerified: z.literal(false) })
			.strict(),
		validation: z.literal("mp4-video-samples-and-full-frame-decode"),
		association: z.literal("matched-author-selected-pin-claims; original-project-not-revalidated"),
	})
	.strict();
export const packageManifestSchema = z
	.object({
		format: z.literal("openscreen-portable-lesson"),
		guideContract: z.literal("openscreen-static-guide-portable-v1"),
		version: z.literal(1),
		lessonId: z.string().uuid(),
		scope: z
			.object({
				kind: z.literal("derived-static-lesson-and-rendered-video"),
				code: z.enum(["included", "excluded"]),
				images: z.enum(["exclude", "include-external-provenance"]),
				sourceProjects: z.literal("external-unavailable"),
				sourceMedia: z.literal("not-included"),
				historyAndEvidence: z.literal("not-included"),
				nativeEditableProject: z.literal(false),
				nativeDependencies: z.literal("fonts-annotations-added-audio-branches-not-included"),
				mediaMeaning: z.literal(
					"already-rendered-video; embedded-audio-unverified; not-native-editability",
				),
			})
			.strict(),
		files: z.array(packageFileSchema).min(3).max(PACKAGE_MAX_FILES),
		videos: z.array(packageVideoSchema).max(4),
	})
	.strict();
export const packageReceiptSchema = z
	.object({
		format: z.literal("openscreen-portable-lesson-completion"),
		version: z.literal(1),
		manifest: z
			.object({
				bytes: z.number().int().min(1).max(65536),
				sha256: z.string().regex(/^[a-f0-9]{64}$/),
			})
			.strict(),
		complete: z.literal(true),
	})
	.strict();
export const createLessonPackageSchema = z
	.object({
		manifestPath: absolute,
		stepIds: z.array(z.string().uuid()).min(1).max(32),
		includeCode: z.boolean(),
		imagePolicy: z.enum(["exclude", "include-external-provenance"]),
		media: z
			.array(
				z
					.object({ stepId: z.string().uuid(), receiptPath: absolute, mediaPath: absolute })
					.strict(),
			)
			.max(4),
		outputDirectory: absolute,
	})
	.strict()
	.refine(
		(v) =>
			new Set(v.stepIds).size === v.stepIds.length &&
			new Set(v.media.map((m) => m.stepId)).size === v.media.length &&
			v.media.every((m) => v.stepIds.includes(m.stepId)),
	);
export const verifyLessonPackageSchema = z.object({ directory: absolute }).strict();
export type CreateLessonPackageRequest = z.infer<typeof createLessonPackageSchema>;
export type PortablePackageManifest = z.infer<typeof packageManifestSchema>;
export type PackageVideo = z.infer<typeof packageVideoSchema>;
