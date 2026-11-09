import { createHash } from "node:crypto";
import { openSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseLesson } from "../../src/lib/lesson/schema";
import { validateRangeVideo } from "./encodedVideo";
import { createLessonPackage, inspectLessonPackage, verifyLessonPackage } from "./package";
import { fakePackageVideo, packageFixture } from "./package.test-support";
import { portablePackagePath } from "./packageContracts";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, openSync: vi.fn(actual.openSync), realpathSync: vi.fn(actual.realpathSync) };
});
vi.mock("./encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
let root: string;
const authority = {
	assertCurrent: () => {
		/* Explicit files and destination selected by the caller. */
	},
};
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "portable-lesson-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function resign(directory: string, mutate: (manifest: Record<string, unknown>) => void) {
	const file = path.join(directory, "lesson-package.json"),
		manifest = JSON.parse(await fs.readFile(file, "utf8"));
	mutate(manifest);
	const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
	await fs.writeFile(file, bytes);
	const receipt = JSON.parse(
		await fs.readFile(path.join(directory, "package-receipt.json"), "utf8"),
	);
	receipt.manifest = {
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
	await fs.writeFile(path.join(directory, "package-receipt.json"), JSON.stringify(receipt));
}
it("roundtrips a selected derived static guide and validated media after copy and original paths disappear, with privacy exclusions", async () => {
	const f = await packageFixture(root),
		originals = await Promise.all([
			fs.readFile(f.request.manifestPath),
			fs.readFile(f.source),
			fs.readFile(f.request.media[0].receiptPath),
		]),
		packaged = await createLessonPackage(f.request, authority);
	expect(packaged).toMatchObject({ status: "packaged", steps: 1, videos: 1, images: 0 });
	const inspected = await inspectLessonPackage({ directory: packaged.path }, authority);
	expect(inspected.lesson.steps[0]).toMatchObject({
		id: f.step.id,
		instructions: "Public selected instructions",
		evidence: [],
	});
	expect(inspected.lesson.steps[0].mediaSelection).toBeUndefined();
	expect(await fs.readFile(path.join(packaged.path, "index.html"), "utf8")).toContain(
		`href="media/${f.step.id}.mp4"`,
	);
	expect(await fs.readFile(path.join(packaged.path, "lesson.md"), "utf8")).toContain(
		`](media/${f.step.id}.mp4)`,
	);
	expect(inspected.lesson.derivedFrom).toMatchObject({ id: f.lesson.id, stepIds: [f.step.id] });
	for (const entry of inspected.manifest.files) {
		const bytes = await fs.readFile(path.join(packaged.path, entry.path));
		expect(bytes.length).toBe(entry.bytes);
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
		if (!entry.path.endsWith(".mp4"))
			expect(bytes.toString()).not.toMatch(
				/PRIVATE_|abababababababababababababababababababababababababababababababab/,
			);
	}
	expect(
		await Promise.all([
			fs.readFile(f.request.manifestPath),
			fs.readFile(f.source),
			fs.readFile(f.request.media[0].receiptPath),
		]),
	).toEqual(originals);
	const moved = path.join(root, "moved lesson");
	await fs.cp(packaged.path, moved, { recursive: true });
	await fs.rename(f.authoring, f.authoring + ".offline");
	expect((await verifyLessonPackage({ directory: moved }, authority)).status).toBe("verified");
	const reopened = await parseLesson(
		await fs.readFile(path.join(moved, "lesson.openscreen-lesson.json"), "utf8"),
	);
	expect(reopened.steps[0].instructions).toBe("Public selected instructions");
	expect(
		(
			await createLessonPackage(
				{
					...f.request,
					manifestPath: path.join(f.authoring + ".offline", "lesson.json"),
					media: [],
				},
				authority,
			)
		).path,
	).not.toBe(packaged.path);
});
it("includes only deliberate code/JPEG provenance with matching relative Markdown assets and transitive verification", async () => {
	const f = await packageFixture(root),
		result = await createLessonPackage(
			{ ...f.request, includeCode: true, imagePolicy: "include-external-provenance" },
			authority,
		),
		opened = await inspectLessonPackage({ directory: result.path }, authority);
	expect(opened.lesson.assets).toHaveLength(1);
	expect(opened.lesson.assets[0].source).toEqual(f.image.source);
	expect(opened.lesson.steps[0].code?.text).toBe("PRIVATE_SELECTED_CODE");
	expect(JSON.stringify(opened.lesson)).not.toMatch(
		/PRIVATE_EXCLUDED|PRIVATE_RAW|PRIVATE_PIN|PRIVATE_EVIDENCE/,
	);
	expect(await fs.readFile(path.join(result.path, "lesson.md"), "utf8")).toContain(
		`assets/${f.image.id}.jpg`,
	);
	expect((await fs.stat(result.path)).mode & 0o777).toBe(0o700);
	for (const entry of opened.manifest.files)
		expect((await fs.stat(path.join(result.path, entry.path))).mode & 0o777).toBe(0o600);
});
it("requires authority and non-cancelled lifetime before filesystem inspection", async () => {
	const f = await packageFixture(root);
	vi.mocked(openSync).mockClear();
	vi.mocked(realpathSync).mockClear();
	const open = vi.spyOn(fs, "open");
	await expect(
		createLessonPackage(f.request, {
			assertCurrent: () => {
				throw new Error("denied");
			},
		}),
	).rejects.toHaveProperty("code");
	await expect(
		verifyLessonPackage(
			{ directory: f.outputDirectory },
			{ ...authority, signal: AbortSignal.abort() },
		),
	).rejects.toHaveProperty("code", "lesson-package-cancelled");
	expect(open).not.toHaveBeenCalled();
	expect(openSync).not.toHaveBeenCalled();
	expect(realpathSync).not.toHaveBeenCalled();
});
it.each([
	"missing-grant",
	"receipt-path-import",
	"receipt-pin",
	"receipt-target",
	"legacy-pin",
	"wrong-step",
	"receipt-timing",
	"receipt-hash",
	"changed-video",
	"source-symlink",
	"source-ancestor",
	"ancestor-destination",
])("refuses %s without producing any package or changing originals", async (change) => {
	const f = await packageFixture(root);
	let request: unknown = f.request;
	if (change === "missing-grant")
		request = {
			...f.request,
			media: [{ stepId: f.step.id, receiptPath: f.request.media[0].receiptPath }],
		};
	if (
		change === "receipt-path-import" ||
		change === "receipt-timing" ||
		change === "receipt-hash" ||
		change === "receipt-pin" ||
		change === "receipt-target"
	) {
		const p = f.request.media[0].receiptPath,
			r = JSON.parse(await fs.readFile(p, "utf8"));
		if (change === "receipt-path-import") r.output.path = "/PRIVATE_UNGRANTED.mp4";
		if (change === "receipt-timing") r.output.frames++;
		if (change === "receipt-hash") r.output.sha256 = "0".repeat(64);
		if (change === "receipt-pin") r.selection.documentSha256 = "0".repeat(64);
		if (change === "receipt-target") r.target.revision++;
		await fs.writeFile(p, JSON.stringify(r));
	}
	if (change === "legacy-pin") {
		const lesson = { ...f.lesson, steps: [{ ...f.step, mediaSelection: f.reference }] };
		await fs.writeFile(f.request.manifestPath, JSON.stringify(lesson));
	}
	if (change === "wrong-step")
		request = { ...f.request, media: [{ ...f.request.media[0], stepId: crypto.randomUUID() }] };
	if (change === "changed-video")
		await fs.writeFile(f.request.media[0].mediaPath, "different video");
	if (change === "source-symlink") {
		const target = f.request.media[0].mediaPath;
		await fs.rename(target, target + ".old");
		await fs.symlink(target + ".old", target);
	}
	if (change === "source-ancestor") {
		const alias = path.join(root, "source-alias");
		await fs.symlink(path.dirname(f.request.media[0].mediaPath), alias, "dir");
		request = {
			...f.request,
			media: [
				{
					...f.request.media[0],
					mediaPath: path.join(alias, path.basename(f.request.media[0].mediaPath)),
				},
			],
		};
	}
	if (change === "ancestor-destination") {
		const real = path.join(root, "real"),
			alias = path.join(root, "alias");
		await fs.mkdir(path.join(real, "dest"), { recursive: true });
		await fs.symlink(real, alias, "dir");
		request = { ...f.request, outputDirectory: path.join(alias, "dest") };
	}
	const originals = await Promise.all([fs.readFile(f.request.manifestPath), fs.readFile(f.source)]);
	await expect(createLessonPackage(request, authority)).rejects.toHaveProperty("code");
	expect(await fs.readdir(f.outputDirectory)).toEqual([]);
	expect(await Promise.all([fs.readFile(f.request.manifestPath), fs.readFile(f.source)])).toEqual(
		originals,
	);
});
it.each([
	"manifest",
	"missing-file",
	"corrupt-media",
	"extra-private-file",
	"symlink-leaf",
	"symlink-ancestor",
	"traversal",
	"absolute",
	"case-collision",
	"duplicate-path",
	"oversized-list",
	"html-forgery",
])("verification independently refuses %s without source discovery", async (change) => {
	const f = await packageFixture(root),
		result = await createLessonPackage(f.request, authority),
		dir = result.path;
	if (change === "manifest") await fs.appendFile(path.join(dir, "lesson-package.json"), " ");
	if (change === "missing-file") await fs.unlink(path.join(dir, "lesson.md"));
	if (change === "corrupt-media")
		await fs.appendFile(path.join(dir, `media/${f.step.id}.mp4`), "corruption");
	if (change === "extra-private-file")
		await fs.writeFile(path.join(dir, "raw-journal.json"), "PRIVATE_JOURNAL");
	if (change === "symlink-leaf") {
		const file = path.join(dir, "lesson.md");
		await fs.rename(file, path.join(root, "linked.md"));
		await fs.symlink(path.join(root, "linked.md"), file);
	}
	if (change === "symlink-ancestor") {
		await fs.rename(path.join(dir, "media"), path.join(root, "external-media"));
		await fs.symlink(path.join(root, "external-media"), path.join(dir, "media"), "dir");
	}
	if (
		["traversal", "absolute", "case-collision", "duplicate-path", "oversized-list"].includes(change)
	)
		await resign(dir, (m) => {
			const files = m.files as { path: string }[];
			if (change === "traversal") files[0].path = "../PRIVATE";
			if (change === "absolute") files[0].path = "/PRIVATE";
			if (change === "case-collision") files[0].path = "INDEX.HTML";
			if (change === "duplicate-path") files[1] = { ...files[0] };
			if (change === "oversized-list") for (let i = 0; i < 65; i++) files.push({ ...files[0] });
		});
	if (change === "html-forgery") {
		const bytes = Buffer.from("<script>PRIVATE_FORGERY</script>");
		await fs.writeFile(path.join(dir, "index.html"), bytes);
		await resign(dir, (m) => {
			const item = (m.files as { path: string; sha256: string; bytes: number }[]).find(
				(f) => f.path === "index.html",
			)!;
			item.bytes = bytes.length;
			item.sha256 = createHash("sha256").update(bytes).digest("hex");
		});
	}
	await fs.rename(f.authoring, f.authoring + ".offline");
	await expect(verifyLessonPackage({ directory: dir }, authority)).rejects.toHaveProperty(
		"code",
		"lesson-package-invalid",
	);
});
it.each([
	"../a",
	"/absolute",
	"a\\b",
	"C:/a",
	"a//b",
	"a/..",
	"con",
	"aux.txt",
	"a/nul",
	"a/com1.txt",
	"a/lpt9.mp4",
	"a.",
	"a ",
	"UPPER.txt",
	"a/".repeat(91),
])("enforces Windows-portable relative path rule %s", (value) =>
	expect(portablePackagePath(value)).toBe(false));
it.each([
	"cancel-before-output",
	"cancel-output-decode",
	"input-inode",
	"receipt-inode",
	"output-inode",
	"destination-inode",
	"write-error",
])("holds publication and bounded artifact disclosure on %s", async (change) => {
	const f = await packageFixture(root),
		abort = new AbortController(),
		write = fs.writeFile.bind(fs);
	let output: string | undefined;
	if (change === "write-error")
		vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
			if (String(args[0]).endsWith("/lesson.md")) throw new Error("PRIVATE_WRITE_ERROR");
			return write(...args);
		});
	vi.mocked(validateRangeVideo).mockImplementation(async (file) => {
		const evidence = await fakePackageVideo(file),
			stage = file.includes("/lesson-package-");
		if (!stage && change === "cancel-before-output") abort.abort();
		if (stage) {
			output = path.dirname(file);
			if (change === "cancel-output-decode") abort.abort();
			if (change === "input-inode" || change === "receipt-inode") {
				const target =
						change === "input-inode" ? f.request.manifestPath : f.request.media[0].receiptPath,
					bytes = await fs.readFile(target);
				await fs.rename(target, target + ".old");
				await fs.writeFile(target, bytes);
			}
			if (change === "output-inode") {
				const bytes = await fs.readFile(file);
				await fs.rename(file, path.join(root, "replaced-output.mp4"));
				await fs.writeFile(file, bytes);
			}
			if (change === "destination-inode") {
				await fs.rename(f.outputDirectory, f.outputDirectory + ".old");
				await fs.mkdir(f.outputDirectory);
			}
		}
		return evidence;
	});
	const error = await createLessonPackage(f.request, { ...authority, signal: abort.signal }).catch(
		(e) => e,
	);
	expect(error.code).toBeTruthy();
	expect(JSON.stringify(error)).not.toContain("PRIVATE_WRITE_ERROR");
	const base = change === "destination-inode" ? f.outputDirectory + ".old" : f.outputDirectory;
	for (const name of await fs.readdir(base))
		expect(await fs.readdir(path.join(base, name))).not.toContain("package-receipt.json");
	if (change === "cancel-before-output") expect(await fs.readdir(f.outputDirectory)).toEqual([]);
	if (["input-inode", "receipt-inode", "destination-inode"].includes(change))
		expect(error.artifactPath).toBeUndefined();
	if (change === "cancel-output-decode") expect(error.artifactPath).toBeTruthy();
	if (output) expect(output).toContain("lesson-package-");
});

