import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	godotSceneCapture,
	listGodotSceneCheckpoints,
	parseGodotSceneJournal,
} from "./godotScene";
import { sceneNode, sceneRecords, sceneSource } from "./godotScene.test-support";

const startHistory = { available: true, version: 1, actionIndex: -1, action: null };
const stopped = { state: "stopped" };

function v4(records: Record<string, unknown>[]): Record<string, unknown>[] {
	return records.map((record, sequence) => ({
		...record,
		schemaVersion: 4,
		sequence,
		atMs: sequence * 250,
		sessionId: `godot-scene-${"a".repeat(32)}`,
		instanceId: "b".repeat(32),
	}));
}

function historyTake(): Record<string, unknown>[] {
	const [start, ...rest] = sceneRecords();
	const footer = rest.pop() as Record<string, unknown>;
	return v4([
		{ ...start, history: startHistory, run: stopped },
		{
			event: "scene-history",
			history: { available: true, version: 2, actionIndex: 0, action: "Add Child Node" },
		},
		{ ...rest[0], trigger: "history" },
		{
			event: "scene-history",
			history: { available: true, version: 3, actionIndex: 1, action: "Rename Node" },
		},
		{
			event: "scene-history",
			history: { available: true, version: 2, actionIndex: 0, action: "Add Child Node" },
		},
		// A new action after an undo can return to an earlier version number.
		{
			event: "scene-history",
			history: { available: true, version: 2, actionIndex: 0, action: "Set position" },
		},
		{
			event: "scene-run",
			run: { state: "playing", scope: "current-scene", scene: "res://enemy.tscn" },
		},
		{ event: "scene-run", run: stopped },
		{ event: "scene-run", run: { state: "playing", scope: "other-scene" } },
		footer,
	]);
}

it("normalizes captured-scene history positions without claiming the editor gesture", () => {
	const journal = parseGodotSceneJournal(sceneSource(historyTake()));
	const history = journal.observations.filter((entry) => entry.type === "editor-history");
	expect(history.map((entry) => entry.label)).toEqual([
		"Editor history: Add Child Node",
		"Editor history: Rename Node",
		"Editor history stepped back from: Rename Node",
		"Editor history changed: Set position",
	]);
	expect(history.map((entry) => (entry.payload as { direction: string }).direction)).toEqual([
		"forward",
		"forward",
		"back",
		"unresolved",
	]);
	expect(history[0].payload).toMatchObject({
		historyScope: "captured-scene",
		interpretation: "editor-reported-history-position",
		before: startHistory,
	});
	expect(journal.baseline).toEqual({
		...(sceneRecords()[0].state as object),
		history: startHistory,
		run: stopped,
	});
	// The history-triggered sample still yields its ordinary scene diff.
	expect(
		journal.observations.find((entry) => entry.type === "node-appeared")?.payload,
	).toMatchObject({ samplingTrigger: "history" });
});

it("reports run state as polled editor context, withholding another scene's path", () => {
	const journal = parseGodotSceneJournal(sceneSource(historyTake()));
	const runs = journal.observations.filter((entry) => entry.type === "run-state");
	expect(runs.map((entry) => entry.label)).toEqual([
		"Editor run observed: res://enemy.tscn",
		"Editor run stop observed",
		"Editor run observed: another scene (path withheld)",
	]);
	expect(runs[0].payload).toMatchObject({
		observation: "polled-editor-run-state",
		result: "unavailable",
	});
	expect(JSON.stringify(runs[2])).not.toContain("res://");
	const capture = godotSceneCapture(journal);
	expect(capture.version).toBe(1);
	expect(capture.observations.filter((entry) => entry.type === "run-state")).toHaveLength(3);
});

it("records a pre-existing run and unavailable history as baseline context only", () => {
	const records = historyTake().filter(
		(record) => record.event !== "scene-history" && record.event !== "scene-run",
	);
	records[0] = {
		...records[0],
		history: { available: false },
		run: { state: "playing", scope: "other-scene" },
	};
	const journal = parseGodotSceneJournal(sceneSource(v4(records)));
	expect(journal.observations.some((entry) => entry.type === "run-state")).toBe(false);
	expect(journal.baseline).toMatchObject({
		history: { available: false },
		run: { state: "playing", scope: "other-scene" },
	});
});

