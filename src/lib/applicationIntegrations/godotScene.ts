import { z } from "zod";
import {
	type ApplicationCapture,
	MAX_APPLICATION_CAPTURE_BYTES,
	validateApplicationCapture,
} from "./capture";

type JsonValue = z.infer<ReturnType<typeof z.json>>;

export const MAX_SCENE_JOURNAL_BYTES = 8 * 1024 * 1024;
const nodeId = z.string().regex(/^[1-9][0-9]{0,19}$/);
const resourcePath = z
	.string()
	.max(1000)
	.refine((value) => {
		if (value === "built-in-or-unsaved" || value === "external-or-unsupported") return true;
		return (
			value.startsWith("res://") &&
			!/[\\\p{Cc}]/u.test(value) &&
			!value
				.slice(6)
				.split("/")
				.some((part) => part === ".." || part === ".")
		);
	});
const vector = z.tuple([z.number().finite(), z.number().finite()]);
const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const nodeSchema = z
	.object({
		id: nodeId,
		parent: z.union([nodeId, z.literal("")]),
		name: z.string().min(1).max(200),
		type: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,99}$/),
		properties: z
			.object({
				position: vector.optional(),
				rotation: z.number().finite().optional(),
				scale: vector.optional(),
				visible: z.boolean().optional(),
				script: resourcePath.nullable(),
				texture: resourcePath.nullable().optional(),
				position3: vector3.optional(),
				rotation3: vector3.optional(),
				scale3: vector3.optional(),
			})
			.strict(),
	})
	.strict();
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/);
// v5: persistent signal connections between observed nodes. Bound argument values are
// never part of the journal, only their count.
const connectionSchema = z
	.object({
		signal: identifier,
		from: nodeId,
		to: nodeId,
		method: identifier,
		boundArgs: z.number().int().min(0).max(64),
		deferred: z.boolean(),
		oneShot: z.boolean(),
	})
	.strict();
type SceneConnection = z.infer<typeof connectionSchema>;
const stateSchema = z
	.object({
		nodes: z.array(nodeSchema).min(1).max(512),
		selected: z.array(nodeId).max(512),
		connections: z.array(connectionSchema).max(256).optional(),
		excludedConnections: z.number().int().min(0).max(1000000).optional(),
	})
	.strict();
// v4 editor context: the captured scene's own undo history and polled run state.
const historyLabel = z
	.string()
	.min(1)
	.max(200)
	.refine((label) => label.trim().length > 0 && !/[\p{Cc}]/u.test(label));
