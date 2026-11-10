import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_PLAYER_PLACES, type PlayerPlace, PlayerProgressStore } from "./playerProgress";

let root: string, dir: string, store: PlayerProgressStore;
const current = () => undefined;
const place = (fingerprint = "a".repeat(64), extra: Partial<PlayerPlace> = {}): PlayerPlace => ({
	fingerprint,
	stepId: randomUUID(),
	timeSec: 12.5,
	speed: 1.25,
	loop: true,
	...extra,
});
const file = () => path.join(dir, "progress.json");
const listing = async () => (await fs.readdir(dir).catch(() => [])).sort();
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "player-progress-"));
	dir = path.join(root, "lesson-player-progress");
	store = new PlayerProgressStore(dir);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

it("creates nothing until an explicit save, then keeps only the minimal record, privately", async () => {
	expect(await store.get("a".repeat(64), current)).toBeNull();
	expect(await store.clear("a".repeat(64), current)).toBe(false);
	await expect(fs.stat(dir)).rejects.toThrow();
	const saved = place();
	await store.save(saved, current);
	expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
	expect((await fs.stat(file())).mode & 0o777).toBe(0o600);
	expect(await listing()).toEqual(["progress.json"]);
	expect(JSON.parse(await fs.readFile(file(), "utf8"))).toEqual({
		format: "openscreen-lesson-player-places",
		version: 1,
		places: [saved],
	});
	expect(await store.get(saved.fingerprint, current)).toEqual(saved);
	// Saving the same package again replaces its one place.
	const later = { ...saved, timeSec: 3, loop: false };
	await store.save(later, current);
	expect(await store.get(saved.fingerprint, current)).toEqual(later);
	expect(await store.clear(saved.fingerprint, current)).toBe(true);
	expect(await store.get(saved.fingerprint, current)).toBeNull();
	expect(await listing()).toEqual(["progress.json"]);
});

it("refuses malformed places before touching the store", async () => {
	for (const bad of [
		{ ...place(), speed: 2 },
		{ ...place(), timeSec: Number.NaN },
		{ ...place(), timeSec: 121 },
		{ ...place(), fingerprint: "not-a-hash" },
		{ ...place(), extra: "PRIVATE_PATH" },
	])
		expect(() => store.save(bad as PlayerPlace, current)).toThrow();
	await expect(fs.stat(dir)).rejects.toThrow();
});

it.each([
	["not JSON", "{"],
	[
		"unknown fields",
		JSON.stringify({
			format: "openscreen-lesson-player-places",
			version: 1,
			places: [],
			path: "/x",
		}),
	],
	[
		"a duplicated package",
		JSON.stringify({
			format: "openscreen-lesson-player-places",
			version: 1,
			places: [place(), place()],
		}),
	],
	["too large", "x".repeat(70 * 1024)],
])("refuses a store that is %s, never repairing or overwriting it", async (_label, bytes) => {
	await fs.mkdir(dir, { mode: 0o700 });
	await fs.writeFile(file(), bytes);
	for (const action of [
		() => store.get("a".repeat(64), current),
		() => store.save(place(), current),
		() => store.clear("a".repeat(64), current),
	])
		await expect(action()).rejects.toHaveProperty("code", "lesson-progress-unavailable");
	expect(await fs.readFile(file(), "utf8")).toBe(bytes);
	// The learner's explicit Clear all is the way out.
	await store.clearAll(current);
	expect(await listing()).toEqual([]);
	await store.save(place(), current);
});

it("refuses a linked store directory or file, and Clear all removes only the link", async () => {
	const elsewhere = path.join(root, "elsewhere");
	await fs.mkdir(elsewhere);
	await fs.symlink(elsewhere, dir);
	await expect(store.save(place(), current)).rejects.toHaveProperty(
		"code",
		"lesson-progress-unavailable",
	);
	expect(await fs.readdir(elsewhere)).toEqual([]);
	await fs.rm(dir);
	await fs.mkdir(dir, { mode: 0o700 });
	const target = path.join(root, "target.json");
	const valid = JSON.stringify({
		format: "openscreen-lesson-player-places",
		version: 1,
		places: [],
	});
	await fs.writeFile(target, valid);
	await fs.symlink(target, file());
	await expect(store.get("a".repeat(64), current)).rejects.toHaveProperty(
		"code",
		"lesson-progress-unavailable",
	);
	await expect(store.save(place(), current)).rejects.toHaveProperty(
		"code",
		"lesson-progress-unavailable",
	);
	await store.clearAll(current);
	expect(await fs.readFile(target, "utf8")).toBe(valid);
	expect(await listing()).toEqual([]);
});

it("refuses a new place when full, never dropping anyone's saved place, but still updates one", async () => {
	const places = Array.from({ length: MAX_PLAYER_PLACES }, (_, i) =>
		place(i.toString(16).padStart(64, "0")),
	);
	await fs.mkdir(dir, { mode: 0o700 });
	await fs.writeFile(
		file(),
		JSON.stringify({ format: "openscreen-lesson-player-places", version: 1, places }),
	);
	const before = await fs.readFile(file(), "utf8");
	await expect(store.save(place("f".repeat(64)), current)).rejects.toHaveProperty(
		"code",
		"lesson-progress-full",
	);
	expect(await fs.readFile(file(), "utf8")).toBe(before);
	await store.save({ ...places[0], timeSec: 1 }, current);
	expect((await store.get(places[0].fingerprint, current))?.timeSec).toBe(1);
	expect(JSON.parse(await fs.readFile(file(), "utf8")).places).toHaveLength(MAX_PLAYER_PLACES);
});

it("checks the caller's ticket after reading and right before writing", async () => {
	const saved = place();
	await store.save(saved, current);
	const before = await fs.readFile(file(), "utf8");
	let calls = 0;
	const endsOnSecondCheck = () => {
		if (++calls >= 2) throw new Error("ticket ended");
	};
	await expect(store.save({ ...saved, timeSec: 99 }, endsOnSecondCheck)).rejects.toThrow(
		"ticket ended",
	);
	calls = 0;
	await expect(store.clear(saved.fingerprint, endsOnSecondCheck)).rejects.toThrow("ticket ended");
	calls = 0;
	await expect(store.get(saved.fingerprint, endsOnSecondCheck)).rejects.toThrow("ticket ended");
	expect(await fs.readFile(file(), "utf8")).toBe(before);
	expect(await listing()).toEqual(["progress.json"]);
});

it("applies concurrent actions from several windows in one order, with no resurrection", async () => {
	const fingerprint = "b".repeat(64);
	const first = place(fingerprint, { timeSec: 1 }),
		second = place(fingerprint, { timeSec: 2 });
	const results = await Promise.all([
		store.save(first, current),
		store.clear(fingerprint, current),
		store.get(fingerprint, current),
		store.save(second, current),
		store.get(fingerprint, current),
	]);
	expect(results[1]).toBe(true);
	expect(results[2]).toBeNull();
	expect(results[4]).toEqual(second);
	expect(await listing()).toEqual(["progress.json"]);
});

it("leaves no staged file behind when a write fails", async () => {
	await store.save(place(), current);
	const before = await fs.readFile(file(), "utf8");
	vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk"));
	await expect(store.save(place("c".repeat(64)), current)).rejects.toHaveProperty(
		"code",
		"lesson-progress-unavailable",
	);
	expect(await listing()).toEqual(["progress.json"]);
	expect(await fs.readFile(file(), "utf8")).toBe(before);
});
