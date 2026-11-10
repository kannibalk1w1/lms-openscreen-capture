import { createHash } from "node:crypto";
import {
	compareGodotSceneCheckpoints,
	listGodotSceneCheckpoints,
	MAX_SCENE_JOURNAL_BYTES,
} from "../../src/lib/applicationIntegrations/godotScene";
import { compareGodotCheckpointToReference } from "../../src/lib/applicationIntegrations/godotSceneReference";
import {
	compareGodotCheckpointsFileSchema,
	compareGodotReferenceFileSchema,
	inspectGodotCheckpointsFileSchema,
} from "./godotCheckpointContracts";
import { readSelectedFileSnapshot } from "./selectedFile";

export class GodotCheckpointFileError extends Error {
	constructor(
		readonly code:
			| "invalid-request"
			| "capture-file-unavailable"
			| "capture-file-invalid"
			| "capture-file-changed"
			| "reference-file-changed"
			| "candidate-file-changed"
			| "checkpoint-invalid",
	) {
		super(code);
	}
}
function snapshot(journalPath: string) {
	try {
		return readSelectedFileSnapshot(journalPath, MAX_SCENE_JOURNAL_BYTES).bytes;
	} catch {
		throw new GodotCheckpointFileError("capture-file-unavailable");
	}
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function text(bytes: Uint8Array) {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new GodotCheckpointFileError("capture-file-invalid");
	}
}
/** Read-only metadata from one explicit raw journal; no resource paths are loaded. */
export function inspectGodotCheckpointsFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const parsed = inspectGodotCheckpointsFileSchema.safeParse(input);
	if (!parsed.success) throw new GodotCheckpointFileError("invalid-request");
	const request = parsed.data;
	assertCurrent();
	const bytes = snapshot(request.journalPath),
		source = text(bytes);
	let checkpoints;
	try {
		checkpoints = listGodotSceneCheckpoints(source);
	} catch {
		throw new GodotCheckpointFileError("capture-file-invalid");
	}
	assertCurrent();
	return {
		format: "openscreen-godot-checkpoint-inspection" as const,
		version: 1 as const,
		sha256: digest(bytes),
		adapterId: "godot-scene" as const,
		clock: "unmapped" as const,
		checkpointCount: checkpoints.length,
		checkpoints: checkpoints.slice(request.offset, request.offset + request.limit),
		nextOffset:
			request.offset + request.limit < checkpoints.length ? request.offset + request.limit : null,
	};
}
/** Fingerprint-bound endpoint comparison; no files are created or changed. */
export function compareGodotCheckpointsFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const parsed = compareGodotCheckpointsFileSchema.safeParse(input);
	if (!parsed.success) throw new GodotCheckpointFileError("invalid-request");
	const request = parsed.data;
	assertCurrent();
	const bytes = snapshot(request.journalPath),
		sha256 = digest(bytes);
	if (sha256 !== request.sha256) throw new GodotCheckpointFileError("capture-file-changed");
	const source = text(bytes);
	let comparison;
	try {
		comparison = compareGodotSceneCheckpoints(
			source,
			request.fromRecordSequence,
			request.toRecordSequence,
		);
	} catch {
		throw new GodotCheckpointFileError("checkpoint-invalid");
	}
	assertCurrent();
	return {
		format: "openscreen-godot-checkpoint-comparison" as const,
		version: 1 as const,
		sha256,
		adapterId: "godot-scene" as const,
		clock: "unmapped" as const,
		comparison,
	};
}

/**
 * Advisory cross-take comparison of two explicit raw journals, each bound to the exact
 * SHA-256 from its own inspection. Both files are read once, before comparing; nothing is
 * created or changed, and no resource paths are loaded.
 */
export function compareGodotReferenceFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const parsed = compareGodotReferenceFileSchema.safeParse(input);
	if (!parsed.success) throw new GodotCheckpointFileError("invalid-request");
	const request = parsed.data;
	assertCurrent();
	// Each side is one bounded snapshot; only these exact bytes are fingerprinted and compared.
	const referenceBytes = snapshot(request.referencePath);
	assertCurrent();
	const candidateBytes = snapshot(request.candidatePath);
	assertCurrent();
	if (digest(referenceBytes) !== request.referenceSha256)
		throw new GodotCheckpointFileError("reference-file-changed");
	if (digest(candidateBytes) !== request.candidateSha256)
		throw new GodotCheckpointFileError("candidate-file-changed");
	const reference = text(referenceBytes),
		candidate = text(candidateBytes);
	let comparison;
	try {
		comparison = compareGodotCheckpointToReference(
			reference,
			request.referenceRecordSequence,
			candidate,
			request.candidateRecordSequence,
			request.tolerance === undefined ? {} : { tolerance: request.tolerance },
		);
	} catch {
		throw new GodotCheckpointFileError("checkpoint-invalid");
	}
	assertCurrent();
	return {
		format: "openscreen-godot-reference-comparison" as const,
		version: 1 as const,
		adapterId: "godot-scene" as const,
		clock: "unmapped" as const,
		/** Same bytes on both sides (any paths): agreement is not independent confirmation. */
		sameContent: request.referenceSha256 === request.candidateSha256,
		comparison: {
			...comparison,
			reference: { sha256: request.referenceSha256, ...comparison.reference },
			candidate: { sha256: request.candidateSha256, ...comparison.candidate },
		},
	};
}
