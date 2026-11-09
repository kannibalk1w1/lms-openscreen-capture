import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { createLessonFileLifecycle } from "../lesson/fileLifecycle";
import { fakePackageVideo, packageFixture } from "../lesson/package.test-support";
import { parseCliArgs } from "./args";
import { runLessonCommand } from "./lessonCommands";

vi.mock("../lesson/encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "package-cli-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
it("actual CLI parser/command exports and verifies explicit package then queries derived editable lesson after original authoring paths move", async () => {
	const f = await packageFixture(root),
		argv = [
			"electron",
			"app",
			"lesson",
			"package",
			f.request.manifestPath,
			"--step",
			f.step.id,
			"--code",
			"exclude",
			"--images",
			"exclude",
			"--media",
			f.step.id,
			f.request.media[0].mediaPath,
			f.request.media[0].receiptPath,
			"--out",
			f.outputDirectory,
			"--json",
		],
		command = parseCliArgs(argv, 2)!,
		chunks: string[] = [],
		lifecycle = createLessonFileLifecycle();
	if (command.kind !== "lesson" || command.action !== "package")
		throw new Error("not package command");
	expect(command.request).toEqual(f.request);
	expect(await runLessonCommand(command, (s) => chunks.push(s), { lifecycle })).toBe(0);
	const result = JSON.parse(chunks.pop()!).result;
	await fs.rename(f.authoring, f.authoring + ".offline");
	const verify = parseCliArgs(
		["electron", "app", "lesson", "verify-package", result.path, "--json"],
		2,
	)!;
	if (verify.kind !== "lesson") throw new Error("not verification");
	expect(await runLessonCommand(verify, (s) => chunks.push(s), { lifecycle })).toBe(0);
	expect(JSON.parse(chunks.pop()!).result.status).toBe("verified");
	const query = parseCliArgs(
		[
			"electron",
			"app",
			"lesson",
			"query",
			path.join(result.path, "lesson.openscreen-lesson.json"),
			"--json",
		],
		2,
	)!;
	if (query.kind !== "lesson") throw new Error("not query");
	expect(await runLessonCommand(query, (s) => chunks.push(s))).toBe(0);
	expect(chunks.join("")).not.toMatch(/PRIVATE_|mediaSelection|identity|documentSha256/);
	expect(
		parseCliArgs(
			argv.filter((v) => v !== "--images" && v !== "exclude"),
			2,
		),
	).toMatchObject({ kind: "error" });
	expect(parseCliArgs([...argv, "--out", root], 2)).toMatchObject({ kind: "error" });
	expect(parseCliArgs([...argv, "--source", "/PRIVATE_UNGRANTED"], 2)).toMatchObject({
		kind: "error",
	});
});
it("package commands require a real caller lifecycle and return fixed errors on cancellation, without paths/payloads", async () => {
	const f = await packageFixture(root),
		command = {
			kind: "lesson" as const,
			action: "package" as const,
			manifestPath: f.request.manifestPath,
			request: f.request,
			json: true,
		},
		chunks: string[] = [];
	expect(await runLessonCommand(command, (s) => chunks.push(s))).toBe(1);
	expect(JSON.parse(chunks[0]).message).toBe("lesson-package-unsupported");
	expect(
		await runLessonCommand(command, (s) => chunks.push(s), {
			lifecycle: createLessonFileLifecycle(),
			signal: AbortSignal.abort(),
		}),
	).toBe(1);
	expect(JSON.parse(chunks[1]).message).toBe("lesson-package-cancelled");
	expect(chunks.join("")).not.toContain(root);
	expect(await fs.readdir(f.outputDirectory)).toEqual([]);
});
