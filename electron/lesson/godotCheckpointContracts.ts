import path from "node:path";
import { z } from "zod";

const journalPath = z.string().min(1).max(4096).refine(path.isAbsolute);
const sequence = z.number().int().min(0).max(4095);
export const inspectGodotCheckpointsFileSchema = z
	.object({
		journalPath,
		offset: sequence.default(0),
		limit: z.number().int().min(1).max(200).default(200),
	})
	.strict();
export const compareGodotCheckpointsFileSchema = z
	.object({
		journalPath,
		fromRecordSequence: sequence,
		toRecordSequence: sequence,
		sha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict()
	.refine(
		(value) => value.fromRecordSequence !== value.toRecordSequence,
		"Choose distinct checkpoint records",
	);

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
/** Two explicit raw journals (possibly the same file), each bound to its inspected hash. */
export const compareGodotReferenceFileSchema = z
	.object({
		referencePath: journalPath,
		referenceSha256: sha256,
		referenceRecordSequence: sequence,
		candidatePath: journalPath,
		candidateSha256: sha256,
		candidateRecordSequence: sequence,
		/** Absolute numeric tolerance; omitted means exact comparison. */
		tolerance: z.number().finite().min(0).max(1).optional(),
	})
	.strict();
