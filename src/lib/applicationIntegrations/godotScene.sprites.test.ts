import { describe, expect, it } from "vitest";
import { parseGodotSceneJournal } from "./godotScene";
import { sceneSource } from "./godotScene.test-support";
import { compareGodotCheckpointToReference } from "./godotSceneReference";

const spatial = { position3: [0, 0, 0], rotation3: [0, 0, 0], scale3: [1, 1, 1], visible: true };
const flat = { position: [0, 0], rotation: 0, scale: [1, 1], visible: true };
const svg = { type: "CompressedTexture2D", path: "res://tex.svg" };
const walk = { type: "SpriteFrames", path: "res://walk.tres" };
const builtIn = { type: "SpriteFrames", path: "built-in-or-unsaved" };
const root = (offset = 0) => ({
	id: String(1 + offset),
	parent: "",
	name: "World",
	type: "Node3D",
	properties: { script: null, ...spatial },
});
const node = (offset: number, type: string, name: string, properties: Record<string, unknown>) => ({
	id: String(2 + offset),
	parent: String(1 + offset),
	name,
	type,
	properties: { script: null, ...properties },
});
const billboard = (offset: number, texture: unknown) =>
	node(offset, "Sprite3D", "Billboard", { ...spatial, spriteTexture: texture });
const walker2d = (offset: number, frames: unknown) =>
	node(offset, "AnimatedSprite2D", "Walker", { ...flat, spriteFrames: frames });
const walker3d = (offset: number, frames: unknown) =>
	node(offset, "AnimatedSprite3D", "Walker", { ...spatial, spriteFrames: frames });
const state = (nodes: unknown[]) => ({
	nodes,
	selected: [],
	connections: [],
	excludedConnections: 0,
});

function take(states: unknown[], version = 8, session = "a"): string {
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

it("decodes Sprite3D texture and AnimatedSprite SpriteFrames references and their changes", () => {
	const journal = parseGodotSceneJournal(
		take([state([root(), billboard(0, null)]), state([root(), billboard(0, svg)])]),
	);
	expect(journal.observations.find((o) => o.type === "node-changed")?.label).toBe(
		"Node changed: Billboard (spriteTexture)",
	);
	for (const walker of [walker2d(0, builtIn), walker3d(0, walk), walker3d(0, null)])
		expect(() => parseGodotSceneJournal(take([state([root(), walker])]))).not.toThrow();
});

describe("rejects malformed, misplaced or cross-version sprite references", () => {
	it.each([
		["an animation name", walker3d(0, { ...walk, animation: "PRIVATE_ANIM" })],
		["frame data", walker3d(0, { ...walk, frames: [] })],
		[
			"a sub-resource id",
			walker3d(0, { type: "SpriteFrames", path: "res://world.tscn::SpriteFrames_1" }),
		],
		["an absolute path", billboard(0, { type: "CompressedTexture2D", path: "/home/x/tex.png" })],
		[
			"SpriteFrames on a node without transforms",
			node(0, "AnimatedSprite2D", "Walker", { spriteFrames: walk }),
		],
		[
			"a texture reference on a 2D node",
			node(0, "Sprite3D", "Billboard", { ...flat, spriteTexture: svg }),
		],
		[
			"both fields on one node",
			node(0, "Sprite3D", "Billboard", { ...spatial, spriteTexture: svg, spriteFrames: walk }),
		],
		["a v8 Sprite3D without its reference", node(0, "Sprite3D", "Billboard", { ...spatial })],
		[
			"a v8 AnimatedSprite2D without its reference",
			node(0, "AnimatedSprite2D", "Walker", { ...flat }),
		],
	])("%s", (_name, bad) => {
		expect(() => parseGodotSceneJournal(take([state([root(), bad])]))).toThrow();
	});
	it("refuses sprite references in a v7 journal", () => {
		expect(() => parseGodotSceneJournal(take([state([root(), billboard(0, svg)])], 7))).toThrow(
			/schema v8/,
		);
	});
	it("still accepts a v7 Sprite3D without references", () => {
		expect(() =>
			parseGodotSceneJournal(
				take([state([root(), node(0, "Sprite3D", "Billboard", { ...spatial })])], 7),
			),
		).not.toThrow();
	});
});

describe("reference comparison with sprite references", () => {
	const compare = (a: string, b: string) => compareGodotCheckpointToReference(a, 1, b, 1);
	it("agrees on equal identities and differs on a swapped resource, even at tolerance 1", () => {
		expect(
			compare(
				take([state([root(), walker3d(0, walk)])]),
				take([state([root(100), walker3d(100, { ...walk })])], 8, "c"),
			).outcome,
		).toBe("sampled-fields-agree");
		const swapped = compareGodotCheckpointToReference(
			take([state([root(), walker3d(0, walk)])]),
			1,
			take([state([root(100), walker3d(100, builtIn)])], 8, "c"),
			1,
			{ tolerance: 1 },
		);
		expect(swapped.differing).toEqual([{ path: ["Walker"], fields: ["spriteFrames"] }]);
	});
	it("treats a pre-v8 journal as unobserved, never as no texture", () => {
		const legacy = take([state([root(), node(0, "Sprite3D", "Billboard", { ...spatial })])], 7);
		const result = compare(legacy, take([state([root(100), billboard(100, svg)])], 8, "c"));
		expect(result.outcome).toBe("partial-no-observed-difference");
		expect(result.unknowns).toEqual(["sprite-references-unobserved"]);
		expect(result.partiallyCompared).toEqual([
			{ path: ["Billboard"], unobservedFields: ["spriteTexture"] },
		]);
	});
	it("compares an observed null as a recorded value", () => {
		const result = compare(
			take([state([root(), billboard(0, null)])]),
			take([state([root(100), billboard(100, svg)])], 8, "c"),
		);
		expect(result.differing).toEqual([{ path: ["Billboard"], fields: ["spriteTexture"] }]);
	});
});
