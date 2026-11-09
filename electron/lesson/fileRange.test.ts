import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { createLessonFileLifecycle } from "./fileLifecycle";
import { confirmLessonFileRange } from "./fileRange";
import { planLessonRange } from "./rangePlan";

let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "file-range-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

import { fixture } from "./fileRange.test-support";

const authority = {
	assertCurrent: () => {
		/* This fixture represents an authorized explicit caller. */
	},
};
it("explicitly pins into a new copy, reopens and same-project refreshes preserving input bytes and history", async () => {
	const f = await fixture(root),
		old = await fs.readFile(f.manifestPath),
		project = await fs.readFile(f.projectPath),
		source = await fs.readFile(f.source);
	const result = await confirmLessonFileRange(f.request, authority);
	expect(result).toMatchObject({ status: "confirmed", revision: 1, stepId: f.request.stepId });
	expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CODE_CANARY|sha256|source.mp4/);
	const first = JSON.parse(await fs.readFile(result.path, "utf8"));
	expect(first.steps[0].mediaSelection.version).toBe(2);
	await fs.writeFile(f.source, "explicitly reviewed changed source");
	const refreshed = await confirmLessonFileRange(
		{
			...f.request,
			manifestPath: result.path,
			outputPath: path.join(root, "refreshed.json"),
			intent: "refresh-current",
		},
		authority,
	);
	const next = JSON.parse(await fs.readFile(refreshed.path, "utf8"));
	expect(next.steps[0].mediaSelection.previousSelections).toHaveLength(2);
	expect(next.steps[0].mediaSelection.previousSelections[1].identity).toEqual(
		first.steps[0].mediaSelection.identity,
	);
	expect(await fs.readFile(f.manifestPath)).toEqual(old);
	expect(await fs.readFile(f.projectPath)).toEqual(project);
	expect(source.toString()).toBe("synthetic source bytes");
	expect(await fs.readdir(root)).not.toContain(".partial");
});
it.each([
	"wrong-project",
	"wrong-step",
	"missing-grant",
	"legacy-project",
	"existing-output",
	"bad-intent",
	"extra-path",
])("refuses %s with fixed codes and no input writes", async (change) => {
	const f = await fixture(root),
		original = await fs.readFile(f.manifestPath);
	let input: unknown = f.request;
	if (change === "wrong-project") input = { ...f.request, projectId: "foreign" };
	if (change === "wrong-step") input = { ...f.request, stepId: randomUUID() };
	if (change === "missing-grant")
		input = { ...f.request, sourcePaths: [path.join(root, "other.mp4")] };
	if (change === "legacy-project")
		await fs.writeFile(f.projectPath, JSON.stringify({ ...f.document, schemaVersion: 3 }));
	if (change === "existing-output") await fs.writeFile(f.request.outputPath, "EXISTING");
	if (change === "bad-intent") input = { ...f.request, intent: "refresh-current" };
	if (change === "extra-path") input = { ...f.request, discoverDirectory: root };
	await expect(confirmLessonFileRange(input, authority)).rejects.toHaveProperty("code");
	expect(await fs.readFile(f.manifestPath)).toEqual(original);
	if (change === "existing-output")
		expect(await fs.readFile(f.request.outputPath, "utf8")).toBe("EXISTING");
	else await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("checks permission and cancellation before any filesystem inspection", async () => {
	const f = await fixture(root),
		stat = vi.spyOn(fs, "lstat"),
		open = vi.spyOn(fs, "open");
	const signal = AbortSignal.abort();
	await expect(confirmLessonFileRange(f.request, { ...authority, signal })).rejects.toHaveProperty(
		"code",
		"range-source-cancelled",
	);
	await expect(
		confirmLessonFileRange(f.request, {
			assertCurrent: () => {
				throw new Error("denied");
			},
		}),
	).rejects.toHaveProperty("code");
	expect(stat).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
});
it.each([
	"lesson",
	"project",
	"replace-identical",
	"cancel",
	"revoke",
])("refuses %s during source observation before publication", async (change) => {
	const f = await fixture(root),
		abort = new AbortController();
	let allowed = true,
		done = false;
	const open = fs.open.bind(fs);
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const file = await open(...args);
		if (args[0] === f.source && !done) {
			done = true;
			if (change === "lesson")
				await fs.writeFile(f.manifestPath, JSON.stringify({ ...f.lesson, title: "Changed" }));
			if (change === "project")
				await fs.writeFile(
					f.projectPath,
					JSON.stringify({ ...f.document, project: { ...f.document.project, title: "Changed" } }),
				);
			if (change === "replace-identical") {
				const bytes = await fs.readFile(f.manifestPath);
				await fs.rename(f.manifestPath, f.manifestPath + ".old");
				await fs.writeFile(f.manifestPath, bytes);
			}
			if (change === "cancel") abort.abort();
			if (change === "revoke") allowed = false;
		}
		return file;
	});
	await expect(
		confirmLessonFileRange(f.request, {
			signal: abort.signal,
			assertCurrent: () => {
				if (!allowed) throw new Error("denied");
			},
		}),
	).rejects.toHaveProperty("code");
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("cancelled staged writes remain inspectable and never publish a completed copy", async () => {
	const f = await fixture(root),
		abort = new AbortController(),
		write = fs.writeFile.bind(fs);
	vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await write(...args);
		abort.abort();
	});
	const error = await confirmLessonFileRange(f.request, {
		...authority,
		signal: abort.signal,
	}).catch((error) => error);
	expect(error.code).toBe("range-source-cancelled");
	expect(await fs.readFile(error.artifactPath, "utf8")).toContain("PRIVATE_CODE_CANARY");
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("racing publications never overwrite the first completed output", async () => {
	const f = await fixture(root);
	const results = await Promise.allSettled([
		confirmLessonFileRange(f.request, authority),
		confirmLessonFileRange(f.request, authority),
	]);
	expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
	expect(
		JSON.parse(await fs.readFile(f.request.outputPath, "utf8")).steps[0].mediaSelection.version,
	).toBe(2);
});
it("caller lifecycle drains actual work and isolates another caller", async () => {
	const one = createLessonFileLifecycle(),
		two = createLessonFileLifecycle();
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => {
		finish = resolve;
	});
	one.track(pending);
	let drained = false;
	const closing = one.drain().then(() => {
		drained = true;
	});
	one.abort();
	await Promise.resolve();
	expect(drained).toBe(false);
	expect(one.signal.aborted).toBe(true);
	expect(two.signal.aborted).toBe(false);
	finish();
	await closing;
	expect(drained).toBe(true);
});
it("rejects a tampered staged lesson instead of publishing different valid bytes", async () => {
	const f = await fixture(root),
		write = fs.writeFile.bind(fs);
	vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await write(...args);
		const target = String(args[0]);
		const lesson = JSON.parse(await fs.readFile(target, "utf8"));
		await write(target, JSON.stringify({ ...lesson, title: "TAMPERED" }));
	});
	const error = await confirmLessonFileRange(f.request, authority).catch((e) => e);
	expect(error.code).toBe("range-target-changed");
	expect(await fs.readFile(error.artifactPath, "utf8")).toContain("TAMPERED");
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("a destination appearing after observation is preserved by atomic no-overwrite publication", async () => {
	const f = await fixture(root),
		write = fs.writeFile.bind(fs);
	vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await write(...args);
		await write(f.request.outputPath, "WINNER");
	});
	await expect(confirmLessonFileRange(f.request, authority)).rejects.toHaveProperty(
		"code",
		"destination-exists",
	);
	expect(await fs.readFile(f.request.outputPath, "utf8")).toBe("WINNER");
});
it.each([
	"source",
	"missing-source",
	"output-parent",
])("refuses %s symlink/missing authority without modifying input", async (change) => {
	const f = await fixture(root);
	let request = f.request;
	if (change === "missing-source") await fs.unlink(f.source);
	if (change === "source") {
		const other = path.join(root, "elsewhere");
		await fs.mkdir(other);
		await fs.copyFile(f.source, path.join(other, "source.mp4"));
		await fs.unlink(f.source);
		await fs.symlink(path.join(other, "source.mp4"), f.source);
	}
	if (change === "output-parent") {
		const other = path.join(root, "alias");
		await fs.symlink(root, other, "dir");
		request = { ...request, outputPath: path.join(other, "new.json") };
	}
	await expect(confirmLessonFileRange(request, authority)).rejects.toHaveProperty("code");
	await expect(fs.stat(request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("parallel confirmation owners cannot cancel or certify one another's snapshots", async () => {
	const f = await fixture(root),
		one = new AbortController(),
		two = new AbortController();
	one.abort();
	const results = await Promise.allSettled([
		confirmLessonFileRange(f.request, { ...authority, signal: one.signal }),
		confirmLessonFileRange(
			{ ...f.request, outputPath: path.join(root, "other.json") },
			{ ...authority, signal: two.signal },
		),
	]);
	expect(results[0].status).toBe("rejected");
	expect(results[1].status).toBe("fulfilled");
	expect(two.signal.aborted).toBe(false);
});
it("a source lesson changed while staging is refused by the final snapshot check", async () => {
	const f = await fixture(root),
		write = fs.writeFile.bind(fs);
	vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await write(...args);
		await write(f.manifestPath, JSON.stringify({ ...f.lesson, title: "CHANGED_AT_STAGING" }));
	});
	const error = await confirmLessonFileRange(f.request, authority).catch((e) => e);
	expect(error.code).toBe("range-target-changed");
	expect(await fs.readFile(error.artifactPath, "utf8")).toContain("PRIVATE_CODE_CANARY");
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("revoked authority hides retained staged paths and prevents publication", async () => {
	const f = await fixture(root),
		write = fs.writeFile.bind(fs);
	let allowed = true;
	vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
		await write(...args);
		allowed = false;
	});
	const error = await confirmLessonFileRange(f.request, {
		assertCurrent: () => {
			if (!allowed) throw new Error("revoked");
		},
	}).catch((e) => e);
	expect(error.artifactPath).toBeUndefined();
	expect((await fs.readdir(root)).some((name) => name.endsWith(".partial"))).toBe(true);
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});

it("keeps a legacy reference intact until explicit same-project refresh into a new pinned copy", async () => {
	const f = await fixture(root),
		reference = await planLessonRange(f.document, {
			projectId: "project",
			documentSha256: await lessonRenderFingerprint(f.document),
			startSec: 0.5,
			endSec: 4,
		});
	await fs.writeFile(
		f.manifestPath,
		JSON.stringify({ ...f.lesson, steps: [{ ...f.lesson.steps[0], mediaSelection: reference }] }),
	);
	const old = await fs.readFile(f.manifestPath);
	await expect(confirmLessonFileRange(f.request, authority)).rejects.toHaveProperty(
		"code",
		"range-target-changed",
	);
	const result = await confirmLessonFileRange(
			{ ...f.request, intent: "refresh-current" },
			authority,
		),
		next = JSON.parse(await fs.readFile(result.path, "utf8"));
	expect(next.steps[0].mediaSelection.version).toBe(2);
	expect(next.steps[0].mediaSelection.previousSelections).toHaveLength(1);
	expect(next.steps[0].mediaSelection.previousSelections[0].version).toBe(1);
	expect(await fs.readFile(f.manifestPath)).toEqual(old);
});
