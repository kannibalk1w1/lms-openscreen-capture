import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	checkProjectDriftFile,
	checkProjectDriftSchema,
	createProjectManifestFile,
	createProjectManifestSchema,
	ProjectManifestError,
} from "../lesson/projectManifest";

/** Opt-in project manifest and drift tools: explicit folder only, no contents, no restore. */
export function registerProjectManifestTools(
	server: McpServer,
	transport: "http" | "stdio",
	editsAllowed: () => boolean,
) {
	const failure = (code: string) => ({
		isError: true as const,
		content: [{ type: "text" as const, text: code }],
	});
	const refused = "consent_required: Enable MCP edits to scan a selected project folder.";
	const run =
		(operation: (args: unknown, assertCurrent: () => void) => Promise<unknown>) =>
		async (args: unknown, extra: { signal: AbortSignal }) => {
			if (transport === "http" && !editsAllowed()) return failure(refused);
			try {
				const result = await operation(args, () => {
					extra.signal.throwIfAborted();
					if (transport === "http" && !editsAllowed()) throw new Error("consent_required");
				});
				if (transport === "http" && !editsAllowed()) return failure(refused);
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (transport === "http" && !editsAllowed()) return failure(refused);
				if (extra.signal.aborted) return failure("cancelled");
				return failure(
					error instanceof ProjectManifestError ? error.code : "project-manifest-operation-failed",
				);
			}
		};
	server.registerTool(
		"createProjectManifestFile",
		{
			description:
				"Scan ONE explicitly selected project folder and write a NEW manifest file outside it, recording each regular file's relative path, size and SHA-256 only (never contents). Symbolic links/reparse points are not followed; special, unreadable or changing files and root .git/.godot/.import folders are listed as unobserved; file/byte/depth/entry limits give limited coverage. Path names are sensitive metadata. Nothing is copied, archived, restored or written into the project. A manifest describes what was observed; it does not certify a project. HTTP requires MCP edits; stdio uses explicit launch authority.",
			inputSchema: createProjectManifestSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		run(createProjectManifestFile),
	);
	server.registerTool(
		"checkProjectDriftFile",
		{
			description:
				"Read-only drift check of ONE explicitly selected project folder against a manifest bound to the exact SHA-256 returned when it was created. Reports changed/missing/added paths plus now/previously unobserved and not-reached paths, with outcome drift-observed, partial-no-drift-observed or no-drift-observed. Observations only: not proof that a project is correct, complete, runnable or restorable. No contents, discovery, restore or writes. HTTP requires MCP edits before reads; stdio uses explicit launch authority.",
			inputSchema: checkProjectDriftSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		run(checkProjectDriftFile),
	);
}
