import { randomUUID } from "node:crypto";
import path from "node:path";
import { validatePackageEdit } from "../../src/lib/lesson/packageEdit";
import { validateLesson } from "../../src/lib/lesson/schema";
import { LessonPackageError, type PackageAuthority, publishLessonPackage } from "./package";
import { pinBinary, pinDirectory } from "./packageIO";
import { type InspectedPackage, openSelectedLessonPackage } from "./packageOpen";

/** No original project/receipt/source lookup: only the verified capability's known relative video inventory. */
export async function resealLessonPackage(
	directory: string,
	opened: InspectedPackage,
	input: unknown,
	authority: PackageAuthority,
	pickDirectory: () => Promise<string | null>,
) {
	const check = () => {
		authority.assertCurrent();
		if (authority.signal?.aborted) throw new LessonPackageError("lesson-package-cancelled");
	};
	check();
	const draft = await validatePackageEdit(opened.lesson, input);
	check();
	const destination = await pickDirectory();
	check();
	if (!destination) return { status: "cancelled" as const };
	const relative = path.relative(directory, destination);
	// A destination mistake is the user's to correct: report it distinctly from a changed package.
	if (!path.isAbsolute(destination) || (!relative.startsWith(".." + path.sep) && relative !== ".."))
		throw new Error("package-destination-invalid");
	try {
		pinDirectory(destination)();
	} catch {
		throw new Error("package-destination-invalid");
	}
	opened.assertCurrent();
	const verified = await openSelectedLessonPackage(directory, authority);
	check();
	opened.assertCurrent();
	const current = () => {
		check();
		opened.assertCurrent();
		verified.assertCurrent();
	};
	const derived = await validateLesson({
		...draft,
		id: randomUUID(),
		revision: 0,
		derivedFrom: {
			id: verified.lesson.id,
			revision: verified.lesson.revision,
			stepIds: draft.steps.map((s) => s.id),
		},
	});
	current();
	const media = [];
	for (const portable of verified.manifest.videos) {
		const binary = await pinBinary(
			path.join(directory, portable.path),
			128 * 1024 * 1024,
			current,
			authority.signal,
		);
		current();
		const inventory = verified.manifest.files.find((f) => f.path === portable.path)!;
		if (binary.hash.sha256 !== inventory.sha256 || binary.hash.bytes !== inventory.bytes)
			throw new LessonPackageError("lesson-package-invalid");
		media.push({ portable, binary });
	}
	return publishLessonPackage(
		derived,
		verified.manifest.scope,
		media,
		destination,
		authority,
		current,
	);
}
