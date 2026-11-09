import { createHash, randomUUID } from "node:crypto";
import { lstatSync, openSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderOwnerJobs } from "../ipc/exportJobs";
import { validateRangeVideo } from "./encodedVideo";
import { exportLessonRangeFile, LESSON_FILE_EXPORT_CHANNEL } from "./fileExport";
import { createLessonFileLifecycle } from "./fileLifecycle";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		openSync: vi.fn(actual.openSync),
		realpathSync: vi.fn(actual.realpathSync),
		lstatSync: vi.fn(actual.lstatSync),
	};
});
vi.mock("./encodedVideo", () => ({
	validateRangeVideo: vi.fn(async (file: string) => {
		const bytes = await fs.readFile(file);
		return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	}),
}));
let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "file-export-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

import { setup } from "./fileExport.test-support";

it("exports only one pinned included step through the shared service and validator, preserving all inputs and receipt flags", async () => {
	const f = await setup(root),
		before = await Promise.all([
			fs.readFile(f.request.manifestPath),
			fs.readFile(f.request.projectPath),
			fs.readFile(f.source),
		]),
		progress: unknown[] = [];
	const result = await exportLessonRangeFile(f.request, f.authority, f.render, (value) =>
		progress.push(value),
	);
	expect(result).toMatchObject({ status: "materialized", frames: 45 });
	if (result.status !== "materialized") throw new Error("not materialized");
	const receipt = JSON.parse(
		await fs.readFile(path.join(result.path, "range-export.json"), "utf8"),
	);
	expect(receipt).toMatchObject({
		target: { lessonId: f.lesson.id, stepId: f.step.id },
		output: { frames: 45, nativeReportedDurationSec: 1.5 },
		mediaDecodedByValidator: true,
		encodedTimingVerified: true,
		audio: { streamMetadataVerified: false, timingVerified: false },
	});
	expect(progress).not.toHaveLength(0);
	expect(
		await Promise.all([
			fs.readFile(f.request.manifestPath),
			fs.readFile(f.request.projectPath),
			fs.readFile(f.source),
		]),
	).toEqual(before);
	expect((await exportLessonRangeFile(f.request, f.authority, f.render)).status).toBe(
		"materialized",
	);
});
it("permission or pre-cancellation refuses before any filesystem access", async () => {
	const f = await setup(root);
	for (const mock of [openSync, realpathSync, lstatSync]) vi.mocked(mock).mockClear();
	const open = vi.spyOn(fs, "open");
	await expect(
		exportLessonRangeFile(f.request, { ...f.authority, signal: AbortSignal.abort() }, f.render),
	).rejects.toHaveProperty("code", "range-export-cancelled");
	await expect(
		exportLessonRangeFile(
			f.request,
			{
				...f.authority,
				assertCurrent: () => {
					throw new Error("denied");
				},
			},
			f.render,
		),
	).rejects.toHaveProperty("code");
	expect(openSync).not.toHaveBeenCalled();
	expect(realpathSync).not.toHaveBeenCalled();
	expect(lstatSync).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
});
it.each([
	"legacy",
	"unattested",
	"not-included",
	"foreign-project",
	"extra-destination",
	"missing-grant",
	"changed-source",
	"missing-source",
	"lesson-ancestor",
	"destination-symlink",
])("refuses %s before native rendering without implicit refresh", async (change) => {
	const f = await setup(root),
		pin = JSON.stringify(f.pin);
	let request: unknown = f.request;
	if (change === "legacy" || change === "unattested") {
		await fs.writeFile(
			f.request.manifestPath,
			JSON.stringify({
				...f.lesson,
				steps: [{ ...f.step, mediaSelection: change === "legacy" ? f.reference : undefined }],
			}),
		);
	}
	if (change === "not-included") request = { ...f.request, includedStepIds: [randomUUID()] };
	if (change === "foreign-project") request = { ...f.request, projectId: "other" };
	if (change === "extra-destination") request = { ...f.request, destination: "/PRIVATE" };
	if (change === "missing-grant")
		request = { ...f.request, sourcePaths: [path.join(root, "other.mp4")] };
	if (change === "changed-source") await fs.writeFile(f.source, "replacement");
	if (change === "missing-source") await fs.unlink(f.source);
	if (change === "lesson-ancestor") {
		const alias = path.join(root, "alias");
		await fs.symlink(root, alias, "dir");
		request = { ...f.request, manifestPath: path.join(alias, "lesson.json") };
	}
	if (change === "destination-symlink") {
		const alias = path.join(root, "alias");
		await fs.symlink(root, alias, "dir");
		request = { ...f.request, outputDirectory: alias };
	}
	await expect(exportLessonRangeFile(request, f.authority, f.render)).rejects.toHaveProperty(
		"code",
	);
	expect(f.native).not.toHaveBeenCalled();
	expect(JSON.stringify(f.pin)).toBe(pin);
	expect((await fs.readdir(root)).some((name) => name.startsWith("lesson-range-"))).toBe(false);
});
it.each([
	true,
	false,
])("cancels owned native work with controls=%s and holds both leases through actual settlement", async (controls) => {
	const f = await setup(root, controls),
		abort = new AbortController();
	let finish!: () => void,
		id = "";
	f.native.mockImplementationOnce(async (_clips, file) => {
		await fs.writeFile(file, "partial");
		return new Promise((resolve) => {
			finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
		});
	});
	const pending = exportLessonRangeFile(
		f.request,
		{ ...f.authority, signal: abort.signal },
		f.render,
		(value) => {
			id = value.operationId;
		},
	);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	expect(
		renderOwnerJobs.cancel(createLessonFileLifecycle().owner, id, LESSON_FILE_EXPORT_CHANNEL),
	).toBe(false);
	expect(renderOwnerJobs.cancel(f.lifecycle.owner, id, "export")).toBe(false);
	expect(renderOwnerJobs.cancel(f.lifecycle.owner, randomUUID(), LESSON_FILE_EXPORT_CHANNEL)).toBe(
		false,
	);
	abort.abort();
	if (controls) expect(f.cancel).toHaveBeenCalledOnce();
	else expect(f.cancel).not.toHaveBeenCalled();
	await expect(exportLessonRangeFile(f.request, f.authority, f.render)).rejects.toHaveProperty(
		"code",
		"render-busy",
	);
	await expect(f.compositor.renderFrames([], "{}", 30, [0], 64)).rejects.toThrow(/already running/);
	finish();
	const error = await pending.catch((e) => e);
	expect(error.code).toBe("range-export-cancelled");
	expect(error.artifactPath).toBeTruthy();
	expect(await fs.readdir(error.artifactPath)).not.toContain("range-export.json");
	expect((await exportLessonRangeFile(f.request, f.authority, f.render)).status).toBe(
		"materialized",
	);
	expect(renderOwnerJobs.cancel(f.lifecycle.owner, id, LESSON_FILE_EXPORT_CHANNEL)).toBe(false);
});
it("connection closure invalidates authority and hides paths but waits for native completion", async () => {
	const f = await setup(root);
	let finish!: () => void;
	f.native.mockImplementationOnce(
		async () =>
			new Promise((resolve) => {
				finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
			}),
	);
	const pending = exportLessonRangeFile(
		f.request,
		{ ...f.authority, signal: f.lifecycle.signal },
		f.render,
	);
	f.lifecycle.track(pending);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	f.lifecycle.abort();
	let drained = false;
	const drain = f.lifecycle.drain().then(() => {
		drained = true;
	});
	await Promise.resolve();
	expect(drained).toBe(false);
	await expect(f.compositor.renderFrames([], "{}", 30, [0], 64)).rejects.toThrow(/already running/);
	finish();
	const error = await pending.catch((e) => e);
	await drain;
	expect(error.code).toBe("range-export-cancelled");
	expect(error.artifactPath).toBeUndefined();
});
it.each([
	"lesson-inode",
	"project-inode",
	"permission",
	"cancel",
	"validator",
])("refuses %s during decode without a receipt", async (change) => {
	const f = await setup(root),
		abort = new AbortController();
	let allowed = true;
	vi.mocked(validateRangeVideo).mockImplementationOnce(async (file) => {
		if (change.endsWith("inode")) {
			const target = change === "lesson-inode" ? f.request.manifestPath : f.request.projectPath,
				bytes = await fs.readFile(target);
			await fs.rename(target, target + ".old");
			await fs.writeFile(target, bytes);
		}
		if (change === "permission") allowed = false;
		if (change === "cancel") abort.abort();
		if (change === "validator") throw new Error("PRIVATE_DECODE_CANARY");
		const bytes = await fs.readFile(file);
		return {
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		} as Awaited<ReturnType<typeof validateRangeVideo>>;
	});
	const error = await exportLessonRangeFile(
		f.request,
		{
			...f.authority,
			signal: abort.signal,
			assertCurrent: () => {
				if (!allowed) throw new Error("denied");
			},
		},
		f.render,
	).catch((e) => e);
	expect(error.code).toBeTruthy();
	expect(JSON.stringify(error)).not.toContain("PRIVATE_DECODE_CANARY");
	const dirs = (await fs.readdir(root)).filter((name) => name.startsWith("lesson-range-"));
	expect(dirs).toHaveLength(1);
	expect(await fs.readdir(path.join(root, dirs[0]))).not.toContain("range-export.json");
	if (change.includes("inode") || change === "permission")
		expect(error.artifactPath).toBeUndefined();
});

