import { describe, expect, it } from "vitest";
import {
	compareGodotSceneCheckpoints,
	listGodotSceneCheckpoints,
	parseGodotSceneJournal,
} from "./godotScene";

function journal() {
	const root = { id: "1", parent: "", name: "Root", type: "Node2D", properties: { script: null } };
	const child = {
		id: "2",
		parent: "1",
		name: "Sprite",
		type: "Sprite2D",
		properties: { script: null, position: [0, 0] },
	};
	const other = {
		id: "3",
		parent: "1",
		name: "Holder",
		type: "Node2D",
		properties: { script: null },
	};
	const temporary = {
		id: "5",
		parent: "1",
		name: "Temporary",
		type: "Node2D",
		properties: { script: null },
	};
	const first = { nodes: [root, child, other, temporary], selected: ["2"] };
	const changedChild = {
		...child,
		parent: "3",
		name: "Enemy",
		properties: { script: "res://enemy.gd", position: [10, 20], visible: false },
	};
	const second = {
		nodes: [
			root,
			other,
			changedChild,
			{ id: "4", parent: "1", name: "Label", type: "Label", properties: { script: null } },
		],
		selected: ["4"],
	};
	const base = {
		schemaVersion: 2,
		sessionId: `godot-scene-${"a".repeat(32)}`,
		instanceId: "b".repeat(32),
	};
	const records = [
		{
			...base,
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://main.tscn",
			state: { nodes: [root], selected: [] },
			intervalMs: 250,
		},
		{ ...base, event: "scene-state", state: first },
		{
			...base,
			event: "scene-checkpoint",
			label: "Draft",
			labelProvenance: "authored",
			nodeCount: first.nodes.length,
			snapshotSequence: 1,
		},
		{ ...base, event: "scene-state", state: second },
		{
			...base,
			event: "scene-checkpoint",
			label: "Draft",
			labelProvenance: "authored",
			nodeCount: second.nodes.length,
			snapshotSequence: 3,
		},
		{ ...base, event: "scene-stop", coverage: "sampled", reason: "user-stop" },
	].map((record, sequence) => ({ ...record, sequence, atMs: sequence * 250 })) as Record<
		string,
		unknown
	>[];
	return records;
}

const source = (records: Record<string, unknown>[]) =>
	`${records.map((record) => JSON.stringify(record)).join("\n")}\n`;

