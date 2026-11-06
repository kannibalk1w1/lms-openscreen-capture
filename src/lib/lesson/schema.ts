import { z } from "zod";
import { lessonOutputSchema } from "./output";

export const MAX_LESSON_BYTES = 16 * 1024 * 1024;
const id = z.string().uuid();
const title = z.string().min(1).max(300);
export const lessonEvidenceSchema = z
	.object({
		kind: z.enum(["recording-flag", "typing-section", "authored"]),
		assetId: z.string().max(200).optional(),
		takeId: z.string().max(200).optional(),
		eventId: z.string().max(220).optional(),
		sessionId: z.string().max(200).optional(),
		clock: z.enum(["recording-control-active-ms", "typing-session-elapsed-ms", "unmapped"]),
		atMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
		provenance: z.enum(["observed", "authored"]),
	})
	.strict();
export const lessonSourceSchema = z
	.object({
		projectId: z.string().min(1).max(200),
		rulerSec: z.number().finite().nonnegative().max(86400),
		basis: z.literal("editor-ruler-seconds"),
		precision: z.literal("60fps-floor"),
		fingerprintKind: z.literal("render-inputs-v1").optional(),
		documentSha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();
export const lessonImageSchema = z
	.object({
		id,
		mime: z.literal("image/jpeg"),
		base64: z
			.string()
			.min(4)
			.max(2 * 1024 * 1024)
			.regex(/^[A-Za-z0-9+/]+={0,2}$/),
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
		width: z.number().int().min(1).max(4096),
		height: z.number().int().min(1).max(4096),
		source: lessonSourceSchema,
	})
	.strict();
export const lessonStepSchema = z
	.object({
		id,
		title,
		instructions: z.string().max(12000),
		status: z.enum(["draft", "reviewed"]),
		evidence: z.array(lessonEvidenceSchema).max(32),
		imageId: id.optional(),
		imageAlt: z.string().max(1000).default(""),
		code: z
			.object({ language: z.string().max(40), text: z.string().max(40000) })
			.strict()
			.optional(),
	})
	.strict();
export const lessonManifestSchema = z
	.object({
		format: z.literal("openscreen-lesson"),
		version: z.literal(1),
		id,
		revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		derivedFrom: z
			.object({
				id,
				revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
				stepIds: z.array(id).min(1).max(200),
			})
			.strict()
			.optional(),
		title,
		output: lessonOutputSchema.optional(),
		steps: z.array(lessonStepSchema).max(200),
		assets: z.array(lessonImageSchema).max(40),
		extensions: z.record(z.string().regex(/^[a-z][a-z0-9.-]{0,79}$/), z.json()).optional(),
	})
	.strict()
	.superRefine((lesson, ctx) => {
		const steps = new Set<string>(),
			assets = new Set<string>();
		for (const asset of lesson.assets) {
			if (assets.has(asset.id) || asset.width * asset.height > 8388608)
				ctx.addIssue({ code: "custom", message: "Duplicate or oversized lesson image" });
			assets.add(asset.id);
		}
		for (const step of lesson.steps) {
			if (steps.has(step.id) || (step.imageId && !assets.has(step.imageId)))
				ctx.addIssue({ code: "custom", message: "Duplicate step or missing image" });
			steps.add(step.id);
		}
	});
export type LessonManifest = z.infer<typeof lessonManifestSchema>;
export type LessonStep = z.infer<typeof lessonStepSchema>;
export type LessonImage = z.infer<typeof lessonImageSchema>;
export type LessonSource = z.infer<typeof lessonSourceSchema>;
export async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** JPEG dimensions from bounded SOF header, before a browser decoder allocates pixels. */
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
	if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
		throw new Error("Invalid JPEG");
	let offset = 2;
	while (offset + 4 < bytes.length) {
		if (bytes[offset++] !== 255) throw new Error("Invalid JPEG marker");
		while (bytes[offset] === 255) offset++;
		const marker = bytes[offset++];
		if (marker === 0xda || marker === 0xd9) break;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		const length = (bytes[offset] << 8) | bytes[offset + 1];
		if (length < 2 || offset + length > bytes.length) throw new Error("Invalid JPEG segment");
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			if (length < 8) throw new Error("Invalid JPEG dimensions");
			return {
				height: (bytes[offset + 3] << 8) | bytes[offset + 4],
				width: (bytes[offset + 5] << 8) | bytes[offset + 6],
			};
		}
		offset += length;
	}
	throw new Error("JPEG dimensions unavailable");
}
export function decodeImage(image: LessonImage): Uint8Array {
	const text = atob(image.base64);
	return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
export async function validateLesson(input: unknown): Promise<LessonManifest> {
	const text = JSON.stringify(input);
	if (new TextEncoder().encode(text).byteLength > MAX_LESSON_BYTES)
		throw new Error("Lesson exceeds 16 MiB");
	const lesson = lessonManifestSchema.parse(input);
	for (const image of lesson.assets) {
		const bytes = decodeImage(image),
			size = jpegDimensions(bytes);
		if (
			bytes.length > 1024 * 1024 ||
			size.width !== image.width ||
			size.height !== image.height ||
			(await sha256(bytes)) !== image.sha256
		)
			throw new Error("Lesson image integrity failure");
	}
	return lesson;
}
export async function parseLesson(text: string): Promise<LessonManifest> {
	if (new TextEncoder().encode(text).byteLength > MAX_LESSON_BYTES)
		throw new Error("Lesson exceeds 16 MiB");
	return validateLesson(JSON.parse(text));
}
