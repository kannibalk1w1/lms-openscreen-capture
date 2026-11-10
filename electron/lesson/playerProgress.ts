import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LESSON_PLAYER_SPEEDS } from "../../src/lib/lesson/player";

/** Saved places kept at most; a full store refuses new places rather than dropping any. */
export const MAX_PLAYER_PLACES = 100;
/** The whole store file is never larger than this. */
export const MAX_PLAYER_PROGRESS_BYTES = 64 * 1024;
const FILE = "progress.json";

/**
 * One learner-saved place in one exact verified package. Deliberately minimal: no lesson text, code,
 * paths, names or times of day. It is a bookmark on this computer, not a record of learning.
 */
export const playerPlaceSchema = z
	.object({
		fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
		stepId: z.string().uuid(),
		timeSec: z.number().finite().min(0).max(120),
		speed: z
			.number()
			.refine((value) => (LESSON_PLAYER_SPEEDS as readonly number[]).includes(value)),
		loop: z.boolean(),
	})
	.strict();
export type PlayerPlace = {
	fingerprint: string;
	stepId: string;
	timeSec: number;
	speed: number;
	loop: boolean;
};
const storeSchema = z
	.object({
		format: z.literal("openscreen-lesson-player-places"),
		version: z.literal(1),
		places: z.array(playerPlaceSchema).max(MAX_PLAYER_PLACES),
	})
	.strict()
	.refine(
		(store) => new Set(store.places.map((place) => place.fingerprint)).size === store.places.length,
	);
type Store = { format: "openscreen-lesson-player-places"; version: 1; places: PlayerPlace[] };
const empty = (): Store => ({ format: "openscreen-lesson-player-places", version: 1, places: [] });

export class PlayerProgressError extends Error {
	constructor(readonly code: "lesson-progress-unavailable" | "lesson-progress-full") {
		super(code);
	}
}
const unavailable = () => new PlayerProgressError("lesson-progress-unavailable");
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

/**
 * The learner's explicitly saved places, private to this user, separate from the authoring recovery
 * store. Every operation is serialized across all player windows, so concurrent saves and clears
 * apply in one order. `assertCurrent` is the caller's ticket: it is checked after reading and
 * immediately before any write, so a released or replaced package never writes or restores.
 */
export class PlayerProgressStore {
	private queue: Promise<unknown> = Promise.resolve();
	constructor(private readonly root: string) {}

	private serial<T>(run: () => Promise<T>): Promise<T> {
		const next = this.queue.then(run, run);
		this.queue = next.catch(() => undefined);
		return next;
	}
	/** The store directory, if it exists, must be a real private directory, never a link. */
	private async rootState(create: boolean) {
		try {
			const stats = await fs.lstat(this.root);
			if (!stats.isDirectory()) throw unavailable();
			return true;
		} catch (error) {
			if (!missing(error)) throw error instanceof PlayerProgressError ? error : unavailable();
			if (!create) return false;
			await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
			const stats = await fs.lstat(this.root);
			if (!stats.isDirectory()) throw unavailable();
			return true;
		}
	}
	/** Missing means empty. Anything unreadable, oversized, linked or malformed is refused, not repaired. */
	private async read(): Promise<Store> {
		if (!(await this.rootState(false))) return empty();
		let handle: fs.FileHandle;
		try {
			handle = await fs.open(
				path.join(this.root, FILE),
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
		} catch (error) {
			if (missing(error)) return empty();
			throw unavailable();
		}
		try {
			const stats = await handle.stat();
			if (!stats.isFile() || stats.size > MAX_PLAYER_PROGRESS_BYTES) throw unavailable();
			const bytes = await handle.readFile();
			if (bytes.length > MAX_PLAYER_PROGRESS_BYTES) throw unavailable();
			const parsed = storeSchema.safeParse(JSON.parse(bytes.toString("utf8")));
			if (!parsed.success) throw unavailable();
			return parsed.data as Store;
		} catch {
			throw unavailable();
		} finally {
			await handle.close();
		}
	}
	/** A private staged file, flushed, then atomically renamed over the store. */
	private async write(store: Store) {
		const bytes = Buffer.from(`${JSON.stringify(store)}\n`);
		if (bytes.length > MAX_PLAYER_PROGRESS_BYTES)
			throw new PlayerProgressError("lesson-progress-full");
		await this.rootState(true);
		const stage = path.join(this.root, `.${FILE}.${randomUUID()}.partial`);
		const handle = await fs.open(
			stage,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			try {
				await handle.writeFile(bytes);
				await handle.sync();
			} finally {
				await handle.close();
			}
			const target = path.join(this.root, FILE);
			try {
				const existing = await fs.lstat(target);
				if (!existing.isFile()) throw unavailable();
			} catch (error) {
				if (!missing(error)) throw unavailable();
			}
			await fs.rename(stage, target);
		} catch (error) {
			await fs.rm(stage, { force: true }).catch(() => undefined);
			throw error instanceof PlayerProgressError ? error : unavailable();
		}
	}

	get(fingerprint: string, assertCurrent: () => void): Promise<PlayerPlace | null> {
		return this.serial(async () => {
			assertCurrent();
			const store = await this.read();
			assertCurrent();
			return store.places.find((place) => place.fingerprint === fingerprint) ?? null;
		});
	}
	/** Replaces this package's place, or adds it; refuses when the store is full. */
	save(place: PlayerPlace, assertCurrent: () => void): Promise<void> {
		const parsed = playerPlaceSchema.parse(place) as PlayerPlace;
		return this.serial(async () => {
			assertCurrent();
			const store = await this.read();
			const others = store.places.filter((p) => p.fingerprint !== parsed.fingerprint);
			if (others.length >= MAX_PLAYER_PLACES) throw new PlayerProgressError("lesson-progress-full");
			assertCurrent();
			await this.write({ ...store, places: [...others, parsed] });
		});
	}
	/** Removes only this package's place. */
	clear(fingerprint: string, assertCurrent: () => void): Promise<boolean> {
		return this.serial(async () => {
			assertCurrent();
			const store = await this.read();
			const kept = store.places.filter((p) => p.fingerprint !== fingerprint);
			if (kept.length === store.places.length) return false;
			assertCurrent();
			await this.write({ ...store, places: kept });
			return true;
		});
	}
	/**
	 * The learner's explicit "clear all saved places": removes the store file only. This is also the
	 * explicit way out of an unreadable store; nothing else in the directory is touched.
	 */
	clearAll(assertCurrent: () => void): Promise<void> {
		return this.serial(async () => {
			assertCurrent();
			if (!(await this.rootState(false))) return;
			const target = path.join(this.root, FILE);
			try {
				const stats = await fs.lstat(target);
				if (!stats.isFile() && !stats.isSymbolicLink()) throw unavailable();
			} catch (error) {
				if (missing(error)) return;
				throw unavailable();
			}
			assertCurrent();
			// unlink removes a link itself, never what it points at.
			await fs.unlink(target);
		});
	}
}
