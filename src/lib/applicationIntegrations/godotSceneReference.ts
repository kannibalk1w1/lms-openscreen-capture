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
const SPATIAL = ["position3", "rotation3", "scale3"] as const;
const FIELDS = [
	"type",
	"script",
	"texture",
	"position",
	"rotation",
	"scale",
	"visible",
	...SPATIAL,
] as const;
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
	scene: string;
	schemaVersion: number;
	sessionId: string;
	instanceId: string;
	coverage: "sampled" | "limited";
	stopReason: string;
	checkpoint: { recordSequence: number; label: string; atMs: number };
};
type ConnectionRow = { from: Path; signal: string; to: Path; method: string };

export type GodotReferenceComparison = {
	kind: "advisory-sampled-state-comparison";
	reference: GodotReferenceSource;
	candidate: GodotReferenceSource;
	numbers: { mode: "exact" } | { mode: "absolute-tolerance"; tolerance: number };
	outcome: "sampled-fields-agree" | "sampled-fields-differ" | "partial-no-observed-difference";
	unknowns: Unknown[];
	counts: {
		matched: number;
		referenceOnly: number;
		candidateOnly: number;
		differing: number;
		connectionsReferenceOnly: number;
		connectionsCandidateOnly: number;
	};
	referenceOnly: Array<{ path: Path; type: string }>;
	candidateOnly: Array<{ path: Path; type: string }>;
	differing: Array<{ path: Path; fields: Field[]; unobservedFields?: Field[] }>;
	connections:
		| { status: "unobserved" }
		| {
				status: "compared" | "partially-recorded";
				referenceOnly: ConnectionRow[];
				candidateOnly: ConnectionRow[];
				excluded: { reference: number; candidate: number };
		  };
	/** True when row lists were cut at the row or byte bound; counts stay complete. */
	truncated: boolean;
};

function indexByPath(state: GodotSceneSnapshotState): Map<string, { path: Path; node: SceneNode }> {
	const pathById = new Map<string, Path>();
	const result = new Map<string, { path: Path; node: SceneNode }>();
	for (const node of state.nodes) {
		// Validated journals list parents before children.
		const parent = node.parent === "" ? [] : pathById.get(node.parent);
		if (!parent) throw new Error("Invalid scene hierarchy");
		const path = node.parent === "" ? [] : [...parent, node.name];
		const key = JSON.stringify(path);
		if (result.has(key)) throw new Error("Ambiguous scene node path");
		pathById.set(node.id, path);
		result.set(key, { path, node });
	}
	return result;
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

function fieldValue(node: SceneNode, field: (typeof FIELDS)[number]): unknown {
	return field === "type" ? node.type : node.properties[field];
}

/** v1/v2 journals never recorded Node3D transforms or Node3D visibility. */
function unobservable(node: SceneNode, other: SceneNode, version: number, field: Field): boolean {
	if (version >= 3 || node.properties[field as never] !== undefined) return false;
	const isSpatial = other.properties.position3 !== undefined;
	return (SPATIAL as readonly string[]).includes(field) || (field === "visible" && isSpatial);
}

function connectionRows(
	state: GodotSceneSnapshotState,
	pathById: Map<string, Path>,
): Map<string, ConnectionRow> {
	const rows = new Map<string, ConnectionRow>();
	for (const connection of state.connections ?? []) {
		const row = {
			from: pathById.get(connection.from) ?? [],
			signal: connection.signal,
			to: pathById.get(connection.to) ?? [],
			method: connection.method,
		};
		// Flags and bound-argument counts belong to the connection's identity.
		rows.set(
			JSON.stringify([row, connection.boundArgs, connection.deferred, connection.oneShot]),
			row,
		);
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
	const expected = indexByPath(reference.state);
	const actual = indexByPath(candidate.state);
	const unknowns = new Set<Unknown>();
	if (reference.coverage === "limited") unknowns.add("reference-coverage-limited");
	if (candidate.coverage === "limited") unknowns.add("candidate-coverage-limited");

	let rowBytes = 0;
	let truncated = false;
	const keep = <T>(list: T[], row: T) => {
		const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
		if (
			list.length >= GODOT_REFERENCE_MAX_ROWS ||
			rowBytes + bytes > GODOT_REFERENCE_MAX_ROW_BYTES
		) {
			truncated = true;
			return;
		}
		rowBytes += bytes;
		list.push(row);
	};
	const counts = {
		matched: 0,
		referenceOnly: 0,
		candidateOnly: 0,
		differing: 0,
		connectionsReferenceOnly: 0,
		connectionsCandidateOnly: 0,
	};
	const referenceOnly: GodotReferenceComparison["referenceOnly"] = [];
	const candidateOnly: GodotReferenceComparison["candidateOnly"] = [];
	const differing: GodotReferenceComparison["differing"] = [];

	for (const [key, { path, node }] of expected) {
		const other = actual.get(key)?.node;
		if (!other) {
			counts.referenceOnly++;
			keep(referenceOnly, { path, type: node.type });
			continue;
		}
		const fields: Field[] = [];
		const unobservedFields: Field[] = [];
		const all: Field[] = path.length === 0 ? ["name", ...FIELDS] : [...FIELDS];
		for (const field of all) {
			const a = field === "name" ? node.name : fieldValue(node, field);
			const b = field === "name" ? other.name : fieldValue(other, field);
			if (sameValue(a, b, tolerance)) continue;
			if (
				unobservable(node, other, reference.schemaVersion, field) ||
				unobservable(other, node, candidate.schemaVersion, field)
			)
				unobservedFields.push(field);
			else fields.push(field);
		}
		if (unobservedFields.length) unknowns.add("node3d-fields-unobserved");
		if (fields.length) {
			counts.differing++;
			keep(differing, {
				path,
				fields,
				...(unobservedFields.length ? { unobservedFields } : {}),
			});
		} else counts.matched++;
	}
	for (const [key, { path, node }] of actual)
		if (!expected.has(key)) {
			counts.candidateOnly++;
			keep(candidateOnly, { path, type: node.type });
		}

	let connections: GodotReferenceComparison["connections"] = { status: "unobserved" };
	if (reference.state.connections === undefined || candidate.state.connections === undefined)
		unknowns.add("connections-unobserved");
	else {
		const paths = (index: typeof expected) =>
			new Map([...index.values()].map(({ path, node }) => [node.id, path]));
		const want = connectionRows(reference.state, paths(expected));
		const have = connectionRows(candidate.state, paths(actual));
		const excluded = {
			reference: reference.state.excludedConnections ?? 0,
			candidate: candidate.state.excludedConnections ?? 0,
		};
		const referenceRows: ConnectionRow[] = [];
		const candidateRows: ConnectionRow[] = [];
		for (const [key, row] of want)
			if (!have.has(key)) {
				counts.connectionsReferenceOnly++;
				keep(referenceRows, row);
			}
		for (const [key, row] of have)
			if (!want.has(key)) {
				counts.connectionsCandidateOnly++;
				keep(candidateRows, row);
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
		checkpoint: {
			recordSequence: source.checkpoint.recordSequence,
			label: source.checkpoint.label,
			atMs: source.checkpoint.atMs,
		},
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
		connections,
		truncated,
	};
}
