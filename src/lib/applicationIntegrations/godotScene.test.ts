import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	godotSceneCapture,
	MAX_SCENE_JOURNAL_BYTES,
	parseGodotSceneJournal,
} from "./godotScene";
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

function boundedStressJournal(kind: "count" | "bytes", corruptTail = false): string {
	const template = sceneRecords();
	const base = sceneNode();
	const children = Array.from({ length: kind === "count" ? 255 : 1 }, (_, index) => ({
		...sceneNode(String(index + 2), "Child", "1"),
		properties:
			kind === "bytes"
				? {
						script: `res://${"s".repeat(980)}.gd`,
						texture: `res://${"t".repeat(980)}.png`,
						position: [0, 0],
					}
				: { script: null },
	}));
	const state = (index: number) => ({
		nodes: [
			base,
			...(kind === "count" && index % 2
				? []
				: children.map((node) => ({
						...node,
						properties: {
							...node.properties,
							...(kind === "bytes" ? { position: [index, 0] } : {}),
						},
					}))),
		],
		selected: [],
	});
	const records: Record<string, unknown>[] = [{ ...template[0], state: state(0) }];
	for (let index = 1; index <= (kind === "count" ? 44 : 2300); index++)
		records.push({ ...template[1], state: state(index) });
	if (corruptTail)
		records.push({ ...template[1], state: { nodes: [sceneNode("999")], selected: [] } });
	records.push(template[5]);
	return sceneSource(
		records.map((record, sequence) => ({ ...record, sequence, atMs: sequence * 250 })),
	);
}
it("keeps an honest limited prefix when valid producer evidence expands beyond 10,000 observations", () => {
	const source = boundedStressJournal("count");
	expect(new TextEncoder().encode(source).byteLength).toBeLessThan(MAX_SCENE_JOURNAL_BYTES);
	const parsed = parseGodotSceneJournal(source);
	expect(parsed.coverage).toBe("limited");
	expect(parsed.stopReason).toBe("decoder-observation-limit");
	expect(parsed.observations).toHaveLength(10000);
	expect(() => parseGodotSceneJournal(boundedStressJournal("count", true))).toThrow("scope");
});
it("limits normalized diff bytes while retaining valid evidence and validating the entire source", () => {
	const source = boundedStressJournal("bytes");
	expect(new TextEncoder().encode(source).byteLength).toBeLessThan(MAX_SCENE_JOURNAL_BYTES);
	const parsed = parseGodotSceneJournal(source);
	expect(parsed.coverage).toBe("limited");
	expect(parsed.stopReason).toBe("decoder-size-limit");
	expect(parsed.observations.length).toBeGreaterThan(100);
	expect(
		new TextEncoder().encode(JSON.stringify(godotSceneCapture(parsed))).byteLength,
	).toBeLessThanOrEqual(MAX_SCENE_JOURNAL_BYTES);
	expect(() => parseGodotSceneJournal(boundedStressJournal("bytes", true))).toThrow("scope");
});

