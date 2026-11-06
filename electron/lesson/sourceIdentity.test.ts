import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import {
	attachLessonMediaSelection,
	newLesson,
	newStep,
	reviseLesson,
} from "../../src/lib/lesson/authoring";
import { renderLessonGuide } from "../../src/lib/lesson/export";
import { lessonRenderFingerprint } from "../../src/lib/lesson/frameSource";
import {
	lessonMediaSelectionSchema,
	mediaSelectionReference,
} from "../../src/lib/lesson/mediaSelection";
import { parseLesson } from "../../src/lib/lesson/schema";
import { LessonDraftStore } from "./draftStore";
import { queryLessonFile } from "./fileCommands";
import { materializeLessonRange } from "./rangeMedia";
import { planLessonRange } from "./rangePlan";
import { captureLessonSourceIdentity } from "./sourceIdentity";

let root: string;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "identity-"));
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = path.join(root, "PRIVATE_SOURCE.mp4");
	await fs.writeFile(source, "original bytes");
	const doc = createEmptyDocument({ projectId: "p", title: "Pin fixture" });
	doc.assets = [
		{
			id: "PRIVATE_ASSET",
			kind: "video",
			label: "PRIVATE_LABEL",
			originalPath: source,
			cameraTrack: null,
			durationSec: 1,
			video: { codec: "h264", fps: 30, width: 64, height: 32 },
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: doc.assets[0].id,
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
	const request = {
		projectId: "p",
		documentSha256: await lessonRenderFingerprint(doc),
		startSec: 0,
		endSec: 1,
	};
	const reference = await planLessonRange(doc, request),
		readDocument = vi.fn(async () => doc);
	const capture = () =>
		captureLessonSourceIdentity({ selection: reference, intent: "author-current", readDocument });
	return { source, doc, request, reference, readDocument, capture };
}
it("captures explicitly, preserves legacy geometry, and records no source path or machine time", async () => {
	const f = await fixture(),
		selection = await f.capture();
	expect(mediaSelectionReference(selection)).toEqual(f.reference);
	expect(selection.previousSelections).toEqual([f.reference]);
	expect(f.readDocument).toHaveBeenCalledTimes(3);
	expect(selection.identity).toMatchObject({
		basis: "explicit-author-current",
		sources: [{ role: "screen", bytes: 14 }],
	});
	for (const secret of [
		f.source,
		"PRIVATE_SOURCE",
		"PRIVATE_ASSET",
		"PRIVATE_LABEL",
		"mtime",
		"inode",
	])
		expect(JSON.stringify(selection)).not.toContain(secret);
});
it("preserves full pins through editable parsing and stale-safe attachment, stripping the whole record from guides", async () => {
	const f = await fixture(),
		pin = await f.capture(),
		step = { ...newStep(), mediaSelection: f.reference },
		lesson = { ...newLesson(), steps: [step] },
		request = {
			lessonId: lesson.id,
			stepId: step.id,
			revision: lesson.revision,
			previous: f.reference,
		};
	// Match the existing attachment request contract, including the previous reference.
	const target = request;
	const current = reviseLesson(lesson, {
		steps: [{ ...step, instructions: "Later text", status: "reviewed" }],
	});
	const attached = attachLessonMediaSelection(current, target, pin);
	expect(attached.steps[0]).toMatchObject({
		instructions: "Later text",
		status: "draft",
		mediaSelection: pin,
	});
	const manifest = path.join(root, "lesson.json");
	await fs.writeFile(manifest, JSON.stringify(attached));
	const reopened = await parseLesson(await fs.readFile(manifest, "utf8"));
	expect(reopened.steps[0].mediaSelection).toEqual(pin);
	const store = new LessonDraftStore(path.join(root, "recovery")),
		saved = await store.save(reopened);
	expect(
		(await new LessonDraftStore(path.join(root, "recovery")).read(saved.id)).steps[0]
			.mediaSelection,
	).toEqual(pin);
	await fs.unlink(f.source);
	const query = await queryLessonFile({ manifestPath: manifest, query: {} });
	expect(query.steps[0]).toMatchObject({
		hasMediaSelection: true,
		sourceIdentityStatus: "content-pinned",
	});
	expect(JSON.stringify(query)).not.toContain(pin.identity.observationId);
	expect(JSON.stringify(query)).not.toContain(pin.identity.sources[0].sha256);
	const guide = await renderLessonGuide(reopened, [step.id]);
	expect(guide.lesson.steps[0].mediaSelection).toBeUndefined();
	expect(JSON.stringify(guide)).not.toContain(pin.identity.observationId);
	const stale = { ...current, steps: [{ ...step, mediaSelection: { ...pin } }] };
	expect(attachLessonMediaSelection(stale, target, pin)).toBe(stale);
});
it("explicit refresh preserves old observations and requires a fresh current-project request", async () => {
	const f = await fixture(),
		first = await f.capture();
	await fs.writeFile(f.source, "changed bytes!");
	const second = await captureLessonSourceIdentity({
		selection: first,
		intent: "refresh-current",
		replacement: f.request,
		readDocument: f.readDocument,
	});
	expect(second.identity.observationId).not.toBe(first.identity.observationId);
	expect(second.identity.basis).toBe("explicit-refresh-current");
	expect(second.identity.sources[0].sha256).not.toBe(first.identity.sources[0].sha256);
	const { previousSelections: _history, ...firstSnapshot } = first;
	expect(second.previousSelections).toEqual([f.reference, firstSnapshot]);
	await expect(
		captureLessonSourceIdentity({
			selection: first,
			intent: "refresh-current",
			readDocument: f.readDocument,
		}),
	).rejects.toThrow("range-media-unsupported");
	await expect(
		captureLessonSourceIdentity({
			selection: first,
			intent: "author-current",
			readDocument: f.readDocument,
		}),
	).rejects.toThrow("range-media-unsupported");
});
it("refuses a saved project changed during capture", async () => {
	const f = await fixture();
	let reads = 0;
	await expect(
		captureLessonSourceIdentity({
			selection: f.reference,
			intent: "author-current",
			readDocument: async () => {
				if (++reads === 2) f.doc.timeline.clips[0].sourceStartSec = 0.1;
				return f.doc;
			},
		}),
	).rejects.toThrow("range-media-changed");
});
it("refuses legacy materialization before document, picker or media IO; cancelled pinned requests read no media", async () => {
	const f = await fixture(),
		render = vi.fn(),
		pickDirectory = vi.fn(async () => root);
	await expect(
		materializeLessonRange({
			selection: f.reference,
			readDocument: f.readDocument,
			render,
			pickDirectory,
		}),
	).rejects.toThrow("range-media-unattested");
	expect(f.readDocument).not.toHaveBeenCalled();
	expect(pickDirectory).not.toHaveBeenCalled();
	const pin = await f.capture();
	await fs.unlink(f.source);
	const open = vi.spyOn(fs, "open");
	expect(
		await materializeLessonRange({
			selection: pin,
			readDocument: f.readDocument,
			render,
			pickDirectory: async () => null,
		}),
	).toEqual({ status: "cancelled" });
	expect(open).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});
it.each([
	"same-size",
	"truncated",
	"replacement",
	"missing",
	"symlink",
])("rejects %s after capture before output and never refreshes the stored pin", async (kind) => {
	const f = await fixture(),
		pin = await f.capture(),
		original = JSON.stringify(pin),
		render = vi.fn();
	if (kind === "same-size") await fs.writeFile(f.source, "different byte");
	if (kind === "truncated") await fs.writeFile(f.source, "short");
	if (kind === "replacement") {
		await fs.unlink(f.source);
		await fs.writeFile(f.source, "other content");
	}
	if (kind === "missing") await fs.unlink(f.source);
	if (kind === "symlink") {
		await fs.unlink(f.source);
		await fs.symlink(root, f.source);
	}
	await expect(
		materializeLessonRange({
			selection: pin,
			readDocument: f.readDocument,
			render,
			pickDirectory: async () => root,
		}),
	).rejects.toThrow(/^range-media-(changed|unsupported)$/);
	expect(render).not.toHaveBeenCalled();
	expect(JSON.stringify(pin)).toBe(original);
	expect((await fs.readdir(root)).some((name) => name.startsWith("lesson-range-"))).toBe(false);
});
it("rejects malformed or extra identity claims and duplicated observations", async () => {
	const f = await fixture(),
		pin = await f.capture();
	for (const identity of [
		{ ...pin.identity, path: "PRIVATE" },
		{ ...pin.identity, observationId: "bad" },
		{ ...pin.identity, sources: [] },
		{
			...pin.identity,
			sources: [{ ...pin.identity.sources[0], bindings: ["0".repeat(64), "0".repeat(64)] }],
		},
		{ ...pin.identity, sources: [{ ...pin.identity.sources[0], bytes: 8 * 1024 ** 3 + 1 }] },
	])
		expect(lessonMediaSelectionSchema.safeParse({ ...pin, identity }).success).toBe(false);
	expect(
		lessonMediaSelectionSchema.safeParse({
			...pin,
			previousSelections: [{ ...pin, previousSelections: undefined }],
		}).success,
	).toBe(false);
});
it("requires explicit refresh after a path rebind even for identical source bytes", async () => {
	const f = await fixture(),
		pin = await f.capture(),
		replacement = path.join(root, "relinked.mp4");
	await fs.copyFile(f.source, replacement);
	f.doc.assets[0].originalPath = replacement;
	const render = vi.fn();
	await expect(
		materializeLessonRange({
			selection: pin,
			readDocument: f.readDocument,
			render,
			pickDirectory: async () => root,
		}),
	).rejects.toThrow("range-media-changed");
	expect(render).not.toHaveBeenCalled();
	const rebound = await captureLessonSourceIdentity({
		selection: pin,
		intent: "refresh-current",
		replacement: { ...f.request, documentSha256: await lessonRenderFingerprint(f.doc) },
		readDocument: f.readDocument,
	});
	expect(rebound.documentSha256).not.toBe(pin.documentSha256);
	expect(rebound.identity.sources).toEqual(pin.identity.sources);
	expect(rebound.previousSelections).toHaveLength(2);
});
it("refuses source changes between capture observations without returning a pin", async () => {
	const f = await fixture();
	let reads = 0;
	await expect(
		captureLessonSourceIdentity({
			selection: f.reference,
			intent: "author-current",
			readDocument: async () => {
				if (++reads === 2) await fs.writeFile(f.source, "different byte");
				return f.doc;
			},
		}),
	).rejects.toThrow("range-media-changed");
});
it("never prunes full history or silently reuses an observation", async () => {
	const f = await fixture();
	let pin = await f.capture();
	for (let i = 1; i < 8; i++)
		pin = await captureLessonSourceIdentity({
			selection: pin,
			intent: "refresh-current",
			replacement: f.request,
			readDocument: f.readDocument,
		});
	expect(pin.previousSelections).toHaveLength(8);
	f.readDocument.mockClear();
	await expect(
		captureLessonSourceIdentity({
			selection: pin,
			intent: "refresh-current",
			replacement: f.request,
			readDocument: f.readDocument,
		}),
	).rejects.toThrow("range-media-unsupported");
	expect(f.readDocument).not.toHaveBeenCalled();
	const { previousSelections: _history, ...snapshot } = pin;
	expect(
		lessonMediaSelectionSchema.safeParse({ ...pin, previousSelections: [snapshot] }).success,
	).toBe(false);
});
it.each(["darwin", "win32"] as const)("does not claim %s file authority", async (platform) => {
	const f = await fixture();
	vi.spyOn(process, "platform", "get").mockReturnValue(platform);
	await expect(f.capture()).rejects.toThrow("range-media-unsupported");
	expect(f.readDocument).not.toHaveBeenCalled();
});
it("honors cancellation of explicit capture before any authority read", async () => {
	const f = await fixture(),
		controller = new AbortController();
	controller.abort();
	await expect(
		captureLessonSourceIdentity({
			selection: f.reference,
			intent: "author-current",
			readDocument: f.readDocument,
			signal: controller.signal,
		}),
	).rejects.toThrow("range-media-cancelled");
	expect(f.readDocument).not.toHaveBeenCalled();
});
it("rejects pin coverage mismatches before choosing a destination", async () => {
	const f = await fixture(),
		pin = await f.capture(),
		pickDirectory = vi.fn(async () => root),
		render = vi.fn();
	const selection = {
		...pin,
		identity: {
			...pin.identity,
			sources: [{ ...pin.identity.sources[0], bindings: ["f".repeat(64)] }],
		},
	};
	await expect(
		materializeLessonRange({ selection, readDocument: f.readDocument, render, pickDirectory }),
	).rejects.toThrow("range-media-changed");
	expect(pickDirectory).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});
it("retains legacy references in source and recovery without accessing missing media", async () => {
	const f = await fixture(),
		lesson = { ...newLesson(), steps: [{ ...newStep(), mediaSelection: f.reference }] };
	await fs.unlink(f.source);
	const file = path.join(root, "legacy.json");
	await fs.writeFile(file, JSON.stringify(lesson));
	const opened = await parseLesson(await fs.readFile(file, "utf8"));
	const store = new LessonDraftStore(path.join(root, "copies")),
		saved = await store.save(opened);
	expect((await store.read(saved.id)).steps[0].mediaSelection).toEqual(f.reference);
	expect((await queryLessonFile({ manifestPath: file })).steps[0]).toMatchObject({
		hasMediaSelection: true,
		sourceIdentityStatus: "legacy-unattested",
	});
	expect(f.readDocument).not.toHaveBeenCalled();
});
