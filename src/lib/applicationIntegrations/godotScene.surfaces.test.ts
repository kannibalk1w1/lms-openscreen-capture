import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	listGodotSceneCheckpoints,
	parseGodotSceneJournal,
} from "./godotScene";
import { sceneSource } from "./godotScene.test-support";
import { compareGodotCheckpointToReference } from "./godotSceneReference";

const spatial = { position3: [0, 0, 0], rotation3: [0, 0, 0], scale3: [1, 1, 1], visible: true };
const box = { type: "BoxMesh", path: "built-in-or-unsaved" };
const red = { type: "StandardMaterial3D", path: "res://red.tres" };
const surfaces = (count: number, overrides: unknown[]) => ({
	count,
	overrides,
	truncated: count > 32,
});
const crate = (offset: number, refs: Record<string, unknown>) => ({
	id: String(2 + offset),
	parent: String(1 + offset),
	name: "Crate",
	type: "MeshInstance3D",
	properties: { script: null, ...spatial, mesh: box, materialOverride: null, ...refs },
});
const world = (offset: number) => ({
	id: String(1 + offset),
	parent: "",
	name: "World",
	type: "Node3D",
	properties: { script: null, ...spatial },
});
const state = (nodes: unknown[]) => ({
	nodes,
	selected: [],
	connections: [],
	excludedConnections: 0,
});

function take(states: unknown[], version = 7, session = "a"): string {
	const records: Record<string, unknown>[] = [
		{
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://world.tscn",
			intervalMs: 250,
			state: states[0],
			history: { available: false },
			run: { state: "stopped" },
		},
	];
	states.forEach((value, index) => {
		if (index > 0) records.push({ event: "scene-state", state: value });
		records.push({
			event: "scene-checkpoint",
			label: `Step ${index + 1}`,
			labelProvenance: "authored",
			nodeCount: (value as { nodes: unknown[] }).nodes.length,
			snapshotSequence: records.length - 1,
		});
	});
	records.push({ event: "scene-stop", reason: "user-stop", coverage: "sampled" });
	return sceneSource(
		records.map((record, sequence) => ({
			...record,
			schemaVersion: version,
			sessionId: `godot-scene-${session.repeat(32)}`,
			instanceId: session.repeat(32),
			sequence,
			atMs: sequence * 250,
		})),
	);
}

it("decodes per-surface overrides by index and reports a changed override", () => {
	const source = take([
		state([world(0), crate(0, { surfaceOverrides: surfaces(2, [null, null]) })]),
		state([world(0), crate(0, { surfaceOverrides: surfaces(2, [red, null]) })]),
	]);
	const journal = parseGodotSceneJournal(source);
	expect(journal.observations.find((entry) => entry.type === "node-changed")?.label).toBe(
		"Node changed: Crate (surfaceOverrides)",
	);
	const markers = listGodotSceneCheckpoints(source);
	expect(
		compareGodotSceneCheckpoints(source, markers[0].recordSequence, markers[1].recordSequence)
			.changed[0].fields,
	).toEqual(["surfaceOverrides"]);
});

it("records no surfaces without a mesh, distinct from an observed null override", () => {
	const noMesh = crate(0, { mesh: null, surfaceOverrides: null });
	const nullOverride = crate(0, { surfaceOverrides: surfaces(1, [null]) });
	expect(() => parseGodotSceneJournal(take([state([world(0), noMesh])]))).not.toThrow();
	expect(() => parseGodotSceneJournal(take([state([world(0), nullOverride])]))).not.toThrow();
	// Mismatch between mesh presence and surface information is refused both ways.
	expect(() =>
		parseGodotSceneJournal(
			take([state([world(0), crate(0, { mesh: null, surfaceOverrides: surfaces(1, [null]) })])]),
		),
	).toThrow(/presence of a mesh/);
	expect(() =>
		parseGodotSceneJournal(take([state([world(0), crate(0, { surfaceOverrides: null })])])),
	).toThrow(/presence of a mesh/);
});

describe("rejects malformed or cross-version surface overrides", () => {
	it.each([
		["count/length mismatch", surfaces(3, [null, null])],
		["more than 32 entries", { count: 40, overrides: Array(33).fill(null), truncated: true }],
		["wrong truncated flag", { count: 40, overrides: Array(32).fill(null), truncated: false }],
		["count above 256", { count: 300, overrides: Array(32).fill(null), truncated: true }],
		["a sub-resource id", surfaces(1, [{ type: "StandardMaterial3D", path: "res://a.glb::M_1" }])],
		["a resource name", surfaces(1, [{ ...red, name: "PRIVATE" }])],
		["an unknown marker", "missing"],
	])("%s", (_name, value) => {
		expect(() =>
			parseGodotSceneJournal(take([state([world(0), crate(0, { surfaceOverrides: value })])])),
		).toThrow();
	});
	it("requires surface overrides on v7 mesh nodes", () => {
		expect(() => parseGodotSceneJournal(take([state([world(0), crate(0, {})])]))).toThrow(
			/surface overrides/,
		);
	});
	it("refuses surface overrides in a v6 journal", () => {
		expect(() =>
			parseGodotSceneJournal(
				take([state([world(0), crate(0, { surfaceOverrides: surfaces(1, [null]) })])], 6),
			),
		).toThrow(/schema v7/);
	});
	it("accepts the unavailable marker and a truncated list", () => {
		for (const value of [
			"unavailable",
			{ count: 40, overrides: Array(32).fill(null), truncated: true },
		])
			expect(() =>
				parseGodotSceneJournal(take([state([world(0), crate(0, { surfaceOverrides: value })])])),
			).not.toThrow();
	});
});

describe("reference comparison with surface overrides", () => {
	const compare = (a: string, b: string) => compareGodotCheckpointToReference(a, 1, b, 1);
	it("agrees on equal overrides and differs by index, without topology matching", () => {
		const two = (overrides: unknown[]) =>
			take([state([world(0), crate(0, { surfaceOverrides: surfaces(2, overrides) })])]);
		expect(compare(two([red, null]), two([red, null])).outcome).toBe("sampled-fields-agree");
		expect(compare(two([red, null]), two([null, red])).differing).toEqual([
			{ path: ["Crate"], fields: ["surfaceOverrides"] },
		]);
	});
	it("reports a v6 journal's missing surfaces as unobserved, never as no overrides", () => {
		const v6 = take([state([world(0), crate(0, {})])], 6);
		const v7 = take(
			[state([world(100), crate(100, { surfaceOverrides: surfaces(1, [red]) })])],
			7,
			"c",
		);
		const result = compare(v6, v7);
		expect(result.outcome).toBe("partial-no-observed-difference");
		expect(result.unknowns).toEqual(["surface-overrides-unobserved"]);
	});
	it("marks truncated or unavailable surface lists as partial", () => {
		const wide = { count: 40, overrides: Array(32).fill(null), truncated: true };
		const a = take([state([world(0), crate(0, { surfaceOverrides: wide })])]);
		const b = take([state([world(100), crate(100, { surfaceOverrides: wide })])], 7, "c");
		expect(compare(a, b)).toMatchObject({
			outcome: "partial-no-observed-difference",
			unknowns: ["surface-overrides-partial"],
		});
		const unavailable = take(
			[state([world(100), crate(100, { surfaceOverrides: "unavailable" })])],
			7,
			"c",
		);
		expect(compare(unavailable, unavailable).unknowns).toEqual(["surface-overrides-partial"]);
	});
});