const historySchema = z.union([
	z.object({ available: z.literal(false) }).strict(),
	z
		.object({
			available: z.literal(true),
			version: z.number().int().min(0).max(2147483647),
			actionIndex: z.number().int().min(-1).max(1000000),
			action: historyLabel.nullable(),
		})
		.strict()
		.refine((history) => history.actionIndex < 0 === (history.action === null)),
]);
const runSchema = z.union([
	z.object({ state: z.literal("stopped") }).strict(),
	z
		.object({ state: z.literal("playing"), scope: z.literal("current-scene"), scene: resourcePath })
		.strict(),
	z.object({ state: z.literal("playing"), scope: z.literal("other-scene") }).strict(),
]);
type SceneHistory = z.infer<typeof historySchema>;
type SceneRun = z.infer<typeof runSchema>;
const envelope = z.object({
	schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
	sessionId: z.string().regex(/^godot-scene-[a-f0-9]{32}$/),
	instanceId: z.string().regex(/^[a-f0-9]{32}$/),
	sequence: z.number().int().min(0).max(4095),
	atMs: z.number().int().min(0).max(86400000),
});
const recordSchema = z.discriminatedUnion("event", [
	envelope
		.extend({
			event: z.literal("scene-start"),
			producer: z.literal("godot-scene"),
			scene: resourcePath,
			state: stateSchema,
			intervalMs: z.literal(250),
			history: historySchema.optional(),
			run: runSchema.optional(),
		})
		.strict(),
	envelope
		.extend({
			event: z.literal("scene-state"),
			state: stateSchema,
			trigger: z
				.enum(["poll", "selection", "inspector", "tree", "save", "stop", "checkpoint", "history"])
				.optional(),
		})
		.strict(),
	envelope.extend({ event: z.literal("scene-saved"), scene: resourcePath }).strict(),
	envelope.extend({ event: z.literal("scene-history"), history: historySchema }).strict(),
	envelope.extend({ event: z.literal("scene-run"), run: runSchema }).strict(),
	envelope
		.extend({
			event: z.literal("scene-stop"),
			coverage: z.enum(["sampled", "limited"]),
			reason: z.enum(["user-stop", "scene-changed", "plugin-disabled", "limit"]),
		})
		.strict(),
	envelope
		.extend({
			event: z.literal("scene-checkpoint"),
			label: z
				.string()
				.min(1)
				.max(200)
				.refine((label) => label.trim().length > 0 && !/[\p{Cc}]/u.test(label)),
			labelProvenance: z.literal("authored"),
			nodeCount: z.number().int().min(1).max(512),
			snapshotSequence: z.number().int().min(0).max(4095),
		})
		.strict(),
]);
type SceneRecord = z.infer<typeof recordSchema>;
type SceneNode = z.infer<typeof nodeSchema>;
type SceneState = z.infer<typeof stateSchema>;
export type SceneObservation = {
	id: string;
	atMs: number;
	type:
		| "node-appeared"
		| "node-disappeared"
		| "node-changed"
		| "selection-changed"
		| "scene-saved"
		| "author-checkpoint"
		| "editor-history"
		| "run-state"
		| "signal-connection-added"
		| "signal-connection-removed"
		| "signal-connections-unrecorded";
	label: string;
	payload: JsonValue;
};
export type GodotSceneJournal = {
	adapterId: "godot-scene";
	sessionId: string;
	instanceId: string;
	scene: string;
	clock: "unmapped";
	coverage: "sampled" | "limited";
	stopReason: string;
	durationMs: number;
	/** v4 adds the starting editor history/run context; earlier versions keep the bare state. */
	baseline: SceneState | (SceneState & { history: SceneHistory; run: SceneRun });
	observations: SceneObservation[];
};
function validateState(state: SceneState, rootId?: string, schemaVersion = 2): void {
	const depths = new Map<string, number>();
	for (const [index, node] of state.nodes.entries()) {
		const properties = node.properties;
		const has2d =
			properties.position !== undefined ||
			properties.rotation !== undefined ||
			properties.scale !== undefined;
		const spatial3d = [properties.position3, properties.rotation3, properties.scale3];
		const has3d = spatial3d.some((value) => value !== undefined);
		if (schemaVersion < 3 && has3d)
			throw new Error("3D transforms require scene journal schema v3");
		if (has2d && has3d) throw new Error("Mixed 2D and 3D scene transforms");
		if (has3d && spatial3d.some((value) => value === undefined))
			throw new Error("Incomplete 3D scene transforms");
		if (depths.has(node.id)) throw new Error("Duplicate scene node");
		if (index === 0) {
			if (node.parent !== "" || (rootId && node.id !== rootId))
				throw new Error("Scene scope changed");
			depths.set(node.id, 0);
		} else {
			const depth = depths.get(node.parent);
			if (depth === undefined || depth >= 64) throw new Error("Invalid scene hierarchy");
			depths.set(node.id, depth + 1);
		}
	}
	if (
		new Set(state.selected).size !== state.selected.length ||
		state.selected.some((id) => !depths.has(id))
	)
		throw new Error("Invalid scene selection");
	if (
		(state.connections !== undefined) !== schemaVersion >= 5 ||
		(state.excludedConnections !== undefined) !== schemaVersion >= 5
	)
		throw new Error("Signal connections require scene journal schema v5 or later");
	const connections = state.connections ?? [];
	if (
		new Set(connections.map(connectionKey)).size !== connections.length ||
		connections.some((connection) => !depths.has(connection.from) || !depths.has(connection.to))
	)
		throw new Error("Invalid scene signal connections");
}
function connectionKey(connection: SceneConnection): string {
	return JSON.stringify([
		connection.from,
		connection.signal,
		connection.to,
		connection.method,
		connection.boundArgs,
		connection.deferred,
		connection.oneShot,
	]);
}
// Labels stay within the shared 300-character observation label; the payload keeps the
// full names and session node IDs (node names need not be unique).
function shortName(value: string): string {
	return value.length > 48 ? `${value.slice(0, 47)}…` : value;
}
function describeConnection(connection: SceneConnection, state: SceneState): string {
	const name = (id: string) => shortName(state.nodes.find((node) => node.id === id)?.name ?? id);
	return `${name(connection.from)}.${shortName(connection.signal)} → ${name(connection.to)}.${shortName(connection.method)}`;
}
/** Pure offline decoder. Does not connect to Godot, read resource paths or map video time. */
function decodeGodotSceneJournal(text: string): {
	journal: GodotSceneJournal;
	records: SceneRecord[];
} {
	if (
		text.length > MAX_SCENE_JOURNAL_BYTES ||
		new TextEncoder().encode(text).byteLength > MAX_SCENE_JOURNAL_BYTES
	)
		throw new Error("Scene journal exceeds 8 MiB");
	const lines = text.trimEnd().split("\n");
	if (lines.length < 2 || lines.length > 4096)
		throw new Error("Invalid scene journal record count");
	const records = lines.map((line) => recordSchema.parse(JSON.parse(line)));
	const first = records[0],
		last = records[records.length - 1];
	if (first.event !== "scene-start" || last.event !== "scene-stop" || first.atMs !== 0)
		throw new Error("Scene journal requires a header and footer");
	validateState(first.state, undefined, first.schemaVersion);
	if (records.some((record) => record.schemaVersion !== first.schemaVersion))
		throw new Error("Scene journal schema version mismatch");
	if (
		first.schemaVersion === 1 &&
		records.some(
			(record) =>
				record.event === "scene-checkpoint" ||
				(record.event === "scene-state" && record.trigger === "checkpoint"),
		)
	)
		throw new Error("Checkpoint requires scene journal schema v2");
	const v4 = first.schemaVersion >= 4;
	if ((first.history !== undefined) !== v4 || (first.run !== undefined) !== v4)
		throw new Error("Editor history/run context requires scene journal schema v4 or later");
	if (
		!v4 &&
		records.some(
			(record) =>
				record.event === "scene-history" ||
				record.event === "scene-run" ||
				(record.event === "scene-state" && record.trigger === "history"),
		)
	)
		throw new Error("Editor history/run records require scene journal schema v4");
	if (first.history && !first.history.available && records.some((r) => r.event === "scene-history"))
		throw new Error("History records require an available scene history");
	// A current-scene run must name the captured scene: its header path or a path the
	// take itself observed being saved (Save As). Any other path is out of scope.
	const capturedScenes = new Set([first.scene]);
	if (
		first.run?.state === "playing" &&
		first.run.scope === "current-scene" &&
		first.run.scene !== first.scene
	)
		throw new Error("Run path is outside the captured scene");
	const rootId = first.state.nodes[0].id;
	const types = new Map(first.state.nodes.map((node) => [node.id, node.type]));
	let previous = first.state,
		time = 0;
	let snapshotSequence = first.sequence;
	const observations: SceneObservation[] = [];
	const journal: GodotSceneJournal = {
		adapterId: "godot-scene",
		sessionId: first.sessionId,
		instanceId: first.instanceId,
		scene: first.scene,
		clock: "unmapped",
		coverage: last.coverage,
		stopReason: last.reason,
		durationMs: last.atMs,
		baseline:
			first.history && first.run
				? { ...first.state, history: first.history, run: first.run }
				: first.state,
		observations,
	};
	let history = first.history,
		run = first.run;
	// Diff expansion can exceed the source byte count. Keep a bounded prefix while
	// validating every remaining raw record; never turn corrupt tails into partial success.
	let normalizedBytes =
		new TextEncoder().encode(JSON.stringify(godotSceneCapture(journal))).byteLength + 1024;
	let omitted: "observation-limit" | "size-limit" | undefined;
	for (const [index, record] of records.entries()) {
		if (
			record.sequence !== index ||
			record.sessionId !== first.sessionId ||
			record.instanceId !== first.instanceId ||
			record.atMs < time
		)
			throw new Error("Scene journal sequence, session or clock mismatch");
		time = record.atMs;
		if (index === 0 || index === records.length - 1) continue;
		const add = (type: SceneObservation["type"], label: string, payload: JsonValue) => {
			if (omitted) return;
			if (observations.length >= 10000) {
				omitted = "observation-limit";
				return;
			}
			const observation: SceneObservation = {
				id: `${index}:${observations.length}`,
				atMs: record.atMs,
				type,
				label,
				payload:
					record.event === "scene-state" && record.trigger
						? { ...(payload as Record<string, JsonValue>), samplingTrigger: record.trigger }
						: payload,
			};
			const bytes = new TextEncoder().encode(JSON.stringify(observation)).byteLength + 1;
			if (normalizedBytes + bytes > MAX_APPLICATION_CAPTURE_BYTES) {
				omitted = "size-limit";
				return;
			}
			normalizedBytes += bytes;
			observations.push(observation);
		};
		if (record.event === "scene-state") {
			validateState(record.state, rootId, first.schemaVersion);
			snapshotSequence = record.sequence;
			const before = new Map(previous.nodes.map((node) => [node.id, node]));
			const after = new Map(record.state.nodes.map((node) => [node.id, node]));
			for (const node of previous.nodes) {
				if (!after.has(node.id))
					add("node-disappeared", `Node disappeared: ${node.name}`, { before: node });
			}
			for (const node of record.state.nodes) {
				if (types.has(node.id) && types.get(node.id) !== node.type)
					throw new Error("Node identity reused");
				types.set(node.id, node.type);
				const old = before.get(node.id);
				if (!old) add("node-appeared", `Node appeared: ${node.name}`, { after: node });
				else if (JSON.stringify(old) !== JSON.stringify(node))
					add("node-changed", describeNodeChange(old, node), { before: old, after: node });
			}
			if (
				JSON.stringify([...previous.selected].sort()) !==
				JSON.stringify([...record.state.selected].sort())
			)
				add("selection-changed", "Scene selection changed", {
					before: previous.selected,
					after: record.state.selected,
				});
			const beforeConnections = new Set((previous.connections ?? []).map(connectionKey));
			const afterConnections = new Set((record.state.connections ?? []).map(connectionKey));
			// Observed saved-connection differences between samples; not the dock gesture.
			for (const connection of previous.connections ?? [])
				if (!afterConnections.has(connectionKey(connection)))
					add(
						"signal-connection-removed",
						`Signal connection no longer observed: ${describeConnection(connection, previous)}`,
						{ before: connection },
					);
			for (const connection of record.state.connections ?? [])
				if (!beforeConnections.has(connectionKey(connection)))
					add(
						"signal-connection-added",
						`Signal connection observed: ${describeConnection(connection, record.state)}`,
						{ after: connection },
					);
			if ((previous.excludedConnections ?? 0) !== (record.state.excludedConnections ?? 0))
				add(
					"signal-connections-unrecorded",
					`Unrecorded saved signal connections: ${record.state.excludedConnections}`,
					{
						before: previous.excludedConnections ?? 0,
						after: record.state.excludedConnections ?? 0,
						reason: "outside-observed-scene-or-unsupported-callable",
					},
				);
			previous = record.state;
		} else if (record.event === "scene-saved") {
			capturedScenes.add(record.scene);
			add("scene-saved", "Scene save observed", { scene: record.scene });
		} else if (record.event === "scene-history" && history?.available) {
			const after = record.history;
			if (!after.available || JSON.stringify(after) === JSON.stringify(history))
				throw new Error("Invalid scene history record");
			const direction =
				after.version > history.version
					? "forward"
					: after.version < history.version
						? "back"
						: "unresolved";
			// Version/action-name changes are editor-reported observations. They do not
			// prove the gesture, whether a forward step was new or a redo, or what changed.
			const label =
				direction === "back"
					? `Editor history stepped back from: ${history.action ?? "(start of history)"}`
					: direction === "forward"
						? `Editor history: ${after.action ?? "(start of history)"}`
						: `Editor history changed: ${after.action ?? "(start of history)"}`;
			add("editor-history", label, {
				historyScope: "captured-scene",
				direction,
				before: history,
				after,
				interpretation: "editor-reported-history-position",
			});
			history = after;
		} else if (record.event === "scene-run" && run) {
			const after = record.run;
			if (JSON.stringify(after) === JSON.stringify(run))
				throw new Error("Invalid scene run record");
			if (
				after.state === "playing" &&
				after.scope === "current-scene" &&
				!capturedScenes.has(after.scene)
			)
				throw new Error("Run path is outside the captured scene");
			const label =
				after.state === "stopped"
					? "Editor run stop observed"
					: after.scope === "current-scene"
						? `Editor run observed: ${after.scene}`
						: "Editor run observed: another scene (path withheld)";
			add("run-state", label, {
				before: run,
				after,
				observation: "polled-editor-run-state",
				result: "unavailable",
			});
			run = after;
		} else if (record.event === "scene-checkpoint") {
			if (
				first.schemaVersion < 2 ||
				record.snapshotSequence !== snapshotSequence ||
				record.nodeCount !== previous.nodes.length
			)
				throw new Error("Invalid checkpoint snapshot reference");
			add("author-checkpoint", `Author checkpoint: ${record.label}`, {
				label: record.label,
				labelProvenance: "authored",
				nodeCount: record.nodeCount,
				snapshotSequence: record.snapshotSequence,
			});
		} else throw new Error("Unexpected scene lifecycle record");
	}
	if (last.reason === "limit" && last.coverage !== "limited")
		throw new Error("Invalid scene coverage");
	return {
		journal: {
			...journal,
			coverage: omitted ? "limited" : last.coverage,
			stopReason: omitted ? `decoder-${omitted}` : last.reason,
		},
		records,
	};
}
/** Pure offline decoder. Does not connect to Godot, read resource paths or map video time. */
export function parseGodotSceneJournal(text: string): GodotSceneJournal {
	return decodeGodotSceneJournal(text).journal;
}

