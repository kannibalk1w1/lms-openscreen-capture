import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { LessonOperationError } from "../../src/lib/lesson/api";
import {
	type LocalDraftEntry,
	type LocalDraftStatus,
	MAX_LOCAL_DRAFT_BYTES,
	MAX_LOCAL_DRAFTS,
} from "../../src/lib/lesson/drafts";
import { validateLesson } from "../../src/lib/lesson/schema";
import { readLessonFile } from "./readLessonFile";

const identity = z.string().uuid();
const suffix = ".openscreen-lesson.json";
/** Explicit immutable recovery copies, separate from projects and ordinary save paths. */
export class LessonDraftStore {
	private queue: Promise<unknown> = Promise.resolve();
	private pendingMutations = 0;
	constructor(private readonly root: string) {}
	private async entries() {
		const result: Array<{ name: string; file: string; stat: import("node:fs").Stats }> = [];
		let limited = false;
		let directory: import("node:fs").Dir;
		try {
			const root = await fs.lstat(this.root);
			if (!root.isDirectory()) throw new LessonOperationError("local-draft-unavailable");
			directory = await fs.opendir(this.root);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: result, limited };
			throw error;
		}
		let scanned = 0;
		for await (const entry of directory) {
			if (++scanned > 4096) {
				limited = true;
				break;
			}
			const name = entry.name;
			if (!name.endsWith(suffix) && !name.startsWith(".pending-")) continue;
			if (result.length >= MAX_LOCAL_DRAFTS + 1) {
				limited = true;
				break;
			}
			const file = path.join(this.root, name);
			try {
				result.push({ name, file, stat: await fs.lstat(file) });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		return { items: result, limited };
	}
	async status(): Promise<LocalDraftStatus> {
		const { items: entries, limited } = await this.entries();
		return {
			limited,
			path: this.root,
			copies: entries.length,
			bytes: entries.reduce((sum, entry) => sum + entry.stat.size, 0),
			maxCopies: MAX_LOCAL_DRAFTS,
			maxBytes: MAX_LOCAL_DRAFT_BYTES,
		};
	}
	private serial<T>(work: () => Promise<T>): Promise<T> {
		if (this.pendingMutations >= 4)
			return Promise.reject(new LessonOperationError("local-draft-unavailable"));
		this.pendingMutations++;
		const pending = this.queue.catch(() => undefined).then(work);
		this.queue = pending;
		return pending.finally(() => {
			this.pendingMutations--;
		});
	}
	async save(input: unknown) {
		return this.serial(async () => {
			const lesson = await validateLesson(input),
				content = Buffer.from(JSON.stringify(lesson, null, 2) + "\n");
			// Pretty-print expansion is part of the retained byte budget too.
			if (content.length > 16 * 1024 * 1024) throw new LessonOperationError("local-draft-limit");
			const status = await this.status();
			if (
				status.limited ||
				status.copies >= MAX_LOCAL_DRAFTS ||
				status.bytes + content.length > MAX_LOCAL_DRAFT_BYTES
			)
				throw new LessonOperationError("local-draft-limit");
			await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
			const directory = await fs.lstat(this.root);
			if (
				!directory.isDirectory() ||
				(process.platform !== "win32" && (directory.mode & 0o077) !== 0)
			)
				throw new LessonOperationError("local-draft-unavailable");
			const id = randomUUID(),
				target = path.join(this.root, id + suffix),
				temporary = path.join(this.root, `.pending-${randomUUID()}`);
			let created = false;
			try {
				const file = await fs.open(temporary, "wx", 0o600);
				created = true;
				try {
					await file.writeFile(content);
					await file.sync();
				} finally {
					await file.close();
				}
				// Same-directory hard link commits only a new name; it cannot overwrite another copy.
				await fs.link(temporary, target);
				return { id, path: target, lessonId: lesson.id, revision: lesson.revision };
			} finally {
				if (created) await fs.unlink(temporary).catch(() => undefined);
			}
		});
	}
	async list(): Promise<LocalDraftEntry[]> {
		const { items: entries } = await this.entries();
		const result: LocalDraftEntry[] = [];
		// Respect limits even if the directory was manually populated outside the app.
		for (const entry of entries
			.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
			.slice(0, MAX_LOCAL_DRAFTS)) {
			const id = entry.name.slice(0, -suffix.length);
			if (!entry.name.endsWith(suffix) || !identity.safeParse(id).success) continue;
			try {
				const lesson = await readLessonFile(entry.file);
				result.push({
					id,
					title: lesson.title,
					revision: lesson.revision,
					bytes: entry.stat.size,
					savedAt: entry.stat.mtime.toISOString(),
					readable: true,
				});
			} catch {
				result.push({
					id,
					title: "",
					revision: 0,
					bytes: entry.stat.size,
					savedAt: entry.stat.mtime.toISOString(),
					readable: false,
				});
			}
		}
		return result;
	}
	private async checkRoot() {
		if (!(await fs.lstat(this.root)).isDirectory())
			throw new LessonOperationError("local-draft-unavailable");
	}
	async read(id: unknown) {
		const key = identity.parse(id);
		await this.checkRoot();
		return readLessonFile(path.join(this.root, key + suffix));
	}
	async remove(id: unknown) {
		const key = identity.parse(id);
		return this.serial(async () => {
			try {
				await this.checkRoot();
				await fs.unlink(path.join(this.root, key + suffix));
				return { removed: true };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return { removed: false };
				throw error;
			}
		});
	}
}
