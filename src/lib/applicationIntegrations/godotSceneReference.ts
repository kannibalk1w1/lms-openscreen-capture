import {
	type GodotCheckpointSnapshot,
	type GodotSceneSnapshotState,
	readGodotCheckpointSnapshot,
} from "./godotScene";

/**
 * Advisory, offline comparison of the sampled scene state at a candidate checkpoint with a
 * reference checkpoint, usually from a different raw journal (a retake or a later take).
 *
 * - Session node IDs are never matched across takes. Nodes are matched only by their
 *   root-relative path, an array of node names (Godot keeps sibling names unique);
 *   duplicate paths are refused as ambiguous. A renamed or reparented node is reported as
 *   an unmatched path on each side, not as a deletion, rename or any other action.
 * - Roots are matched by position. Root name and type are compared as ordinary fields.
 * - Only the journal's allowlisted sampled fields are compared. Resource paths are compared
 *   as identity text; no resource is loaded, so asset content is not compared. Numbers
 *   are compared exactly unless the caller passes an explicit absolute tolerance.
 * - Fields one source could not record, saved signal connections either source did not
 *   or could not fully record, and limited coverage make the outcome partial, never "agree".
 *
 * This is not expected-state verification, completion grading, or evidence of world pose,
 * rendering, runtime behaviour or learning.
 */
export const GODOT_REFERENCE_MAX_ROWS = 200;
export const GODOT_REFERENCE_MAX_ROW_BYTES = 256 * 1024;
const MAX_TOLERANCE = 1;
const FIELDS = [
	"type",
	"script",
	"texture",
	"position",
	"rotation",
	"scale",
	"visible",
	"position3",
	"rotation3",
	"scale3",
] as const;
/** v1/v2 journals never recorded Node3D transforms or Node3D visibility. */
const LEGACY_UNRECORDED = ["visible", "position3", "rotation3", "scale3"] as const;
type Field = (typeof FIELDS)[number] | "name";
type SceneNode = GodotSceneSnapshotState["nodes"][number];
type Path = string[];
type Unknown =
	| "reference-coverage-limited"
	| "candidate-coverage-limited"
	| "node3d-fields-unobserved"
	| "connections-unobserved"
	| "connections-partially-recorded";

export type GodotReferenceSource = {
	/** The take's header scene path (a Save As during the take is not reflected here). */
	scene: string;
	schemaVersion: number;
	sessionId: string;
	instanceId: string;
	coverage: "sampled" | "limited";
	stopReason: string;
	checkpoint: { recordSequence: number; label: string; atMs: number; snapshotSequence: number };
};
type ConnectionDetail = {
	signal: string;
	method: string;
	boundArgs: number;
	deferred: boolean;
	oneShot: boolean;
};
type ConnectionRow = { from: Path; to: Path } & ConnectionDetail;
type Lists =
	| "referenceOnly"
	| "candidateOnly"
	| "differing"
	| "partiallyCompared"
	| "connectionsReferenceOnly"
	| "connectionsCandidateOnly";

export type GodotReferenceComparison = {
	kind: "advisory-sampled-state-comparison";
	reference: GodotReferenceSource;
	candidate: GodotReferenceSource;
	numbers: { mode: "exact" } | { mode: "absolute-tolerance"; tolerance: number };
	outcome: "sampled-fields-agree" | "sampled-fields-differ" | "partial-no-observed-difference";
	unknowns: Unknown[];
	counts: {
		/** Matched paths whose every compared field agrees and none was unobservable. */
		matched: number;
		/** Matched paths with no observed difference but some fields one source could not record. */
		partiallyCompared: number;
		referenceOnly: number;
		candidateOnly: number;
		differing: number;
		connectionsReferenceOnly: number;
		connectionsCandidateOnly: number;
	};
	referenceOnly: Array<{ path: Path; type: string }>;
	candidateOnly: Array<{ path: Path; type: string }>;
	differing: Array<{ path: Path; fields: Field[]; unobservedFields?: Field[] }>;
	partiallyCompared: Array<{ path: Path; unobservedFields: Field[] }>;
	connections:
		| { status: "unobserved" }
		| {
				status: "compared" | "partially-recorded";
				referenceOnly: ConnectionRow[];
				candidateOnly: ConnectionRow[];
				excluded: { reference: number; candidate: number };
		  };
	/** Lists cut at the row or byte bound. Each list is a clean prefix; counts stay complete. */
	truncated: Lists[];
};

/**
 * Canonical path identities shared by both sides: each path is interned from its parent's
 * identity and its own name, so keys stay small however deep the hierarchy is.
 */
