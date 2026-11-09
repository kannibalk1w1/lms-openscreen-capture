import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rangeExportToolUnavailableMessage } from "../../src/lib/lesson/api";
import { exportLessonFile, queryLessonFile } from "../lesson/fileCommands";
import { exportLessonFileSchema, queryLessonFileSchema } from "../lesson/fileContracts";
import { exportLessonRangeFile, type LessonFileRangeRenderer } from "../lesson/fileExport";
import { exportLessonRangeFileSchema } from "../lesson/fileExportContracts";
import type { LessonFileLifecycle } from "../lesson/fileLifecycle";
import { confirmLessonFileRange, LessonFileRangeError } from "../lesson/fileRange";
import { confirmLessonFileRangeSchema } from "../lesson/fileRangeContracts";
import { registerLessonPackageTools } from "./package-tools";

export function registerLessonTools(
	server: McpServer,
	{
		transport,
		editsAllowed,
		lifecycle,
		render,
	}: {
		transport: "http" | "stdio";
		editsAllowed: () => boolean;
		lifecycle?: LessonFileLifecycle;
		render?: LessonFileRangeRenderer;
	},
) {
	registerLessonPackageTools(server, editsAllowed, lifecycle);
	const failure = (code: string) => ({
		isError: true as const,
		content: [{ type: "text" as const, text: code }],
	});
	server.registerTool(
		"exportLessonRangeFile",
		{
			description:
				"Export exactly the included pinned step from explicitly selected saved lesson/project files as a NEW private MP4 folder in explicit existing outputDirectory. Requires live MCP edits before filesystem inspection, explicit sourcePaths grants and includedStepIds:[stepId]. No implicit source confirmation, refresh, relink, legacy upgrade, discovery, full-project fallback or dialog. Linux bounded video-only subset; stored sample timing, full decode and hashes checked, audio flags false. Originals preserved; incomplete artifacts retained and disclosed only under current authority. Stdio SDK request cancel and connection close wait actual native/file settlement before ownership reuse. HTTP clients must abort/close the active HTTP request to cancel: stateless cancellation notifications alone do not address another request.",
			inputSchema: exportLessonRangeFileSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (args, extra) => {
			if (!editsAllowed())
				return failure("consent_required: Enable MCP edits to export a selected lesson range.");
			if (!lifecycle || !render) return failure("range-export-unsupported");
			const signal = AbortSignal.any([extra.signal, lifecycle.signal]),
				assertCurrent = () => {
					if (!editsAllowed()) throw new Error("consent_required");
				};
			try {
				const pending = exportLessonRangeFile(
					args,
					{ owner: lifecycle.owner, signal, assertCurrent },
					render,
					(value) => {
						if (extra._meta?.progressToken !== undefined)
							void extra
								.sendNotification({
									method: "notifications/progress",
									params: {
										progressToken: extra._meta.progressToken,
										progress:
											value.frames ?? (value.phase === "validating" ? (value.totalFrames ?? 0) : 0),
										...(value.totalFrames ? { total: value.totalFrames } : {}),
										message: JSON.stringify(value),
									},
								})
								.catch(() => undefined);
					},
				);
				lifecycle.track(pending);
				const result = await pending;
				assertCurrent();
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (!editsAllowed())
					return failure("consent_required: Enable MCP edits to export a selected lesson range.");
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({
								code:
									error instanceof LessonFileRangeError
										? error.code
										: "lesson-file-operation-failed",
								...(error instanceof LessonFileRangeError &&
								error.code === "range-export-tool-unavailable"
									? { message: rangeExportToolUnavailableMessage }
									: {}),
								...(error instanceof LessonFileRangeError && error.artifactPath
									? { artifactPath: error.artifactPath }
									: {}),
							}),
						},
					],
				};
			}
		},
	);

	server.registerTool(
		"confirmLessonRangeFile",
		{
			description:
				"Explicitly confirm or same-project refresh one selected step into a NEW editable lesson file (never overwrite). Requires MCP edits permission before filesystem access, even on stdio. Explicit absolute manifestPath, current-schema saved projectPath/projectId, outputPath, stepId, ruler startSec/endSec, sourcePaths grants and author-current/refresh-current intent are all required. Source paths are NEVER inferred as grants from imported lesson/project contents. Linux bounded video-only source identity; no MP4 rendering/export, discovery, relinking or legacy upgrade. Results omit pins, source paths, instructions and code; cancelled/failed staged output may be retained for authorized inspection.",
			inputSchema: confirmLessonFileRangeSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (args, extra) => {
			if (!editsAllowed())
				return failure("consent_required: Enable MCP edits to confirm selected lesson sources.");
			const assertCurrent = () => {
				if (!editsAllowed()) throw new Error("consent_required");
			};
			try {
				const signal = lifecycle ? AbortSignal.any([extra.signal, lifecycle.signal]) : extra.signal;
				const pending = confirmLessonFileRange(args, { assertCurrent, signal });
				lifecycle?.track(pending);
				const result = await pending;
				assertCurrent();
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (!editsAllowed())
					return failure("consent_required: Enable MCP edits to confirm selected lesson sources.");
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({
								code:
									error instanceof LessonFileRangeError
										? error.code
										: "lesson-file-operation-failed",
								...(error instanceof LessonFileRangeError && error.artifactPath
									? { artifactPath: error.artifactPath }
									: {}),
							}),
						},
					],
				};
			}
		},
	);

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
