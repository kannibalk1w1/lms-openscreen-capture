import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { parseCliArgs } from "./args";
import { runLessonCommand } from "./lessonCommands";

const fixture = fileURLToPath(
	new URL("../../integrations/godot-typing/probes/fixtures/checkpoints.jsonl", import.meta.url),
);
let root: string;
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "godot-checkpoint-cli-")));
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));
const parse = (...tail: string[]) => parseCliArgs(["electron", "app", "lesson", ...tail], 2, root);

it("parses and dispatches explicit inspection and fingerprint-bound comparison", async () => {
	const journalPath = path.join(root, "scene.jsonl");
	await fs.copyFile(fixture, journalPath);
	const inspect = parse(
		"inspect-godot-checkpoints",
		journalPath,
		"--offset",
		"0",
		"--limit",
		"2",
		"--json",
	);
	expect(inspect).toMatchObject({ kind: "lesson", action: "inspect-godot-checkpoints" });
	if (inspect?.kind !== "lesson") throw new Error("invalid command");
	const output: string[] = [];
	expect(await runLessonCommand(inspect, (value) => output.push(value))).toBe(0);
	const parsedInspect = JSON.parse(output.pop()!);
	expect(
		parsedInspect.result.checkpoints.map((x: { recordSequence: number }) => x.recordSequence),
	).toEqual([1, 6]);
	const compare = parse(
		"compare-godot-checkpoints",
		journalPath,
		"--from",
		"1",
		"--to",
		"6",
		"--sha256",
		parsedInspect.result.sha256,
		"--json",
	);
	expect(compare).toMatchObject({ kind: "lesson", action: "compare-godot-checkpoints" });
	if (compare?.kind !== "lesson") throw new Error("invalid command");
	expect(await runLessonCommand(compare, (value) => output.push(value))).toBe(0);
	expect(JSON.parse(output.pop()!).result.comparison).toMatchObject({
		from: { recordSequence: 1 },
		to: { recordSequence: 6 },
	});
});

it.each([
	["inspect-godot-checkpoints", "scene.jsonl", "--limit", "201"],
	["inspect-godot-checkpoints", "scene.jsonl", "--limit", "2", "--limit", "3"],
	["inspect-godot-checkpoints", "scene.jsonl", "--unknown"],
	["compare-godot-checkpoints", "scene.jsonl", "--from", "1", "--to", "2"],
	[
		"compare-godot-checkpoints",
		"scene.jsonl",
		"--from",
		"1x",
		"--to",
		"2",
		"--sha256",
		"a".repeat(64),
	],
	[
		"compare-godot-checkpoints",
		"scene.jsonl",
		"--from",
		"1",
		"--to",
		"1",
		"--sha256",
		"a".repeat(64),
	],
	[
		"compare-godot-checkpoints",
		"scene.jsonl",
		"--from",
		"-1",
		"--to",
		"2",
		"--sha256",
		"a".repeat(64),
	],
	["compare-godot-checkpoints", "scene.jsonl", "--from", "1", "--to", "2", "--sha256", "bad"],
])("rejects malformed checkpoint CLI args %j", (...args) =>
	expect(parse(...args)).toMatchObject({ kind: "error" }));