it("rechecks the exact bounded tree after pending decode, refusing an extra late private dependency", async () => {
	const f = await packageFixture(root),
		result = await createLessonPackage(f.request, authority);
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file) => {
		const value = await fakePackageVideo(file);
		await fs.writeFile(path.join(result.path, "late-private-journal.json"), "PRIVATE_LATE");
		return value;
	});
	await expect(verifyLessonPackage({ directory: result.path }, authority)).rejects.toHaveProperty(
		"code",
		"lesson-package-invalid",
	);
});

it.each([
	"manifest",
	"completion",
	"editable",
	"video",
])("refuses same-byte %s inode replacement during package verification", async (kind) => {
	const f = await packageFixture(root),
		result = await createLessonPackage(f.request, authority);
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file) => {
		const evidence = await fakePackageVideo(file),
			target =
				kind === "manifest"
					? path.join(result.path, "lesson-package.json")
					: kind === "completion"
						? path.join(result.path, "package-receipt.json")
						: kind === "editable"
							? path.join(result.path, "lesson.openscreen-lesson.json")
							: file,
			bytes = await fs.readFile(target);
		await fs.rename(target, path.join(root, "old-" + kind));
		await fs.writeFile(target, bytes);
		return evidence;
	});
	await expect(verifyLessonPackage({ directory: result.path }, authority)).rejects.toHaveProperty(
		"code",
		"lesson-package-invalid",
	);
});
it("copy descriptor identity is checked before reading a substituted unapproved inode", async () => {
	const { pinBinary, copyPinned } = await import("./packageIO"),
		file = path.join(root, "approved"),
		foreign = path.join(root, "PRIVATE_UNGRANTED"),
		target = path.join(root, "copy");
	await fs.writeFile(file, "approved bytes");
	await fs.writeFile(foreign, "PRIVATE_FOREIGN");
	const pinned = await pinBinary(file, 1024, () => {
			/* Selected authority. */
		}),
		open = fs.open.bind(fs),
		reads = vi.fn();
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const handle = await open(args[0] === file ? foreign : args[0], args[1], args[2]);
		if (args[0] === file) vi.spyOn(handle, "read").mockImplementation(reads);
		return handle;
	});
	await expect(
		copyPinned(pinned, target, () => {
			/* Current operation. */
		}),
	).rejects.toThrow();
	expect(reads).not.toHaveBeenCalled();
	await expect(fs.stat(target)).rejects.toHaveProperty("code", "ENOENT");
});
it("parallel package operations have isolated cancellation and exclusive completion folders", async () => {
	const f = await packageFixture(root),
		abort = new AbortController();
	let finish!: () => void, blocked: string | undefined;
	vi.mocked(validateRangeVideo).mockImplementation(async (file) => {
		const value = await fakePackageVideo(file);
		if (file.includes("/lesson-package-") && !blocked) {
			blocked = path.dirname(file);
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
		}
		return value;
	});
	const first = createLessonPackage(f.request, { ...authority, signal: abort.signal });
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	const second = await createLessonPackage(f.request, authority);
	abort.abort();
	finish();
	await expect(first).rejects.toHaveProperty("code", "lesson-package-cancelled");
	expect(await fs.readdir(second.path)).toContain("package-receipt.json");
	expect(await fs.readdir(path.dirname(blocked!))).not.toContain("package-receipt.json");
});
it("unsupported platforms fail closed before package path inspection", async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
	vi.mocked(realpathSync).mockClear();
	await expect(
		verifyLessonPackage({ directory: "/PRIVATE_NOT_INSPECTED" }, authority),
	).rejects.toHaveProperty("code", "lesson-package-unsupported");
	expect(realpathSync).not.toHaveBeenCalled();
});

