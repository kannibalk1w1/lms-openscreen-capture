import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	illustrationUnsupportedMessage,
	LessonOperationError,
	rangeExportToolUnavailableMessage,
} from "../../src/lib/lesson/api";
import {
	draftApplicationCaptureFileSchema,
	inspectApplicationCaptureFileSchema,
} from "../lesson/applicationCaptureContracts";
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
import {
	addLessonStepsFileSchema,
	createLessonFileSchema,
	exportLessonFileSchema,
	moveLessonStepFileSchema,
	queryLessonFileSchema,
	removeLessonStepFileSchema,
	updateLessonStepFileSchema,
} from "../lesson/fileContracts";
import { exportLessonRangeFile, type LessonFileRangeRenderer } from "../lesson/fileExport";
import { exportLessonRangeFileSchema } from "../lesson/fileExportContracts";
import {
	illustrateLessonStepFile,
	illustrateLessonStepFileSchema,
	type LessonFrameRenderer,
} from "../lesson/fileIllustrate";
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
		renderFrames,
	}: {
		transport: "http" | "stdio";
		editsAllowed: () => boolean;
		lifecycle?: LessonFileLifecycle;
		render?: LessonFileRangeRenderer;
		renderFrames?: LessonFrameRenderer;
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
				"Query one explicitly selected server-local editable lesson file by absolute manifestPath. Returns step IDs, titles, review findings, source kinds and author-entered LMS lessonRef/slideRef labels only; no instructions, code, images or paths. Does not discover files or look up application/recovery storage. On HTTP, requires MCP edits permission before file access; stdio uses its existing explicit-launch authority. Title matching uses NFKC plus lowercase substring; review findings are advisory.",
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
	// Registered last so earlier tool positions stay stable for existing clients.
	for (const tool of [
		{
			name: "createLessonFile",
			description:
				"Create a NEW empty editable lesson file at an explicit absolute outputPath with a title and optional lessonRef (your own LMS lesson label, not checked against any LMS). Never replaces an existing file. No project, media, discovery or recovery-store access. Requires MCP edits.",
			inputSchema: createLessonFileSchema,
			run: createLessonFile,
		},
		{
			name: "addLessonSteps",
			description:
				"Append 1-50 authored steps (title, optional instructions, optional slideRef LMS slide label, optional code) to one explicitly selected editable lesson file and save the result as a NEW file at an explicit absolute outputPath. The selected file is unchanged and no file is replaced. Every added step is a draft that needs human review; this records text only and does not demonstrate, capture or verify anything on screen. Returns the new step IDs. Requires MCP edits.",
			inputSchema: addLessonStepsFileSchema,
			run: addLessonStepsFile,
		},
		{
			name: "updateLessonStep",
			description:
				"Change one existing step's title, instructions, slideRef or code in an explicitly selected editable lesson file (null clears slideRef or code) and save the result as a NEW file at an explicit absolute outputPath. Changed teaching text returns the step to draft for human review; a slideRef change alone keeps its status. The selected file is unchanged and no file is replaced. Requires MCP edits.",
			inputSchema: updateLessonStepFileSchema,
			run: updateLessonStepFile,
		},
		{
			name: "removeLessonStep",
			description:
				"Remove one step (and any illustration no other step uses) from an explicitly selected editable lesson file and save the result as a NEW file at an explicit absolute outputPath. The selected file is unchanged and no file is replaced. Requires MCP edits.",
			inputSchema: removeLessonStepFileSchema,
			run: removeLessonStepFile,
		},
		{
			name: "moveLessonStep",
			description:
				"Move one step to a 1-based position in an explicitly selected editable lesson file and save the result as a NEW file at an explicit absolute outputPath. Only the order changes; step IDs, text, media bindings and review status are kept. The selected file is unchanged and no file is replaced. Requires MCP edits.",
			inputSchema: moveLessonStepFileSchema,
			run: moveLessonStepFile,
		},
	] as const)
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
			},
			async (args: unknown) => {
				if (!editsAllowed())
					return failure("consent_required: Enable MCP edits to write a lesson file.");
				try {
					return {
						content: [{ type: "text" as const, text: JSON.stringify(await tool.run(args)) }],
					};
				} catch {
					return failure("lesson-file-operation-failed");
				}
			},
		);
	server.registerTool(
		"illustrateLessonStep",
		{
			description:
				"Attach one composed frame of an explicitly selected SAVED project (projectPath, projectId, rulerSec on the editor ruler) to one step of an explicitly selected editable lesson file, with a required imageAlt description, and save the result as a NEW file at an explicit absolute outputPath. sourcePaths must name every screen source file the project's clips play; nothing is discovered or relinked and symlinked sources are refused. Screen-only projects only: a webcam, image background, image annotation, added audio, click sound, webcam effect or recorded cursor file beside a source is refused with illustration-unsupported before anything is rendered. The step returns to draft: a person must still review the pixels for private content and check that the frame shows the step. Selected files are unchanged and no file is replaced. Fails with frame-unavailable for a time inside a cut. Requires MCP edits.",
			inputSchema: illustrateLessonStepFileSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (args: unknown, extra) => {
			const refused = "consent_required: Enable MCP edits to illustrate a lesson step.";
			if (!editsAllowed()) return failure(refused);
			if (!lifecycle || !renderFrames) return failure("lesson-file-operation-failed");
			try {
				const pending = illustrateLessonStepFile(
					args,
					{
						signal: AbortSignal.any([extra.signal, lifecycle.signal]),
						assertCurrent: () => {
							if (!editsAllowed() || lifecycle.owner.isDestroyed())
								throw new Error("caller-scope-changed");
						},
					},
					renderFrames,
				);
				lifecycle.track(pending);
				const result = await pending;
				if (!editsAllowed()) return failure(refused);
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
			} catch (error) {
				if (!editsAllowed()) return failure(refused);
				// Fixed codes only, such as a trimmed time; no paths, payloads or raw errors.
				if (error instanceof LessonOperationError && error.code === "illustration-unsupported")
					return failure(`illustration-unsupported: ${illustrationUnsupportedMessage}`);
				return failure(
					error instanceof LessonOperationError ? error.code : "lesson-file-operation-failed",
				);
			}
		},
	);
	server.registerTool(
		"inspectApplicationCaptureFile",
		{
			description:
				"Inspect one explicitly selected application capture or Godot JSONL file. Returns paginated observation IDs, times, types, labels, coverage and raw SHA-256 only; no payload or baseline. No discovery, provider loading, project access, media grant or file modification. HTTP requires MCP edits permission before reading; stdio uses explicit launch authority.",
			inputSchema: inspectApplicationCaptureFileSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		(args: unknown) => {
			if (transport === "http" && !editsAllowed())
				return failure(
					"consent_required: Enable MCP edits to inspect a selected application capture.",
				);
			try {
				return {
					content: [
						{ type: "text" as const, text: JSON.stringify(inspectApplicationCaptureFile(args)) },
					],
				};
			} catch (error) {
				return failure(
					error instanceof ApplicationCaptureFileError
						? error.code
						: "capture-file-operation-failed",
				);
			}
		},
	);
	server.registerTool(
		"draftLessonFromApplicationCapture",
		{
			description:
				"Create a NEW editable draft lesson from 1–200 explicitly selected observations in one selected capture, bound to the exact raw SHA-256 returned by inspection. Preserves selected evidence and its unmapped clock; baseline and unselected payloads are omitted. Original capture remains unchanged. Explicit absolute source/output paths; output must not exist. No timing calibration, project/media access, rendering or source grants. Requires MCP edits before any file read.",
			inputSchema: draftApplicationCaptureFileSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		async (args: unknown, extra) => {
			if (!editsAllowed())
				return failure(
					"consent_required: Enable MCP edits to create a lesson from application observations.",
				);
			try {
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								await draftApplicationCaptureFile(args, () => {
									extra.signal.throwIfAborted();
									if (!editsAllowed()) throw new Error("consent_required");
								}),
							),
						},
					],
				};
			} catch (error) {
				if (!editsAllowed())
					return failure(
						"consent_required: Enable MCP edits to create a lesson from application observations.",
					);
				if (extra.signal.aborted) return failure("cancelled");
				return failure(
					error instanceof ApplicationCaptureFileError
						? error.code
						: "lesson-file-operation-failed",
				);
			}
		},
	);
}
