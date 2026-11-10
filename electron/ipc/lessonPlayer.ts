import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	type LessonPlayerCode,
	type LessonPlayerView,
	lessonPlayerMediaUrl,
} from "../../src/lib/lesson/player";
import { LessonPackageError } from "../lesson/package";
import { identity } from "../lesson/packageIO";
import { type InspectedPackage, openSelectedLessonPackage } from "../lesson/packageOpen";
import {
	type PlayerMediaCapability,
	type PlayerMediaFile,
	servePlayerMedia,
} from "../lesson/playerMedia";

/** The webContents surface a player owner needs; a real Electron WebContents satisfies it. */
export interface PlayerContents {
	getURL(): string;
	isDestroyed(): boolean;
	mainFrame: unknown;
	on(
		event: "destroyed" | "render-process-gone" | "did-start-navigation",
		listener: () => void,
	): unknown;
}
function canonicalURL(value: string) {
	try {
		const url = new URL(value);
		url.search = url.searchParams.toString();
		return url.toString();
	} catch {
		return null;
	}
}
/** At most this many player windows exist at once. */
export const MAX_PLAYER_WINDOWS = 4;

/**
 * One read-only player window. It holds at most one verified package capability, which ends with
 * the window's page context (navigation, crash, close), an explicit close, or a newer open.
 */
export class LessonPlayerOwner {
	private epoch = 0;
	private operation = 0;
	private pending?: AbortController;
	/** Resolves once the pending open, if any, has fully unwound (picker and verification). */
	private settling: Promise<void> = Promise.resolve();
	private capability?: PlayerMediaCapability & { abort: AbortController };
	ended = false;
	constructor(
		readonly contents: PlayerContents,
		private readonly url: string,
	) {
		for (const name of ["destroyed", "render-process-gone", "did-start-navigation"] as const)
			contents.on(name, () => this.end());
	}
	/** Every navigation, crash or close: everything the window held ends, as on an explicit release. */
	private end() {
		this.release();
		if (this.contents.isDestroyed()) this.ended = true;
	}
	/**
	 * The learner's explicit close, and every lifetime end: the open package's media AND any open still
	 * in its picker or verification end now. A new epoch means nothing begun before can install a view
	 * or capability; only a fresh open afterwards can.
	 */
	release() {
		this.epoch++;
		this.pending?.abort();
		this.revokeCapability();
	}
	/** Ends only the current media capability (a newly chosen folder, or a changed file). */
	private revokeCapability() {
		this.capability?.abort.abort();
		this.capability = undefined;
	}
	cancel() {
		this.pending?.abort();
	}
	/** The exact player page, in its main frame, still alive. */
	isPage(event: { sender?: unknown; senderFrame?: unknown } | undefined) {
		return (
			!!event &&
			event.sender === this.contents &&
			!this.contents.isDestroyed() &&
			event.senderFrame === this.contents.mainFrame &&
			canonicalURL(this.contents.getURL()) === this.url
		);
	}
	/** Media requests from this owner's own session only. */
	serve(request: Request) {
		return servePlayerMedia(request, () => this.capability);
	}
	/** Native picker → full verification → capability, rechecked after every await (R1 pattern). */
	async open(
		event: IpcMainInvokeEvent,
		pick: () => Promise<string | null>,
		inspect: (
			directory: string,
			authority: { assertCurrent(): void; signal: AbortSignal },
		) => Promise<InspectedPackage>,
	): Promise<LessonPlayerView | { status: "cancelled" }> {
		if (this.pending) {
			if (!this.pending.signal.aborted) throw new PlayerError("lesson-player-busy");
			// A released or cancelled open is still unwinding: let its picker and verification
			// settle before any new work, then start fresh from the current page and epoch.
			await this.settling;
			if (this.pending) throw new PlayerError("lesson-player-busy");
			if (!this.isPage(event)) throw new PlayerError("lesson-player-unavailable");
		}
		let settled!: () => void;
		this.settling = new Promise<void>((resolve) => {
			settled = resolve;
		});
		const epoch = this.epoch,
			operation = ++this.operation,
			abort = new AbortController();
		this.pending = abort;
		const current = () =>
			this.epoch === epoch &&
			this.operation === operation &&
			!abort.signal.aborted &&
			this.isPage(event);
		const assertCurrent = () => {
			if (!current()) throw new LessonPackageError("lesson-package-cancelled");
		};
		try {
			const directory = await pick();
			assertCurrent();
			if (!directory) return { status: "cancelled" };
			// A different folder was chosen: the previous package stops playing now. This open
			// itself stays current (no new epoch).
			this.revokeCapability();
			const inspected = await inspect(directory, { assertCurrent, signal: abort.signal });
			assertCurrent();
			const videos = new Map<string, PlayerMediaFile>();
			for (const video of inspected.manifest.videos) {
				const file = path.join(directory, video.path),
					stats = lstatSync(file);
				videos.set(video.stepId, { path: file, size: stats.size, identity: identity(stats) });
			}
			// Every pinned file, media included, is still exactly what was hashed and decoded.
			inspected.assertCurrent();
			assertCurrent();
			const token = randomUUID(),
				revoked = new AbortController();
			this.capability = {
				token,
				videos,
				abort: revoked,
				signal: revoked.signal,
				inflight: 0,
				isCurrent: () => this.capability?.token === token && this.epoch === epoch,
				revoke: () => {
					if (this.capability?.token === token) this.revokeCapability();
				},
			};
			return playerView(token, inspected);
		} finally {
			if (this.pending === abort) this.pending = undefined;
			settled();
		}
	}
}
export class PlayerError extends Error {
	constructor(readonly code: LessonPlayerCode) {
		super(code);
	}
}
/** Only what the learner sees: verified lesson text, embedded JPEGs and capability media URLs. */
export function playerView(token: string, inspected: InspectedPackage): LessonPlayerView {
	const { lesson, manifest } = inspected;
	const images = new Map(lesson.assets.map((image) => [image.id, image]));
	const videos = new Map(manifest.videos.map((video) => [video.stepId, video]));
	return {
		status: "opened",
		title: lesson.title,
		...(lesson.lessonRef ? { lessonRef: lesson.lessonRef } : {}),
		steps: lesson.steps.map((step) => {
			const image = step.imageId ? images.get(step.imageId) : undefined,
				video = videos.get(step.id);
			return {
				id: step.id,
				title: step.title,
				instructions: step.instructions,
				...(step.code ? { code: { language: step.code.language, text: step.code.text } } : {}),
				...(image
					? {
							image: {
								src: `data:image/jpeg;base64,${image.base64}`,
								alt: step.imageAlt,
								width: image.width,
								height: image.height,
							},
						}
					: {}),
				...(video
					? {
							video: {
								src: lessonPlayerMediaUrl(token, step.id),
								durationSec: video.durationSec,
								width: video.width,
								height: video.height,
							},
						}
					: {}),
			};
		}),
		checks: {
			videos: manifest.videos.length,
			audioChecked: false,
			authenticity: "local-readback-not-signature",
		},
	};
}

