import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { projectLesson, renderProjectedLessonGuide } from "../../src/lib/lesson/export";
import {
	hasLmsReferences,
	LESSON_MAPPING_FILE,
	lessonMappingBytes,
} from "../../src/lib/lesson/mapping";
import { lessonOutput } from "../../src/lib/lesson/output";
import {
	decodeImage,
	type LessonManifest,
	MAX_LESSON_BYTES,
	parseLesson,
	validateLesson,
} from "../../src/lib/lesson/schema";
import { validateRangeVideo } from "./encodedVideo";
import {
	type CreateLessonPackageRequest,
	createLessonPackageSchema,
	PACKAGE_MAX_BYTES,
	type PortablePackageManifest,
	packageManifestSchema,
	packageReceiptSchema,
	verifyLessonPackageSchema,
} from "./packageContracts";
import {
	assertPackageTree,
	copyPinned,
	digest,
	type PinnedBinary,
	pinBinary,
	pinDirectory,
	pinMetadata,
} from "./packageIO";
import { selectedPackageMedia } from "./packageMedia";
import { RangeVideoToolUnavailableError } from "./rangeErrors";
export class LessonPackageError extends Error {
	constructor(
		readonly code:
			| "lesson-package-invalid"
			| "lesson-package-cancelled"
			| "lesson-package-unsupported"
			| "lesson-package-tool-unavailable",
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
export interface PackageAuthority {
	assertCurrent(): void;
	signal?: AbortSignal;
}
const checkFor = (authority: PackageAuthority) => () => {
	authority.assertCurrent();
	if (authority.signal?.aborted) throw new LessonPackageError("lesson-package-cancelled");
	if (process.platform !== "linux") throw new LessonPackageError("lesson-package-unsupported");
};
const failureCode = (error: unknown, authority: PackageAuthority) =>
	authority.signal?.aborted
		? "lesson-package-cancelled"
		: error instanceof LessonPackageError
			? error.code
			: error instanceof RangeVideoToolUnavailableError
				? "lesson-package-tool-unavailable"
				: "lesson-package-invalid";
async function portableGuideV1Files(
	lesson: LessonManifest,
	videos: PortablePackageManifest["videos"],
) {
	const output = await renderProjectedLessonGuide(lesson);
	const links = videos.map((video) => ({
		path: video.path,
		number: lesson.steps.findIndex((s) => s.id === video.stepId) + 1,
		frames: video.frames,
	}));
	const note =
		"Derived lesson and already rendered media. Original native projects, source media and editing history are not included. Embedded audio is not verified.";
	const section = `<section aria-label="Portable package scope" lang="en" dir="ltr"><h2>Included rendered videos</h2><p>${note}</p>${links.length ? `<ul>${links.map((link) => `<li><a href="${link.path}">Open step ${link.number} MP4 (${link.frames} frames at 30 fps)</a></li>`).join("")}</ul>` : "<p>No videos were selected for this package.</p>"}</section>`;
	const html = output.html.replace("</main>", section + "</main>"),
		markdown =
			output.markdown +
			"\n## Portable package scope\n\n" +
			note +
			"\n\n" +
			(links.length
				? links
						.map(
							(link) =>
								`- [Open step ${link.number} MP4 (${link.frames} frames at 30 fps)](${link.path})`,
						)
						.join("\n")
				: "No videos were selected for this package.") +
			"\n";
	const files = new Map<string, Buffer>([
		["index.html", Buffer.from(html)],
		["lesson.md", Buffer.from(markdown)],
		["lesson.openscreen-lesson.json", Buffer.from(JSON.stringify(lesson, null, 2) + "\n")],
	]);
	// Only with authored LMS references: packages without them keep the original v1 inventory.
	if (hasLmsReferences(lesson))
		files.set(LESSON_MAPPING_FILE, Buffer.from(lessonMappingBytes(lesson, videos)));
	for (const image of lesson.assets) {
		const relative = `assets/${image.id}.jpg`;
		if (files.has(relative)) throw new Error("package-path-collision");
		files.set(relative, Buffer.from(decodeImage(image)));
	}
	return files;
}
function pathsUnique(manifest: PortablePackageManifest) {
	const paths = manifest.files.map((f) => f.path.toLowerCase());
	if (
		new Set(paths).size !== paths.length ||
		manifest.files.reduce((n, f) => n + f.bytes, 0) > PACKAGE_MAX_BYTES
	)
		throw new Error("package-inventory-invalid");
}
function validateProjection(lesson: LessonManifest, manifest: PortablePackageManifest) {
	if (
		JSON.stringify(lesson.derivedFrom?.stepIds) !== JSON.stringify(lesson.steps.map((s) => s.id)) ||
		lesson.assets.some((a) => !lesson.steps.some((s) => s.imageId === a.id)) ||
		(!lessonOutput(lesson).includeImages && lesson.assets.length) ||
		lesson.id !== manifest.lessonId ||
		!lesson.derivedFrom ||
		lesson.revision !== 0 ||
		lesson.extensions ||
		lesson.steps.length < 1 ||
		lesson.steps.length > 32 ||
		lesson.steps.some((s) => s.mediaSelection || s.evidence.length) ||
		(!lessonOutput(lesson).includeCode && lesson.steps.some((s) => s.code)) ||
		(manifest.scope.code === "excluded" && lesson.steps.some((s) => s.code)) ||
		(manifest.scope.images === "exclude" && lesson.assets.length) ||
		lesson.assets.some((a) => a.id !== a.id.toLowerCase())
	)
		throw new Error("package-projection-invalid");
	const ids = new Set(lesson.steps.map((s) => s.id));
	if (
		manifest.videos.some(
			(v) =>
				!ids.has(v.stepId) ||
				v.path !== `media/${v.stepId.toLowerCase()}.mp4` ||
				v.durationSec !== v.frames / 30,
		) ||
		new Set(manifest.videos.map((v) => v.stepId)).size !== manifest.videos.length
	)
		throw new Error("package-video-invalid");
}
/** Returns the verified derived editable lesson internally; transports deliberately return only summary. */
export async function inspectLessonPackage(input: unknown, authority: PackageAuthority) {
	const check = checkFor(authority);
	try {
		check();
		const request = verifyLessonPackageSchema.parse(input),
			root = pinDirectory(request.directory),
			current = () => {
				check();
				root();
			};
		current();
		const completion = pinMetadata(path.join(request.directory, "package-receipt.json"), 65536),
			receipt = packageReceiptSchema.parse(JSON.parse(completion.bytes.toString("utf8"))),
			metadata = pinMetadata(path.join(request.directory, "lesson-package.json"), 65536);
		if (
			metadata.bytes.length !== receipt.manifest.bytes ||
			digest(metadata.bytes) !== receipt.manifest.sha256
		)
			throw new Error("package-manifest-changed");
		const manifest = packageManifestSchema.parse(JSON.parse(metadata.bytes.toString("utf8")));
		pathsUnique(manifest);
		current();
		const editable = pinMetadata(
				path.join(request.directory, "lesson.openscreen-lesson.json"),
				MAX_LESSON_BYTES,
			),
			lesson = await parseLesson(editable.bytes.toString("utf8"));
		current();
		validateProjection(lesson, manifest);
		const expected = await portableGuideV1Files(lesson, manifest.videos);
		current();
		const required = new Set([...expected.keys(), ...manifest.videos.map((v) => v.path)]);
		if (
			required.size !== manifest.files.length ||
			manifest.files.some((f) => !required.has(f.path))
		)
			throw new Error("package-inventory-invalid");
		await assertPackageTree(
			request.directory,
			new Set([...required, "lesson-package.json", "package-receipt.json"]),
			current,
		);
		const pinned: PinnedBinary[] = [];
		for (const entry of manifest.files) {
			current();
			const source = await pinBinary(
				path.join(request.directory, entry.path),
				Math.min(
					entry.path.endsWith(".mp4") ? 128 * 1024 * 1024 : 32 * 1024 * 1024,
					PACKAGE_MAX_BYTES,
				),
				current,
				authority.signal,
			);
			if (source.hash.bytes !== entry.bytes || source.hash.sha256 !== entry.sha256)
				throw new Error("package-checksum-invalid");
			const generated = expected.get(entry.path);
			if (generated && (generated.length !== entry.bytes || digest(generated) !== entry.sha256))
				throw new Error("package-guide-invalid");
			pinned.push(source);
		}
		const videoEvidence = [];
		for (const video of manifest.videos) {
			current();
			const evidence = await validateRangeVideo(path.join(request.directory, video.path), video);
			current();
			const item = manifest.files.find((f) => f.path === video.path)!;
			if (evidence.sha256 !== item.sha256 || evidence.bytes !== item.bytes)
				throw new Error("package-media-changed");
			videoEvidence.push(evidence);
		}
		current();
		await assertPackageTree(
			request.directory,
			new Set([...required, "lesson-package.json", "package-receipt.json"]),
			current,
		);
		current();
		completion.assertCurrent();
		metadata.assertCurrent();
		editable.assertCurrent();
		for (const p of pinned) p.assertCurrent();
		return {
			assertCurrent: () => {
				current();
				completion.assertCurrent();
				metadata.assertCurrent();
				editable.assertCurrent();
				for (const p of pinned) p.assertCurrent();
			},
			lesson,
			manifest,
			videoEvidence,
			summary: {
				status: "verified" as const,
				path: request.directory,
				lessonId: lesson.id,
				steps: lesson.steps.map((s) => ({ id: s.id, title: s.title })),
				guide: "index.html",
				editableLesson: "lesson.openscreen-lesson.json",
				videos: manifest.videos,
				videoChecks: videoEvidence.map((e, index) => ({
					stepId: manifest.videos[index].stepId,
					samples: e.samples.sampleCount,
					storedDurationSec: e.samples.durationSec,
					decodedFrames: e.decoded.frames,
					audio: { streamMetadataVerified: false, timingVerified: false },
				})),
				scope: manifest.scope,
				checksumAuthenticity: "local-readback-not-signature" as const,
			},
		};
	} catch (error) {
		throw new LessonPackageError(failureCode(error, authority));
	}
}
export async function createLessonPackage(input: unknown, authority: PackageAuthority) {
	const check = checkFor(authority);
	const inputChecks: (() => void)[] = [];
	try {
		check();
		const request = createLessonPackageSchema.parse(input);
		pinDirectory(request.outputDirectory)();
		const source = pinMetadata(request.manifestPath, MAX_LESSON_BYTES);
		inputChecks.push(source.assertCurrent);
		const lesson = await parseLesson(source.bytes.toString("utf8"));
		check();
		return await packageSelectedLesson(lesson, request, authority, inputChecks);
	} catch (error) {
		if (error instanceof LessonPackageError) throw error;
		throw new LessonPackageError(failureCode(error, authority));
	}
}
/** One projection and media path for a saved lesson file (CLI/MCP) and a validated in-memory lesson (editor). */
export async function packageSelectedLesson(
	lesson: LessonManifest,
	request: Omit<CreateLessonPackageRequest, "manifestPath">,
	authority: PackageAuthority,
	inputChecks: (() => void)[] = [],
) {
	const check = checkFor(authority);
	let destination: (() => void) | undefined;
	const assertInputs = () => {
		authority.assertCurrent();
		destination?.();
		for (const current of inputChecks) current();
	};
	try {
		check();
		destination = pinDirectory(request.outputDirectory);
		destination();
		assertInputs();
		const images = request.imagePolicy === "include-external-provenance",
			includeCode = request.includeCode && lessonOutput(lesson).includeCode;
		const projected = await projectLesson(
			{
				...lesson,
				output: {
					...lessonOutput(lesson),
					includeImages: images && lessonOutput(lesson).includeImages,
					includeCode,
				},
			},
			request.stepIds,
		);
		check();
		const derived = await validateLesson({
			...projected,
			steps: projected.steps.map((s) => ({
				...s,
				evidence: [],
				mediaSelection: undefined,
				imageId: s.imageId?.toLowerCase(),
			})),
			assets: projected.assets.map((a) => ({ ...a, id: a.id.toLowerCase() })),
			extensions: undefined,
		});
		check();
		const media = [];
		for (const binding of request.media) {
			check();
			assertInputs();
			const item = await selectedPackageMedia(
				lesson,
				binding,
				() => {
					check();
					assertInputs();
				},
				authority.signal,
			);
			inputChecks.push(item.metadata.assertCurrent, item.binary.assertCurrent);
			media.push(item);
		}
		return await publishLessonPackage(
			derived,
			{
				kind: "derived-static-lesson-and-rendered-video",
				code: includeCode ? "included" : "excluded",
				images: request.imagePolicy,
				sourceProjects: "external-unavailable",
				sourceMedia: "not-included",
				historyAndEvidence: "not-included",
				nativeEditableProject: false,
				nativeDependencies: "fonts-annotations-added-audio-branches-not-included",
				mediaMeaning: "already-rendered-video; embedded-audio-unverified; not-native-editability",
			},
			media,
			request.outputDirectory,
			authority,
			assertInputs,
		);
	} catch (error) {
		if (error instanceof LessonPackageError) throw error;
		throw new LessonPackageError(failureCode(error, authority));
	}
}
/** Shared v1 writer for explicitly selected authored media and verified-package derivatives. */
export async function publishLessonPackage(
	derived: LessonManifest,
	scope: PortablePackageManifest["scope"],
	media: Array<{ portable: PortablePackageManifest["videos"][number]; binary: PinnedBinary }>,
	outputDirectory: string,
	authority: PackageAuthority,
	assertSource: () => void,
) {
	const check = checkFor(authority);
	let partial: string | undefined;
	let stageRoot: (() => void) | undefined;
	check();
	assertSource();
	const destination = pinDirectory(outputDirectory);
	const assertInputs = () => {
		authority.assertCurrent();
		destination();
		assertSource();
	};
	try {
		const files = await portableGuideV1Files(
			derived,
			media.map((item) => item.portable),
		);
		check();
		const manifest: PortablePackageManifest = {
			format: "openscreen-portable-lesson",
			guideContract: "openscreen-static-guide-portable-v1",
			version: 1,
			lessonId: derived.id,
			scope,
			files: [
				...[...files].map(([relative, bytes]) => ({
					path: relative,
					bytes: bytes.length,
					sha256: digest(bytes),
				})),
				...media.map((m) => ({ path: m.portable.path, ...m.binary.hash })),
			],
			videos: media.map((m) => m.portable),
		};
		packageManifestSchema.parse(manifest);
		pathsUnique(manifest);
		validateProjection(derived, manifest);
		check();
		assertInputs();
		const created = path.join(outputDirectory, `lesson-package-${randomUUID()}`);
		await fs.mkdir(created, { mode: 0o700 });
		partial = created;
		const root = pinDirectory(partial);
		stageRoot = root;
		const stage = () => {
			check();
			assertInputs();
			root();
		};
		for (const dir of ["assets", "media"])
			if (manifest.files.some((f) => f.path.startsWith(dir + "/"))) {
				stage();
				await fs.mkdir(path.join(partial, dir), { mode: 0o700 });
				stage();
			}
		for (const [relative, bytes] of files) {
			stage();
			await fs.writeFile(path.join(partial, relative), bytes, { flag: "wx", mode: 0o600 });
			stage();
		}
		for (const m of media) {
			stage();
			await copyPinned(m.binary, path.join(partial, m.portable.path), stage);
			stage();
		}
		const payload = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
		if (payload.length > 65536) throw new Error("package-manifest-limit");
		stage();
		await fs.writeFile(path.join(partial, "lesson-package.json"), payload, {
			flag: "wx",
			mode: 0o600,
		});
		stage();
		// Verify every actual output and original input again before the receipt's final one-turn publication.
		const readbacks = [];
		for (const entry of manifest.files) {
			stage();
			const readback = await pinBinary(
				path.join(partial, entry.path),
				entry.bytes,
				stage,
				authority.signal,
			);
			if (readback.hash.bytes !== entry.bytes || readback.hash.sha256 !== entry.sha256)
				throw new Error("package-readback-invalid");
			readbacks.push(readback);
		}
		for (const m of media) {
			stage();
			const video = await validateRangeVideo(path.join(partial, m.portable.path), m.portable);
			stage();
			if (video.sha256 !== m.binary.hash.sha256 || video.bytes !== m.binary.hash.bytes)
				throw new Error("package-media-invalid");
		}
		stage();
		await assertPackageTree(
			partial,
			new Set([...manifest.files.map((f) => f.path), "lesson-package.json"]),
			stage,
		);
		stage();
		const stored = pinMetadata(path.join(partial, "lesson-package.json"), 65536);
		if (!stored.bytes.equals(payload)) throw new Error("package-manifest-changed");
		stage();
		stored.assertCurrent();
		for (const readback of readbacks) readback.assertCurrent();
		const receipt = {
			format: "openscreen-portable-lesson-completion",
			version: 1,
			manifest: { bytes: payload.length, sha256: digest(payload) },
			complete: true,
		};
		writeFileSync(
			path.join(partial, "package-receipt.json"),
			JSON.stringify(receipt, null, 2) + "\n",
			{ flag: "wx", mode: 0o600 },
		);
		return {
			status: "packaged" as const,
			path: partial,
			lessonId: derived.id,
			steps: derived.steps.length,
			videos: media.length,
			images: derived.assets.length,
			scope: manifest.scope,
			editableMeaning:
				"derived lesson text/code/illustrations; video bindings remain package metadata; original native projects unavailable" as const,
		};
	} catch (error) {
		let visible: string | undefined;
		try {
			assertInputs();
			stageRoot?.();
			visible = partial;
		} catch {
			/* Revoked scope receives no path. */
		}
		throw new LessonPackageError(failureCode(error, authority), visible);
	}
}

export async function verifyLessonPackage(input: unknown, authority: PackageAuthority) {
	return (await inspectLessonPackage(input, authority)).summary;
}

export const lessonPackageMessages = {
	"lesson-package-invalid":
		"The selected package or inputs could not be verified. Select current explicit files and an existing directory, check missing or changed files, then retry. Unfinished files are not a completed package.",
	"lesson-package-cancelled":
		"Packaging or verification stopped. No new completed package was certified after cancellation.",
	"lesson-package-unsupported":
		"This package supports bounded Linux static lessons, explicit JPEG image policy and up to four already rendered selected-step MP4 files. Native editor projects and timed playback are not included.",
	"lesson-package-tool-unavailable":
		"The video verification tool is unavailable. Reinstall or update OpenScreen, or ask an administrator to check the configured FFmpeg tool, then retry. No completed package was certified.",
} as const;