function sceneRecordsFromJsonl(source: string): Record<string, unknown>[] {
	return source
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

it("decodes v3 Node3D transforms and reports their exact changed fields", () => {
	const records = sceneRecords().slice(0, 3);
	const spatial = {
		id: "3",
		parent: "1",
		name: "SpatialCanary",
		type: "Node3D",
		properties: {
			position3: [1, 2, 3],
			rotation3: [0.1, 0.2, 0.3],
			scale3: [1, 1, 1],
			visible: true,
			script: null,
		},
	};
	const later = {
		...spatial,
		properties: { ...spatial.properties, position3: [4, 2, 3], rotation3: [0.1, 0.8, 0.3] },
	};
	const marker = (sequence: number, label: string, snapshotSequence: number) => ({
		event: "scene-checkpoint",
		schemaVersion: 3,
		sessionId: records[0].sessionId,
		instanceId: records[0].instanceId,
		sequence,
		atMs: sequence * 250,
		label,
		labelProvenance: "authored",
		nodeCount: 2,
		snapshotSequence,
	});
	const start = {
		...records[0],
		schemaVersion: 3,
		state: { nodes: [rawState(records[0]).nodes[0], spatial], selected: [] },
	};
	const firstMarker = marker(1, "3D baseline", 0);
	const state = {
		...records[1],
		schemaVersion: 3,
		sequence: 2,
		atMs: 500,
		state: { nodes: [rawState(records[0]).nodes[0], later], selected: [] },
	};
	const secondMarker = marker(3, "3D later", 2);
	const footer = { ...sceneRecords()[5], schemaVersion: 3, sequence: 4, atMs: 1000 };
	const raw = sceneSource([start, firstMarker, state, secondMarker, footer]);
	const journal = parseGodotSceneJournal(raw);
	expect(journal.baseline.nodes[1].properties.position3).toEqual([1, 2, 3]);
	expect(journal.observations.find((value) => value.type === "node-changed")?.label).toContain(
		"position3, rotation3",
	);
	expect(compareGodotSceneCheckpoints(raw, 1, 3).changed[0].fields).toEqual([
		"position3",
		"rotation3",
	]);
});

it("rejects 3D shapes in legacy versions and malformed or mixed v3 axes", () => {
	for (const version of [1, 2]) {
		const legacy = sceneRecords();
		for (const record of legacy) record.schemaVersion = version;
		rawState(legacy[0]).nodes[0].properties.position3 = [0, 0, 0];
		expect(() => parseGodotSceneJournal(sceneSource(legacy))).toThrow("schema v3");
	}
	for (const invalid of [
		{ position3: [0, 0, Infinity], rotation3: [0, 0, 0], scale3: [1, 1, 1] },
		{ position3: [0, 0, 0], rotation3: [0, 0, 0], scale3: [1, 1] },
		{ position3: [0, 0, 0], rotation3: [0, 0, 0] },
		{ position3: [0, 0, 0], rotation3: [0, 0, 0], scale3: [1, 1, 1], position: [0, 0] },
	]) {
		const base = sceneRecords();
		const records = [base[0], { ...base[5], sequence: 1, atMs: 250 }];
		for (const record of records) record.schemaVersion = 3;
		rawState(records[0]).nodes[0] = {
			...sceneNode(),
			type: "Node3D",
			properties: { script: null, ...invalid },
		};
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
	}
	const unsuffixedBase = sceneRecords();
	const unsuffixed = [unsuffixedBase[0], { ...unsuffixedBase[5], sequence: 1, atMs: 250 }];
	for (const record of unsuffixed) record.schemaVersion = 3;
	rawState(unsuffixed[0]).nodes[0] = {
		...rawState(unsuffixed[0]).nodes[0],
		type: "CustomSpatialRoot",
		properties: {
			position3: [1, 2, 3],
			rotation3: [0, 0, 0],
			scale3: [1, 1, 1],
			visible: true,
			script: null,
		},
	};
	expect(parseGodotSceneJournal(sceneSource(unsuffixed)).baseline.nodes[0].type).toBe(
		"CustomSpatialRoot",
	);
	const legacyType = sceneRecords();
	for (const record of legacyType)
		if (record.event === "scene-start" || record.event === "scene-state")
			rawState(record).nodes[0].type = "CustomLegacy3D";
	expect(parseGodotSceneJournal(sceneSource(legacyType)).baseline.nodes[0].type).toBe(
		"CustomLegacy3D",
	);
});

function v2CheckpointJournal(label = `Texture\" set\\nC:\\private\\artifact.png`): string {
	const base = sceneRecords();
	const marker = {
		event: "scene-checkpoint",
		sessionId: base[0].sessionId,
		instanceId: base[0].instanceId,
		label,
		labelProvenance: "authored",
		nodeCount: 2,
		snapshotSequence: 2,
	};
	const records = [...base.slice(0, 3), marker, ...base.slice(3)].map((record, sequence) => ({
		...record,
		schemaVersion: 2,
		sequence,
		atMs: sequence * 250,
	}));
	return sceneSource(records);
}

it("normalizes a v2 authored checkpoint as a small observation referencing a prior snapshot", () => {
	const parsed = parseGodotSceneJournal(v2CheckpointJournal());
	const marker = parsed.observations.find((value) => value.type === "author-checkpoint");
	expect(marker).toMatchObject({
		label: expect.stringContaining("Author checkpoint:"),
		payload: { labelProvenance: "authored", nodeCount: 2, snapshotSequence: 2 },
	});
	expect(marker?.payload).not.toHaveProperty("state");
});

it("requires a checkpoint to reference the latest validated scene snapshot", () => {
	const stale = sceneRecordsFromJsonl(v2CheckpointJournal());
	stale[3].snapshotSequence = 1; // Same node count, but an older state.
	expect(() => parseGodotSceneJournal(sceneSource(stale))).toThrow("checkpoint snapshot reference");
	const records = sceneRecordsFromJsonl(v2CheckpointJournal());
	const newerState = records[4];
	if (!newerState) throw new Error("Expected a later scene-state record");
	records.splice(4, 1);
	records.splice(3, 0, newerState);
	const reordered = records.map((record, sequence) => ({
		...record,
		sequence,
		atMs: sequence * 250,
	}));
	expect(() => parseGodotSceneJournal(sceneSource(reordered))).toThrow(
		"checkpoint snapshot reference",
	);
});

it("rejects malformed checkpoint fields, invalid snapshot references and mixed versions", () => {
	for (const invalid of [
		{ label: "" },
		{ label: "   " },
		{ label: "😀".repeat(101) },
		{ label: "bad\u0000label" },
		{ labelProvenance: "captured" },
		{ nodeCount: 513 },
		{ snapshotSequence: 4 },
		{ privateText: "CANARY" },
	]) {
		const records = sceneRecordsFromJsonl(v2CheckpointJournal());
		Object.assign(records[3], invalid);
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow();
	}
	const mixed = sceneRecordsFromJsonl(v2CheckpointJournal());
	mixed[4].schemaVersion = 1;
	expect(() => parseGodotSceneJournal(sceneSource(mixed))).toThrow("version mismatch");
	const legacyMarker = sceneRecordsFromJsonl(v2CheckpointJournal());
	for (const record of legacyMarker) record.schemaVersion = 1;
	expect(() => parseGodotSceneJournal(sceneSource(legacyMarker))).toThrow(
		"requires scene journal schema v2",
	);
	const legacyTrigger = sceneRecords();
	legacyTrigger[1].trigger = "checkpoint";
	expect(() => parseGodotSceneJournal(sceneSource(legacyTrigger))).toThrow();
});

it("validates malformed v2 checkpoint tails after normalized observations reach their cap", () => {
	const records = sceneRecordsFromJsonl(boundedStressJournal("count"));
	for (const record of records) record.schemaVersion = 2;
	const footer = records.pop();
	const tailMarker = {
		event: "scene-checkpoint",
		sessionId: records[0].sessionId,
		instanceId: records[0].instanceId,
		label: "Tail marker",
		labelProvenance: "authored",
		nodeCount: 256,
		schemaVersion: 2,
		snapshotSequence: 0,
	};
	records.push(tailMarker, footer!);
	const malformedTail = records.map((record, sequence) => ({
		...record,
		sequence,
		atMs: sequence * 250,
	}));
	expect(() => parseGodotSceneJournal(sceneSource(malformedTail))).toThrow();
});

it.each([
	"\u00a0",
	"\u1680",
	"\u2000",
	"\u200a",
	"\u2028",
	"\u2029",
	"\u202f",
	"\u205f",
	"\u3000",
	"\ufeff",
	" \u3000\u00a0",
])("rejects Unicode-only blank checkpoint label %j", (label) => {
	expect(() => parseGodotSceneJournal(v2CheckpointJournal(label))).toThrow();
});
it("retains authored nonblank text surrounded by Unicode whitespace", () => {
	const label = "\u3000Texture set\u00a0";
	expect(
		parseGodotSceneJournal(v2CheckpointJournal(label)).observations.find(
			(entry) => entry.type === "author-checkpoint",
		)?.payload,
	).toMatchObject({ label });
});

function rawState(record: Record<string, unknown>) {
	return record.state as {
		nodes: Array<{
			id: string;
			parent: string;
			name: string;
			type: string;
			properties: Record<string, unknown>;
		}>;
		selected: string[];
	};
}
