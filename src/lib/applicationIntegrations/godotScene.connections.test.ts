import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	godotSceneCapture,
	listGodotSceneCheckpoints,
	parseGodotSceneJournal,
} from "./godotScene";
import { sceneNode, sceneSource } from "./godotScene.test-support";

const root = sceneNode("1", "Enemy");
const timer = { ...sceneNode("2", "Timer", "1"), type: "Timer", properties: { script: null } };
const hitbox = {
	...sceneNode("3", "Hitbox", "1"),
	type: "Area2D",
	properties: { script: "res://enemy.gd" },
};
const timeout = {
	signal: "timeout",
	from: "2",
	to: "3",
	method: "_on_timeout",
	boundArgs: 0,
	deferred: false,
	oneShot: false,
};
const ready = { ...timeout, signal: "ready", method: "_on_ready", boundArgs: 1, oneShot: true };
const state = (connections: unknown[], excludedConnections = 0, nodes = [root, timer, hitbox]) => ({
	nodes,
	selected: [],
	connections,
	excludedConnections,
});

function take(states: unknown[], extra: Record<string, unknown>[] = []): Record<string, unknown>[] {
	return [
		{
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://enemy.tscn",
			intervalMs: 250,
			state: states[0],
			history: { available: false },
			run: { state: "stopped" },
		},
		...states.slice(1).map((value) => ({ event: "scene-state", state: value })),
		...extra,
		{ event: "scene-stop", reason: "user-stop", coverage: "sampled" },
	].map((record, sequence) => ({
		...record,
		schemaVersion: 5,
		sessionId: `godot-scene-${"a".repeat(32)}`,
		instanceId: "b".repeat(32),
		sequence,
		atMs: sequence * 250,
	}));
}

it("keeps pre-existing connections as baseline and reports sampled additions/removals", () => {
	const journal = parseGodotSceneJournal(
		sceneSource(take([state([timeout]), state([timeout, ready]), state([ready])])),
	);
	expect(journal.baseline).toMatchObject({ connections: [timeout], excludedConnections: 0 });
	const signals = journal.observations.filter((entry) => entry.type.startsWith("signal-"));
	expect(signals.map((entry) => entry.label)).toEqual([
		"Signal connection observed: Timer.ready → Hitbox._on_ready",
		"Signal connection no longer observed: Timer.timeout → Hitbox._on_timeout",
	]);
	expect(signals[0].payload).toEqual({ after: ready });
	expect(signals[1].payload).toEqual({ before: timeout });
	expect(godotSceneCapture(journal).version).toBe(1);
});

it("reports unrecorded connection counts without describing them", () => {
	const journal = parseGodotSceneJournal(sceneSource(take([state([]), state([], 2)])));
	const entry = journal.observations.find((o) => o.type === "signal-connections-unrecorded");
	expect(entry?.label).toBe("Unrecorded saved signal connections: 2");
	expect(entry?.payload).toEqual({
		before: 0,
		after: 2,
		reason: "outside-observed-scene-or-unsupported-callable",
	});
});

it.each([
	["deferred", { deferred: true }],
	["oneShot", { oneShot: true }],
	["boundArgs", { boundArgs: 2 }],
	["signal", { signal: "ready" }],
	["method", { method: "_on_ready" }],
	["from", { from: "3", to: "2" }],
])("treats a changed %s as a different connection", (_field, change) => {
	const journal = parseGodotSceneJournal(
		sceneSource(take([state([timeout]), state([{ ...timeout, ...change }])])),
	);
	expect(journal.observations.map((entry) => entry.type)).toEqual([
		"signal-connection-removed",
		"signal-connection-added",
	]);
});

it("keeps maximal names within the shared label limit and imports the whole take", () => {
	const long = (id: string, parent: string) => ({ ...sceneNode(id, "N".repeat(200), parent) });
	const nodes = [root, long("2", "1"), long("3", "1")];
	const wide = { ...timeout, signal: "s".repeat(100), method: "m".repeat(100) };
	const journal = parseGodotSceneJournal(
		sceneSource(take([state([], 0, nodes), state([wide], 0, nodes), state([], 0, nodes)])),
	);
	const capture = godotSceneCapture(journal);
	const labels = capture.observations.map((entry) => entry.label);
	expect(labels).toHaveLength(2);
	for (const label of labels) expect(label.length).toBeLessThanOrEqual(300);
	expect(labels[0]).toContain("…");
	expect(capture.observations[0].payload).toEqual({ after: wide });
});