export type GodotSceneCheckpoint = {
	recordSequence: number;
	label: string;
	atMs: number;
	snapshotSequence: number;
};

/** List authored markers from the original, fully validated raw journal only. */
export function listGodotSceneCheckpoints(text: string): GodotSceneCheckpoint[] {
	return decodeGodotSceneJournal(text).records.flatMap((record) =>
		record.event === "scene-checkpoint"
			? [
					{
						recordSequence: record.sequence,
						label: record.label,
						atMs: record.atMs,
						snapshotSequence: record.snapshotSequence,
					},
				]
			: [],
	);
}

export type GodotCheckpointComparison = {
	from: GodotSceneCheckpoint;
	to: GodotSceneCheckpoint;
	counts: { added: number; removed: number; changed: number; changedFields: number };
	added: Array<{ id: string; name: string; type: string; parent: string }>;
	removed: Array<{ id: string; name: string; type: string; parent: string }>;
	changed: Array<{ id: string; nameBefore: string; nameAfter: string; fields: string[] }>;
	selection?: { before: string[]; after: string[] };
	/** v5 only, present when the saved signal connections differ between the two snapshots. */
	connections?: { added: SceneConnection[]; removed: SceneConnection[] };
};

/**
 * Compare two authored checkpoint records in one fully validated raw Godot take.
 * Arguments are raw record sequence numbers, not labels or normalized observation IDs.
 */
