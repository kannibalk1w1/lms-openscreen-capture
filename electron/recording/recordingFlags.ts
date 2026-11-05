import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
	type RecordingClock,
	type RecordingFlag,
	recordingFlagsFileSchema,
} from "../../src/lib/recordingFlags";
import { DEFAULT_SHORTCUTS, type ShortcutBinding } from "../../src/lib/shortcuts";
import { bindingToAccelerator } from "../shortcutAccelerator";

/** Monotonic, pause-compacted take clock. Portal registrations may outlive unregister
 * in Electron 41; their inactive callbacks route only to the focused editor. */
export class RecordingFlags {
	private clock: RecordingClock | undefined;
	private binding = DEFAULT_SHORTCUTS.addFlag;
	private accelerator: string | null = null;
	private running = false;
	private pausedAt: number | null = null;
	private startAt = 0;
	private pausedMs = 0;
	private flags: RecordingFlag[] = [];
	private pending = false;
	private lastFlagAt = -Infinity;
	private error: string | null = null;
	private verifiedKeys = new Set<string>();
	constructor(
		private readonly keys: {
			register: (key: string, callback: () => void) => boolean;
			unregister: (key: string) => void;
			requiresApproval?: () => boolean;
			onIdleTrigger?: () => void;
		},
		private readonly now = () => performance.now(),
	) {}
	configure(value: unknown) {
		const b = value as Partial<ShortcutBinding> | null;
		this.binding =
			b && typeof b.key === "string" && b.key.length > 0 && b.key.length < 40
				? { key: b.key, ctrl: b.ctrl === true, shift: b.shift === true, alt: b.alt === true }
				: DEFAULT_SHORTCUTS.addFlag;
		if (this.running) this.register();
	}
	private unregister() {
		if (this.accelerator) this.keys.unregister(this.accelerator);
		this.accelerator = null;
	}
	private register() {
		this.unregister();
		try {
			const key = bindingToAccelerator(this.binding);
			if (
				!this.keys.register(key, () => {
					// Old portal callbacks can survive unregister; rebinding must retire them.
					if (key !== bindingToAccelerator(this.binding)) return;
					this.verifiedKeys.add(key);
					this.error = null;
					if (this.running) this.add();
					else this.keys.onIdleTrigger?.();
				})
			)
				throw new Error("unavailable");
			this.accelerator = key;
			this.error =
				this.keys.requiresApproval?.() && !this.verifiedKeys.has(key)
					? "shortcut-approval-pending"
					: null;
		} catch {
			this.error = "shortcut-unavailable";
		}
	}
	start() {
		if (this.running) return;
		this.running = true;
		this.pending = true;
		this.startAt = this.now();
		this.clock = {
			sessionId: randomUUID(),
			clock: "recording-control-active-ms",
			segments: [{ id: randomUUID(), startMs: 0, endMs: 0 }],
		};
		this.pausedAt = null;
		this.pausedMs = 0;
		this.flags = [];
		this.lastFlagAt = -Infinity;
		this.register();
	}
	pause(paused: boolean) {
		if (!this.running) return;
		if (paused && this.pausedAt === null) {
			this.closeSegment();
			this.pausedAt = this.now();
		}
		if (!paused && this.pausedAt !== null) {
			this.pausedMs += this.now() - this.pausedAt;
			this.pausedAt = null;
			const last = this.clock?.segments.at(-1);
			if (this.clock && this.clock.segments.length >= 1000) this.clock = undefined;
			else if (last)
				this.clock?.segments.push({ id: randomUUID(), startMs: last.endMs, endMs: last.endMs });
		}
	}
	private closeSegment() {
		const segment = this.clock?.segments.at(-1);
		if (segment && this.pausedAt === null)
			segment.endMs = Math.max(
				segment.startMs,
				Math.round(this.now() - this.startAt - this.pausedMs),
			);
	}
	add(): RecordingFlag | null {
		const now = this.now();
		if (
			!this.running ||
			this.pausedAt !== null ||
			now - this.lastFlagAt < 300 ||
			this.flags.length >= 10000
		)
			return null;
		const flag = {
			id: randomUUID(),
			timeMs: Math.max(0, Math.round(now - this.startAt - this.pausedMs)),
			label: "",
			segmentId: this.clock?.segments.at(-1)?.id,
		};
		this.flags.push(flag);
		this.lastFlagAt = now;
		return flag;
	}
	stop(discard = false) {
		if (this.running) this.closeSegment();
		this.running = false;
		this.unregister();
		if (discard) {
			this.pending = false;
			this.clock = undefined;
			this.flags = [];
		}
	}
	status() {
		return {
			running: this.running,
			paused: this.pausedAt !== null,
			count: this.flags.length,
			shortcut: this.binding,
			shortcutAvailable: this.accelerator !== null && this.error === null,
			error: this.error,
		};
	}
	async persist(videoPath: string) {
		if (!this.pending) return;
		this.stop();
		const snapshot = this.flags;
		this.pending = false;
		if (this.clock || snapshot.length)
			await fs.writeFile(
				`${videoPath}.flags.json`,
				JSON.stringify({ version: 1, flags: snapshot, recordingClock: this.clock }, null, 2),
				"utf8",
			);
	}
}

export async function readRecordingFlagData(videoPath: string) {
	try {
		const file = `${videoPath}.flags.json`;
		if ((await fs.stat(file)).size > 2 * 1024 * 1024) throw new Error("flags file too large");
		return recordingFlagsFileSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT")
			console.warn("[recording-flags] could not read flags", error);
		return { version: 1 as const, flags: [] as RecordingFlag[] };
	}
}

export async function readRecordingFlags(videoPath: string): Promise<RecordingFlag[]> {
	return (await readRecordingFlagData(videoPath)).flags;
}
