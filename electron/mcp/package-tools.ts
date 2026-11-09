import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LessonFileLifecycle } from "../lesson/fileLifecycle";
import {
	createLessonPackage,
	LessonPackageError,
	lessonPackageMessages,
	verifyLessonPackage,
} from "../lesson/package";
import { createLessonPackageSchema, verifyLessonPackageSchema } from "../lesson/packageContracts";
export function registerLessonPackageTools(
	server: McpServer,
	editsAllowed: () => boolean,
	lifecycle?: LessonFileLifecycle,
) {
	const failure = (code: string) => ({
		isError: true as const,
		content: [{ type: "text" as const, text: code }],
	});
	const run = async (kind: "create" | "verify", args: unknown, signal: AbortSignal) => {
		if (!editsAllowed())
			return failure(
				"consent_required: Enable MCP edits to read/export an explicitly selected lesson package.",
			);
		if (!lifecycle) return failure("lesson-package-unsupported");
		const authority = {
			signal: AbortSignal.any([signal, lifecycle.signal]),
			assertCurrent: () => {
				if (!editsAllowed() || lifecycle.owner.isDestroyed())
					throw new Error("caller-scope-changed");
			},
		};
		try {
			const pending =
				kind === "create"
					? createLessonPackage(args, authority)
					: verifyLessonPackage(args, authority);
			lifecycle.track(pending);
			const result = await pending;
			authority.assertCurrent();
			return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
		} catch (error) {
			if (!editsAllowed())
				return failure(
					"consent_required: Enable MCP edits to read/export an explicitly selected lesson package.",
				);
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							code: error instanceof LessonPackageError ? error.code : "lesson-package-invalid",
							...(error instanceof LessonPackageError
								? {
										message: lessonPackageMessages[error.code],
										...(error.artifactPath ? { artifactPath: error.artifactPath } : {}),
									}
								: {}),
						}),
					},
				],
			};
		}
	};
	server.registerTool(
		"createLessonPackage",
		{
			description:
				"Create a NEW private bounded Linux portable derived static lesson/media folder from explicit saved manifestPath, selected stepIds, includeCode, imagePolicy, mediaPath AND receiptPath pairs and existing outputDirectory. Live MCP edits required BEFORE any filesystem inspection. Image policy include-external-provenance explicitly includes original image-source project IDs/hashes/timing; exclude omits it. Existing output exclusions are respected. Evidence/extensions/source pins/refresh history/raw journals/projects are omitted deliberately, source projects external-unavailable. Each already rendered MP4 must match current selected pin/target/bytes and passes actual sample/full decode again; source projects are not revalidated. No discovery, relink, pin upgrade, render, download, zip or implicit path grants. Derived text/code/JPEG editing only; native project edits, player and audio certification unavailable. Cancel/disconnect waits actual pending validation before completion; partials retained under current authority.",
			inputSchema: createLessonPackageSchema,
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
		},
		(args, extra) => run("create", args, extra.signal),
	);
	server.registerTool(
		"verifyLessonPackage",
		{
			description:
				"Verify/reopen one explicit portable package directory using only its bounded known tree. Requires live MCP edits BEFORE file access even though read-only. Check manifest/receipt, exact checksums, no-follow paths/extra assets, derived editable lesson/static guide/JPEG projection and actual MP4 sample/full decode; never probe original project/source paths. Returns bounded summary and relative guide/editable/media paths, no code/instructions/pin history. Local integrity, not authenticated signature; Linux subset/audio unverified/no timed player. After successful verification the derived editable file can be opened explicitly with existing lesson tools; video bindings remain package metadata.",
			inputSchema: verifyLessonPackageSchema,
			annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
		},
		(args, extra) => run("verify", args, extra.signal),
	);
}
