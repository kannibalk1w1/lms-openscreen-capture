import { randomUUID } from "node:crypto";
import path from "node:path";
import {
	BrowserWindow,
	dialog,
	type IpcMainInvokeEvent,
	ipcMain,
	type WebContents,
} from "electron";
import { z } from "zod";
import type { PackageOpenCode } from "../../src/lib/lesson/packageOpen";
import { validateLesson } from "../../src/lib/lesson/schema";
import { LessonPackageError, packageSelectedLesson } from "../lesson/package";
import { digest, pinMetadata } from "../lesson/packageIO";
import {
	type InspectedPackage,
	openSelectedLessonPackage,
	saveStaticPackageCopy,
} from "../lesson/packageOpen";
import { resealLessonPackage } from "../lesson/packageReseal";

const idSchema = z.string().uuid();
const resealSchema = z
	.object({ operationId: idSchema, token: idSchema, lesson: z.unknown() })
	.strict();
const createSchema = z
	.object({
		operationId: idSchema,
		lesson: z.unknown(),
		// Same contract as headless create: each selected step once.
		stepIds: z
			.array(idSchema)
			.min(1)
			.max(32)
			.refine((ids) => new Set(ids).size === ids.length),
		includeCode: z.boolean(),
		imagePolicy: z.enum(["exclude", "include-external-provenance"]),
		includeVideos: z.boolean(),
	})
	.strict();