/** Owners by webContents; a window is a player only if main created and registered it. */
export class LessonPlayerOwners {
	private readonly owners = new WeakMap<object, LessonPlayerOwner>();
	private live = new Set<LessonPlayerOwner>();
	register(contents: PlayerContents, url: string) {
		const canonical = canonicalURL(url);
		if (!canonical) throw new Error("Player URL is invalid.");
		const owner = new LessonPlayerOwner(contents, canonical);
		this.owners.set(contents, owner);
		this.live.add(owner);
		contents.on("destroyed", () => this.live.delete(owner));
		return owner;
	}
	get(contents: unknown) {
		return contents && typeof contents === "object" ? this.owners.get(contents) : undefined;
	}
	count() {
		return [...this.live].filter((owner) => !owner.contents.isDestroyed()).length;
	}
}
export const lessonPlayerOwners = new LessonPlayerOwners();

const codeOf = (error: unknown): LessonPlayerCode =>
	error instanceof PlayerError
		? error.code
		: error instanceof LessonPackageError
			? error.code
			: "lesson-package-invalid";

/**
 * Player routes. `launch` is for the editor only; the rest serve only the exact registered player
 * page. Nothing here accepts a path from a renderer: the native folder picker is the only authority.
 */
export function registerLessonPlayerHandlers(deps: {
	owners: LessonPlayerOwners;
	isEditorFrame: (event: IpcMainInvokeEvent) => boolean;
	openWindow: () => void;
	pickDirectory: (event: IpcMainInvokeEvent) => Promise<string | null>;
	inspect?: typeof openSelectedLessonPackage;
}) {
	const inspect = deps.inspect ?? openSelectedLessonPackage;
	const ownerOf = (event: IpcMainInvokeEvent) => {
		const owner = deps.owners.get(event?.sender);
		return owner?.isPage(event) ? owner : undefined;
	};
	ipcMain.handle("lesson-player:launch", (event) => {
		if (
			!event?.sender ||
			event.senderFrame !== event.sender.mainFrame ||
			!deps.isEditorFrame(event)
		)
			return { success: false, code: "lesson-player-unavailable" };
		if (deps.owners.count() >= MAX_PLAYER_WINDOWS)
			return { success: false, code: "lesson-player-limit" };
		deps.openWindow();
		return { success: true, result: { status: "launched" } };
	});
	ipcMain.handle("lesson-player:open", async (event) => {
		const owner = ownerOf(event);
		if (!owner) return { success: false, code: "lesson-player-unavailable" };
		try {
			return {
				success: true,
				result: await owner.open(event, () => deps.pickDirectory(event), inspect),
			};
		} catch (error) {
			return { success: false, code: codeOf(error) };
		}
	});
	ipcMain.handle("lesson-player:cancel", (event) => {
		ownerOf(event)?.cancel();
	});
	ipcMain.handle("lesson-player:close", (event) => {
		ownerOf(event)?.release();
	});
}
