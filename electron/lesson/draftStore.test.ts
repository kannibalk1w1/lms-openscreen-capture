import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { MAX_LOCAL_DRAFT_BYTES, MAX_LOCAL_DRAFTS } from "../../src/lib/lesson/drafts";
import { LessonDraftStore } from "./draftStore";

const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-recovery-"));
	roots.push(root);
	const location = path.join(root, "copies");
	return { root, location, store: new LessonDraftStore(location) };
}
it("creates no storage by default and explicitly retains immutable complete source copies", async () => {
	const f = await fixture();
	expect((await f.store.status()).copies).toBe(0);
	await expect(fs.stat(f.location)).rejects.toThrow();
	const step = {
			...newStep("Source"),
			instructions: "Retain this",
			code: { language: "plain", text: "PRIVATE_RECOVERY_SOURCE_CANARY" },
		},
		lesson = {
			...newLesson(),
			steps: [step],
			output: {
				version: 1 as const,
				preset: "standard" as const,
				language: "en",
				direction: "auto" as const,
				includeImages: false,
				includeCode: false,
			},
		};
	const a = await f.store.save(lesson),
		bytes = await fs.readFile(a.path),
		b = await f.store.save({ ...lesson, revision: 1, title: "Later" });
	expect(a.id).not.toBe(b.id);
	expect(await fs.readFile(a.path)).toEqual(bytes);
	expect((await f.store.read(a.id)).steps[0].code?.text).toBe("PRIVATE_RECOVERY_SOURCE_CANARY");
	expect(
		(await new LessonDraftStore(f.location).list()).map((copy) => copy.revision).sort(),
	).toEqual([0, 1]);
	expect((await fs.readdir(f.location)).some((name) => name.startsWith(".pending-"))).toBe(false);
	if (process.platform !== "win32") {
		expect((await fs.stat(f.location)).mode & 0o777).toBe(0o700);
		expect((await fs.stat(a.path)).mode & 0o777).toBe(0o600);
	}
});
it("serializes concurrent explicit saves and enforces the copy limit without replacing earlier work", async () => {
	const f = await fixture(),
		lesson = { ...newLesson(), steps: [newStep()] };
	const results = await Promise.allSettled(Array.from({ length: 6 }, () => f.store.save(lesson)));
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
	expect(results.filter((result) => result.status === "rejected")).toHaveLength(2);
	for (let n = 4; n < MAX_LOCAL_DRAFTS; n++) await f.store.save(lesson);
	await expect(f.store.save(lesson)).rejects.toMatchObject({ code: "local-draft-limit" });
	expect(await f.store.list()).toHaveLength(MAX_LOCAL_DRAFTS);
	expect((await f.store.status()).copies).toBe(MAX_LOCAL_DRAFTS);
});
it("counts interrupted temporary bytes toward retention quota", async () => {
	const f = await fixture();
	await fs.mkdir(f.location, { mode: 0o700 });
	const pending = path.join(f.location, ".pending-interrupted");
	await fs.writeFile(pending, "original");
	await fs.truncate(pending, MAX_LOCAL_DRAFT_BYTES);
	await expect(f.store.save(newLesson())).rejects.toMatchObject({ code: "local-draft-limit" });
	expect((await fs.stat(pending)).size).toBe(MAX_LOCAL_DRAFT_BYTES);
	expect((await f.store.status()).bytes).toBe(MAX_LOCAL_DRAFT_BYTES);
});
it("preserves existing copies on failed publication and permits a later explicit retry", async () => {
	const f = await fixture(),
		a = await f.store.save(newLesson("Original")),
		bytes = await fs.readFile(a.path);
	const link = vi.spyOn(fs, "link").mockRejectedValueOnce(new Error("PRIVATE_DISK_FAILURE_CANARY"));
	await expect(f.store.save(newLesson("Fail"))).rejects.toThrow();
	link.mockRestore();
	expect(await fs.readFile(a.path)).toEqual(bytes);
	expect(await fs.readdir(f.location)).toHaveLength(1);
	await f.store.save(newLesson("Retry"));
	expect((await f.store.status()).copies).toBe(2);
});
it("lists corrupt copies without exposing raw payload and restricts recovery/deletion to validated identities", async () => {
	const f = await fixture(),
		a = await f.store.save(newLesson());
	await fs.writeFile(a.path, "PRIVATE_BAD_DRAFT_CANARY");
	const list = await f.store.list();
	expect(list[0].readable).toBe(false);
	expect(JSON.stringify(list)).not.toContain("PRIVATE_BAD_DRAFT_CANARY");
	await expect(f.store.read("../outside")).rejects.toThrow();
	await expect(f.store.remove("../outside")).rejects.toThrow();
	expect(await f.store.remove(a.id)).toEqual({ removed: true });
	expect(await f.store.remove(a.id)).toEqual({ removed: false });
});
it.skipIf(process.platform === "win32")(
	"rejects a root symlink and never follows a recovery-copy symlink",
	async () => {
		const f = await fixture(),
			outside = path.join(f.root, "outside.json");
		await fs.writeFile(outside, "PRESERVED_EXTERNAL_CANARY");
		await fs.mkdir(f.location, { mode: 0o700 });
		const id = crypto.randomUUID();
		await fs.symlink(outside, path.join(f.location, `${id}.openscreen-lesson.json`));
		await expect(f.store.read(id)).rejects.toThrow("regular");
		expect((await f.store.list())[0].readable).toBe(false);
		await f.store.remove(id);
		expect(await fs.readFile(outside, "utf8")).toBe("PRESERVED_EXTERNAL_CANARY");
		const alias = path.join(f.root, "alias");
		await fs.symlink(f.location, alias);
		const aliased = new LessonDraftStore(alias);
		await expect(aliased.save(newLesson())).rejects.toThrow();
		const kept = await f.store.save(newLesson("Preserve through alias"));
		await expect(aliased.read(kept.id)).rejects.toThrow();
		await expect(aliased.remove(kept.id)).rejects.toThrow();
		expect((await f.store.read(kept.id)).title).toBe("Preserve through alias");
	},
);
it.skipIf(process.platform === "win32")(
	"refuses nonprivate existing recovery folders without changing their permissions",
	async () => {
		const f = await fixture();
		await fs.mkdir(f.location, { mode: 0o755 });
		await fs.chmod(f.location, 0o755);
		await expect(f.store.save(newLesson())).rejects.toMatchObject({
			code: "local-draft-unavailable",
		});
		expect((await fs.stat(f.location)).mode & 0o777).toBe(0o755);
		expect(await fs.readdir(f.location)).toEqual([]);
	},
);
it("bounds manually overpopulated listings and reports a lower-bound inventory", async () => {
	const f = await fixture();
	await fs.mkdir(f.location, { mode: 0o700 });
	await Promise.all(
		Array.from({ length: MAX_LOCAL_DRAFTS + 3 }, () =>
			fs.writeFile(
				path.join(f.location, `${crypto.randomUUID()}.openscreen-lesson.json`),
				"invalid",
			),
		),
	);
	const status = await f.store.status();
	expect(status.limited).toBe(true);
	expect(status.copies).toBe(MAX_LOCAL_DRAFTS + 1);
	expect((await f.store.list()).length).toBeLessThanOrEqual(MAX_LOCAL_DRAFTS);
	await expect(f.store.save(newLesson())).rejects.toMatchObject({ code: "local-draft-limit" });
});
