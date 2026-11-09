import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { emptyLessonQuery } from "../../src/lib/lesson/review";
import { fixture } from "../lesson/fileRange.test-support";
import { parseCliArgs } from "./args";
import { runLessonCommand } from "./lessonCommands";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-cli-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
it("queries and exports the selected source with bounded NDJSON results", async () => {
	const step = {
		...newStep("Selected"),
		instructions: "PRIVATE_INSTRUCTION",
		code: { language: "plain", text: "PRIVATE_CODE" },
	};
	const source = path.join(root, "lesson.json");
	const raw = JSON.stringify({ ...newLesson(), steps: [step, newStep("OMITTED_TITLE")] });
	await fs.writeFile(source, raw);
	const chunks: string[] = [],
		out = (value: string) => {
			chunks.push(value);
		};
	expect(
		await runLessonCommand(
			{
				kind: "lesson",
				action: "query",
				manifestPath: source,
				query: { ...emptyLessonQuery(), title: "Selected" },
				json: true,
			},
			out,
		),
	).toBe(0);
	const query = JSON.parse(chunks.pop() ?? "");
	expect(query).toMatchObject({
		event: "done",
		result: { matchingSteps: 1, steps: [{ id: step.id }] },
	});
	expect(JSON.stringify(query)).not.toMatch(/PRIVATE_INSTRUCTION|PRIVATE_CODE|OMITTED_TITLE/);
	expect(
		await runLessonCommand(
			{
				kind: "lesson",
				action: "export",
				manifestPath: source,
				outputDirectory: root,
				stepIds: [step.id],
				json: true,
			},
			out,
		),
	).toBe(0);
	const exported = JSON.parse(chunks.pop() ?? "");
	expect(exported).toMatchObject({ event: "done", result: { status: "exported", steps: 1 } });
	expect(
		JSON.parse(await fs.readFile(path.join(exported.result.path, "export-report.json"), "utf8"))
			.format,
	).toBe("openscreen-guide-export");
	expect(await fs.readFile(source, "utf8")).toBe(raw);
});
it("returns fixed errors without OS paths or imported content and nonzero exit status", async () => {
	const source = path.join(root, "PRIVATE_USERNAME.json");
	await fs.writeFile(source, '{"secret":"PRIVATE_SECRET"}');
	const chunks: string[] = [];
	expect(
		await runLessonCommand(
			{
				kind: "lesson",
				action: "query",
				manifestPath: source,
				query: emptyLessonQuery(),
				json: true,
			},
			(value) => {
				chunks.push(value);
			},
		),
	).toBe(1);
	expect(chunks).toEqual(['{"event":"error","message":"lesson-file-operation-failed"}\n']);
	expect(
		await runLessonCommand(
			{
				kind: "lesson",
				action: "export",
				manifestPath: path.join(root, "PRIVATE_MISSING"),
				outputDirectory: root,
				stepIds: [crypto.randomUUID()],
			},
			(value) => {
				chunks.push(value);
			},
		),
	).toBe(1);
	expect(chunks[1]).toBe("lesson-file-operation-failed\n");
	expect(await fs.readdir(root)).toEqual(["PRIVATE_USERNAME.json"]);
});

it("runs the actual explicit-file command through shared confirmation, save/reopen and fixed denial", async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	const f = await fixture(root),
		chunks: string[] = [];
	const command = parseCliArgs(
		[
			"electron",
			"app",
			"lesson",
			"confirm-range",
			f.manifestPath,
			"--project",
			f.projectPath,
			"--project-id",
			"project",
			"--step",
			f.request.stepId,
			"--start",
			".5",
			"--end",
			"4",
			"--source",
			f.source,
			"--intent",
			"author-current",
			"--out",
			f.request.outputPath,
			"--json",
		],
		2,
	)!;
	if (command.kind !== "lesson") throw new Error("missing CLI lesson command");
	expect(await runLessonCommand(command, (s) => chunks.push(s))).toBe(0);
	expect(JSON.parse(chunks[0])).toMatchObject({
		event: "done",
		result: { status: "confirmed", path: f.request.outputPath },
	});
	expect(chunks[0]).not.toContain("PRIVATE_CODE_CANARY");
	expect(await runLessonCommand(command, (s) => chunks.push(s))).toBe(1);
	expect(JSON.parse(chunks[1])).toMatchObject({ event: "error", message: "destination-exists" });
});

it("runs explicit selected MP4 through production CLI parser/command and actual validator rejection", async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	const { setup } = await import("../lesson/fileExport.test-support"),
		f = await setup(root),
		chunks: string[] = [];
	const argv = [
		"electron",
		"app",
		"lesson",
		"export-range",
		f.request.manifestPath,
		"--project",
		f.request.projectPath,
		"--project-id",
		"p",
		"--step",
		f.step.id,
		"--source",
		f.source,
		"--out",
		root,
		"--json",
	];
	const command = parseCliArgs(argv, 2)!;
	if (command.kind !== "lesson" || command.action !== "export-range")
		throw new Error("missing command");
	expect(command.request).toEqual(f.request);
	// Fixture bytes deliberately fail the real decoder; native stats cannot certify them.
	expect(
		await runLessonCommand(command, (s) => chunks.push(s), {
			lifecycle: f.lifecycle,
			render: f.render,
		}),
	).toBe(1);
	expect(f.native).toHaveBeenCalledOnce();
	expect(JSON.parse(chunks.at(-1)!)).toMatchObject({
		event: "error",
		message: "range-export-incomplete",
	});
	expect(chunks.some((s) => JSON.parse(s).event === "lesson-progress")).toBe(true);
	expect(chunks.join("")).not.toContain("PRIVATE_SOURCE");
	expect(parseCliArgs([...argv, "--step", f.step.id], 2)).toMatchObject({ kind: "error" });
	expect(parseCliArgs([...argv, "--out", root], 2)).toMatchObject({ kind: "error" });
});

it("reports unavailable verification tooling distinctly with fixed actionable detail and an authorized unfinished path", async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	const { setup } = await import("../lesson/fileExport.test-support"),
		f = await setup(root),
		video = await import("../lesson/encodedVideo"),
		{ RangeVideoToolUnavailableError } = await import("../lesson/rangeErrors"),
		chunks: string[] = [];
	vi.spyOn(video, "validateRangeVideo").mockRejectedValueOnce(new RangeVideoToolUnavailableError());
	expect(
		await runLessonCommand(
			{
				kind: "lesson",
				action: "export-range",
				manifestPath: f.request.manifestPath,
				request: f.request,
				json: true,
			},
			(s) => chunks.push(s),
			{ lifecycle: f.lifecycle, render: f.render },
		),
	).toBe(1);
	const error = JSON.parse(chunks.at(-1)!);
	expect(error).toMatchObject({
		event: "error",
		message: "range-export-tool-unavailable",
		detail: expect.stringContaining("Reinstall or update OpenScreen"),
	});
	expect(error.artifactPath).toMatch(/lesson-range-/);
	expect(chunks.join("")).not.toContain("PRIVATE_SOURCE");
	expect(await fs.readdir(error.artifactPath)).not.toContain("range-export.json");
});
