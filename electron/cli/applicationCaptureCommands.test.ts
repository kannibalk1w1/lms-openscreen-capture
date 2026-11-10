import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { parseLesson } from "../../src/lib/lesson/schema";
import { parseCliArgs } from "./args";
import { runLessonCommand } from "./lessonCommands";

let root: string;
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "capture-cli-")));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
function command(...tail: string[]) {
	return parseCliArgs(["electron", "app", "lesson", ...tail], 2, root);
}
it("parses repeated observation flags, inspects a real Godot v1 file and dispatches selected import", async () => {
	const capturePath = fileURLToPath(
		new URL("../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
	);
	const outputPath = path.join(root, "draft.json");
	const raw = await fs.readFile(capturePath);
	const chunks: string[] = [];
	const inspect = command("inspect-capture", capturePath, "--limit", "2", "--json");
	expect(inspect).toMatchObject({
		kind: "lesson",
		action: "inspect-capture",
		request: { limit: 2 },
	});
	if (inspect?.kind !== "lesson") throw new Error("invalid command");
	expect(await runLessonCommand(inspect, (value) => chunks.push(value))).toBe(0);
	const inspection = JSON.parse(chunks.pop()!);
	expect(inspection.result).toMatchObject({
		observationCount: 8,
		nextOffset: 2,
	});
	const ids = inspection.result.observations.map((value: { id: string }) => value.id);
	const importCommand = command(
		"import-capture",
		capturePath,
		"--out",
		outputPath,
		"--title",
		"Enemy",
		"--sha256",
		createHash("sha256").update(raw).digest("hex"),
		"--observation",
		ids[0],
		"--observation",
		ids[1],
		"--json",
	);
	expect(importCommand).toMatchObject({
		kind: "lesson",
		action: "import-capture",
		request: { observationIds: ids },
	});
	if (importCommand?.kind !== "lesson") throw new Error("invalid command");
	expect(await runLessonCommand(importCommand, (value) => chunks.push(value))).toBe(0);
	const result = JSON.parse(chunks.pop()!);
	const lesson = await parseLesson(await fs.readFile(outputPath, "utf8"));
	expect(result.result.totalSteps).toBe(2);
	expect(lesson.steps.map((step) => step.evidence[0].eventId)).toEqual(ids);
	expect(lesson.steps.every((step) => step.evidence[0].clock === "unmapped")).toBe(true);
	expect(await fs.readFile(capturePath)).toEqual(raw);
});
it("rejects duplicate, missing, and excessive import options", () => {
	const pathArg = path.join(root, "capture.json");
	const prefix = [
		"import-capture",
		pathArg,
		"--out",
		path.join(root, "new.json"),
		"--title",
		"x",
		"--sha256",
		"a".repeat(64),
	];
	expect(command(...prefix, "--observation", "event-a", "--observation", "event-a")).toMatchObject({
		kind: "error",
	});
	expect(command(...prefix)).toMatchObject({ kind: "error" });
	expect(command("inspect-capture", pathArg, "--limit", "201")).toMatchObject({
		kind: "error",
	});
});

it.each([
	["inspect-capture", "capture.json", "--limit", "1", "--limit", "2"],
	["inspect-capture", "capture.json", "--unknown"],
	["inspect-capture", "capture.json", "--json", "--json"],
	["inspect-capture", "capture.json", "--offset", "10001"],
	["import-capture", "capture.json", "--out", "a.json", "--out", "b.json"],
	[
		"import-capture",
		"capture.json",
		"--out",
		"a.json",
		"--title",
		"T",
		"--sha256",
		"bad",
		"--observation",
		"a",
	],
	["import-capture", "capture.json", "--out", "a.json", "--title", "T", "--observation", "a"],
])("rejects ambiguous or invalid capture options %j", (...args) => {
	expect(command(...args)).toMatchObject({ kind: "error" });
});
it("rejects more than 200 selected IDs before dispatch", () => {
	const flags = Array.from({ length: 201 }, (_, i) => ["--observation", `event-${i}`]).flat();
	expect(
		command(
			"import-capture",
			"capture.json",
			"--out",
			"draft.json",
			"--title",
			"T",
			"--sha256",
			"a".repeat(64),
			...flags,
		),
	).toMatchObject({ kind: "error" });
});
