import { randomUUID } from "node:crypto";
import { linkSync, unlinkSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_LESSON_BYTES, parseLesson } from "../../src/lib/lesson/schema";
import { inspectLessonPackage, LessonPackageError, type PackageAuthority } from "./package";
import { pinDirectory, pinMetadata } from "./packageIO";

/** No renderer paths or grants. The caller supplies a native directory selection and lifetime. */
export async function openSelectedLessonPackage(directory: string, authority: PackageAuthority) {
	return inspectLessonPackage({ directory }, authority);
}
export type InspectedPackage = Awaited<ReturnType<typeof openSelectedLessonPackage>>;
/** Static copies retain all embedded JPEGs/code and derived provenance; MP4 bindings cannot be dropped. */
export async function saveStaticPackageCopy(
	directory: string,
	opened: InspectedPackage,
	authority: PackageAuthority,
	pickPath: () => Promise<string | null>,
) {
	const check = () => {
		authority.assertCurrent();
		if (authority.signal?.aborted) throw new LessonPackageError("lesson-package-cancelled");
	};
	check();
	if (opened.manifest.videos.length) throw new Error("package-video-copy-unsupported");
	const target = await pickPath();
	check();
	if (!target) return { status: "cancelled" as const };
	opened.assertCurrent();
	const verified = await openSelectedLessonPackage(directory, authority);
	check();
	opened.assertCurrent();
	const relative = path.relative(directory, target);
	if (!path.isAbsolute(target) || (!relative.startsWith(".." + path.sep) && relative !== ".."))
		throw new LessonPackageError("lesson-package-invalid");
	const parent = path.dirname(target),
		parentCurrent = pinDirectory(parent);
	const lesson = await parseLesson(
		JSON.stringify({
			...verified.lesson,
			id: randomUUID(),
			revision: 0,
			derivedFrom: {
				id: verified.lesson.id,
				revision: verified.lesson.revision,
				stepIds: verified.lesson.steps.map((s) => s.id),
			},
		}),
	);
	check();
	const bytes = Buffer.from(JSON.stringify(lesson, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES) throw new LessonPackageError("lesson-package-invalid");
	const stage = path.join(parent, `.lesson-copy-${randomUUID()}.partial`);
	parentCurrent();
	opened.assertCurrent();
	await fs.writeFile(stage, bytes, { flag: "wx", mode: 0o600 });
	check();
	const written = pinMetadata(stage, MAX_LESSON_BYTES);
	if (!written.bytes.equals(bytes)) throw new LessonPackageError("lesson-package-invalid");
	await parseLesson(written.bytes.toString("utf8"));
	check();
	parentCurrent();
	opened.assertCurrent();
	verified.assertCurrent();
	written.assertCurrent();
	// Exclusive atomic publication, with no async gap after final authority and source checks.
	linkSync(stage, target);
	try {
		unlinkSync(stage);
	} catch {
		/* A redundant private stage may remain. */
	}
	return { status: "saved" as const, path: target };
}
