import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { newLesson, newStep, reviseLesson } from "../../src/lib/lesson/authoring";
import type { LessonManifest } from "../../src/lib/lesson/schema";
import { grantLessonFile, type LessonFileGrant, replaceLessonFile } from "./lessonFile";

let root: string, target: string, original: LessonManifest, originalBytes: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-file-"));
	target = path.join(root, "lesson.openscreen-lesson.json");
	original = { ...newLesson("Original"), steps: [newStep("One")] };
	originalBytes = JSON.stringify(original, null, 2) + "\n";
	await fs.writeFile(target, originalBytes, { mode: 0o644 });
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));
const granted = async () => {
	const value = await grantLessonFile(target);
	if (!value) throw new Error("fixture grant");
	return value.grant;
};
const edited = (title = "Edited") => reviseLesson(original, { title });
// The ordinary case: a caller whose permission context stays current throughout.
const replace = async (grant: LessonFileGrant, input: unknown) =>
	(await replaceLessonFile(grant, input, () => true)).grant;
const leftovers = async () => (await fs.readdir(root)).filter((name) => name.includes(".partial"));

it("replaces exactly the granted file atomically and privately, then allows the next save", async () => {
	const grant = await granted(),
		next = await replace(grant, edited());
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Edited");
	expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
	expect(await leftovers()).toEqual([]);
	expect(await fs.readdir(root)).toEqual(["lesson.openscreen-lesson.json"]);
	expect(next).toMatchObject({ token: grant.token, target, revision: 1 });
	expect(next.identity).not.toBe(grant.identity);
	await replace(next, reviseLesson(edited(), { title: "Again" }));
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Again");
	// The first permission described bytes that no longer exist.
	await expect(replace(grant, edited("Stale"))).rejects.toHaveProperty(
		"code",
		"lesson-file-changed",
	);
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Again");
});
it.each([
	"edited-elsewhere",
	"same-bytes-new-file",
	"deleted",
	"became-symlink",
])("keeps the file on disk and leaves no partial file when it was %s", async (change) => {
	const grant = await granted(),
		elsewhere = JSON.stringify({ ...original, title: "Edited elsewhere" });
	if (change === "edited-elsewhere") await fs.writeFile(target, elsewhere);
	if (change === "same-bytes-new-file") {
		await fs.rm(target);
		await fs.writeFile(target, originalBytes);
	}
	if (change === "deleted") await fs.rm(target);
	if (change === "became-symlink") {
		await fs.rename(target, target + ".moved");
		await fs.symlink(target + ".moved", target);
	}
	await expect(replace(grant, edited())).rejects.toHaveProperty("code", "lesson-file-changed");
	expect(await leftovers()).toEqual([]);
	if (change === "edited-elsewhere") expect(await fs.readFile(target, "utf8")).toBe(elsewhere);
	if (change === "same-bytes-new-file")
		expect(await fs.readFile(target, "utf8")).toBe(originalBytes);
	if (change === "deleted") await expect(fs.stat(target)).rejects.toThrow();
	if (change === "became-symlink")
		expect(await fs.readFile(target + ".moved", "utf8")).toBe(originalBytes);
});
it("refuses a different lesson, an older revision and an invalid lesson without touching the file", async () => {
	const once = await replace(await granted(), edited());
	for (const input of [
		{ ...edited(), id: crypto.randomUUID() },
		{ ...original, title: "Older revision" },
	])
		await expect(replace(once, input)).rejects.toHaveProperty("code", "lesson-file-changed");
	await expect(replace(once, { ...edited(), title: "" })).rejects.toThrow();
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Edited");
	expect(await leftovers()).toEqual([]);
});
it("gives no update permission through a symlinked path, a directory or a non-lesson file", async () => {
	const link = path.join(root, "link.json");
	await fs.symlink(target, link);
	expect(await grantLessonFile(link)).toBeNull();
	expect(await grantLessonFile(root)).toBeNull();
	await fs.writeFile(path.join(root, "other.json"), "{}");
	expect(await grantLessonFile(path.join(root, "other.json"))).toBeNull();
	expect(await grantLessonFile(target, Buffer.from("different"))).toBeNull();
});

// isCurrent is consulted at entry, before staging, in the rename's own synchronous turn, and once
// just after the commit. `endsAt` is the first consultation that sees the context gone.
it.each([
	[1, "before validation"],
	[2, "during validation, before staging"],
	[3, "while the staged copy is read back, before the rename"],
])("refuses and keeps the original bytes when the context ends %#: %s", async (endsAt) => {
	const grant = await granted();
	let calls = 0;
	await expect(
		replaceLessonFile(grant, edited("Stale save"), () => ++calls < endsAt),
	).rejects.toHaveProperty("code", "lesson-file-unavailable");
	expect(calls).toBe(endsAt);
	expect(await fs.readFile(target, "utf8")).toBe(originalBytes);
	expect(await leftovers()).toEqual([]);
	expect(await fs.readdir(root)).toEqual(["lesson.openscreen-lesson.json"]);
});
it("reports honestly when the context ends just after an already-committed replacement", async () => {
	const grant = await granted();
	let calls = 0;
	const result = await replaceLessonFile(grant, edited("Committed"), () => ++calls < 4);
	expect(result.currentAtCommit).toBe(false);
	expect(JSON.parse(await fs.readFile(target, "utf8")).title).toBe("Committed");
	expect(await leftovers()).toEqual([]);
	// With the context current throughout, the same commit is reported as current.
	expect((await replaceLessonFile(result.grant, edited("Again"), () => true)).currentAtCommit).toBe(
		true,
	);
});
