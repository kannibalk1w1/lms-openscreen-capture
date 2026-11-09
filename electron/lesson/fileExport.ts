import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import type { LessonRangeExportProgress } from "../../src/lib/lesson/rangeExport";
import { type ExportOwner, renderOwnerJobs } from "../ipc/exportJobs";
import { NativeRenderBusyError } from "../ipc/nativeRenderJobs";
import { exportLessonRangeFileSchema } from "./fileExportContracts";
import { LessonFileRangeError } from "./fileRange";
import { LessonRangeExportError, LessonRangeExportService } from "./rangeExport";
import { openSelectedLessonContext } from "./selectedLessonContext";
export type LessonFileRangeRenderer = ConstructorParameters<typeof LessonRangeExportService>[1];
export const LESSON_FILE_EXPORT_CHANNEL = "lesson-file-range";
/** Caller is the actual connection/CLI lifetime; no editor identity or authority is manufactured. */
export async function exportLessonRangeFile(
	input: unknown,
	authority: { owner: ExportOwner; signal?: AbortSignal; assertCurrent(): void },
	render: LessonFileRangeRenderer,
	progress: (value: LessonRangeExportProgress) => void = () => {
		/* Optional observer. */
	},
) {
	const operationId = randomUUID();
	let activeContext: (() => void) | undefined;
	const assertScope = () => {
		authority.assertCurrent();
		if (authority.owner.isDestroyed()) throw new LessonOperationError("range-export-cancelled");
	};
	const check = () => {
		assertScope();
		if (authority.signal?.aborted) throw new LessonOperationError("range-export-cancelled");
	};
	const cancel = () =>
		renderOwnerJobs.cancel(authority.owner, operationId, LESSON_FILE_EXPORT_CHANNEL);
	authority.signal?.addEventListener("abort", cancel, { once: true });
	try {
		check();
		const request = exportLessonRangeFileSchema.parse(input);
		const result = await renderOwnerJobs.run(
			authority.owner,
			operationId,
			() => {
				// Reserve this actual caller through metadata, rendering, validation and receipt publication.
				let job: ReturnType<LessonRangeExportService["start"]> | undefined;
				const result = (async () => {
					check();
					const directory = realpathSync(request.outputDirectory),
						stat = lstatSync(request.outputDirectory);
					if (directory !== path.resolve(request.outputDirectory) || !stat.isDirectory())
						throw new LessonOperationError("range-export-unsupported");
					const assertDirectory = () => {
						assertScope();
						const now = lstatSync(request.outputDirectory);
						if (
							realpathSync(request.outputDirectory) !== directory ||
							!now.isDirectory() ||
							now.dev !== stat.dev ||
							now.ino !== stat.ino
						)
							throw new LessonOperationError("project-changed");
					};
					const context = await openSelectedLessonContext(request, assertDirectory);
					check();
					activeContext = () => {
						context.assertCurrent();
						assertDirectory();
					};
					activeContext();
					const service = new LessonRangeExportService(context.readDocument, render);
					job = service.start(
						{
							operationId,
							lesson: context.lesson,
							stepId: request.stepId,
							includedStepIds: request.includedStepIds,
						},
						{
							owner: authority.owner,
							projectId: request.projectId,
							assertCurrent: activeContext,
							canReadSource: (source) => request.sourcePaths.includes(source),
						},
						async () => {
							activeContext!();
							return request.outputDirectory;
						},
						(value) => {
							activeContext!();
							progress(value);
						},
					);
					if (authority.signal?.aborted || authority.owner.isDestroyed()) job.cancel();
					return await job.result;
				})();
				return {
					result,
					cancel: () => job?.cancel() ?? false,
					invalidate: () => job?.invalidate?.(),
				};
			},
			() => undefined,
			LESSON_FILE_EXPORT_CHANNEL,
		);
		return result;
	} catch (error) {
		const code: LessonErrorCode =
			authority.signal?.aborted || authority.owner.isDestroyed()
				? "range-export-cancelled"
				: error instanceof LessonRangeExportError
					? error.code
					: error instanceof LessonOperationError
						? error.code
						: error instanceof NativeRenderBusyError
							? "render-busy"
							: "lesson-operation-failed";
		let artifact: string | undefined;
		try {
			activeContext?.();
			assertScope();
			if (error instanceof LessonRangeExportError) artifact = error.artifactPath;
		} catch {
			/* No paths after caller/file/directory authority is stale. */
		}
		throw new LessonFileRangeError(code, artifact);
	} finally {
		authority.signal?.removeEventListener("abort", cancel);
	}
}
