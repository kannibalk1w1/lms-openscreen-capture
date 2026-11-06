import { exportLessonFile, queryLessonFile } from "../lesson/fileCommands";
import type { CliLessonCommand } from "./args";
import type { CliWriter } from "./projectCommands";

export async function runLessonCommand(
	command: CliLessonCommand & { json?: boolean },
	out: CliWriter,
): Promise<number> {
	try {
		const result =
			command.action === "query"
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
	} catch {
		// Never echo imported payloads, private file paths, source data or raw parser/OS errors.
		const error = "lesson-file-operation-failed";
		out((command.json ? JSON.stringify({ event: "error", message: error }) : error) + "\n");
		return 1;
	}
}
