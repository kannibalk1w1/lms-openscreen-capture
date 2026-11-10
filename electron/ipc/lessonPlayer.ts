import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import { z } from "zod";
import {
	LESSON_PLAYER_SPEEDS,
	type LessonPlayerCode,
	type LessonPlayerView,
	lessonPlayerMediaUrl,
} from "../../src/lib/lesson/player";
import { LessonPackageError } from "../lesson/package";
import { digest, identity } from "../lesson/packageIO";
import { type InspectedPackage, openSelectedLessonPackage } from "../lesson/packageOpen";
import {
	type PlayerMediaCapability,
	type PlayerMediaFile,
	servePlayerMedia,
} from "../lesson/playerMedia";
import { PlayerProgressError, type PlayerProgressStore } from "../lesson/playerProgress";

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
	private capability?: PlayerMediaCapability & {
		abort: AbortController;
		/** The verified manifest's digest: binds a saved place to this exact package inventory. */
		fingerprint: string;
		/** Every step, with the longest time a saved place may hold for it (0 without a video). */
		steps: ReadonlyMap<string, number>;
	};
	/** One saved-place action at a time per window; a second is refused, never queued. */
	progressBusy = false;
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
	/**
	 * A ticket for one saved-place action on the package this window has open now, taken before any
	 * await. It stays current only while the same capability and lifetime epoch do.
	 */
	progressTicket(token: string) {
		const capability = this.capability;
		if (!capability || capability.token !== token)
			throw new PlayerError("lesson-player-unavailable");
		const epoch = this.epoch;
		return {
			fingerprint: capability.fingerprint,
			steps: capability.steps,
			assertCurrent: () => {
				if (this.capability !== capability || this.epoch !== epoch)
					throw new PlayerError("lesson-progress-cancelled");
			},
		};
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
		// One open per window at a time, and nothing waits: while an earlier open is still running,
		// or released/cancelled but still unwinding its picker or verification, a new request is
		// refused at once. No request can sit waiting where a later close or cancel would miss it;
		// the learner opens again once the earlier one has settled.
		if (this.pending) throw new PlayerError("lesson-player-busy");
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
				fingerprint: digest(JSON.stringify(inspected.manifest)),
				steps: new Map(
					inspected.lesson.steps.map((step) => [
						step.id,
						inspected.manifest.videos.find((video) => video.stepId === step.id)?.durationSec ?? 0,
					]),
				),
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
		token,
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
	/** The learner's explicitly saved places; absent means saved places are unavailable. */
	progress?: PlayerProgressStore;
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

	// Saved places: explicit learner actions only. Each needs the exact player page, the token of the
	// package open there now, and a strict request; one action per window at a time.
	const tokenSchema = z.string().uuid();
	const placeSchema = z
		.object({
			stepId: z.string().uuid(),
			timeSec: z.number().finite().min(0).max(120),
			speed: z
				.number()
				.refine((value) => (LESSON_PLAYER_SPEEDS as readonly number[]).includes(value)),
			loop: z.boolean(),
		})
		.strict();
	const progressRoute =
		<T>(
			run: (owner: LessonPlayerOwner, store: PlayerProgressStore, ...args: unknown[]) => Promise<T>,
		) =>
		async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
			const owner = ownerOf(event);
			if (!owner) return { success: false, code: "lesson-player-unavailable" };
			if (!deps.progress) return { success: false, code: "lesson-progress-unavailable" };
			if (owner.progressBusy) return { success: false, code: "lesson-player-busy" };
			owner.progressBusy = true;
			try {
				return { success: true, result: await run(owner, deps.progress, ...args) };
			} catch (error) {
				return {
					success: false,
					code:
						error instanceof PlayerProgressError
							? error.code
							: error instanceof PlayerError
								? error.code
								: "lesson-progress-unavailable",
				};
			} finally {
				owner.progressBusy = false;
			}
		};
	const ticketFor = (owner: LessonPlayerOwner, token: unknown) => {
		const parsed = tokenSchema.safeParse(token);
		if (!parsed.success) throw new PlayerError("lesson-player-unavailable");
		return owner.progressTicket(parsed.data);
	};
	ipcMain.handle(
		"lesson-player:place-save",
		progressRoute(async (owner, store, token, input) => {
			const ticket = ticketFor(owner, token);
			const place = placeSchema.safeParse(input);
			if (!place.success) throw new PlayerError("lesson-player-unavailable");
			const limit = ticket.steps.get(place.data.stepId);
			if (limit === undefined || place.data.timeSec > limit + 0.5)
				throw new PlayerError("lesson-player-unavailable");
			await store.save(
				{
					fingerprint: ticket.fingerprint,
					...place.data,
					timeSec: Math.round(Math.min(place.data.timeSec, limit) * 1000) / 1000,
				},
				ticket.assertCurrent,
			);
			// Already committed when this returns: reported honestly even if the window moved on since.
			return { status: "saved" as const };
		}),
	);
	ipcMain.handle(
		"lesson-player:place-restore",
		progressRoute(async (owner, store, token) => {
			const ticket = ticketFor(owner, token);
			const saved = await store.get(ticket.fingerprint, ticket.assertCurrent);
			ticket.assertCurrent();
			const limit = saved ? ticket.steps.get(saved.stepId) : undefined;
			if (!saved || limit === undefined) return { status: "none" as const };
			return {
				status: "restored" as const,
				place: {
					stepId: saved.stepId,
					timeSec: Math.min(saved.timeSec, limit),
					speed: saved.speed,
					loop: saved.loop,
				},
			};
		}),
	);
	ipcMain.handle(
		"lesson-player:place-clear",
		progressRoute(async (owner, store, token) => {
			const ticket = ticketFor(owner, token);
			const removed = await store.clear(ticket.fingerprint, ticket.assertCurrent);
			return { status: "cleared" as const, removed };
		}),
	);
	ipcMain.handle(
		"lesson-player:place-clear-all",
		progressRoute(async (_owner, store) => {
			await store.clearAll(() => undefined);
			return { status: "cleared-all" as const };
		}),
	);
}
