import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { emptyLessonQuery } from "../../src/lib/lesson/review";
import { runLessonCommand } from "./lessonCommands";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-cli-"));
});
afterEach(async () => {
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