describe("compareGodotSceneCheckpoints", () => {
	it("compares the exact snapshots by marker record sequence, despite repeated labels", () => {
		const result = compareGodotSceneCheckpoints(source(journal()), 2, 4);
		expect(result.from).toEqual({
			recordSequence: 2,
			label: "Draft",
			atMs: 500,
			snapshotSequence: 1,
		});
		expect(result.to).toEqual({
			recordSequence: 4,
			label: "Draft",
			atMs: 1000,
			snapshotSequence: 3,
		});
		expect(result.counts).toEqual({ added: 1, removed: 1, changed: 1, changedFields: 5 });
		expect(result.changed).toEqual([
			{
				id: "2",
				nameBefore: "Sprite",
				nameAfter: "Enemy",
				fields: ["name", "parent", "position", "visible", "script"],
			},
		]);
		expect(result.added).toEqual([{ id: "4", name: "Label", type: "Label", parent: "1" }]);
		expect(result.removed).toEqual([{ id: "5", name: "Temporary", type: "Node2D", parent: "1" }]);
		expect(result.selection).toEqual({ before: ["2"], after: ["4"] });
		expect(JSON.stringify(result)).not.toContain("res://enemy.gd");
	});

	it("allows reverse comparisons and reports unchanged snapshots without dumping state", () => {
		const records = journal();
		records.splice(5, 0, { ...records[4], label: "Repeated Draft" });
		const sequenced = records.map((record, sequence) => ({
			...record,
			sequence,
			atMs: sequence * 250,
		}));
		const result = compareGodotSceneCheckpoints(source(sequenced), 5, 4);
		expect(result.counts).toEqual({ added: 0, removed: 0, changed: 0, changedFields: 0 });
		expect(result).not.toHaveProperty("selection");
		expect(result).not.toHaveProperty("nodes");
	});

	it("supports baseline snapshot sequence zero and rejects same or non-marker choices", () => {
		const records = journal();
		records.splice(1, 0, {
			...records[2],
			event: "scene-checkpoint",
			label: "Baseline",
			nodeCount: 1,
			snapshotSequence: 0,
		});
		records[3].snapshotSequence = 2;
		records[5].snapshotSequence = 4;
		const sequenced = records.map((record, sequence) => ({
			...record,
			sequence,
			atMs: sequence * 250,
		}));
		expect(compareGodotSceneCheckpoints(source(sequenced), 1, 5).from.snapshotSequence).toBe(0);
		expect(() => compareGodotSceneCheckpoints(source(sequenced), 3, 3)).toThrow("distinct");
		expect(() => compareGodotSceneCheckpoints(source(sequenced), 2, 5)).toThrow("not an authored");
		expect(() => compareGodotSceneCheckpoints(source(sequenced), 9, 5)).toThrow("not an authored");
	});

	it("refuses a malformed tail even when the selected checkpoints precede it", () => {
		const records = journal();
		records.splice(5, 0, { ...records[2], label: "invalid", snapshotSequence: 0, nodeCount: 1 });
		const malformed: Record<string, unknown>[] = records.map((record, sequence) => ({
			...record,
			sequence,
			atMs: sequence * 250,
		}));
		malformed[5].labelProvenance = "untrusted";
		expect(() => compareGodotSceneCheckpoints(source(malformed), 2, 4)).toThrow();
	});

	it("continues raw validation after the decoder's normalized observation cap", () => {
		const nodes = (revision: number) =>
			Array.from({ length: 512 }, (_, index) => ({
				id: String(index + 1),
				parent: index === 0 ? "" : "1",
				name: `Node-${index}-${revision}`,
				type: index === 0 ? "Node2D" : "Sprite2D",
				properties: { script: null },
			}));
		const base = {
			schemaVersion: 2,
			sessionId: `godot-scene-${"a".repeat(32)}`,
			instanceId: "b".repeat(32),
		};
		const records: Record<string, unknown>[] = [
			{
				...base,
				event: "scene-start",
				producer: "godot-scene",
				scene: "res://main.tscn",
				state: { nodes: nodes(0), selected: [] },
				intervalMs: 250,
			},
			{
				...base,
				event: "scene-checkpoint",
				label: "A",
				labelProvenance: "authored",
				nodeCount: 512,
				snapshotSequence: 0,
			},
			{ ...base, event: "scene-state", state: { nodes: nodes(1), selected: [] } },
			{
				...base,
				event: "scene-checkpoint",
				label: "B",
				labelProvenance: "authored",
				nodeCount: 512,
				snapshotSequence: 2,
			},
		];
		for (let revision = 2; revision <= 22; revision++)
			records.push({
				...base,
				event: "scene-state",
				state: { nodes: nodes(revision), selected: [] },
			});
		records.push({ ...base, event: "scene-stop", coverage: "sampled", reason: "user-stop" });
		const validInput = source(
			records.map((record, sequence) => ({ ...record, sequence, atMs: sequence * 250 })),
		);
		expect(parseGodotSceneJournal(validInput).stopReason).toBe("decoder-observation-limit");
		expect(compareGodotSceneCheckpoints(validInput, 1, 3).counts.changed).toBe(512);
		records.splice(-1, 0, {
			...base,
			event: "scene-checkpoint",
			label: "bad tail",
			labelProvenance: "authored",
			nodeCount: 512,
			snapshotSequence: 0,
		});
		const input = source(
			records.map((record, sequence) => ({ ...record, sequence, atMs: sequence * 250 })),
		);
		expect(new TextEncoder().encode(input).byteLength).toBeLessThan(8 * 1024 * 1024);
		expect(() => compareGodotSceneCheckpoints(input, 1, 3)).toThrow();
	});
});

it("lists raw checkpoint identities and rejects ambiguous or out-of-bound choices", () => {
	const input = source(journal());
	expect(listGodotSceneCheckpoints(input)).toEqual([
		{ recordSequence: 2, label: "Draft", atMs: 500, snapshotSequence: 1 },
		{ recordSequence: 4, label: "Draft", atMs: 1000, snapshotSequence: 3 },
	]);
	for (const invalid of [NaN, Infinity, -1, 1.5, 4096, 1e100]) {
		expect(() => compareGodotSceneCheckpoints(input, invalid, 4)).toThrow();
		expect(() => compareGodotSceneCheckpoints(input, 2, invalid)).toThrow();
	}
});
