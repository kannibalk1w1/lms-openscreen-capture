import { randomUUID } from "node:crypto";
import { linkSync, realpathSync, unlinkSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import { attachLessonMediaSelection } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { MAX_LESSON_BYTES, parseLesson, validateLesson } from "../../src/lib/lesson/schema";
import { confirmLessonFileRangeSchema } from "./fileRangeContracts";
import { RangeAuthoringService } from "./rangeAuthoring";
import { RangeMediaError } from "./rangeErrors";
import { readSelectedFile } from "./selectedFile";
import { openSelectedLessonContext } from "./selectedLessonContext";
export class LessonFileRangeError extends LessonOperationError {
	constructor(
		code: LessonErrorCode,
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
/** Prerequisite for headless media: explicit source confirmation into a new editable copy only. */
export async function confirmLessonFileRange(
	input: unknown,
	authority: { assertCurrent(): void; signal?: AbortSignal },
) {
	let partial: string | undefined;
	const check = () => {
		authority.assertCurrent();
		if (authority.signal?.aborted) throw new LessonOperationError("range-source-cancelled");
	};
	try {
		check();
		const request = confirmLessonFileRangeSchema.parse(input);
		if (request.outputPath === request.manifestPath || request.outputPath === request.projectPath)
			throw new LessonOperationError("destination-exists");
		const parent = path.dirname(request.outputPath);
		if (realpathSync(parent) !== path.resolve(parent))
			throw new LessonOperationError("lesson-operation-failed");
		// Refuse an existing destination before observing any media. Publication also uses no-replace.
		try {
			await fs.lstat(request.outputPath);
			throw new LessonOperationError("destination-exists");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		check();
		const context = await openSelectedLessonContext(request, check);
		const { lesson, document, assertCurrent: currentInputs } = context;
		const step = lesson.steps.find((step) => step.id === request.stepId);
		if (!step) throw new LessonOperationError("range-target-changed");
		const service = new RangeAuthoringService(context.readDocument);
		const owner = {},
			operationId = randomUUID(),
			cancel = () => service.cancelOwner(owner);
		authority.signal?.addEventListener("abort", cancel, { once: true });
		let selection;
		try {
			selection = await service.confirm(
				{
					operationId,
					lesson,
					stepId: step.id,
					intent: request.intent,
					range: {
						projectId: request.projectId,
						documentSha256: await lessonRenderFingerprint(document),
						startSec: request.startSec,
						endSec: request.endSec,
					},
				},
				{
					owner,
					projectId: request.projectId,
					assertCurrent: currentInputs,
					canReadSource: (source) => request.sourcePaths.includes(source),
				},
			);
		} finally {
			authority.signal?.removeEventListener("abort", cancel);
		}
		currentInputs();
		const attached = attachLessonMediaSelection(
			lesson,
			{
				lessonId: lesson.id,
				stepId: step.id,
				revision: lesson.revision,
				previous: step.mediaSelection,
			},
			selection,
		);
		if (attached === lesson) throw new LessonOperationError("range-target-changed");
		const next = await validateLesson(attached);
		currentInputs();
		partial = path.join(parent, `.lesson-confirm-${randomUUID()}.partial`);
		const outputBytes = Buffer.from(JSON.stringify(next, null, 2) + "\n");
		await fs.writeFile(partial, outputBytes, { flag: "wx", mode: 0o600 });
		check();
		// Validate complete staged bytes before exclusive publication; failed/cancelled stages stay inspectable.
		const staged = readSelectedFile(partial, MAX_LESSON_BYTES);
		if (!staged.equals(outputBytes)) throw new LessonOperationError("range-target-changed");
		await parseLesson(staged.toString("utf8"));
		currentInputs();
		if (realpathSync(parent) !== path.resolve(parent))
			throw new LessonOperationError("lesson-operation-failed");
		// No JS await between final snapshot/permission checks and atomic no-overwrite publication.
		linkSync(partial, request.outputPath);
		try {
			unlinkSync(partial);
		} catch {
			/* The published copy is complete; a redundant private stage may remain. */
		}
		return {
			status: "confirmed" as const,
			path: request.outputPath,
			lessonId: next.id,
			stepId: step.id,
			revision: next.revision,
			sourceIdentityStatus: "content-pinned" as const,
		};
	} catch (error) {
		const code: LessonErrorCode = authority.signal?.aborted
			? "range-source-cancelled"
			: error instanceof LessonOperationError
				? error.code
				: error instanceof RangeMediaError
					? (
							{
								"range-media-cancelled": "range-source-cancelled",
								"range-media-changed": "range-source-changed",
								"range-media-unattested": "range-source-unsupported",
								"range-media-unsupported": "range-source-unsupported",
								"range-media-incomplete": "range-source-unsupported",
								"range-media-tool-unavailable": "range-source-unsupported",
							} as const
						)[error.code]
					: (error as NodeJS.ErrnoException | null)?.code === "EEXIST"
						? "destination-exists"
						: "lesson-operation-failed";
		try {
			authority.assertCurrent();
			if (partial && !(await fs.lstat(partial)).isFile()) partial = undefined;
		} catch {
			partial = undefined;
		}
		throw new LessonFileRangeError(code, partial);
	}
}
