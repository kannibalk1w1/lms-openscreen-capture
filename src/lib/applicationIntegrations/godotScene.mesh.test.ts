import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	godotSceneCapture,
	listGodotSceneCheckpoints,
	parseGodotSceneJournal,
} from "./godotScene";
import { sceneSource } from "./godotScene.test-support";
import { compareGodotCheckpointToReference } from "./godotSceneReference";

const spatial = { position3: [0, 0, 0], rotation3: [0, 0, 0], scale3: [1, 1, 1], visible: true };
const box = { type: "BoxMesh", path: "built-in-or-unsaved" };
const cube = { type: "BoxMesh", path: "res://cube.tres" };
const material = { type: "StandardMaterial3D", path: "built-in-or-unsaved" };
const crate = (
	offset: number,
	refs: Record<string, unknown> = { mesh: box, materialOverride: null },
) => ({
	id: String(2 + offset),
	parent: String(1 + offset),
	name: "Crate",
	type: "MeshInstance3D",
	properties: { script: null, ...spatial, ...refs },
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

function take(states: unknown[], version = 6, session = "a"): string {
	const records: Record<string, unknown>[] = [
		{
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://world.tscn",
			intervalMs: 250,
			state: states[0],
			...(version >= 4 ? { history: { available: false }, run: { state: "stopped" } } : {}),
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
const legacyState = (nodes: unknown[]) => ({ ...state(nodes) });

it("decodes v6 mesh/material identity references and reports a change of reference", () => {
	const source = take([
		state([world(0), crate(0)]),
		state([world(0), crate(0, { mesh: cube, materialOverride: material })]),
	]);
	const journal = parseGodotSceneJournal(source);
	const change = journal.observations.find((entry) => entry.type === "node-changed");
	expect(change?.label).toBe("Node changed: Crate (mesh, materialOverride)");
	expect(change?.payload).toMatchObject({
		before: { properties: { mesh: box, materialOverride: null } },
		after: { properties: { mesh: cube, materialOverride: material } },
	});
	expect(godotSceneCapture(journal).version).toBe(1);
	const markers = listGodotSceneCheckpoints(source);
	const within = compareGodotSceneCheckpoints(
		source,
		markers[0].recordSequence,
		markers[1].recordSequence,
	);
	expect(within.changed).toEqual([
		{ id: "2", nameBefore: "Crate", nameAfter: "Crate", fields: ["mesh", "materialOverride"] },
	]);
});

describe("rejects malformed or cross-version mesh references", () => {
	const variants: Array<[string, Record<string, unknown>]> = [
		["a resource name", { mesh: { ...box, name: "PRIVATE" }, materialOverride: null }],
		["resource contents", { mesh: { ...box, size: [2, 2, 2] }, materialOverride: null }],
		[
			"an absolute path",
			{ mesh: { type: "BoxMesh", path: "/home/x/cube.tres" }, materialOverride: null },
		],
		[
			"a parent-escaping path",
			{ mesh: { type: "BoxMesh", path: "res://../x.tres" }, materialOverride: null },
		],
		[
			"a non-identifier type",
			{ mesh: { type: "Box Mesh", path: "res://cube.tres" }, materialOverride: null },
		],
		["mesh without materialOverride", { mesh: box }],
		[
			"a sub-resource id",
			{ mesh: { type: "ArrayMesh", path: "res://ship.glb::ArrayMesh_1" }, materialOverride: null },
		],
	];
	it.each(variants)("%s", (_name, refs) => {
		expect(() => parseGodotSceneJournal(take([state([world(0), crate(0, refs)])]))).toThrow();
	});
	it("requires both references on a v6 MeshInstance3D", () => {
		const bare = { ...crate(0), properties: { script: null, ...spatial } };
		expect(() => parseGodotSceneJournal(take([state([world(0), bare])]))).toThrow(/both mesh/);
	});
	it("requires a complete 3D node", () => {
		const flat = {
			id: "2",
			parent: "1",
			name: "Crate",
			type: "MeshInstance3D",
			properties: { script: null, mesh: box, materialOverride: null },
		};
		expect(() => parseGodotSceneJournal(take([state([world(0), flat])]))).toThrow(
			/complete 3D node/,
		);
	});
	it.each([3, 4, 5])("refuses mesh references in a schema v%i journal", (version) => {
		const nodes = [world(0), crate(0)];
		const value = version >= 5 ? state(nodes) : { nodes, selected: [] };
		expect(() => parseGodotSceneJournal(take([value], version))).toThrow(/schema v6/);
	});
	it("accepts the unsupported-type marker and external marker", () => {
		const refs = {
			mesh: { type: "unsupported-type", path: "external-or-unsupported" },
			materialOverride: null,
		};
		expect(() => parseGodotSceneJournal(take([state([world(0), crate(0, refs)])]))).not.toThrow();
	});
});

describe("reference comparison with mesh references", () => {
	it("agrees on equal references across takes (compared as text, not by object identity)", () => {
		const result = compareGodotCheckpointToReference(
			take([state([world(0), crate(0, { mesh: cube, materialOverride: material })])]),
			1,
			take(
				[state([world(100), crate(100, { mesh: { ...cube }, materialOverride: { ...material } })])],
				6,
				"c",
			),
			1,
		);
		expect(result.outcome).toBe("sampled-fields-agree");
	});
	it("reports a different reference as a differing field, even with the maximum tolerance", () => {
		const result = compareGodotCheckpointToReference(
			take([state([world(0), crate(0, { mesh: cube, materialOverride: null })])]),
			1,
			take([state([world(100), crate(100, { mesh: box, materialOverride: null })])], 6, "c"),
			1,
			{ tolerance: 1 },
		);
		expect(result.differing).toEqual([{ path: ["Crate"], fields: ["mesh"] }]);
	});
	it("treats a pre-v6 journal's missing references as unobserved, never as 'none'", () => {
		const legacyCrate = { ...crate(0), properties: { script: null, ...spatial } };
		const result = compareGodotCheckpointToReference(
			take([legacyState([world(0), legacyCrate])], 5),
			1,
			take([state([world(100), crate(100, { mesh: cube, materialOverride: null })])], 6, "c"),
			1,
		);
		expect(result.outcome).toBe("partial-no-observed-difference");
		// Exactly the mesh reason: no misleading "some 3D fields" reason for mesh-only gaps.
		expect(result.unknowns).toEqual(["mesh-references-unobserved"]);
		expect(result.partiallyCompared).toEqual([
			{ path: ["Crate"], unobservedFields: ["mesh", "materialOverride"] },
		]);
	});
});
