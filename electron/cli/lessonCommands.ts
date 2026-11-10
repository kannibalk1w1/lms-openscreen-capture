import {
	illustrationUnsupportedMessage,
	LessonOperationError,
	rangeExportToolUnavailableMessage,
} from "../../src/lib/lesson/api";
import {
	ApplicationCaptureFileError,
	draftApplicationCaptureFile,
	inspectApplicationCaptureFile,
} from "../lesson/applicationCaptureFile";
import {
	addLessonStepsFile,
	createLessonFile,
	exportLessonFile,
	moveLessonStepFile,
	queryLessonFile,
	removeLessonStepFile,
	updateLessonStepFile,
} from "../lesson/fileCommands";
import { exportLessonRangeFile, type LessonFileRangeRenderer } from "../lesson/fileExport";
import { illustrateLessonStepFile, type LessonFrameRenderer } from "../lesson/fileIllustrate";
import type { LessonFileLifecycle } from "../lesson/fileLifecycle";
import { confirmLessonFileRange, LessonFileRangeError } from "../lesson/fileRange";
import {
	createLessonPackage,
	LessonPackageError,
	lessonPackageMessages,
	verifyLessonPackage,
} from "../lesson/package";
import type { CliLessonCommand } from "./args";
import type { CliWriter } from "./projectCommands";

export async function runLessonCommand(
	command: CliLessonCommand & { json?: boolean },
	out: CliWriter,
	options: {
		signal?: AbortSignal;
		lifecycle?: LessonFileLifecycle;
		render?: LessonFileRangeRenderer;
		renderFrames?: LessonFrameRenderer;
	} = {},
): Promise<number> {
	try {
		if (command.action === "inspect-capture" || command.action === "import-capture") {
			const result =
				command.action === "inspect-capture"
					? inspectApplicationCaptureFile(command.request)
					: await draftApplicationCaptureFile(command.request);
			out(
				JSON.stringify(
					command.json ? { event: "done", result } : result,
					null,
					command.json ? undefined : 2,
				) + "\n",
			);
			return 0;
		}
		if (command.action === "package" || command.action === "verify-package") {
			if (!options.lifecycle) throw new LessonPackageError("lesson-package-unsupported");
			const lifecycle = options.lifecycle,
				authority = {
					signal: options.signal,
					assertCurrent: () => {
						if (lifecycle.owner.isDestroyed()) throw new Error("caller-closed");
					},
				};
			const result =
				command.action === "package"
					? await createLessonPackage(command.request, authority)
					: await verifyLessonPackage({ directory: command.directory }, authority);
			out(
				JSON.stringify(
					command.json ? { event: "done", result } : result,
					null,
					command.json ? undefined : 2,
				) + "\n",
			);
			return 0;
		}
		if (command.action === "illustrate") {
			let frames = options.renderFrames;
			if (!frames) {
				const { CompositorViewService } = await import(
					"../native-bridge/services/compositorViewService"
				);
				const service = new CompositorViewService();
				frames = (...args) => service.renderFrames(...args);
			}
			const result = await illustrateLessonStepFile(
				command.request,
				{
					signal: options.signal,
					assertCurrent: () => {
						/* Explicit launch and file arguments supply CLI authority; no editor state is claimed. */
					},
				},
				frames,
			);
			out(
				JSON.stringify(
					command.json ? { event: "done", result } : result,
					null,
					command.json ? undefined : 2,
				) + "\n",
			);
			return 0;
		}
		if (command.action === "export-range") {
			if (!options.lifecycle) throw new LessonFileRangeError("range-export-unsupported");
			let start = options.render;
			if (!start) {
				const { CompositorViewService } = await import(
					"../native-bridge/services/compositorViewService"
				);
				const service = new CompositorViewService();
				start = (...args) => service.startExportMulti(...args);
			}
			const result = await exportLessonRangeFile(
				command.request,
				{
					owner: options.lifecycle.owner,
					signal: options.signal,
					assertCurrent: () => {
						/* Explicit launch/file arguments authorize this saved-file operation. */
					},
				},
				start,
				(value) => {
					if (command.json) out(JSON.stringify({ event: "lesson-progress", ...value }) + "\n");
					else
						out(
							`MP4 ${value.phase}${value.frames === undefined ? "" : ` ${value.frames}/${value.totalFrames} frames`}\n`,
						);
				},
			);
			out(
				JSON.stringify(
					command.json ? { event: "done", result } : result,
					null,
					command.json ? undefined : 2,
				) + "\n",
			);
			return 0;
		}

		const result =
			command.action === "confirm-range"
				? await confirmLessonFileRange(command.request, {
						signal: options.signal,
						assertCurrent: () => {
							/* Explicit launch and file arguments supply CLI authority; no editor state is claimed. */
						},
					})
				: command.action === "new"
					? await createLessonFile(command.request)
					: command.action === "move-step"
						? await moveLessonStepFile(command.request)
						: command.action === "edit-step"
							? await updateLessonStepFile(command.request)
							: command.action === "remove-step"
								? await removeLessonStepFile(command.request)
								: command.action === "add-step"
									? await addLessonStepsFile(command.request)
									: command.action === "query"
										? await queryLessonFile({
												manifestPath: command.manifestPath,
												query: command.query,
											})
										: await exportLessonFile({
												manifestPath: command.manifestPath,
												outputDirectory: command.outputDirectory,
												stepIds: command.stepIds,
											});
		out(
			JSON.stringify(
				command.json ? { event: "done", result } : result,
				null,
				command.json ? undefined : 2,
			) + "\n",
		);
		return 0;
	} catch (failure) {
		// Never echo imported payloads, private file paths, source data or raw parser/OS errors.
		const error =
			failure instanceof LessonPackageError ||
			failure instanceof LessonFileRangeError ||
			failure instanceof ApplicationCaptureFileError
				? failure.code
				: // Fixed codes only, such as a trimmed time; still no paths, payloads or raw errors.
					command.action === "illustrate" && failure instanceof LessonOperationError
					? failure.code
					: "lesson-file-operation-failed";
		out(
			(command.json
				? JSON.stringify({
						event: "error",
						message: error,
						...(error === "range-export-tool-unavailable"
							? { detail: rangeExportToolUnavailableMessage }
							: {}),
						...(error === "illustration-unsupported"
							? { detail: illustrationUnsupportedMessage }
							: {}),
						...(failure instanceof LessonPackageError
							? { detail: lessonPackageMessages[failure.code] }
							: {}),
						...((failure instanceof LessonFileRangeError ||
							failure instanceof LessonPackageError) &&
						failure.artifactPath
							? { artifactPath: failure.artifactPath }
							: {}),
					})
				: error +
					(failure instanceof LessonPackageError
						? `\n${lessonPackageMessages[failure.code]}`
						: "") +
					(error === "range-export-tool-unavailable"
						? `\n${rangeExportToolUnavailableMessage}`
						: "") +
					(error === "illustration-unsupported" ? `\n${illustrationUnsupportedMessage}` : "") +
					((failure instanceof LessonFileRangeError || failure instanceof LessonPackageError) &&
					failure.artifactPath
						? `\nUnfinished copy: ${failure.artifactPath}`
						: "")) + "\n",
		);
		return 1;
	}
}
