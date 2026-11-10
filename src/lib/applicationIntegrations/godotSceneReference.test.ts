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
		checkpoint: { recordSequence: 1, label: "Step 1", atMs: 250 },
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
	expect(result.counts.differing).toBe(0);
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
	expect(result.truncated).toBe(true);
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