it("an ancestor destination alias is refused before input reads or any referent output is created", async () => {
	const f = await packageFixture(root),
		real = path.join(root, "real-output"),
		alias = path.join(root, "alias-output");
	await fs.mkdir(path.join(real, "dest"), { recursive: true });
	await fs.symlink(real, alias, "dir");
	vi.mocked(openSync).mockClear();
	const open = vi.spyOn(fs, "open");
	await expect(
		createLessonPackage({ ...f.request, outputDirectory: path.join(alias, "dest") }, authority),
	).rejects.toHaveProperty("code", "lesson-package-invalid");
	expect(openSync).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	expect(await fs.readdir(path.join(real, "dest"))).toEqual([]);
});
it("verification requires fresh actual decode even when checksum and receipt claims agree", async () => {
	const f = await packageFixture(root),
		result = await createLessonPackage(f.request, authority);
	vi.mocked(validateRangeVideo).mockRejectedValueOnce(new Error("PRIVATE_DECODE_ERROR"));
	await expect(verifyLessonPackage({ directory: result.path }, authority)).rejects.toHaveProperty(
		"code",
		"lesson-package-invalid",
	);
});
it("existing authored code exclusions remain effective even if package inclusion is requested", async () => {
	const f = await packageFixture(root),
		{ defaultLessonOutput } = await import("../../src/lib/lesson/output");
	await fs.writeFile(
		f.request.manifestPath,
		JSON.stringify({ ...f.lesson, output: { ...defaultLessonOutput(), includeCode: false } }),
	);
	const result = await createLessonPackage({ ...f.request, includeCode: true }, authority);
	expect(result.scope.code).toBe("excluded");
	const inspected = await inspectLessonPackage({ directory: result.path }, authority);
	expect(inspected.lesson.steps[0].code).toBeUndefined();
});

