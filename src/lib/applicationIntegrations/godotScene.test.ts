import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_SCENE_JOURNAL_BYTES, parseGodotSceneJournal } from "./godotScene";
import { sceneNode, sceneRecords, sceneSource } from "./godotScene.test-support";

it("normalizes observed changes and keeps the starting state separate from action drafts", () => {
	const journal = parseGodotSceneJournal(sceneSource());
	expect(journal.clock).toBe("unmapped");
	expect(journal.coverage).toBe("sampled");
	expect(journal.observations.map((o) => o.type)).toEqual([
		"node-appeared",
		"node-changed",
		"selection-changed",
		"node-disappeared",
		"selection-changed",
		"scene-saved",
	]);
	expect(journal.observations[1].label).toContain(
		"name, position, rotation, scale, visible, script, texture",
	);
	expect(journal.observations[1].payload).toMatchObject({
		before: { name: "Sprite2D" },
		after: { name: "Slime", properties: { texture: "res://slime.svg" } },
	});
	expect(journal.baseline.nodes).toHaveLength(1);
});
it("preserves limited coverage", () => {
	const records = sceneRecords();
	records[5].coverage = "limited";
	records[5].reason = "limit";
	expect(parseGodotSceneJournal(sceneSource(records)).coverage).toBe("limited");
});
describe("rejects malformed, mixed or incomplete evidence", () => {
	it.each([
		["session", { sessionId: `godot-scene-${"c".repeat(32)}` }],
		["instance", { instanceId: "c".repeat(32) }],
		["sequence", { sequence: 99 }],
		["clock", { atMs: -1 }],
		["version", { schemaVersion: 2 }],
		["unknown data", { privateText: "CANARY" }],
	])("rejects %s", (_name, changes) => {
		const records = sceneRecords();
		Object.assign(records[1], changes);
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
	});
	it("rejects backward clock, a second header, an early footer and truncation", () => {
		for (const replacement of [
			{ atMs: 1 },
			{ ...sceneRecords()[0], sequence: 2, atMs: 500 },
			{ ...sceneRecords()[5], sequence: 2, atMs: 500 },
		]) {
			const records = sceneRecords();
			Object.assign(records[2], replacement);
			expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
		}
		expect(() => parseGodotSceneJournal(sceneSource(sceneRecords().slice(0, -1)))).toThrow();
		expect(() => parseGodotSceneJournal(`${sceneSource()}{}\n`)).toThrow();
	});
	it.each([
		{ nodes: [sceneNode("3")], selected: [] },
		{ nodes: [sceneNode(), sceneNode()], selected: [] },
		{ nodes: [sceneNode(), sceneNode("2", "Child", "999")], selected: [] },
		{ nodes: [sceneNode()], selected: ["999"] },
		{ nodes: [sceneNode()], selected: ["1", "1"] },
		{
			nodes: [
				sceneNode(),
				{ ...sceneNode("2", "Child", "1"), properties: { script: "/private/key.gd" } },
			],
			selected: [],
		},
		{
			nodes: [
				sceneNode(),
				{ ...sceneNode("2", "Child", "1"), properties: { script: "res://../key.gd" } },
			],
			selected: [],
		},
		{ nodes: [{ ...sceneNode(), properties: { script: null, password: "CANARY" } }], selected: [] },
	])("rejects invalid scope/tree/properties %#", (state) => {
		const records = sceneRecords();
		records[1].state = state;
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
	});
	it("rejects reused object identity with a different type", () => {
		const records = sceneRecords();
		records[3].state = {
			nodes: [sceneNode(), { ...sceneNode("2", "Changed", "1"), type: "Label" }],
			selected: [],
		};
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow("identity");
	});
	it("bounds bytes, records and nodes", () => {
		expect(() => parseGodotSceneJournal(" ".repeat(MAX_SCENE_JOURNAL_BYTES + 1))).toThrow();
		expect(() => parseGodotSceneJournal("{}\n".repeat(4097))).toThrow();
		const records = sceneRecords();
		records[1].state = {
			nodes: Array.from({ length: 513 }, (_, i) => sceneNode(String(i + 1), "Node", i ? "1" : "")),
			selected: [],
		};
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
	});
});

it("decodes the retained real Godot 4.7.1 editor journal", () => {
	const journal = parseGodotSceneJournal(
		readFileSync(
			new URL("../../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
			"utf8",
		),
	);
	expect(journal.stopReason).toBe("scene-changed");
	expect(journal.observations.map((value) => value.type)).toEqual([
		"node-appeared",
		"node-changed",
		"selection-changed",
		"node-appeared",
		"node-changed",
		"selection-changed",
		"node-disappeared",
		"scene-saved",
	]);
	expect(journal.observations.some((value) => value.label.includes("parent"))).toBe(true);
});
