import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exportLessonFile, queryLessonFile } from "../lesson/fileCommands";
import { exportLessonFileSchema, queryLessonFileSchema } from "../lesson/fileContracts";

export function registerLessonTools(
	server: McpServer,
	{ transport, editsAllowed }: { transport: "http" | "stdio"; editsAllowed: () => boolean },
) {
	const failure = (code: string) => ({
		isError: true as const,
		content: [{ type: "text" as const, text: code }],
	});
	server.registerTool(
		"queryLessonFile",
		{
			description:
				"Query one explicitly selected server-local editable lesson file by absolute manifestPath. Returns step IDs, titles, review findings and source kinds only; no instructions, code, images or paths. Does not discover files or look up application/recovery storage. On HTTP, requires MCP edits permission before file access; stdio uses its existing explicit-launch authority. Title matching uses NFKC plus lowercase substring; review findings are advisory.",
			inputSchema: queryLessonFileSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		async (args: unknown) => {
			if (transport === "http" && !editsAllowed())
				return failure("consent_required: Enable MCP edits to query a selected lesson file.");
			try {
				return {
					content: [{ type: "text" as const, text: JSON.stringify(await queryLessonFile(args)) }],
				};
			} catch {
				return failure("lesson-file-operation-failed");
			}
		},
	);
	server.registerTool(
		"exportLessonGuide",
		{
			description:
				"Export explicitly selected stepIds from one server-local editable lesson file into a fresh private guide folder inside an explicitly selected existing outputDirectory. Both paths must be absolute. Uses the lesson reading settings and omits excluded code/images. Creates HTML, Markdown, selected editable manifest and verified completion receipt; preserves source files. Requires MCP edits permission. Does not discover files or use recovery-store APIs. A failed export can leave a partial folder without a completion receipt.",
			inputSchema: exportLessonFileSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (args: unknown) => {
			if (!editsAllowed())
				return failure("consent_required: Enable MCP edits to export a lesson guide.");
			try {
				return {
					content: [{ type: "text" as const, text: JSON.stringify(await exportLessonFile(args)) }],
				};
			} catch {
				return failure("lesson-file-operation-failed");
			}
		},
	);
}