describe("rejects malformed, cross-version or out-of-scope v4 context", () => {
	const mutate = (index: number, change: Record<string, unknown>) => {
		const records = historyTake();
		records[index] = { ...records[index], ...change };
		return sceneSource(records);
	};
	it.each([
		["missing start history", 0, { history: undefined }],
		["missing start run", 0, { run: undefined }],
		["extra history field", 1, { history: { ...startHistory, version: 2, scope: "global" } }],
		[
			"action without index",
			1,
			{ history: { available: true, version: 2, actionIndex: -1, action: "X" } },
		],
		[
			"index without action",
			1,
			{ history: { available: true, version: 2, actionIndex: 0, action: null } },
		],
		[
			"control in action",
			1,
			{ history: { available: true, version: 2, actionIndex: 0, action: "a\u0001" } },
		],
		["blank action", 1, { history: { available: true, version: 2, actionIndex: 0, action: "　" } }],
		[
			"oversized action",
			1,
			{ history: { available: true, version: 2, actionIndex: 0, action: "x".repeat(201) } },
		],
		[
			"negative version",
			1,
			{ history: { available: true, version: -1, actionIndex: 0, action: "X" } },
		],
		["unchanged history", 1, { history: startHistory }],
		["history becoming unavailable", 1, { history: { available: false } }],
		[
			"other-scene path disclosed",
			7,
			{ run: { state: "playing", scope: "other-scene", scene: "res://main.tscn" } },
		],
		["current scene without path", 7, { run: { state: "playing", scope: "current-scene" } }],
		[
			"absolute run path",
			7,
			{ run: { state: "playing", scope: "current-scene", scene: "/home/x.tscn" } },
		],
		["unchanged run", 8, { run: stopped }],
		["run result claim", 8, { run: { state: "stopped", exitCode: 0 } }],
	])("%s", (_name, index, change) => {
		expect(() => parseGodotSceneJournal(mutate(index, change))).toThrow();
	});

	it("rejects history records when the start says history is unavailable", () => {
		const records = historyTake();
		records[0] = { ...records[0], history: { available: false } };
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow(/available/);
	});

	it.each([1, 2, 3])("rejects v4 context in a schema v%i journal", (version) => {
		const records = historyTake().map((record) => ({ ...record, schemaVersion: version }));
		expect(() => parseGodotSceneJournal(sceneSource(records))).toThrow(/v4/);
		const legacy: Record<string, unknown>[] = sceneRecords().map((record) => ({
			...record,
			schemaVersion: version,
		}));
		legacy.splice(1, 0, { ...legacy[4], event: "scene-run", scene: undefined, run: stopped });
		const resequenced = legacy.map((record, sequence) => ({
			...record,
			sequence,
			atMs: sequence * 250,
		}));
		expect(() => parseGodotSceneJournal(sceneSource(resequenced))).toThrow(/v4/);
		const trigger: Record<string, unknown>[] = sceneRecords().map((record) => ({
			...record,
			schemaVersion: version,
		}));
		trigger[1] = { ...trigger[1], trigger: "history" };
		expect(() => parseGodotSceneJournal(sceneSource(trigger))).toThrow(/v4/);
	});

	it("rejects a v4 journal mixed with a v3 record", () => {
		expect(() => parseGodotSceneJournal(mutate(3, { schemaVersion: 3 }))).toThrow();
	});

	it("still validates a malformed v4 tail after normalized observations reach their cap", () => {
		const [start, ...rest] = historyTake();
		const footer = rest.pop() as Record<string, unknown>;
		const a = sceneNode("1");
		const nodes = Array.from({ length: 300 }, (_, i) => sceneNode(String(i + 2), `N${i}`, "1"));
		const records: Record<string, unknown>[] = [start];
		for (let i = 0; i < 40; i++)
			records.push({
				event: "scene-state",
				state: { nodes: i % 2 ? [a] : [a, ...nodes], selected: [] },
			});
		records.push({
			event: "scene-run",
			run: { state: "playing", scope: "other-scene", scene: "res://x.tscn" },
		});
		records.push(footer);
		expect(() => parseGodotSceneJournal(sceneSource(v4(records)))).toThrow();
	});
});

it("keeps checkpoint listing and comparison working in v4 takes with context records", () => {
	const records = historyTake();
	const footer = records.pop() as Record<string, unknown>;
	const node = sceneNode();
	records.push(
		{
			event: "scene-checkpoint",
			label: "First",
			labelProvenance: "authored",
			nodeCount: 2,
			snapshotSequence: 2,
		},
		{ event: "scene-state", state: { nodes: [node], selected: [] } },
		{
			event: "scene-history",
			history: { available: true, version: 3, actionIndex: 1, action: "Delete Node" },
		},
		{
			event: "scene-checkpoint",
			label: "Second",
			labelProvenance: "authored",
			nodeCount: 1,
			snapshotSequence: 10,
		},
		footer,
	);
	const source = sceneSource(v4(records));
	const markers = listGodotSceneCheckpoints(source);
	expect(markers.map((marker) => marker.label)).toEqual(["First", "Second"]);
	const comparison = compareGodotSceneCheckpoints(
		source,
		markers[0].recordSequence,
		markers[1].recordSequence,
	);
	expect(comparison.counts.removed).toBe(1);
});
