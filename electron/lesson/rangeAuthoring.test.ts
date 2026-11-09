import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import { type RangeAuthoringAuthority, RangeAuthoringService } from "./rangeAuthoring";

let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-author-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = path.join(root, "screen.mp4");
	await fs.writeFile(source, "original source bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Generic, no adapters" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Screen",
			originalPath: source,
			cameraTrack: null,
			durationSec: 1,
			video: { codec: "h264", fps: 30, width: 64, height: 32 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 1,
			timelineStartSec: 0,
			timelineEndSec: 1,
			origin: "user",
			reason: "fixture",
			wordRefs: [],
		},
	];
	doc.legacyEditor = { aspectRatio: "2:1", wallpaper: "#ffffff" };
	const step = newStep(),
		lesson = { ...newLesson(), steps: [step] };
	const request = {
		operationId: randomUUID(),
		lesson,
		stepId: step.id,
		range: {
			projectId: "p",
			documentSha256: await lessonRenderFingerprint(doc),
			startSec: 0,
			endSec: 1,
		},
		intent: "author-current" as const,
	};
	const read = vi.fn(async () => doc);
	const authority: RangeAuthoringAuthority = {
		owner: {},
		projectId: "p",
		assertCurrent: vi.fn(),
		canReadSource: vi.fn(() => true),
	};
	return {
		source,
		doc,
		step,
		lesson,
		request,
		read,
		authority,
		service: new RangeAuthoringService(read),
	};
}
it("explicitly confirms, refreshes changed source with history, and never mutates original lesson/project/source", async () => {
	const f = await fixture(),
		original = JSON.stringify([f.doc, f.lesson]);
	const first = await f.service.confirm(f.request, f.authority);
	expect(first.identity.basis).toBe("explicit-author-current");
	expect(JSON.stringify([f.doc, f.lesson])).toBe(original);
	expect(await fs.readFile(f.source, "utf8")).toBe("original source bytes");
	await fs.writeFile(f.source, "reviewed replacement source");
	const refreshed = await f.service.confirm(
		{
			...f.request,
			operationId: randomUUID(),
			intent: "refresh-current",
			lesson: { ...f.lesson, steps: [{ ...f.step, mediaSelection: first }] },
		},
		f.authority,
	);
	expect(refreshed.identity.basis).toBe("explicit-refresh-current");
	expect(refreshed.identity.sources[0].sha256).not.toBe(first.identity.sources[0].sha256);
	expect(refreshed.previousSelections.at(-1)).toMatchObject({ identity: first.identity });
	expect(JSON.stringify(refreshed)).not.toContain(f.source);
});
it.each([
	{ range: { projectId: "other" } },
	{ range: { projectId: "../private" } },
	{ range: { startSec: -1 } },
	{ range: { endSec: 0 } },
	{ destination: "/PRIVATE" },
	{ selection: { path: "/PRIVATE" } },
	{ intent: "automatic" },
	{ stepId: "not-a-uuid" },
	{ operationId: "bad" },
])("refuses invalid/foreign authority before document reads: %j", async (changes) => {
	const f = await fixture();
	await expect(
		f.service.confirm(
			{ ...f.request, ...changes, range: { ...f.request.range, ...changes.range } },
			f.authority,
		),
	).rejects.toBeDefined();
	expect(f.read).not.toHaveBeenCalled();
});
it("requires the selected lesson step and explicit intent, retaining legacy references until refresh", async () => {
	const f = await fixture();
	await expect(
		f.service.confirm({ ...f.request, stepId: randomUUID() }, f.authority),
	).rejects.toMatchObject({ code: "range-target-changed" });
	await expect(
		f.service.confirm({ ...f.request, intent: "refresh-current" }, f.authority),
	).rejects.toMatchObject({ code: "range-target-changed" });
	const pin = await f.service.confirm(f.request, f.authority);
	const withPin = {
		...f.request,
		lesson: { ...f.lesson, steps: [{ ...f.step, mediaSelection: pin }] },
	};
	await expect(f.service.confirm(withPin, f.authority)).rejects.toMatchObject({
		code: "range-target-changed",
	});
	await expect(
		f.service.confirm(
			{ ...withPin, intent: "refresh-current", range: { ...f.request.range, projectId: "other" } },
			{ ...f.authority, projectId: "other" },
		),
	).rejects.toMatchObject({ code: "range-target-changed" });
});
it("rejects unapproved, missing and symlink-ancestor sources without returning a pin", async () => {
	const f = await fixture();
	const resolve = vi.spyOn(fs, "realpath");
	await expect(
		f.service.confirm(f.request, { ...f.authority, canReadSource: () => false }),
	).rejects.toMatchObject({ code: "range-source-unavailable" });
	expect(resolve).not.toHaveBeenCalled();
	const linked = path.join(root, "link");
	await fs.symlink(root, linked);
	f.doc.assets[0].originalPath = path.join(linked, "screen.mp4");
	const range = { ...f.request.range, documentSha256: await lessonRenderFingerprint(f.doc) };
	await expect(f.service.confirm({ ...f.request, range }, f.authority)).rejects.toMatchObject({
		code: "range-source-unavailable",
	});
	f.doc.assets[0].originalPath = f.source;
	await fs.unlink(f.source);
	await expect(f.service.confirm(f.request, f.authority)).rejects.toMatchObject({
		code: "range-source-unavailable",
	});
});
it("rejects stale saved-project inputs and unsupported platforms", async () => {
	const f = await fixture();
	await expect(
		f.service.confirm(
			{ ...f.request, range: { ...f.request.range, documentSha256: "a".repeat(64) } },
			f.authority,
		),
	).rejects.toMatchObject({ code: "project-changed" });
	vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
	f.read.mockClear();
	await expect(f.service.confirm(f.request, f.authority)).rejects.toMatchObject({
		code: "range-media-unsupported",
	});
	expect(f.read).not.toHaveBeenCalled();
});
it("serializes confirmations and only lets the requesting owner cancel the matching operation", async () => {
	const f = await fixture();
	let release!: () => void;
	const wait = new Promise<void>((resolve) => {
		release = resolve;
	});
	f.read.mockImplementationOnce(async () => {
		await wait;
		return f.doc;
	});
	const pending = f.service.confirm(f.request, f.authority);
	await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1));
	await expect(
		f.service.confirm({ ...f.request, operationId: randomUUID() }, f.authority),
	).rejects.toMatchObject({ code: "render-busy" });
	expect(f.service.cancel({}, f.request.operationId)).toBe(false);
	expect(f.service.cancel(f.authority.owner, randomUUID())).toBe(false);
	expect(f.service.cancel(f.authority.owner, f.request.operationId)).toBe(true);
	const rejection = expect(pending).rejects.toMatchObject({ code: "range-media-cancelled" });
	release();
	await rejection;
	expect(
		(await f.service.confirm({ ...f.request, operationId: randomUUID() }, f.authority)).version,
	).toBe(2);
});
it("rechecks editor lifetime after asynchronous reads and releases busy state on errors", async () => {
	const f = await fixture();
	let current = true;
	f.authority.assertCurrent = () => {
		if (!current) throw new Error("EDITOR_CLOSED");
	};
	f.read.mockImplementationOnce(async () => {
		current = false;
		return f.doc;
	});
	await expect(f.service.confirm(f.request, f.authority)).rejects.toThrow("EDITOR_CLOSED");
	current = true;
	expect((await f.service.confirm(f.request, f.authority)).version).toBe(2);
});
it("cancels on owner destruction even during a later backend revalidation", async () => {
	const f = await fixture();
	f.read.mockImplementation(async () => {
		if (f.read.mock.calls.length === 3) f.service.cancelOwner(f.authority.owner);
		return f.doc;
	});
	await expect(f.service.confirm(f.request, f.authority)).rejects.toMatchObject({
		code: "range-media-cancelled",
	});
	expect(f.lesson.steps[0].mediaSelection).toBeUndefined();
});
