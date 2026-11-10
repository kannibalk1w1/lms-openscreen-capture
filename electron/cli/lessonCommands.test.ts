import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { illustrationUnsupportedMessage } from "../../src/lib/lesson/api";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { emptyLessonQuery } from "../../src/lib/lesson/review";
import {
	illustrationFixture,
	UNGRANTED_DEPENDENCIES,
	type UngrantedDependency,
} from "../lesson/fileIllustrate.test-support";
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
it("authors a lesson headlessly through new, add-step, query and export without replacing any file", async () => {
	const run = async (...args: string[]) => {
		const chunks: string[] = [];
		const command = parseCliArgs(["electron", "app", "lesson", ...args, "--json"], 2, root);
		if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
		const code = await runLessonCommand(command, (value) => chunks.push(value));
		return { code, event: JSON.parse(chunks.join("").trim().split("\n").at(-1)!) };
	};
	const first = path.join(root, "first.json"),
		second = path.join(root, "second.json"),
		third = path.join(root, "third.json");
	const created = await run("new", "first.json", "--title", "Enemy", "--lesson-ref", "RPG C1 / L1");
	expect(created).toMatchObject({ code: 0, event: { result: { status: "created", path: first } } });
	const firstBytes = await fs.readFile(first, "utf8");
	expect((await fs.stat(first)).mode & 0o777).toBe(0o600);
	const one = await run(
		"add-step",
		"first.json",
		"--title",
		"Add a Node2D",
		"--instructions",
		"Click +\nChoose Node2D",
		"--slide-ref",
		"slide 12",
		"--out",
		"second.json",
	);
	expect(one).toMatchObject({
		code: 0,
		event: { result: { status: "saved", path: second, totalSteps: 1, revision: 1 } },
	});
	const two = await run(
		"add-step",
		"second.json",
		"--title",
		"Attach a script",
		"--code-language",
		"gdscript",
		"--code-text",
		"extends Node2D",
		"--out",
		"third.json",
	);
	expect(two.event.result.addedSteps).toMatchObject([{ number: 2, title: "Attach a script" }]);
	expect(await fs.readFile(first, "utf8")).toBe(firstBytes);
	const lesson = JSON.parse(await fs.readFile(third, "utf8"));
	expect(lesson).toMatchObject({
		title: "Enemy",
		lessonRef: "RPG C1 / L1",
		steps: [
			{ instructions: "Click +\nChoose Node2D", slideRef: "slide 12", status: "draft" },
			{ code: { language: "gdscript", text: "extends Node2D" }, status: "draft" },
		],
	});
	// Existing files are never replaced, and refusals name no path or content.
	for (const args of [
		["new", "first.json", "--title", "Again"],
		["add-step", "first.json", "--title", "X", "--out", "second.json"],
	]) {
		const refused = await run(...args);
		expect(refused).toEqual({
			code: 1,
			event: { event: "error", message: "lesson-file-operation-failed" },
		});
	}
	expect(await fs.readFile(first, "utf8")).toBe(firstBytes);
	const query = await run("query", "third.json");
	expect(query.event.result).toMatchObject({
		lessonRef: "RPG C1 / L1",
		steps: [{ slideRef: "slide 12" }, { title: "Attach a script" }],
	});
	expect(query.event.result.steps[1].slideRef).toBeUndefined();
	expect(JSON.stringify(query.event)).not.toContain("Click +");
	await fs.mkdir(path.join(root, "out"));
	const exported = await run(
		"export",
		"third.json",
		"--out",
		"out",
		...lesson.steps.flatMap((step: { id: string }) => ["--step", step.id]),
	);
	const mapping = JSON.parse(
		await fs.readFile(path.join(exported.event.result.path, "lesson-mapping.json"), "utf8"),
	);
	expect(mapping).toMatchObject({
		lessonRef: "RPG C1 / L1",
		steps: [{ slideRef: "slide 12" }, {}],
	});
});
it.each([
	["new", "a.json"],
	["new", "a.json", "--title", ""],
	["new", "a.json", "--title", "T", "--lesson-ref", "two\nlines"],
	["new", "a.json", "--title", "T", "--title", "U"],
	["new", "a.json", "--title", "T", "--out", "b.json"],
	["add-step", "a.json", "--title", "T"],
	["add-step", "a.json", "--out", "b.json"],
	["add-step", "a.json", "--title", "T", "--out", "b.json", "--code-language", "gd"],
	["add-step", "a.json", "--title", "T", "--out", "b.json", "--status", "reviewed"],
])("refuses the incomplete or unsupported authoring command %j", (...args) => {
	expect(parseCliArgs(["electron", "app", "lesson", ...args], 2, root)?.kind).toBe("error");
});
it("edits and removes a step from the command line into new files only", async () => {
	const step = { ...newStep("Old title"), slideRef: "old", code: { language: "plain", text: "x" } },
		other = newStep("Other");
	await fs.writeFile(
		path.join(root, "a.json"),
		JSON.stringify({ ...newLesson(), steps: [step, other] }),
	);
	const run = async (...args: string[]) => {
		const chunks: string[] = [];
		const command = parseCliArgs(["electron", "app", "lesson", ...args, "--json"], 2, root);
		if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
		const code = await runLessonCommand(command, (value) => chunks.push(value));
		return { code, event: JSON.parse(chunks.join("").trim().split("\n").at(-1)!) };
	};
	expect(
		await run(
			"edit-step",
			"a.json",
			"--step",
			step.id,
			"--title",
			"New title",
			"--clear-slide-ref",
			"--clear-code",
			"--out",
			"b.json",
		),
	).toMatchObject({
		code: 0,
		event: { result: { step: { title: "New title", status: "draft" } } },
	});
	expect(await run("remove-step", "b.json", "--step", other.id, "--out", "c.json")).toMatchObject({
		code: 0,
		event: { result: { totalSteps: 1 } },
	});
	const final = JSON.parse(await fs.readFile(path.join(root, "c.json"), "utf8"));
	expect(final.steps).toHaveLength(1);
	expect(final.steps[0]).toMatchObject({ id: step.id, title: "New title" });
	expect(final.steps[0].slideRef ?? final.steps[0].code).toBeUndefined();
	expect(await run("remove-step", "b.json", "--step", other.id, "--out", "c.json")).toEqual({
		code: 1,
		event: { event: "error", message: "lesson-file-operation-failed" },
	});
});
it.each([
	["edit-step", "a.json", "--step", "00000000-0000-4000-8000-000000000000", "--out", "b.json"],
	["edit-step", "a.json", "--title", "T", "--out", "b.json"],
	["edit-step", "a.json", "--step", "not-a-uuid", "--title", "T", "--out", "b.json"],
	["edit-step", "a.json", "--step", "00000000-0000-4000-8000-000000000000", "--title", "T"],
	[
		"edit-step",
		"a.json",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--out",
		"b.json",
		"--slide-ref",
		"x",
		"--clear-slide-ref",
	],
	[
		"edit-step",
		"a.json",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--out",
		"b.json",
		"--code-text",
		"x",
	],
	["remove-step", "a.json", "--out", "b.json"],
	[
		"remove-step",
		"a.json",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--out",
		"b.json",
		"--title",
		"T",
	],
])("refuses the incomplete or contradictory step command %j", (...args) => {
	expect(parseCliArgs(["electron", "app", "lesson", ...args], 2, root)?.kind).toBe("error");
});
it.each([
	[],
	[
		"--project",
		"p.openscreen",
		"--project-id",
		"p",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--at",
		"1",
		"--alt",
		"A",
		"--out",
		"b.json",
	],
	[
		"--project",
		"p.openscreen",
		"--project-id",
		"p",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--at",
		"soon",
		"--alt",
		"A",
		"--source",
		"/s.mp4",
		"--out",
		"b.json",
	],
	[
		"--project",
		"p.openscreen",
		"--project-id",
		"p",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--at",
		"1",
		"--source",
		"/s.mp4",
		"--out",
		"b.json",
	],
	[
		"--project",
		"p.openscreen",
		"--project-id",
		"p",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--at",
		"1",
		"--alt",
		"A",
		"--source",
		"/s.mp4",
	],
	[
		"--project",
		"p.openscreen",
		"--project-id",
		"p",
		"--step",
		"00000000-0000-4000-8000-000000000000",
		"--at",
		"1",
		"--at",
		"2",
		"--alt",
		"A",
		"--source",
		"/s.mp4",
		"--out",
		"b.json",
	],
])("refuses the incomplete illustrate command %j, and parses a complete one", (...args) => {
	expect(
		parseCliArgs(["electron", "app", "lesson", "illustrate", "a.json", ...args], 2, root)?.kind,
	).toBe("error");
	const complete = parseCliArgs(
		[
			"electron",
			"app",
			"lesson",
			"illustrate",
			"a.json",
			"--project",
			"p.openscreen",
			"--project-id",
			"p",
			"--step",
			"00000000-0000-4000-8000-000000000000",
			"--at",
			"2.5",
			"--alt",
			"Described",
			"--source",
			"/s.mp4",
			"--out",
			"b.json",
		],
		2,
		root,
	);
	expect(complete).toMatchObject({
		kind: "lesson",
		action: "illustrate",
		request: {
			manifestPath: path.join(root, "a.json"),
			projectPath: path.join(root, "p.openscreen"),
			rulerSec: 2.5,
			sourcePaths: ["/s.mp4"],
			outputPath: path.join(root, "b.json"),
		},
	});
});
it("illustrate reports a fixed reason such as a trimmed time and otherwise the generic failure", async () => {
	const step = newStep("Shown");
	const lessonPath = path.join(root, "lesson.json"),
		projectPath = path.join(root, "project.openscreen"),
		source = path.join(root, "source.mp4");
	await fs.writeFile(lessonPath, JSON.stringify({ ...newLesson(), steps: [step] }));
	await fs.writeFile(source, "PRIVATE_VIDEO_BYTES");
	const { createEmptyDocument } = await import("../../src/lib/ai-edition/schema");
	const doc = createEmptyDocument({ projectId: "p", title: "PRIVATE_PROJECT_TITLE" });
	doc.assets = [{ id: "a", kind: "video", label: "S", originalPath: source, cameraTrack: null }];
	doc.legacyEditor = { aspectRatio: "16:9", wallpaper: "#ffffff" };
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 5,
			timelineStartSec: 0,
			timelineEndSec: 5,
			origin: "user",
			wordRefs: [],
			reason: "fixture",
		},
	];
	await fs.writeFile(projectPath, JSON.stringify(doc));
	const run = async (at: string, sourcePath: string) => {
		const chunks: string[] = [];
		const command = parseCliArgs(
			[
				"electron",
				"app",
				"lesson",
				"illustrate",
				"lesson.json",
				"--project",
				"project.openscreen",
				"--project-id",
				"p",
				"--step",
				step.id,
				"--at",
				at,
				"--alt",
				"Described",
				"--source",
				sourcePath,
				"--out",
				"out.json",
				"--json",
			],
			2,
			root,
		);
		if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
		const renderFrames = vi.fn(async () => null);
		const code = await runLessonCommand(command, (value) => chunks.push(value), { renderFrames });
		return { code, text: chunks.join(""), renderFrames };
	};
	const trimmed = await run("9", source);
	expect(trimmed.code).toBe(1);
	expect(JSON.parse(trimmed.text)).toEqual({ event: "error", message: "frame-unavailable" });
	expect(trimmed.renderFrames).not.toHaveBeenCalled();
	const ungranted = await run("2", lessonPath);
	expect(JSON.parse(ungranted.text)).toEqual({
		event: "error",
		message: "lesson-file-operation-failed",
	});
	const noFrame = await run("2", source);
	expect(JSON.parse(noFrame.text)).toEqual({
		event: "error",
		message: "lesson-file-operation-failed",
	});
	const said = trimmed.text + ungranted.text + noFrame.text;
	expect(said).not.toMatch(/PRIVATE|source\.mp4/);
	expect(said).not.toContain(root);
	expect(await fs.readdir(root)).not.toContain("out.json");
});
it("moves a step from the command line and through nothing else", async () => {
	const steps = [newStep("A"), newStep("B")];
	await fs.writeFile(path.join(root, "a.json"), JSON.stringify({ ...newLesson(), steps }));
	const chunks: string[] = [];
	const command = parseCliArgs(
		[
			"electron",
			"app",
			"lesson",
			"move-step",
			"a.json",
			"--step",
			steps[1].id,
			"--to",
			"1",
			"--out",
			"b.json",
			"--json",
		],
		2,
		root,
	);
	if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
	expect(await runLessonCommand(command, (value) => chunks.push(value))).toBe(0);
	expect(
		JSON.parse(chunks.join("")).result.order.map((step: { title: string }) => step.title),
	).toEqual(["B", "A"]);
	for (const args of [
		["--step", steps[1].id, "--to", "first", "--out", "c.json"],
		["--step", steps[1].id, "--out", "c.json"],
		["--step", steps[1].id, "--to", "1"],
		["--to", "1", "--out", "c.json"],
		["--step", steps[1].id, "--to", "1", "--out", "c.json", "--title", "T"],
	])
		expect(
			parseCliArgs(["electron", "app", "lesson", "move-step", "a.json", ...args], 2, root)?.kind,
		).toBe("error");
});
it.each([
	...UNGRANTED_DEPENDENCIES.map((dependency) => [dependency]),
	["webcam", "image-background", "image-annotation"],
] as UngrantedDependency[][])("illustrate refuses a project with %s through the CLI with the fixed code and guidance, rendering nothing", async (...add) => {
	const f = await illustrationFixture(root, add),
		chunks: string[] = [],
		renderFrames = vi.fn(async () => null);
	const command = parseCliArgs(
		[
			"electron",
			"app",
			"lesson",
			"illustrate",
			f.manifestPath,
			"--project",
			f.projectPath,
			"--project-id",
			"p",
			"--step",
			f.step.id,
			"--at",
			"2.5",
			"--alt",
			"Described",
			"--source",
			f.source,
			"--out",
			f.request.outputPath,
			"--json",
		],
		2,
		root,
	);
	if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
	expect(await runLessonCommand(command, (value) => chunks.push(value), { renderFrames })).toBe(1);
	expect(JSON.parse(chunks.join(""))).toEqual({
		event: "error",
		message: "illustration-unsupported",
		detail: illustrationUnsupportedMessage,
	});
	expect(chunks.join("")).not.toMatch(/SECRET|private/);
	expect(renderFrames).not.toHaveBeenCalled();
	await expect(fs.stat(f.request.outputPath)).rejects.toThrow();
	expect(await fs.readFile(f.projectPath, "utf8")).toBe(f.project);
});