it("rejects replacement of the explicit destination directory during decode, with unchanged saved inputs", async () => {
	const f = await setup(root),
		destination = path.join(root, "destination");
	await fs.mkdir(destination);
	const before = await Promise.all([
		fs.readFile(f.request.manifestPath),
		fs.readFile(f.request.projectPath),
	]);
	vi.mocked(validateRangeVideo).mockImplementationOnce(async () => {
		await fs.rename(destination, destination + ".old");
		await fs.mkdir(destination);
		return {} as Awaited<ReturnType<typeof validateRangeVideo>>;
	});
	const error = await exportLessonRangeFile(
		{ ...f.request, outputDirectory: destination },
		f.authority,
		f.render,
	).catch((e) => e);
	expect(error.code).toBe("project-changed");
	expect(error.artifactPath).toBeUndefined();
	expect(await fs.readdir(destination)).toEqual([]);
	for (const dir of await fs.readdir(destination + ".old"))
		expect(await fs.readdir(path.join(destination + ".old", dir))).not.toContain(
			"range-export.json",
		);
	expect(
		await Promise.all([fs.readFile(f.request.manifestPath), fs.readFile(f.request.projectPath)]),
	).toEqual(before);
});

it("refuses a source symlink whose identical-byte real target is separately approved", async () => {
	const f = await setup(root),
		target = path.join(root, "other-approved.mp4"),
		before = await Promise.all([
			fs.readFile(f.request.manifestPath),
			fs.readFile(f.request.projectPath),
		]);
	await fs.rename(f.source, target);
	await fs.symlink(target, f.source);
	await expect(
		exportLessonRangeFile({ ...f.request, sourcePaths: [f.source, target] }, f.authority, f.render),
	).rejects.toHaveProperty("code", "range-export-source-unavailable");
	expect(f.native).not.toHaveBeenCalled();
	expect(
		await Promise.all([fs.readFile(f.request.manifestPath), fs.readFile(f.request.projectPath)]),
	).toEqual(before);
});

