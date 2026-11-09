import { exportLessonFile, queryLessonFile } from "../lesson/fileCommands";
import { confirmLessonFileRange, LessonFileRangeError } from "../lesson/fileRange";
import type { CliLessonCommand } from "./args";
import type { CliWriter } from "./projectCommands";

export async function runLessonCommand(
	command: CliLessonCommand & { json?: boolean },
	out: CliWriter,
	options: { signal?: AbortSignal } = {},
): Promise<number> {
	try {
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
