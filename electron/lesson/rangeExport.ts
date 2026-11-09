import fs from "node:fs/promises";
import path from "node:path";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { type LessonErrorCode, LessonOperationError } from "../../src/lib/lesson/api";
import {
	type LessonRangeExportProgress,
	lessonRangeExportRequestSchema,
} from "../../src/lib/lesson/rangeExport";
import { validateLesson } from "../../src/lib/lesson/schema";
import type { ExportJob } from "../ipc/exportJobs";
import { NativeRenderBusyError } from "../ipc/nativeRenderJobs";
import type { RangeAuthoringAuthority } from "./rangeAuthoring";
import {
	materializeLessonRange,
	prepareLessonRangeMedia,
	RangeMediaError,
	type RangeMediaRenderer,
} from "./rangeMedia";
import { resolveRangeSources } from "./sourceFiles";

export class LessonRangeExportError extends Error {
	constructor(
		readonly code: LessonErrorCode,
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
export type StartRangeRender = (
	...args: Parameters<RangeMediaRenderer>
) => ExportJob<Awaited<ReturnType<RangeMediaRenderer>>>;
/** No new source observation/refresh: only explicit existing pins can render. */
export class LessonRangeExportService {
	constructor(
		private readonly readSavedDocument: (id: string) => Promise<AxcutDocument>,
		private readonly startRender: (
			...args: [...Parameters<RangeMediaRenderer>, ((frames: number) => void)?]
		) => ExportJob<Awaited<ReturnType<RangeMediaRenderer>>>,
	) {}
	start(
		input: unknown,
		authority: RangeAuthoringAuthority,
		pickDirectory: () => Promise<string | null>,
		progress: (value: LessonRangeExportProgress) => void,
	): ExportJob<Awaited<ReturnType<typeof materializeLessonRange>>> {
		const request = lessonRangeExportRequestSchema.parse(input),
			abort = new AbortController();
		let native: ExportJob<Awaited<ReturnType<RangeMediaRenderer>>> | undefined;
		let settled = false,
			picked = false,
			phase: LessonRangeExportProgress["phase"] = "choosing-destination",
			totalFrames: number | undefined;
		let boundaryFailure: LessonErrorCode | undefined;
		const fail = (code: LessonErrorCode): never => {
			boundaryFailure = code;
			throw new LessonOperationError(code);
		};
		const check = () => {
			if (abort.signal.aborted) throw new RangeMediaError("range-media-cancelled");
			try {
				authority.assertCurrent();
			} catch {
				boundaryFailure = "project-changed";
				throw new RangeMediaError("range-media-changed");
			}
		};
		const emit = (frames?: number) => {
			check();
			progress({
				operationId: request.operationId,
				phase,
				...(totalFrames === undefined ? {} : { totalFrames }),
				...(frames === undefined ? {} : { frames }),
			});
		};
		const stop = () => {
			if (settled) return false;
			if (abort.signal.aborted) return true;
			abort.abort();
			try {
				native?.cancel();
			} catch {
				/* Await actual native settlement even if cancel fails. */
			}
			return true;
		};
		const result = (async () => {
			try {
				check();
				const lesson = await validateLesson(request.lesson);
				check();
				const included = new Set(request.includedStepIds);
				const step = lesson.steps.find((value) => value.id === request.stepId);
				if (
					included.size !== request.includedStepIds.length ||
					!included.has(request.stepId) ||
					request.includedStepIds.some((id) => !lesson.steps.some((value) => value.id === id)) ||
					!step
				)
					throw new LessonOperationError("range-target-changed");
				const selection = step.mediaSelection;
				if (!selection || selection.version !== 2)
					throw new LessonOperationError("range-export-unattested");
				if (selection.projectId !== authority.projectId)
					throw new LessonOperationError("project-changed");
				const sourcesApproved = async (document: AxcutDocument) => {
					const prepared = await prepareLessonRangeMedia(document, selection);
					for (const source of resolveRangeSources(prepared.derived, prepared.clips)) {
						check();
						if (
							!path.isAbsolute(source.path) ||
							!authority.canReadSource(path.resolve(source.path))
						)
							fail("range-export-source-unavailable");
						const canonical = await fs.realpath(source.path).catch(() => {
							fail("range-export-source-unavailable");
						});
						check();
						if (canonical !== path.resolve(source.path) || !authority.canReadSource(canonical))
							fail("range-export-source-unavailable");
					}
				};
				const readDocument = async (id: string) => {
					check();
					if (id !== authority.projectId) fail("project-changed");
					const document = await this.readSavedDocument(id).catch(() => fail("project-changed"));
					check();
					if (document.project.id !== id) fail("project-changed");
					if (picked) await sourcesApproved(document);
					return document;
				};
				return await materializeLessonRange({
					selection,
					readDocument,
					signal: abort.signal,
					assertCurrent: check,
					target: { lessonId: lesson.id, stepId: step.id, revision: lesson.revision },
					pickDirectory: async () => {
						phase = "choosing-destination";
						emit();
						const parent = await pickDirectory();
						check();
						if (!parent) return null;
						picked = true;
						phase = "checking-source";
						emit();
						// Source filesystem access begins only after explicit native destination selection.
						await readDocument(selection.projectId);
						check();
						return parent;
					},
					onPhase: (value, expected) => {
						phase = value;
						totalFrames = expected;
						emit();
					},
					render: async (...args) => {
						check();
						try {
							native = this.startRender(...args, (frames) => {
								if (
									!settled &&
									!abort.signal.aborted &&
									Number.isSafeInteger(frames) &&
									frames >= 0 &&
									(totalFrames === undefined || frames <= totalFrames)
								) {
									try {
										emit(frames);
									} catch {
										stop();
									}
								}
							});
						} catch (error) {
							if (error instanceof NativeRenderBusyError) boundaryFailure = "render-busy";
							throw error;
						}
						if (abort.signal.aborted) native.cancel();
						const value = await native.result;
						check();
						return value;
					},
				});
			} catch (error) {
				const code: LessonErrorCode = abort.signal.aborted
					? "range-export-cancelled"
					: (boundaryFailure ??
						(error instanceof NativeRenderBusyError
							? "render-busy"
							: error instanceof LessonOperationError
								? error.code
								: error instanceof RangeMediaError
									? (
											{
												"range-media-unattested": "range-export-unattested",
												"range-media-unsupported": "range-export-unsupported",
												"range-media-changed": "range-export-changed",
												"range-media-incomplete": "range-export-incomplete",
												"range-media-cancelled": "range-export-cancelled",
											} as const
										)[error.code]
									: "lesson-operation-failed"));
				let artifact: string | undefined;
				try {
					authority.assertCurrent();
					if (error instanceof RangeMediaError) artifact = error.artifactPath;
				} catch {
					/* No path disclosure into a replaced caller context. */
				}
				throw new LessonRangeExportError(code, artifact);
			} finally {
				settled = true;
			}
		})();
		return {
			result,
			cancel: stop,
			invalidate: () => {
				stop();
			},
		};
	}
}