it("refuses an ancestor output symlink with the fixed early error before reading selected inputs/media", async () => {
	const f = await setup(root),
		real = path.join(root, "real"),
		alias = path.join(root, "alias");
	await fs.mkdir(path.join(real, "destination"), { recursive: true });
	await fs.symlink(real, alias, "dir");
	const before = await Promise.all([
		fs.readFile(f.request.manifestPath),
		fs.readFile(f.request.projectPath),
	]);
	vi.mocked(openSync).mockClear();
	const open = vi.spyOn(fs, "open");
	await expect(
		exportLessonRangeFile(
			{ ...f.request, outputDirectory: path.join(alias, "destination") },
			f.authority,
			f.render,
		),
	).rejects.toHaveProperty("code", "range-export-unsupported");
	expect(openSync).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
	expect(await fs.readdir(path.join(real, "destination"))).toEqual([]);
	expect(
		await Promise.all([fs.readFile(f.request.manifestPath), fs.readFile(f.request.projectPath)]),
	).toEqual(before);
});

it("suppresses a partial path when selected inputs become stale after the service failure but before transport disclosure", async () => {
	const f = await setup(root),
		before = await fs.readFile(f.request.manifestPath);
	const { LessonRangeExportService } = await import("./rangeExport"),
		start = LessonRangeExportService.prototype.start;
	let serviceArtifact: string | undefined;
	vi.mocked(validateRangeVideo).mockRejectedValueOnce(new Error("PRIVATE_DECODER_FAILURE"));
	vi.spyOn(LessonRangeExportService.prototype, "start").mockImplementation(function (
		this: import("./rangeExport").LessonRangeExportService,
		...args
	) {
		const job = start.apply(this, args);
		return {
			...job,
			result: job.result.catch(async (error) => {
				serviceArtifact = error.artifactPath;
				expect(serviceArtifact).toBeTruthy();
				await fs.rename(f.request.manifestPath, f.request.manifestPath + ".old");
				await fs.writeFile(f.request.manifestPath, before);
				throw error;
			}),
		};
	});
	const error = await exportLessonRangeFile(f.request, f.authority, f.render).catch((e) => e);
	expect(error.code).toBe("range-export-incomplete");
	expect(serviceArtifact).toBeTruthy();
	expect(error.artifactPath).toBeUndefined();
	expect(await fs.readFile(f.request.manifestPath)).toEqual(before);
	expect(await fs.readdir(serviceArtifact!)).not.toContain("range-export.json");
});

it("keeps a distinct unavailable-tool error and partial evidence without a false receipt", async () => {
	const f = await setup(root),
		{ RangeVideoToolUnavailableError } = await import("./rangeErrors");
	vi.mocked(validateRangeVideo).mockRejectedValueOnce(new RangeVideoToolUnavailableError());
	const error = await exportLessonRangeFile(f.request, f.authority, f.render).catch((e) => e);
	expect(error.code).toBe("range-export-tool-unavailable");
	expect(error.artifactPath).toBeTruthy();
	expect(await fs.readdir(error.artifactPath)).not.toContain("range-export.json");
	expect(JSON.stringify(error)).not.toContain("ffmpeg");
});