it("compares saved connections between authored checkpoints", () => {
	const marker = (snapshotSequence: number, label: string) => ({
		event: "scene-checkpoint",
		label,
		labelProvenance: "authored",
		nodeCount: 3,
		snapshotSequence,
	});
	const records = take([state([timeout])], []);
	const footer = records.pop() as Record<string, unknown>;
	const tail = [
		marker(0, "Before"),
		{ event: "scene-state", state: state([ready]) },
		marker(2, "After"),
		footer,
	].map((record, index) => ({
		...records[0],
		...record,
		producer: undefined,
		scene: undefined,
		intervalMs: undefined,
		history: undefined,
		run: undefined,
		state: (record as { state?: unknown }).state,
		sequence: index + 1,
		atMs: (index + 1) * 250,
	}));
	const source = sceneSource([records[0], ...tail]);
	const markers = listGodotSceneCheckpoints(source);
	const comparison = compareGodotSceneCheckpoints(
		source,
		markers[0].recordSequence,
		markers[1].recordSequence,
	);
	expect(comparison.connections).toEqual({ added: [ready], removed: [timeout] });
	expect(comparison.counts.changed).toBe(0);
});

describe("rejects malformed, out-of-scope or cross-version connections", () => {
	it.each([
		["source outside the observed nodes", { ...timeout, from: "99" }],
		["target outside the observed nodes", { ...timeout, to: "99" }],
		["non-identifier signal", { ...timeout, signal: "time out" }],
		["path-like method", { ...timeout, method: "res://x.gd" }],
		["bound argument values", { ...timeout, boundArgs: 1, bound: ["SECRET"] }],
		["callable object identity", { ...timeout, object: "Lambda" }],
		["negative bound count", { ...timeout, boundArgs: -1 }],
		["oversized bound count", { ...timeout, boundArgs: 65 }],
		["non-boolean flag", { ...timeout, deferred: 1 }],
	])("%s", (_name, connection) => {
		expect(() => parseGodotSceneJournal(sceneSource(take([state([connection])])))).toThrow();
	});

	it("rejects duplicate connections and over 256 entries", () => {
		expect(() =>
			parseGodotSceneJournal(sceneSource(take([state([timeout, { ...timeout }])]))),
		).toThrow(/signal connections/);
		const cap = Array.from({ length: 256 }, (_, i) => ({ ...timeout, method: `m${i}` }));
		expect(() => parseGodotSceneJournal(sceneSource(take([state(cap)])))).not.toThrow();
		const many = Array.from({ length: 257 }, (_, i) => ({ ...timeout, method: `m${i}` }));
		expect(() => parseGodotSceneJournal(sceneSource(take([state(many)])))).toThrow();
	});

	it("requires connections and the unrecorded count in every v5 state", () => {
		const { connections: _c, ...noConnections } = state([]);
		const { excludedConnections: _e, ...noCount } = state([]);
		for (const broken of [noConnections, noCount]) {
			expect(() => parseGodotSceneJournal(sceneSource(take([broken])))).toThrow(/v5/);
			expect(() => parseGodotSceneJournal(sceneSource(take([state([]), broken])))).toThrow(/v5/);
		}
	});

	it.each([1, 2, 3, 4])("rejects connections in a schema v%i journal", (version) => {
		const records: Record<string, unknown>[] = take([state([timeout])]).map((record) => ({
			...record,
			schemaVersion: version,
		}));
		if (version < 4) {
			const { history: _h, run: _r, ...header } = records[0];
			records[0] = header;
		}
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow(/v5/);
	});

	it("validates a malformed connection tail after normalized observations reach their cap", () => {
		const nodes = Array.from({ length: 300 }, (_, i) => sceneNode(String(i + 10), `N${i}`, "1"));
		const states: unknown[] = [];
		for (let i = 0; i < 41; i++)
			states.push(state([], 0, i % 2 ? [root, timer, hitbox] : [root, timer, hitbox, ...nodes]));
		const valid = parseGodotSceneJournal(sceneSource(take([...states, state([timeout])])));
		expect(valid.stopReason).toBe("decoder-observation-limit");
		expect(() =>
			parseGodotSceneJournal(sceneSource(take([...states, state([{ ...timeout, to: "99" }])]))),
		).toThrow(/signal connections/);
	});
});

it("shortens labels on code points, never splitting an emoji", () => {
	const emoji = { ...sceneNode("2", `${"a".repeat(46)}😀😀😀`, "1") };
	const nodes = [root, emoji, hitbox];
	const journal = parseGodotSceneJournal(
		sceneSource(take([state([], 0, nodes), state([timeout], 0, nodes)])),
	);
	const label = journal.observations[0].label;
	expect(label).toContain(`${"a".repeat(46)}😀…`);
	expect(label).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});