class PathTable {
	private readonly ids = new Map<string, number>();
	private readonly entries: Array<{ parent: number; name: string }> = [{ parent: -1, name: "" }];
	intern(parent: number, name: string): number {
		const key = `${parent}\u0000${name}`;
		let id = this.ids.get(key);
		if (id === undefined) {
			id = this.entries.length;
			this.entries.push({ parent, name });
			this.ids.set(key, id);
		}
		return id;
	}
	/** Expanded only for rows that are actually kept. */
	path(id: number): Path {
		const names: string[] = [];
		for (let at = id; at > 0; at = this.entries[at].parent) names.push(this.entries[at].name);
		return names.reverse();
	}
}

function indexByPath(
	state: GodotSceneSnapshotState,
	table: PathTable,
): { byPath: Map<number, SceneNode>; pathById: Map<string, number> } {
	const pathById = new Map<string, number>();
	const byPath = new Map<number, SceneNode>();
	for (const node of state.nodes) {
		// Validated journals list parents before children; the root has path identity 0.
		let id = 0;
		if (node.parent !== "") {
			const parent = pathById.get(node.parent);
			if (parent === undefined) throw new Error("Invalid scene hierarchy");
			id = table.intern(parent, node.name);
		}
		if (byPath.has(id)) throw new Error("Ambiguous scene node path");
		pathById.set(node.id, id);
		byPath.set(id, node);
	}
	return { byPath, pathById };
}

function sameValue(a: unknown, b: unknown, tolerance: number): boolean {
	if (typeof a === "number" && typeof b === "number")
		return tolerance === 0 ? a === b : Math.abs(a - b) <= tolerance;
	if (Array.isArray(a) && Array.isArray(b))
		return (
			a.length === b.length && a.every((value, index) => sameValue(value, b[index], tolerance))
		);
	return a === b;
}

function fieldValue(node: SceneNode, field: Field): unknown {
	return field === "name" ? node.name : field === "type" ? node.type : node.properties[field];
}

/**
 * Fields a source of this version could not have recorded for this node. Inheritance is
 * never inferred from type names: a legacy node without a 2D transform may be a Node3D.
 */
function unrecordable(node: SceneNode, version: number): readonly Field[] {
	return version < 3 && node.properties.position === undefined ? LEGACY_UNRECORDED : [];
}

type IndexedConnection = { from: number; to: number; detail: ConnectionDetail };

function connectionRows(
	state: GodotSceneSnapshotState,
	pathById: Map<string, number>,
): Map<string, IndexedConnection> {
	const rows = new Map<string, IndexedConnection>();
	for (const connection of state.connections ?? []) {
		const from = pathById.get(connection.from) ?? -1;
		const to = pathById.get(connection.to) ?? -1;
		const detail = {
			signal: connection.signal,
			method: connection.method,
			boundArgs: connection.boundArgs,
			deferred: connection.deferred,
			oneShot: connection.oneShot,
		};
		rows.set(JSON.stringify([from, to, detail]), { from, to, detail });
	}
	return rows;
}