it("case-folded illustration IDs cannot collide or silently merge when projected to portable paths", async () => {
	const f = await packageFixture(root),
		otherId = f.image.id.toUpperCase();
	expect(otherId).not.toBe(f.image.id);
	const lesson = {
		...f.lesson,
		assets: [f.image, { ...f.image, id: otherId }],
		steps: [
			f.lesson.steps[0],
			{ ...f.lesson.steps[1], imageId: otherId, imageAlt: "Second selected illustration" },
		],
	};
	await fs.writeFile(f.request.manifestPath, JSON.stringify(lesson));
	await expect(
		createLessonPackage(
			{
				...f.request,
				stepIds: lesson.steps.map((s) => s.id),
				imagePolicy: "include-external-provenance",
			},
			authority,
		),
	).rejects.toHaveProperty("code", "lesson-package-invalid");
	expect(await fs.readdir(f.outputDirectory)).toEqual([]);
});

it("uses the existing native diagnostic tolerance while fresh stored sample/decode timing remains mandatory", async () => {
	const f = await packageFixture(root),
		receipt = JSON.parse(await fs.readFile(f.request.media[0].receiptPath, "utf8"));
	receipt.output.nativeReportedDurationSec += 0.00000025;
	await fs.writeFile(f.request.media[0].receiptPath, JSON.stringify(receipt));
	expect((await createLessonPackage(f.request, authority)).videos).toBe(1);
});

