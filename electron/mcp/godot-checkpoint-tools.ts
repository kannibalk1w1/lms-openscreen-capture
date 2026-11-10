import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	compareGodotCheckpointsFileSchema,
	compareGodotReferenceFileSchema,
	inspectGodotCheckpointsFileSchema,
} from "../lesson/godotCheckpointContracts";
import {
	compareGodotCheckpointsFile,
	compareGodotReferenceFile,
	GodotCheckpointFileError,
	inspectGodotCheckpointsFile,
} from "../lesson/godotCheckpointFile";

export function registerGodotCheckpointTools(
	server: McpServer,
	transport: "http" | "stdio",
	editsAllowed: () => boolean,
) {
	const failure = (code: string) => ({
		isError: true as const,
		content: [{ type: "text" as const, text: code }],
	});
	const refused = "consent_required: Enable MCP edits to read a selected Godot journal.";
	server.registerTool(
		"inspectGodotCheckpointsFile",
		{
			description:
				"Read one explicitly selected original Godot scene JSONL journal. Return at most 200 authored marker labels, raw record/snapshot IDs and independent source times per page plus exact raw SHA-256. No payloads, resources, project discovery or file writes. Legacy v1 has no markers; normalized captures cannot replace raw states. HTTP requires MCP edits before reads; stdio uses explicit launch authority. Labels remain unverified authored content.",
			inputSchema: inspectGodotCheckpointsFileSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		(args: unknown, extra) => {
			if (transport === "http" && !editsAllowed()) return failure(refused);
			try {
				const result = inspectGodotCheckpointsFile(args, () => {
					extra.signal.throwIfAborted();
					if (transport === "http" && !editsAllowed()) throw new Error("consent_required");
				});
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (transport === "http" && !editsAllowed()) return failure(refused);
				if (extra.signal.aborted) return failure("cancelled");
				return failure(
					error instanceof GodotCheckpointFileError ? error.code : "capture-file-operation-failed",
				);
			}
		},
	);
	server.registerTool(
		"compareGodotCheckpointsFile",
		{
			description:
				"Read-only comparison of two explicit distinct authored marker RECORD IDs in one original Godot scene journal, bound to the exact raw SHA-256 from inspection. Direction follows From/To; reverse allowed. Return sampled endpoint node identities/counts/changed field names, not resource values, complete edit history, completion, save or runtime proof. Clock remains unmapped. No restore, project/media access, source grants or writes. HTTP requires MCP edits before reads; stdio uses explicit launch authority.",
			inputSchema: compareGodotCheckpointsFileSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		(args: unknown, extra) => {
			if (transport === "http" && !editsAllowed()) return failure(refused);
			try {
				const result = compareGodotCheckpointsFile(args, () => {
					extra.signal.throwIfAborted();
					if (transport === "http" && !editsAllowed()) throw new Error("consent_required");
				});
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (transport === "http" && !editsAllowed()) return failure(refused);
				if (extra.signal.aborted) return failure("cancelled");
				return failure(
					error instanceof GodotCheckpointFileError ? error.code : "capture-file-operation-failed",
				);
			}
		},
	);
	server.registerTool(
		"compareGodotReferenceFile",
		{
			description:
				"Advisory read-only comparison of one authored marker RECORD in a candidate original Godot scene journal against one in a reference journal (for example a retake against an earlier take; the same file is allowed). Each journal is bound to the exact raw SHA-256 from its own inspection. Nodes match by root-relative path only, never by session IDs; renamed/reparented nodes are unmatched paths. Numbers are exact unless an explicit tolerance (0-1) is given; resource paths compare as text and are never loaded. Outcome agree/differ/partial with unknowns (limited coverage, fields or connections a version could not record). Not expected-state verification, grading, runtime or render proof. No writes. HTTP requires MCP edits before reads; stdio uses explicit launch authority.",
			inputSchema: compareGodotReferenceFileSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		(args: unknown, extra) => {
			if (transport === "http" && !editsAllowed()) return failure(refused);
			try {
				const result = compareGodotReferenceFile(args, () => {
					extra.signal.throwIfAborted();
					if (transport === "http" && !editsAllowed()) throw new Error("consent_required");
				});
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (transport === "http" && !editsAllowed()) return failure(refused);
				if (extra.signal.aborted) return failure("cancelled");
				return failure(
					error instanceof GodotCheckpointFileError ? error.code : "capture-file-operation-failed",
				);
			}
		},
	);
}
