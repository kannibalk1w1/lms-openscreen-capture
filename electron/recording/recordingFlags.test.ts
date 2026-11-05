import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordingFlags, readRecordingFlags } from "./recordingFlags";

let directory: string;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-flags-"));
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});
function fixture(available = true) {
	let now = 1000;
	const keys = { register: vi.fn(() => available), unregister: vi.fn() };
	const flags = new RecordingFlags(keys, () => now);
	return {
		flags,
		keys,
		advance: (ms: number) => {
			now += ms;
		},
	};
}
it("registers only for a running take, drops global flags on the monotonic clock, and excludes pauses", async () => {
	const { flags, keys, advance } = fixture();
	expect(flags.add()).toBeNull();
	flags.start();
	expect(keys.register).toHaveBeenCalledWith("CommandOrControl+Shift+F", expect.any(Function));
	advance(1000);
	flags.add();
	advance(100);
	expect(flags.add()).toBeNull();
	flags.pause(true);
	advance(5000);
	expect(flags.add()).toBeNull();
	flags.pause(false);
	advance(1000);
	flags.add();
	flags.stop();
	advance(5000);
	expect(flags.add()).toBeNull();
	const file = path.join(directory, "take.mp4");
	await flags.persist(file);
	expect((await readRecordingFlags(file)).map((f) => f.timeMs)).toEqual([1000, 2100]);
	expect(keys.unregister).toHaveBeenCalledWith("CommandOrControl+Shift+F");
	await flags.persist(path.join(directory, "wrong-take.mp4"));
	await expect(fs.stat(path.join(directory, "wrong-take.mp4.flags.json"))).rejects.toMatchObject({
		code: "ENOENT",
	});
});
it("keeps a button fallback when global registration fails and permits rebinding", () => {
	const { flags, keys, advance } = fixture(false);
	flags.start();
	expect(flags.status()).toMatchObject({ shortcutAvailable: false, error: "shortcut-unavailable" });
	advance(500);
	expect(flags.add()).not.toBeNull();
	keys.register.mockReturnValue(true);
	flags.configure({ key: "F8" });
	expect(keys.register).toHaveBeenLastCalledWith("F8", expect.any(Function));
	expect(flags.status().shortcutAvailable).toBe(true);
});
it("discards flags and starts the next take with a fresh clock", async () => {
	const { flags, advance } = fixture();
	flags.start();
	advance(1000);
	flags.add();
	flags.stop(true);
	const file = path.join(directory, "cancelled.mp4");
	await flags.persist(file);
	expect(await readRecordingFlags(file)).toEqual([]);
	flags.start();
	advance(500);
	flags.add();
	const next = path.join(directory, "next.mp4");
	await flags.persist(next);
	expect((await readRecordingFlags(next)).map((f) => f.timeMs)).toEqual([500]);
});
it("does not import malformed or oversized flag journals", async () => {
	const file = path.join(directory, "bad.mp4");
	await fs.writeFile(
		`${file}.flags.json`,
		JSON.stringify({ version: 1, flags: [{ id: "f", timeMs: -1 }] }),
	);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {
		/* Expected rejection of the invalid sidecar. */
	});
	expect(await readRecordingFlags(file)).toEqual([]);
	expect(warn).toHaveBeenCalled();
	await fs.writeFile(`${file}.flags.json`, Buffer.alloc(2 * 1024 * 1024 + 1));
	expect(await readRecordingFlags(file)).toEqual([]);
	warn.mockRestore();
});
it("distinguishes portal requests from observed hotkeys and makes stale portal callbacks harmless", async () => {
	let now = 0;
	const callbacks = new Map<string, () => void>();
	const idle = vi.fn();
	const flags = new RecordingFlags(
		{
			register: (key, callback) => {
				callbacks.set(key, callback);
				return true;
			},
			unregister: vi.fn(),
			requiresApproval: () => true,
			onIdleTrigger: idle,
		},
		() => now,
	);
	flags.start();
	expect(flags.status()).toMatchObject({
		shortcutAvailable: false,
		error: "shortcut-approval-pending",
	});
	now = 1000;
	callbacks.get("CommandOrControl+Shift+F")!();
	expect(flags.status()).toMatchObject({ shortcutAvailable: true, count: 1 });
	flags.configure({ key: "F8" });
	now = 2000;
	callbacks.get("CommandOrControl+Shift+F")!();
	expect(flags.status().count).toBe(1);
	callbacks.get("F8")!();
	expect(flags.status().count).toBe(2);
	await flags.persist(path.join(directory, "portal.mp4"));
	callbacks.get("F8")!();
	expect(idle).toHaveBeenCalledOnce();
	expect(flags.status().count).toBe(2);
});
