import { exportLessonFile, queryLessonFile } from "../lesson/fileCommands";
import { exportLessonRangeFile, type LessonFileRangeRenderer } from "../lesson/fileExport";
import type { LessonFileLifecycle } from "../lesson/fileLifecycle";
import { confirmLessonFileRange, LessonFileRangeError } from "../lesson/fileRange";
import type { CliLessonCommand } from "./args";
import type { CliWriter } from "./projectCommands";

export async function runLessonCommand(
	command: CliLessonCommand & { json?: boolean },
	out: CliWriter,
	options: {
		signal?: AbortSignal;
		lifecycle?: LessonFileLifecycle;
		render?: LessonFileRangeRenderer;
	} = {},
): Promise<number> {
	try {
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
				: command.action === "query"
					? await queryLessonFile({ manifestPath: command.manifestPath, query: command.query })
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
			failure instanceof LessonFileRangeError ? failure.code : "lesson-file-operation-failed";
		out(
			(command.json
				? JSON.stringify({
						event: "error",
						message: error,
						...(failure instanceof LessonFileRangeError && failure.artifactPath
							? { artifactPath: failure.artifactPath }
							: {}),
					})
				: error +
					(failure instanceof LessonFileRangeError && failure.artifactPath
						? `\nUnfinished copy: ${failure.artifactPath}`
						: "")) + "\n",
		);
		return 1;
	}
}