export function compareGodotCheckpointToReference(
	referenceText: string,
	referenceRecordSequence: number,
	candidateText: string,
	candidateRecordSequence: number,
	options: { tolerance?: number } = {},
): GodotReferenceComparison {
	const tolerance = options.tolerance ?? 0;
	if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > MAX_TOLERANCE)
		throw new Error("Choose an absolute tolerance between 0 and 1");
	const reference = readGodotCheckpointSnapshot(referenceText, referenceRecordSequence);
	const candidate = readGodotCheckpointSnapshot(candidateText, candidateRecordSequence);
	const table = new PathTable();
	const expected = indexByPath(reference.state, table);
	const actual = indexByPath(candidate.state, table);
	const unknowns = new Set<Unknown>();
	if (reference.coverage === "limited") unknowns.add("reference-coverage-limited");
	if (candidate.coverage === "limited") unknowns.add("candidate-coverage-limited");

	let rowBytes = 0;
	const truncated = new Set<Lists>();
	const keep = <T>(name: Lists, list: T[], make: () => T) => {
		if (truncated.has(name)) return;
		const row = make();
		const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
		if (
			list.length >= GODOT_REFERENCE_MAX_ROWS ||
			rowBytes + bytes > GODOT_REFERENCE_MAX_ROW_BYTES
		) {
			truncated.add(name);
			return;
		}
		rowBytes += bytes;
		list.push(row);
	};
	const counts = {
		matched: 0,
		partiallyCompared: 0,
		referenceOnly: 0,
		candidateOnly: 0,
		differing: 0,
		connectionsReferenceOnly: 0,
		connectionsCandidateOnly: 0,
	};
	const referenceOnly: GodotReferenceComparison["referenceOnly"] = [];
	const candidateOnly: GodotReferenceComparison["candidateOnly"] = [];
	const differing: GodotReferenceComparison["differing"] = [];
	const partiallyCompared: GodotReferenceComparison["partiallyCompared"] = [];

	for (const [id, node] of expected.byPath) {
		const other = actual.byPath.get(id);
		if (!other) {
			counts.referenceOnly++;
			keep("referenceOnly", referenceOnly, () => ({ path: table.path(id), type: node.type }));
			continue;
		}
		const unobservable = new Set<Field>([
			...unrecordable(node, reference.schemaVersion),
			...unrecordable(other, candidate.schemaVersion),
		]);
		const compared: Field[] = id === 0 ? ["name", ...FIELDS] : [...FIELDS];
		const fields = compared.filter(
			(field) =>
				!unobservable.has(field) &&
				!sameValue(fieldValue(node, field), fieldValue(other, field), tolerance),
		);
		const unobservedFields = compared.filter((field) => unobservable.has(field));
		if (unobservedFields.length) unknowns.add("node3d-fields-unobserved");
		if (fields.length) {
			counts.differing++;
			keep("differing", differing, () => ({
				path: table.path(id),
				fields,
				...(unobservedFields.length ? { unobservedFields } : {}),
			}));
		} else if (unobservedFields.length) {
			counts.partiallyCompared++;
			keep("partiallyCompared", partiallyCompared, () => ({
				path: table.path(id),
				unobservedFields,
			}));
		} else counts.matched++;
	}
	for (const [id, node] of actual.byPath)
		if (!expected.byPath.has(id)) {
			counts.candidateOnly++;
			keep("candidateOnly", candidateOnly, () => ({ path: table.path(id), type: node.type }));
		}

	let connections: GodotReferenceComparison["connections"] = { status: "unobserved" };
	if (reference.state.connections === undefined || candidate.state.connections === undefined)
		unknowns.add("connections-unobserved");
	else {
		const want = connectionRows(reference.state, expected.pathById);
		const have = connectionRows(candidate.state, actual.pathById);
		const excluded = {
			reference: reference.state.excludedConnections ?? 0,
			candidate: candidate.state.excludedConnections ?? 0,
		};
		const referenceRows: ConnectionRow[] = [];
		const candidateRows: ConnectionRow[] = [];
		const expand = ({ from, to, detail }: IndexedConnection): ConnectionRow => ({
			from: table.path(from),
			to: table.path(to),
			...detail,
		});
		for (const [key, value] of want)
			if (!have.has(key)) {
				counts.connectionsReferenceOnly++;
				keep("connectionsReferenceOnly", referenceRows, () => expand(value));
			}
		for (const [key, value] of have)
			if (!want.has(key)) {
				counts.connectionsCandidateOnly++;
				keep("connectionsCandidateOnly", candidateRows, () => expand(value));
			}
		const partial = excluded.reference > 0 || excluded.candidate > 0;
		if (partial) unknowns.add("connections-partially-recorded");
		connections = {
			status: partial ? "partially-recorded" : "compared",
			referenceOnly: referenceRows,
			candidateOnly: candidateRows,
			excluded,
		};
	}

	const differs =
		counts.referenceOnly +
			counts.candidateOnly +
			counts.differing +
			counts.connectionsReferenceOnly +
			counts.connectionsCandidateOnly >
		0;
	const describe = (source: GodotCheckpointSnapshot): GodotReferenceSource => ({
		scene: source.scene,
		schemaVersion: source.schemaVersion,
		sessionId: source.sessionId,
		instanceId: source.instanceId,
		coverage: source.coverage,
		stopReason: source.stopReason,
		checkpoint: { ...source.checkpoint },
	});
	return {
		kind: "advisory-sampled-state-comparison",
		reference: describe(reference),
		candidate: describe(candidate),
		numbers: tolerance === 0 ? { mode: "exact" } : { mode: "absolute-tolerance", tolerance },
		outcome: differs
			? "sampled-fields-differ"
			: unknowns.size
				? "partial-no-observed-difference"
				: "sampled-fields-agree",
		unknowns: [...unknowns],
		counts,
		referenceOnly,
		candidateOnly,
		differing,
		partiallyCompared,
		connections,
		truncated: [...truncated],
	};
}
