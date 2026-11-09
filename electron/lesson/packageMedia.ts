import { z } from "zod";
import { outputFrameCount } from "../../src/lib/exporter/outputFrameCount";
import { lessonMediaSelectionSchema } from "../../src/lib/lesson/mediaSelection";
import type { LessonManifest } from "../../src/lib/lesson/schema";
import { validateRangeVideo } from "./encodedVideo";
import type { PackageVideo } from "./packageContracts";
import { pinBinary, pinMetadata } from "./packageIO";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z
	.object({
		format: z.literal("openscreen-lesson-range-media"),
		version: z.literal(1),
		target: z
			.object({
				lessonId: z.string().uuid(),
				stepId: z.string().uuid(),
				revision: z.number().int().nonnegative(),
			})
			.strict(),
		selection: lessonMediaSelectionSchema,
		renderInputsSha256: digest,
		output: z
			.object({
				path: z.literal("range.mp4"),
				bytes: z
					.number()
					.int()
					.min(1)
					.max(128 * 1024 * 1024),
				sha256: digest,
				width: z.number().int().min(2).max(1280),
				height: z.number().int().min(2).max(1280),
				fps: z.literal(30),
				frames: z.number().int().min(1).max(3600),
				nativeReportedDurationSec: z.number().finite().positive(),
				basis: z.literal("selected-programme-seconds"),
			})
			.strict(),
		sources: z.array(z.unknown()).max(8),
		validation: z.literal("mp4-video-samples-and-full-frame-decode"),
		videoEvidence: z.unknown(),
		mediaDecodedByValidator: z.literal(true),
		encodedTimingVerified: z.literal(true),
		audio: z
			.object({
				policy: z.literal("native-source-or-synthesized-silence"),
				streamMetadataVerified: z.literal(false),
				timingVerified: z.literal(false),
			})
			.strict(),
	})
	.strict();
export async function selectedPackageMedia(
	lesson: LessonManifest,
	binding: { stepId: string; receiptPath: string; mediaPath: string },
	check: () => void,
	signal?: AbortSignal,
) {
	check();
	const metadata = pinMetadata(binding.receiptPath, 65536),
		receipt = receiptSchema.parse(JSON.parse(metadata.bytes.toString("utf8"))),
		step = lesson.steps.find((s) => s.id === binding.stepId),
		pin = step?.mediaSelection;
	if (
		!pin ||
		pin.version !== 2 ||
		receipt.target.lessonId !== lesson.id ||
		receipt.target.revision !== lesson.revision ||
		receipt.target.stepId !== binding.stepId ||
		JSON.stringify(receipt.selection) !== JSON.stringify({ ...pin, previousSelections: [] })
	)
		throw new Error("package-media-association-invalid");
	const duration = pin.programme.endSec - pin.programme.startSec,
		frames = outputFrameCount([{ sourceStartSec: 0, sourceEndSec: duration }], undefined, 30);
	if (
		duration < 1 / 30 ||
		duration > 120 ||
		frames !== receipt.output.frames ||
		Math.abs(receipt.output.nativeReportedDurationSec - frames / 30) > 1e-6
	)
		throw new Error("package-media-timing-invalid");
	const binary = await pinBinary(binding.mediaPath, 128 * 1024 * 1024, check, signal);
	if (binary.hash.bytes !== receipt.output.bytes || binary.hash.sha256 !== receipt.output.sha256)
		throw new Error("package-media-bytes-invalid");
	check();
	const video = await validateRangeVideo(binding.mediaPath, receipt.output);
	check();
	metadata.assertCurrent();
	binary.assertCurrent();
	if (video.bytes !== binary.hash.bytes || video.sha256 !== binary.hash.sha256)
		throw new Error("package-media-changed");
	const portable: PackageVideo = {
		stepId: binding.stepId,
		path: `media/${binding.stepId.toLowerCase()}.mp4`,
		width: receipt.output.width,
		height: receipt.output.height,
		fps: 30,
		frames,
		durationSec: frames / 30,
		audio: { streamMetadataVerified: false, timingVerified: false },
		validation: "mp4-video-samples-and-full-frame-decode",
		association: "matched-author-selected-pin-claims; original-project-not-revalidated",
	};
	return { metadata, binary, portable };
}
