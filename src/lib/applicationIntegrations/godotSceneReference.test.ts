import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareGodotSceneCheckpoints, listGodotSceneCheckpoints } from "./godotScene";
import { sceneNode, sceneSource } from "./godotScene.test-support";
import { compareGodotCheckpointToReference, GODOT_REFERENCE_MAX_ROWS } from "./godotSceneReference";

type State = { nodes: Record<string, unknown>[]; selected: string[]; [key: string]: unknown };

/** One take: header state, then one checkpoint per state. Session IDs/node IDs are take-specific. */
function take(
	states: State[],
	{
		version = 3,
		session = "a",
		limited = false,
	}: { version?: number; session?: string; limited?: boolean } = {},
): string {
	const records: Record<string, unknown>[] = [
		{
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://enemy.tscn",
			intervalMs: 250,
			state: states[0],
			...(version >= 4 ? { history: { available: false }, run: { state: "stopped" } } : {}),
		},
	];
	states.forEach((state, index) => {
		if (index > 0) records.push({ event: "scene-state", state });
		records.push({
			event: "scene-checkpoint",
			label: `Step ${index + 1}`,
			labelProvenance: "authored",
			nodeCount: state.nodes.length,
			snapshotSequence: records.length - 1,
		});
	});
	records.push({
		event: "scene-stop",
		reason: limited ? "limit" : "user-stop",
		coverage: limited ? "limited" : "sampled",
	});
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

function enemy(offset: number, sprite: Record<string, unknown> = {}): State {
	const node = {
		...sceneNode(String(2 + offset), "Sprite2D", String(1 + offset)),
		type: "Sprite2D",
		properties: {
			script: "res://enemy.gd",
			texture: "res://slime.svg",
			position: [12, 24],
			rotation: 0,
			scale: [2, 2],
			visible: true,
			...sprite,
		},
	};
	return { nodes: [sceneNode(String(1 + offset), "Enemy"), node], selected: [String(2 + offset)] };
}
const compare = (a: string, b: string, options?: { tolerance?: number }) =>
	compareGodotCheckpointToReference(a, 1, b, 1, options);

it("agrees across takes with different session/node IDs and selection, keeping source identity", () => {
	const result = compare(
		take([enemy(0)]),
		take([{ ...enemy(100), selected: [] }], { session: "c" }),
	);
	expect(result.kind).toBe("advisory-sampled-state-comparison");
	// v3 sources cannot record saved connections: unknown, so partial rather than agree.
	expect(result.outcome).toBe("partial-no-observed-difference");
	expect(result.unknowns).toEqual(["connections-unobserved"]);
	expect(result.numbers).toEqual({ mode: "exact" });
	expect(result.counts).toMatchObject({
		matched: 2,
		referenceOnly: 0,
		candidateOnly: 0,
		differing: 0,
	});
	expect(result.candidate).toEqual({
		scene: "res://enemy.tscn",
		schemaVersion: 3,
		sessionId: `godot-scene-${"c".repeat(32)}`,
		instanceId: "c".repeat(32),
		coverage: "sampled",
		stopReason: "user-stop",
		checkpoint: { recordSequence: 1, label: "Step 1", atMs: 250, snapshotSequence: 0 },
	});
	// v3 sources cannot record saved connections: that is unknown, not equal.
	expect(result.connections).toEqual({ status: "unobserved" });
});

it("compares numbers exactly unless an explicit tolerance is given", () => {
	const reference = take([enemy(0)]);
	const nearly = take([enemy(100, { position: [12.00001, 24] })], { session: "c" });
	expect(compare(reference, nearly).differing).toEqual([
		{ path: ["Sprite2D"], fields: ["position"] },
	]);
	const loose = compare(reference, nearly, { tolerance: 0.001 });
	expect(loose.counts.differing).toBe(0);
	expect(loose.numbers).toEqual({ mode: "absolute-tolerance", tolerance: 0.001 });
	for (const bad of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => compare(reference, reference, { tolerance: bad })).toThrow(/tolerance/);
});

it("reports renamed and reparented nodes as unmatched paths, never relinked", () => {
	const reference = take([enemy(0)]);
	const renamed = enemy(100);
	renamed.nodes[1] = { ...renamed.nodes[1], name: "Slime" };
	const r = compare(reference, take([renamed], { session: "c" }));
	expect(r.outcome).toBe("sampled-fields-differ");
	expect(r.referenceOnly).toEqual([{ path: ["Sprite2D"], type: "Sprite2D" }]);
	expect(r.candidateOnly).toEqual([{ path: ["Slime"], type: "Sprite2D" }]);
	const moved = enemy(100);
	moved.nodes.splice(1, 0, { ...sceneNode("150", "Holder", "101") });
	moved.nodes[2] = { ...moved.nodes[2], parent: "150" };
	const m = compare(reference, take([moved], { session: "c" }));
	expect(m.referenceOnly).toEqual([{ path: ["Sprite2D"], type: "Sprite2D" }]);
	expect(m.candidateOnly).toEqual([
		{ path: ["Holder"], type: "Node2D" },
		{ path: ["Holder", "Sprite2D"], type: "Sprite2D" },
	]);
});

it("keys paths as name arrays, so slash-like joins cannot collide", () => {
	// "A/B" as one name would collide with A → B under a naive slash join.
	const flat: State = {
		nodes: [sceneNode("1", "Root"), sceneNode("2", "A", "1"), sceneNode("3", "B", "2")],
		selected: [],
	};
	const joined: State = {
		nodes: [sceneNode("1", "Root"), sceneNode("2", "A", "1"), sceneNode("3", "A/B", "1")],
		selected: [],
	};
	const result = compare(take([flat]), take([joined], { session: "c" }));
	expect(result.referenceOnly).toEqual([{ path: ["A", "B"], type: "Node2D" }]);
	expect(result.candidateOnly).toEqual([{ path: ["A/B"], type: "Node2D" }]);
});

it("refuses duplicate sibling paths as ambiguous", () => {
	const duplicate: State = {
		nodes: [sceneNode("1", "Root"), sceneNode("2", "Same", "1"), sceneNode("3", "Same", "1")],
		selected: [],
	};
	expect(() => compare(take([enemy(0)]), take([duplicate], { session: "c" }))).toThrow(/Ambiguous/);
	expect(() => compare(take([duplicate]), take([enemy(0)], { session: "c" }))).toThrow(/Ambiguous/);
});

it("compares root name and type explicitly", () => {
	const other = enemy(100);
	other.nodes[0] = {
		...other.nodes[0],
		name: "Boss",
		type: "Node3D",
		properties: { script: null },
	};
	const result = compare(take([enemy(0)]), take([other], { session: "c" }));
	expect(result.differing[0]).toMatchObject({
		path: [],
		fields: expect.arrayContaining(["name", "type"]),
	});
});

it("treats resource paths as identity text", () => {
	const result = compare(
		take([enemy(0)]),
		take([enemy(100, { texture: "res://slime_v2.svg", script: null })], { session: "c" }),
	);
	expect(result.differing).toEqual([{ path: ["Sprite2D"], fields: ["script", "texture"] }]);
});

it("reports v1/v2 Node3D transforms as unobserved, never as equal or different", () => {
	const spatialNode = (offset: number, properties: Record<string, unknown>) => ({
		nodes: [
			sceneNode(String(1 + offset), "Root"),
			{
				id: String(2 + offset),
				parent: String(1 + offset),
				name: "Cube",
				type: "Node3D",
				properties,
			},
		],
		selected: [],
	});
	const legacy = take([spatialNode(0, { script: null })], { version: 2 });
	const modern = take(
		[
			spatialNode(100, {
				script: null,
				position3: [1, 2, 3],
				rotation3: [0, 0, 0],
				scale3: [1, 1, 1],
				visible: true,
			}),
		],
		{ session: "c" },
	);
	const result = compare(legacy, modern);
	expect(result.outcome).toBe("partial-no-observed-difference");
	expect(result.unknowns).toContain("node3d-fields-unobserved");
	// The test root also has no 2D transform, so it is partially compared too.
	expect(result.counts).toMatchObject({ differing: 0, matched: 0, partiallyCompared: 2 });
	expect(result.partiallyCompared).toContainEqual({
		path: ["Cube"],
		unobservedFields: ["visible", "position3", "rotation3", "scale3"],
	});
	const moved = take(
		[
			spatialNode(100, {
				script: "res://cube.gd",
				position3: [1, 2, 3],
				rotation3: [0, 0, 0],
				scale3: [1, 1, 1],
				visible: true,
			}),
		],
		{ session: "c" },
	);
	expect(compare(legacy, moved).differing).toEqual([
		{
			path: ["Cube"],
			fields: ["script"],
			unobservedFields: ["visible", "position3", "rotation3", "scale3"],
		},
	]);
});

it("marks limited coverage and partially recorded connections as partial", () => {
	expect(
		compare(take([enemy(0)]), take([enemy(100)], { session: "c", limited: true })),
	).toMatchObject({
		outcome: "partial-no-observed-difference",
		unknowns: ["candidate-coverage-limited", "connections-unobserved"],
	});
	expect(
		compare(take([enemy(0)], { limited: true }), take([enemy(100)], { session: "c" })),
	).toMatchObject({
		unknowns: ["reference-coverage-limited", "connections-unobserved"],
	});
	const v5 = (offset: number, excluded: number, extra: Record<string, unknown> = {}): State => ({
		...enemy(offset),
		connections: [
			{
				signal: "renamed",
				from: String(2 + offset),
				to: String(1 + offset),
				method: "_on_renamed",
				boundArgs: 0,
				deferred: false,
				oneShot: false,
				...extra,
			},
		],
		excludedConnections: excluded,
	});
	const reference = take([v5(0, 0)], { version: 5 });
	expect(compare(reference, take([v5(100, 0)], { version: 5, session: "c" }))).toMatchObject({
		outcome: "sampled-fields-agree",
		connections: { status: "compared", referenceOnly: [], candidateOnly: [] },
	});
	expect(compare(reference, take([v5(100, 2)], { version: 5, session: "c" }))).toMatchObject({
		outcome: "partial-no-observed-difference",
		unknowns: ["connections-partially-recorded"],
		connections: { status: "partially-recorded", excluded: { reference: 0, candidate: 2 } },
	});
	const flagged = compare(
		reference,
		take([v5(100, 0, { deferred: true })], { version: 5, session: "c" }),
	);
	expect(flagged.outcome).toBe("sampled-fields-differ");
	expect(flagged.connections).toMatchObject({
		referenceOnly: [{ from: ["Sprite2D"], signal: "renamed", to: [], method: "_on_renamed" }],
	});
	expect(compare(reference, take([enemy(100)], { session: "c" }))).toMatchObject({
		outcome: "partial-no-observed-difference",
		unknowns: ["connections-unobserved"],
	});
});

it("bounds rows and bytes for deep paths while keeping complete counts", () => {
	// 64-deep chain of 200-character names under the root, absent from the reference.
	const deep: State = { nodes: [sceneNode("1", "Enemy")], selected: [] };
	for (let i = 0; i < 64; i++)
		deep.nodes.push(sceneNode(String(i + 2), `${i}`.padEnd(200, "x"), String(i + 1)));
	for (let i = 0; i < 300; i++) deep.nodes.push(sceneNode(String(i + 100), `wide${i}`, "1"));
	const result = compare(take([enemy(0)]), take([deep], { session: "c" }));
	expect(result.counts.candidateOnly).toBe(364);
	expect(result.truncated).toEqual(["candidateOnly"]);
	// A clean prefix: once the byte bound cuts the deep chain, no later (smaller) row is kept.
	expect(result.candidateOnly.every((row, index) => row.path.length === index + 1)).toBe(true);
	expect(result.candidateOnly.length).toBeLessThanOrEqual(GODOT_REFERENCE_MAX_ROWS);
	expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(300 * 1024);
});

it("leaves the within-take comparator unchanged", () => {
	const source = take([enemy(0), enemy(0, { visible: false })]);
	const markers = listGodotSceneCheckpoints(source);
	const within = compareGodotSceneCheckpoints(
		source,
		markers[0].recordSequence,
		markers[1].recordSequence,
	);
	expect(within.changed).toEqual([
		{ id: "2", nameBefore: "Sprite2D", nameAfter: "Sprite2D", fields: ["visible"] },
	]);
	expect(compareGodotCheckpointToReference(source, 1, source, 3).differing).toEqual([
		{ path: ["Sprite2D"], fields: ["visible"] },
	]);
});

describe("refuses invalid or unvalidated inputs", () => {
	const reference = take([enemy(0)]);
	it.each([
		["a non-checkpoint record", 0],
		["a missing record", 99],
		["a negative sequence", -1],
		["a fractional sequence", 1.5],
	])("%s", (_name, sequence) => {
		expect(() => compareGodotCheckpointToReference(reference, sequence, reference, 1)).toThrow();
		expect(() => compareGodotCheckpointToReference(reference, 1, reference, sequence)).toThrow();
	});
	it("refuses a corrupt candidate journal", () => {
		expect(() => compare(reference, reference.replace("scene-stop", "x"))).toThrow();
	});
});

it("agrees on the same real probe scene captured separately on Linux and Windows", () => {
	const fixture = (name: string) =>
		readFileSync(
			new URL(`../../../integrations/godot-typing/probes/fixtures/${name}`, import.meta.url),
			"utf8",
		);
	const linux = fixture("scene-v5-linux.jsonl");
	const windows = fixture("scene-v5-windows.jsonl");
	const marker = (text: string, label: string) => {
		const found = listGodotSceneCheckpoints(text).find((entry) => entry.label === label);
		if (!found) throw new Error(`missing ${label}`);
		return found.recordSequence;
	};
	const baseline = compareGodotCheckpointToReference(
		linux,
		marker(linux, "3D baseline"),
		windows,
		marker(windows, "3D baseline"),
	);
	expect(baseline.reference.sessionId).not.toBe(baseline.candidate.sessionId);
	expect(
		baseline.counts.differing + baseline.counts.referenceOnly + baseline.counts.candidateOnly,
	).toBe(0);
	expect(baseline.outcome).toBe("sampled-fields-agree");
	const later = compareGodotCheckpointToReference(
		linux,
		marker(linux, "3D baseline"),
		windows,
		marker(windows, "Texture and scale set"),
	);
	expect(later.outcome).toBe("sampled-fields-differ");
	expect(later.candidateOnly.map((row) => row.path)).toContainEqual(["Slime"]);
	// A retained v2 real journal against a v3 one: different scenes, partial evidence.
	const v2 = fixture("checkpoints.jsonl");
	const v3 = fixture("spatial.jsonl");
	const cross = compareGodotCheckpointToReference(
		v2,
		listGodotSceneCheckpoints(v2)[0].recordSequence,
		v3,
		listGodotSceneCheckpoints(v3)[0].recordSequence,
	);
	expect(cross.unknowns).toContain("connections-unobserved");
	expect(cross.outcome).toBe("sampled-fields-differ");
});

describe("review 0777440c follow-up", () => {
	const plain = (offset: number, name = "Thing") => ({
		nodes: [
			sceneNode(String(1 + offset), "Root"),
			{
				id: String(2 + offset),
				parent: String(1 + offset),
				name,
				type: "Node3D",
				properties: { script: null },
			},
		],
		selected: [],
	});
	it("flags unobservable 3D fields when both sources are legacy, without type-name inference", () => {
		const result = compare(
			take([plain(0)], { version: 2 }),
			take([plain(100)], { version: 2, session: "c" }),
		);
		expect(result.unknowns).toContain("node3d-fields-unobserved");
		expect(result.partiallyCompared.map((row) => row.path)).toEqual([[], ["Thing"]]);
	});
	it("does not flag 3D fields for v3+ sources or for legacy nodes with a 2D transform", () => {
		expect(compare(take([plain(0)]), take([plain(100)], { session: "c" })).unknowns).not.toContain(
			"node3d-fields-unobserved",
		);
		const withRootTransform = (state: State): State => ({
			...state,
			nodes: [
				{
					...state.nodes[0],
					properties: { script: null, position: [0, 0], rotation: 0, scale: [1, 1], visible: true },
				},
				...state.nodes.slice(1),
			],
		});
		const legacy2d = take([withRootTransform(enemy(0))], { version: 2 });
		const spatial: State = {
			nodes: [
				sceneNode("101", "Enemy"),
				{
					id: "102",
					parent: "101",
					name: "Sprite2D",
					type: "Node3D",
					properties: {
						script: null,
						position3: [0, 0, 0],
						rotation3: [0, 0, 0],
						scale3: [1, 1, 1],
						visible: true,
					},
				},
			],
			selected: [],
		};
		const result = compare(legacy2d, take([withRootTransform(spatial)], { session: "c" }));
		expect(
			result.differing.find((row) => row.path[0] === "Sprite2D")?.unobservedFields,
		).toBeUndefined();
		expect(result.unknowns).not.toContain("node3d-fields-unobserved");
	});
	it("shows connection flags and bound-argument counts in rows", () => {
		const v5 = (offset: number, extra: Record<string, unknown>): State => ({
			...enemy(offset),
			connections: [
				{
					signal: "renamed",
					from: String(2 + offset),
					to: String(1 + offset),
					method: "_on_renamed",
					boundArgs: 0,
					deferred: false,
					oneShot: false,
					...extra,
				},
			],
			excludedConnections: 0,
		});
		const result = compare(
			take([v5(0, {})], { version: 5 }),
			take([v5(100, { boundArgs: 2 })], { version: 5, session: "c" }),
		);
		expect(result.connections).toMatchObject({
			referenceOnly: [{ boundArgs: 0, deferred: false, oneShot: false }],
			candidateOnly: [{ boundArgs: 2 }],
		});
	});
	it("caps rows by count with clean prefixes and per-list flags", () => {
		const many: State = { nodes: [sceneNode("1", "Enemy")], selected: [] };
		for (let i = 0; i < 250; i++) many.nodes.push(sceneNode(String(i + 2), `n${i}`, "1"));
		const result = compare(take([enemy(0)]), take([many], { session: "c" }));
		expect(result.candidateOnly).toHaveLength(GODOT_REFERENCE_MAX_ROWS);
		expect(result.candidateOnly.map((row) => row.path[0])).toEqual(
			Array.from({ length: GODOT_REFERENCE_MAX_ROWS }, (_, i) => `n${i}`),
		);
		expect(result.truncated).toEqual(["candidateOnly"]);
		expect(result.counts.candidateOnly).toBe(250);
		expect(result.referenceOnly).toEqual([{ path: ["Sprite2D"], type: "Sprite2D" }]);
	});
	it("keeps path identity cheap for maximal deep hierarchies", () => {
		const deep = (offset: number): State => {
			const state: State = { nodes: [sceneNode(String(1 + offset), "Root")], selected: [] };
			for (let i = 0; i < 511; i++) {
				const parent = i < 63 ? String(i + 1 + offset) : String(63 + offset);
				state.nodes.push(sceneNode(String(i + 2 + offset), `${i}`.padEnd(200, "\u0001"), parent));
			}
			return state;
		};
		const started = performance.now();
		const result = compare(take([deep(0)]), take([deep(1000)], { session: "c" }));
		expect(performance.now() - started).toBeLessThan(1000);
		expect(result.counts.matched).toBe(512);
	});
	it("keeps interned path keys unambiguous between parent identity and name", () => {
		const siblings = Array.from({ length: 12 }, (_, i) =>
			sceneNode(String(i + 2), `c${i + 1}`, "1"),
		);
		const reference: State = {
			nodes: [sceneNode("1", "Root"), ...siblings, sceneNode("50", "x", "13")],
			selected: [],
		};
		const candidate: State = {
			nodes: [sceneNode("1", "Root"), ...siblings, sceneNode("50", "2x", "2")],
			selected: [],
		};
		const result = compare(take([reference]), take([candidate], { session: "c" }));
		expect(result.referenceOnly).toEqual([{ path: ["c12", "x"], type: "Node2D" }]);
		expect(result.candidateOnly).toEqual([{ path: ["c1", "2x"], type: "Node2D" }]);
	});
});