it("reopens the retained v1 guide contract fixture, so future renderer changes cannot silently invalidate existing packages", async () => {
	const target = path.join(root, "retained-package");
	await fs.mkdir(target);
	for (const name of [
		"index.html",
		"lesson.md",
		"lesson.openscreen-lesson.json",
		"lesson-package.json",
		"package-receipt.json",
	])
		await fs.copyFile(
			path.resolve(__dirname, "__fixtures__/portable-lesson-v1", name + ".fixture"),
			path.join(target, name),
		);
	const result = await inspectLessonPackage({ directory: target }, authority);
	expect(result.summary).toMatchObject({
		status: "verified",
		steps: [{ id: "10000000-0000-4000-8000-000000000002", title: "Selected step" }],
	});
	expect(result.manifest.guideContract).toBe("openscreen-static-guide-portable-v1");
});
it("packages a video after later lesson text edits, while a changed pin still refuses", async () => {
	const f = await packageFixture(root),
		receiptBefore = await fs.readFile(f.request.media[0].receiptPath);
	// The author fixed wording after exporting the MP4: only the revision and text moved on.
	const edited = {
		...f.lesson,
		revision: f.lesson.revision + 3,
		steps: f.lesson.steps.map((step, index) =>
			index === 0 ? { ...step, instructions: "Corrected after the video export" } : step,
		),
	};
	await fs.writeFile(f.request.manifestPath, JSON.stringify(edited));
	const packaged = await createLessonPackage(f.request, authority);
	expect(packaged).toMatchObject({ status: "packaged", videos: 1 });
	const inspected = await inspectLessonPackage({ directory: packaged.path }, authority);
	expect(inspected.lesson.steps[0].instructions).toBe("Corrected after the video export");
	expect(inspected.manifest.videos[0].stepId).toBe(f.step.id);
	expect(await fs.readFile(f.request.media[0].receiptPath)).toEqual(receiptBefore);
	// A range changed after the export is a different video claim, whatever the revision says.
	const pin = edited.steps[0].mediaSelection;
	await fs.writeFile(
		f.request.manifestPath,
		JSON.stringify({
			...edited,
			revision: edited.revision + 1,
			steps: edited.steps.map((step, index) =>
				index === 0
					? { ...step, mediaSelection: { ...pin, documentSha256: "cd".repeat(32) } }
					: step,
			),
		}),
	);
	await expect(createLessonPackage(f.request, authority)).rejects.toHaveProperty(
		"code",
		"lesson-package-invalid",
	);
	expect((await fs.readdir(f.outputDirectory)).length).toBe(1);
});
it("carries authored LMS references into a verified mapping file with the video path, and adds none without references", async () => {
	const f = await packageFixture(root);
	const plain = await createLessonPackage(f.request, authority);
	expect(await fs.readdir(plain.path)).not.toContain("lesson-mapping.json");
	const referenced = {
		...f.lesson,
		lessonRef: "RPG Course 1 / Lesson 1",
		steps: f.lesson.steps.map((step, index) =>
			index === 0
				? { ...step, slideRef: "slide 12" }
				: { ...step, slideRef: "PRIVATE_EXCLUDED_SLIDE" },
		),
	};
	await fs.writeFile(f.request.manifestPath, JSON.stringify(referenced));
	const packaged = await createLessonPackage(f.request, authority),
		file = path.join(packaged.path, "lesson-mapping.json"),
		mapping = JSON.parse(await fs.readFile(file, "utf8")),
		opened = await inspectLessonPackage({ directory: packaged.path }, authority);
	expect(mapping).toMatchObject({
		lessonId: opened.lesson.id,
		lessonRef: "RPG Course 1 / Lesson 1",
		steps: [
			{
				number: 1,
				stepId: f.step.id,
				slideRef: "slide 12",
				video: { path: `media/${f.step.id.toLowerCase()}.mp4`, frames: 45, durationSec: 1.5 },
			},
		],
	});
	expect(JSON.stringify(mapping)).not.toContain("PRIVATE_EXCLUDED_SLIDE");
	expect(opened.manifest.files.map((entry) => entry.path)).toContain("lesson-mapping.json");
	expect(opened.lesson.steps[0].slideRef).toBe("slide 12");
	// The mapping is part of the checked inventory: an edited destination no longer verifies.
	await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("slide 12", "slide 13"));
	await expect(
		inspectLessonPackage({ directory: packaged.path }, authority),
	).rejects.toHaveProperty("code", "lesson-package-invalid");
});
