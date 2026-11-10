import { z } from "zod";

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
			})
			.strict(),
	})
	.strict();
const stateSchema = z
	.object({
		nodes: z.array(nodeSchema).min(1).max(512),
		selected: z.array(nodeId).max(512),
	})
	.strict();
const envelope = z.object({
	schemaVersion: z.literal(1),
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
		})
		.strict(),
	envelope.extend({ event: z.literal("scene-state"), state: stateSchema }).strict(),
	envelope.extend({ event: z.literal("scene-saved"), scene: resourcePath }).strict(),
	envelope
		.extend({
			event: z.literal("scene-stop"),
			coverage: z.enum(["sampled", "limited"]),
			reason: z.enum(["user-stop", "scene-changed", "plugin-disabled", "limit"]),
		})
		.strict(),
]);
type SceneNode = z.infer<typeof nodeSchema>;
type SceneState = z.infer<typeof stateSchema>;
export type SceneObservation = {
	id: string;
	atMs: number;
	type: "node-appeared" | "node-disappeared" | "node-changed" | "selection-changed" | "scene-saved";
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
	baseline: SceneState;
	observations: SceneObservation[];
};
function validateState(state: SceneState, rootId?: string): void {
	const depths = new Map<string, number>();
	for (const [index, node] of state.nodes.entries()) {
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
}
/** Pure offline decoder. Does not connect to Godot, read resource paths or map video time. */
export function parseGodotSceneJournal(text: string): GodotSceneJournal {
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
	validateState(first.state);
	const rootId = first.state.nodes[0].id;
	const types = new Map(first.state.nodes.map((node) => [node.id, node.type]));
	let previous = first.state,
		time = 0;
	const observations: SceneObservation[] = [];
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
			if (observations.length >= 10000) throw new Error("Too many scene observations");
			observations.push({
				id: `${index}:${observations.length}`,
				atMs: record.atMs,
				type,
				label,
				payload,
			});
		};
		if (record.event === "scene-state") {
			validateState(record.state, rootId);
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
			previous = record.state;
		} else if (record.event === "scene-saved") {
			add("scene-saved", "Scene save observed", { scene: record.scene });
		} else throw new Error("Unexpected scene lifecycle record");
	}
	if (last.reason === "limit" && last.coverage !== "limited")
		throw new Error("Invalid scene coverage");
	return {
		adapterId: "godot-scene",
		sessionId: first.sessionId,
		instanceId: first.instanceId,
		scene: first.scene,
		clock: "unmapped",
		coverage: last.coverage,
		stopReason: last.reason,
		durationMs: last.atMs,
		baseline: first.state,
		observations,
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