export function compareGodotSceneCheckpoints(
	text: string,
	fromRecordSequence: number,
	toRecordSequence: number,
): GodotCheckpointComparison {
	if (
		!Number.isInteger(fromRecordSequence) ||
		!Number.isInteger(toRecordSequence) ||
		fromRecordSequence < 0 ||
		fromRecordSequence > 4095 ||
		toRecordSequence < 0 ||
		toRecordSequence > 4095 ||
		fromRecordSequence === toRecordSequence
	)
		throw new Error("Choose two distinct checkpoint record sequences");
	const { records } = decodeGodotSceneJournal(text);
	const checkpoint = (sequence: number) => {
		const record = records[sequence];
		if (!record || record.sequence !== sequence || record.event !== "scene-checkpoint")
			throw new Error(`Record ${sequence} is not an authored scene checkpoint`);
		return record;
	};
	const fromRecord = checkpoint(fromRecordSequence);
	const toRecord = checkpoint(toRecordSequence);
	const snapshots = new Map<number, SceneState>();
	for (const record of records) {
		if (record.event === "scene-start") snapshots.set(record.sequence, record.state);
		else if (record.event === "scene-state") snapshots.set(record.sequence, record.state);
	}
	const before = snapshots.get(fromRecord.snapshotSequence);
	const after = snapshots.get(toRecord.snapshotSequence);
	if (!before || !after) throw new Error("Checkpoint references a missing scene snapshot");
	const beforeById = new Map(before.nodes.map((node) => [node.id, node]));
	const afterById = new Map(after.nodes.map((node) => [node.id, node]));
	const added = after.nodes
		.filter((node) => !beforeById.has(node.id))
		.map(({ id, name, type, parent }) => ({ id, name, type, parent }));
	const removed = before.nodes
		.filter((node) => !afterById.has(node.id))
		.map(({ id, name, type, parent }) => ({ id, name, type, parent }));
	const changed: GodotCheckpointComparison["changed"] = [];
	const fields = [
		"name",
		"parent",
		"position",
		"rotation",
		"scale",
		"visible",
		"script",
		"texture",
		"position3",
		"rotation3",
		"scale3",
	] as const;
	const valueFor = (node: SceneNode, field: (typeof fields)[number]) =>
		field === "name" || field === "parent"
			? node[field]
			: node.properties[field] === undefined
				? [false]
				: [true, node.properties[field]];
	for (const node of after.nodes) {
		const previous = beforeById.get(node.id);
		if (!previous) continue;
		const changedFields = fields.filter(
			(field) =>
				JSON.stringify(valueFor(previous, field)) !== JSON.stringify(valueFor(node, field)),
		);
		if (changedFields.length)
			changed.push({
				id: node.id,
				nameBefore: previous.name,
				nameAfter: node.name,
				fields: [...changedFields],
			});
	}
	const selectionChanged =
		JSON.stringify([...before.selected].sort()) !== JSON.stringify([...after.selected].sort());
	const beforeKeys = new Set((before.connections ?? []).map(connectionKey));
	const afterKeys = new Set((after.connections ?? []).map(connectionKey));
	const connectionsAdded = (after.connections ?? []).filter(
		(c) => !beforeKeys.has(connectionKey(c)),
	);
	const connectionsRemoved = (before.connections ?? []).filter(
		(c) => !afterKeys.has(connectionKey(c)),
	);
	return {
		from: {
			recordSequence: fromRecord.sequence,
			label: fromRecord.label,
			atMs: fromRecord.atMs,
			snapshotSequence: fromRecord.snapshotSequence,
		},
		to: {
			recordSequence: toRecord.sequence,
			label: toRecord.label,
			atMs: toRecord.atMs,
			snapshotSequence: toRecord.snapshotSequence,
		},
		counts: {
			added: added.length,
			removed: removed.length,
			changed: changed.length,
			changedFields: changed.reduce((count, node) => count + node.fields.length, 0),
		},
		added,
		removed,
		changed,
		...(selectionChanged
			? { selection: { before: [...before.selected], after: [...after.selected] } }
			: {}),
		...(connectionsAdded.length || connectionsRemoved.length
			? { connections: { added: connectionsAdded, removed: connectionsRemoved } }
			: {}),
	};
}
function describeNodeChange(before: SceneNode, after: SceneNode): string {
	const changes: string[] = [];
	if (before.name !== after.name) changes.push("name");
	if (before.parent !== after.parent) changes.push("parent");
	for (const key of Object.keys(after.properties) as (keyof SceneNode["properties"])[]) {
		if (JSON.stringify(before.properties[key]) !== JSON.stringify(after.properties[key]))
			changes.push(key);
	}
	return `Node changed: ${after.name} (${changes.join(", ") || "properties"})`;
}

/** Adapter-specific scene shape ends here; downstream authoring is application neutral. */
export function godotSceneCapture(journal: GodotSceneJournal): ApplicationCapture {
	return validateApplicationCapture({
		format: "openscreen-application-capture",
		version: 1,
		adapterId: journal.adapterId,
		instanceId: journal.instanceId,
		sessionId: journal.sessionId,
		scope: journal.scene,
		clock: journal.clock,
		coverage: journal.coverage,
		stopReason: journal.stopReason,
		pollIntervalMs: 250,
		durationMs: journal.durationMs,
		baseline: journal.baseline,
		observations: journal.observations,
	});
}