const copySchema = z.object({ operationId: idSchema, token: idSchema }).strict();
/** One bounded inspection capability per registered current editor; never a file-protocol grant. */
export function registerLessonPackageOpenHandlers(
	authorize: (event: IpcMainInvokeEvent) => { assertCurrent(): void },
) {
	if (typeof authorize !== "function") throw new Error("Package editor authorization is required.");
	type State = {
		active?: { id: string; abort: AbortController };
		opened?: { token: string; directory: string; value: InspectedPackage; assertCurrent(): void };
	};
	const states = new WeakMap<WebContents, State>();
	const stateFor = (owner: WebContents) => {
		let state = states.get(owner);
		if (!state) {
			state = {};
			states.set(owner, state);
			const invalidate = () => {
				state!.active?.abort.abort();
				state!.opened = undefined;
			};
			owner.on("destroyed", invalidate);
			owner.on("render-process-gone", invalidate);
			owner.on("did-start-navigation", invalidate);
		}
		return state;
	};
	const mainFrame = (event: IpcMainInvokeEvent) => {
		if (!event.sender || event.senderFrame !== event.sender.mainFrame)
			throw new LessonPackageError("lesson-package-invalid");
	};
	const run = async <T>(
		event: IpcMainInvokeEvent,
		inputId: unknown,
		action: (state: State, authority: { assertCurrent(): void; signal: AbortSignal }) => Promise<T>,
		/** Reseal only: the presented token, whose own capability may survive a recoverable failure. */
		retainToken?: string,
		/** Creation from the authored lesson never uses, so never revokes, an opened package. */
		independent = false,
	) => {
		let state: State | undefined;
		let operation: State["active"];
		try {
			mainFrame(event);
			if (retainToken) state = states.get(event.sender);
			const authority = authorize(event),
				id = idSchema.parse(inputId);
			authority.assertCurrent();
			state = stateFor(event.sender);
			if (state.active) return { success: false as const, code: "lesson-package-busy" as const };
			operation = { id, abort: new AbortController() };
			state.active = operation;
			const check = () => {
				authority.assertCurrent();
				if (operation!.abort.signal.aborted)
					throw new LessonPackageError("lesson-package-cancelled");
			};
			const result = await action(state, { assertCurrent: check, signal: operation.abort.signal });
			check();
			return { success: true as const, result };
		} catch (error) {
			let capability: "retained" | "reopen-required" | undefined;
			if (retainToken) {
				capability = "reopen-required";
				try {
					const held = state?.opened;
					// A different token never learns about, or keeps, another capability.
					if (held && held.token === retainToken) {
						held.assertCurrent();
						// Cancellation keeps the original frozen identity; retry must recheck it.
						if (!operation?.abort.signal.aborted) held.value.assertCurrent();
						capability = "retained";
					}
				} catch {
					/* Keep edits in the renderer; no replacement identity or authority is captured. */
				}
			}
			if (state && capability !== "retained" && !independent) state.opened = undefined;
			let code: PackageOpenCode =
				error instanceof LessonPackageError ? error.code : "lesson-package-invalid";
			if (error instanceof Error && error.message === "package-edit-unsupported")
				code = "lesson-package-edit-unsupported";
			if (error instanceof Error && error.message === "package-destination-invalid")
				code = "lesson-package-destination-invalid";
			if (error instanceof Error && error.message === "package-video-selection-invalid")
				code = "lesson-package-video-selection-invalid";
			if (error instanceof Error && error.message === "package-video-copy-unsupported")
				code = "lesson-package-video-copy-unsupported";
			if (error && typeof error === "object" && "code" in error && error.code === "EEXIST")
				code = "destination-exists";
			// The shared writer names its unfinished folder only while the caller's scope still holds.
			// Shown for the two routes that create package folders, so the author can find and remove it.
			const artifactPath =
				(retainToken || independent) && error instanceof LessonPackageError
					? error.artifactPath
					: undefined;
			return {
				success: false as const,
				code,
				...(capability ? { capability } : {}),
				...(artifactPath ? { artifactPath } : {}),
			};
		} finally {
			if (operation && state?.active === operation) state.active = undefined;
		}
	};
	ipcMain.handle("lesson:package-open", (event, id: unknown) =>
		run(event, id, async (state, authority) => {
			state.opened = undefined;
			const parent = BrowserWindow.fromWebContents(event.sender);
			const options = {
				title: "Open a portable lesson package",
				properties: ["openDirectory"] as ["openDirectory"],
			};
			const picked = parent
				? await dialog.showOpenDialog(parent, options)
				: await dialog.showOpenDialog(options);
			authority.assertCurrent();
			if (picked.canceled || !picked.filePaths[0]) return { status: "cancelled" as const };
			const directory = picked.filePaths[0],
				value = await openSelectedLessonPackage(directory, authority);
			authority.assertCurrent();
			const token = randomUUID();
			// Snapshot authority must outlive this operation's cancellation signal.
			const session = authorize(event);
			state.opened = { token, directory, value, assertCurrent: session.assertCurrent };
			return {
				status: "opened" as const,
				token,
				snapshotSha256: digest(JSON.stringify(value.manifest)),
				lesson: value.lesson,
				videos: value.manifest.videos.map(({ stepId, frames, durationSec }) => ({
					stepId,
					frames,
					durationSec,
				})),
				images: value.manifest.scope.images,
			};
		}),
	);
	ipcMain.handle("lesson:package-copy", (event, input: unknown) => {
		const parsed = copySchema.safeParse(input);
		if (!parsed.success) return { success: false, code: "lesson-package-invalid" };
		return run(event, parsed.data.operationId, async (state, authority) => {
			const opened = state.opened;
			if (!opened || opened.token !== parsed.data.token)
				throw new LessonPackageError("lesson-package-invalid");
			opened.assertCurrent();
			return saveStaticPackageCopy(
				opened.directory,
				opened.value,
				{
					...authority,
					assertCurrent: () => {
						authority.assertCurrent();
						opened.assertCurrent();
						if (state.opened !== opened) throw new LessonPackageError("lesson-package-cancelled");
					},
				},
				async () => {
					const parent = BrowserWindow.fromWebContents(event.sender);
					const options = {
						title: "Save a new editable text and image lesson copy",
						defaultPath: "lesson-copy.openscreen-lesson.json",
						filters: [{ name: "OpenScreen lesson", extensions: ["json"] }],
					};
					const selected = parent
						? await dialog.showSaveDialog(parent, options)
						: await dialog.showSaveDialog(options);
					return selected.canceled ? null : (selected.filePath ?? null);
				},
			);
		});
	});
	ipcMain.handle("lesson:package-reseal", (event, input: unknown) => {
		const request = resealSchema.safeParse(input);
		if (!request.success) return { success: false, code: "lesson-package-invalid" };
		return run(
			event,
			request.data.operationId,
			async (state, authority) => {
				const opened = state.opened;
				if (!opened || opened.token !== request.data.token)
					throw new LessonPackageError("lesson-package-invalid");
				opened.assertCurrent();
				return resealLessonPackage(
					opened.directory,
					opened.value,
					request.data.lesson,
					{
						...authority,
						assertCurrent: () => {
							authority.assertCurrent();
							opened.assertCurrent();
							if (state.opened !== opened) throw new LessonPackageError("lesson-package-cancelled");
						},
					},
					async () => {
						const parent = BrowserWindow.fromWebContents(event.sender);
						const options = {
							title: "Choose an existing folder for a new edited lesson package",
							properties: ["openDirectory"] as ["openDirectory"],
						};
						const selected = parent
							? await dialog.showOpenDialog(parent, options)
							: await dialog.showOpenDialog(options);
						return selected.canceled ? null : (selected.filePaths[0] ?? null);
					},
				);
			},
			request.data.token,
		);
	});
	// The author's current lesson: explicit native selections only, the shared writer, no stored grant.
	ipcMain.handle("lesson:package-create", (event, input: unknown) => {
		const request = createSchema.safeParse(input);
		if (!request.success) return { success: false, code: "lesson-package-invalid" };
		return run(
			event,
			request.data.operationId,
			async (_state, authority) => {
				const lesson = await validateLesson(request.data.lesson);
				authority.assertCurrent();
				const parent = BrowserWindow.fromWebContents(event.sender);
				const pick = async (title: string, many: boolean) => {
					const options = {
						title,
						properties: (many ? ["openDirectory", "multiSelections"] : ["openDirectory"]) as Array<
							"openDirectory" | "multiSelections"
						>,
					};
					const picked = parent
						? await dialog.showOpenDialog(parent, options)
						: await dialog.showOpenDialog(options);
					authority.assertCurrent();
					return picked.canceled || !picked.filePaths.length ? null : picked.filePaths;
				};
				const media: Array<{ stepId: string; receiptPath: string; mediaPath: string }> = [];
				if (request.data.includeVideos) {
					const folders = await pick(
						"Choose the exported step MP4 folders to include (up to 4)",
						true,
					);
					if (!folders) return { status: "cancelled" as const };
					try {
						if (folders.length > 4) throw new Error("too-many");
						for (const folder of folders) {
							const receiptPath = path.join(folder, "range-export.json"),
								receipt = z
									.object({ target: z.object({ stepId: idSchema }) })
									.parse(JSON.parse(pinMetadata(receiptPath, 65536).bytes.toString("utf8"))),
								stepId = receipt.target.stepId;
							if (!request.data.stepIds.includes(stepId) || media.some((m) => m.stepId === stepId))
								throw new Error("unmatched");
							media.push({ stepId, receiptPath, mediaPath: path.join(folder, "range.mp4") });
						}
					} catch {
						throw new Error("package-video-selection-invalid");
					}
				}
				const destination = await pick(
					"Choose an existing folder for the new lesson package",
					false,
				);
				if (!destination) return { status: "cancelled" as const };
				const result = await packageSelectedLesson(
					lesson,
					{
						stepIds: request.data.stepIds,
						includeCode: request.data.includeCode,
						imagePolicy: request.data.imagePolicy,
						media,
						outputDirectory: destination[0],
					},
					authority,
				);
				return {
					status: result.status,
					path: result.path,
					steps: result.steps,
					images: result.images,
					videos: result.videos,
				};
			},
			undefined,
			true,
		);
	});
	ipcMain.handle("lesson:package-cancel", (event, input: unknown) => {
		try {
			mainFrame(event);
			const id = idSchema.parse(input),
				state = states.get(event.sender);
			if (!state?.active || state.active.id !== id) return false;
			state.active.abort.abort();
			return true;
		} catch {
			return false;
		}
	});
	ipcMain.handle("lesson:package-release", (event, input: unknown) => {
		try {
			mainFrame(event);
			const token = idSchema.parse(input),
				state = states.get(event.sender);
			if (state?.opened?.token !== token) return false;
			state.opened = undefined;
			state.active?.abort.abort();
			return true;
		} catch {
			return false;
		}
	});
}
