import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument, documentSchema } from "../../src/lib/ai-edition/schema";
import { disabledCapturePrivacyPolicy } from "../../src/lib/capturePrivacy";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture, jpegBase64 } from "../../src/lib/lesson/fixtures.test-support";
import {
	buildLessonSceneDescription,
	lessonRenderFingerprint,
} from "../../src/lib/lesson/frameSource";
import { sha256 } from "../../src/lib/lesson/schema";
import { DocumentService } from "../ai-edition/document-service";
import {
	bindCapturePolicyToMedia,
	writeCapturePolicyReceipt,
} from "../recording/capturePolicyReceipt";
import { LessonService } from "./service";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function directory() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-guide-"));
	roots.push(root);
	return root;
}
function fixture() {
	const doc = createEmptyDocument({ projectId: "p", title: "Generic" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Source",
			originalPath: "/original-source.mp4",
			cameraTrack: null,
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			origin: "user",
			wordRefs: [],
			reason: "fixture",
		},
	];
	const render = vi.fn(async (_clips: unknown, _scene: string, _fps: number, frames: number[]) => [
		{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") },
	]);
	return {
		doc,
		render,
		service: new LessonService(async () => doc, render),
		digest: () => lessonRenderFingerprint(doc),
	};
}
it("captures via shared native scene/clip and ruler-to-programme projection, preserving frame provenance", async () => {
	const f = fixture();
	const image = await f.service.captureFrame({
		projectId: "p",
		rulerSec: 1.25,
		documentSha256: await f.digest(),
	});
	expect(image.source).toMatchObject({ rulerSec: 1.25, precision: "60fps-floor" });
	expect(f.render.mock.calls[0][3]).toEqual([75]);
	expect(JSON.parse(f.render.mock.calls[0][1])).toMatchObject({
		clips: [{ screenPath: "/original-source.mp4" }],
		annotations: [],
	});
});
it("refuses stale documents and missing/trimmed source instead of making an invented illustration", async () => {
	const f = fixture();
	await expect(
		f.service.captureFrame({ projectId: "p", rulerSec: 1, documentSha256: "0".repeat(64) }),
	).rejects.toThrow("project-changed");
	expect(f.render).not.toHaveBeenCalled();
	await expect(
		f.service.captureFrame({ projectId: "p", rulerSec: 11, documentSha256: await f.digest() }),
	).rejects.toThrow("frame-unavailable");
});
it("saves/reopens a separate editable manifest without overwriting evidence or loading an adapter", async () => {
	const root = await directory(),
		file = path.join(root, "lesson.json"),
		f = fixture(),
		image = await imageFixture();
	const lesson = {
		...newLesson(),
		assets: [image],
		steps: [{ ...newStep(), imageId: image.id }],
		extensions: { "example.kept": { value: 1 } },
	};
	await f.service.saveEditable(lesson, async () => file);
	const before = await fs.readFile(file);
	await expect(
		f.service.saveEditable({ ...lesson, title: "replacement" }, async () => file),
	).rejects.toThrow();
	expect(await fs.readFile(file)).toEqual(before);
	const reopened = await f.service.openEditable(async () => file);
	expect(reopened.status).toBe("opened");
	if (reopened.status === "opened") expect(reopened.lesson).toEqual(lesson);
	expect(f.render).not.toHaveBeenCalled();
});
it("writes a verified self-contained selected guide with relative image assets and checksum inventory", async () => {
	const root = await directory(),
		f = fixture(),
		image = await imageFixture(),
		step = { ...newStep("Included"), imageId: image.id, imageAlt: "Example" },
		other = newStep("PRIVATE_OMITTED_CANARY");
	const lesson = { ...newLesson(), steps: [step, other], assets: [image] };
	const result = await f.service.exportGuide(lesson, [step.id], async () => root);
	expect(result.status).toBe("exported");
	if (result.status !== "exported") return;
	const report = JSON.parse(
		await fs.readFile(path.join(result.path, "export-report.json"), "utf8"),
	);
	expect(report.complete).toBe(true);
	for (const item of report.files) {
		const bytes = await fs.readFile(path.join(result.path, item.path));
		expect(await sha256(bytes)).toBe(item.sha256);
		expect(bytes.toString()).not.toContain("PRIVATE_OMITTED_CANARY");
	}
	expect(await fs.readFile(path.join(result.path, `assets/${image.id}.jpg`))).toEqual(
		Buffer.from(jpegBase64, "base64"),
	);
	const reopened = await f.service.openEditable(async () =>
		path.join(result.path, "lesson.openscreen-lesson.json"),
	);
	expect(reopened.status).toBe("opened");
});
it("cancellation writes nothing and invalid selection is rejected before a folder picker", async () => {
	const f = fixture(),
		picker = vi.fn(async () => null),
		lesson = { ...newLesson(), steps: [newStep()] };
	expect(await f.service.saveEditable(lesson, picker)).toEqual({ status: "cancelled" });
	await expect(f.service.exportGuide(lesson, [crypto.randomUUID()], picker)).rejects.toThrow();
	expect(picker).toHaveBeenCalledTimes(1);
});
it("rejects trimmed positions and maps later ruler times through the same export cut projection", async () => {
	const f = fixture();
	f.doc.timeline.trimRanges = [
		{
			id: "trim",
			assetId: "a",
			clipId: "c",
			startSec: 1,
			endSec: 3,
			reason: "cut",
			origin: "user",
		},
	];
	await expect(
		f.service.captureFrame({ projectId: "p", rulerSec: 2, documentSha256: await f.digest() }),
	).rejects.toThrow("frame-unavailable");
	await f.service.captureFrame({ projectId: "p", rulerSec: 4, documentSha256: await f.digest() });
	expect(f.render.mock.calls[0][3]).toEqual([120]);
});
it("rejects traversal-shaped image identities and unsupported image payloads before any destination is chosen", async () => {
	const f = fixture(),
		image = await imageFixture(),
		picker = vi.fn(async () => "never-used");
	await expect(
		f.service.saveEditable({ ...newLesson(), assets: [{ ...image, id: "../../outside" }] }, picker),
	).rejects.toThrow();
	expect(picker).not.toHaveBeenCalled();
});
it.each([
	"recovered",
	"receipt-change",
])("captures saved %s projects through real DocumentService and store schema roundtrips", async (kind) => {
	const root = await directory(),
		media = path.join(root, "take.mp4");
	await fs.writeFile(media, "fixed source bytes");
	const documents = new DocumentService(path.join(root, "projects"), root);
	const created = await documents.createProject("Real source");
	if (kind === "receipt-change") {
		const captureId = crypto.randomUUID();
		writeCapturePolicyReceipt(media, {
			version: 2,
			captureId,
			policy: disabledCapturePrivacyPolicy(),
			applicationIdentity: "unavailable",
			collectionAllowedAtStart: false,
			suppressedAtStart: false,
		});
		await bindCapturePolicyToMedia(media, captureId);
	}
	const added = await documents.addAsset(created.project.id, { path: media });
	added.timeline.clips = [
		{
			id: "source-clip",
			assetId: added.assets[0].id,
			sourceStartSec: 0,
			sourceEndSec: 5,
			timelineStartSec: 0,
			timelineEndSec: 5,
			origin: "user",
			reason: "fixture",
			wordRefs: [],
		},
	];
	if (kind === "recovered")
		added.assets[0].capturePrivacy = {
			status: "interrupted",
			journalPresent: false,
			recoveredFrom: "interrupted",
		};
	const store = documentSchema.parse(await documents.saveProject(documentSchema.parse(added)));
	const before = await lessonRenderFingerprint(store);
	if (kind === "receipt-change")
		await fs.writeFile(`${media}.capture-policy.json`, "PRIVATE_INVALID_RECEIPT_CANARY");
	const read = await new DocumentService(path.join(root, "projects"), root).getProject(
		created.project.id,
	);
	expect(JSON.stringify(read)).not.toEqual(JSON.stringify(store));
	expect(await lessonRenderFingerprint(read)).toBe(before);
	const render = vi.fn(async (_clips: unknown, _scene: string, _fps: number, frames: number[]) => [
		{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") },
	]);
	const service = new LessonService((id) => documents.getProject(id), render);
	const image = await service.captureFrame({
		projectId: created.project.id,
		rulerSec: 1,
		documentSha256: before,
	});
	expect(image.source.fingerprintKind).toBe("render-inputs-v1");
	expect(render).toHaveBeenCalledTimes(1);
	const changed = documentSchema.parse(await documents.getProject(created.project.id));
	changed.timeline.clips[0].sourceStartSec = 0.5;
	await documents.saveProject(changed);
	await expect(
		service.captureFrame({ projectId: created.project.id, rulerSec: 1, documentSha256: before }),
	).rejects.toThrow("project-changed");
	expect(render).toHaveBeenCalledTimes(1);
	expect(await fs.readFile(media, "utf8")).toBe("fixed source bytes");
});
it("rejects raw clip geometry overhang beyond the source extent", async () => {
	const f = fixture();
	f.doc.timeline.clips[0].sourceEndSec = 2;
	await expect(
		f.service.captureFrame({ projectId: "p", rulerSec: 3, documentSha256: await f.digest() }),
	).rejects.toThrow("frame-unavailable");
	expect(f.render).not.toHaveBeenCalled();
});
it.each([
	"trim",
	"clips",
])("captures both sides of a crossing region through real saved %s geometry", async (geometry) => {
	const root = await directory(),
		media = path.join(root, "crossing.mp4");
	await fs.writeFile(media, "source fixture");
	const documents = new DocumentService(path.join(root, "projects"), root);
	const created = await documents.createProject("Crossing zoom");
	const doc = await documents.addAsset(created.project.id, { path: media });
	const clip = {
		id: "c",
		assetId: doc.assets[0].id,
		sourceStartSec: 0,
		sourceEndSec: 10,
		timelineStartSec: 0,
		timelineEndSec: 10,
		wordRefs: [],
		origin: "user" as const,
		reason: "",
	};
	doc.timeline.clips = [clip];
	if (geometry === "trim")
		doc.timeline.trimRanges = [
			{
				id: "cut",
				assetId: clip.assetId,
				clipId: "c",
				startSec: 3,
				endSec: 5,
				origin: "user",
				reason: "",
			},
		];
	else
		doc.timeline.clips = [
			{ ...clip, id: "c1", sourceEndSec: 5, timelineEndSec: 5 },
			{ ...clip, id: "c2", sourceStartSec: 5, timelineStartSec: 5 },
		];
	doc.zoomRanges = [
		{ id: "zoom", startMs: 500, endMs: 9000, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
	];
	const store = documentSchema.parse(await documents.saveProject(doc)),
		digest = await lessonRenderFingerprint(store);
	expect(
		await lessonRenderFingerprint(
			documentSchema.parse(await documents.getProject(created.project.id)),
		),
	).toBe(digest);
	const render = vi.fn(async (_clips: unknown, scene: string, _fps: number, frames: number[]) => {
		expect(JSON.parse(scene).zoomRegions).toHaveLength(2);
		expect(scene).toBe(JSON.stringify(buildLessonSceneDescription(store)));
		return [{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") }];
	});
	const service = new LessonService((id) => documents.getProject(id), render);
	for (const rulerSec of [1, 6])
		await service.captureFrame({ projectId: created.project.id, rulerSec, documentSha256: digest });
	expect(render).toHaveBeenCalledTimes(2);
	const edit = await documents.getProject(created.project.id);
	edit.zoomRanges[0].depth = 3;
	await documents.saveProject(edit);
	await expect(
		service.captureFrame({ projectId: created.project.id, rulerSec: 6, documentSha256: digest }),
	).rejects.toThrow("project-changed");
	expect(render).toHaveBeenCalledTimes(2);
});
it("persists output settings and writes a code/image-free derived package with truthful receipt", async () => {
	const root = await directory(),
		f = fixture(),
		image = await imageFixture(),
		step = {
			...newStep("Output"),
			imageId: image.id,
			imageAlt: "PRIVATE_PROFILE_ALT",
			code: { language: "plain", text: "PRIVATE_PROFILE_CODE" },
		};
	const source = {
		...newLesson(),
		steps: [step],
		assets: [image],
		output: {
			version: 1 as const,
			preset: "large-print" as const,
			language: "ar",
			direction: "rtl" as const,
			includeImages: false,
			includeCode: false,
		},
	};
	const file = path.join(root, "original.lesson.json");
	await f.service.saveEditable(source, async () => file);
	const original = await f.service.openEditable(async () => file);
	expect(original.status).toBe("opened");
	if (original.status !== "opened") return;
	expect(original.lesson.output).toEqual(source.output);
	const exported = await f.service.exportGuide(original.lesson, [step.id], async () => root);
	if (exported.status !== "exported") throw new Error("export");
	expect(exported.images).toBe(0);
	expect(await fs.readdir(exported.path)).not.toContain("assets");
	const receipt = JSON.parse(
		await fs.readFile(path.join(exported.path, "export-report.json"), "utf8"),
	);
	expect(receipt.output).toEqual(source.output);
	expect(receipt.review.draftSteps).toBe(1);
	for (const item of receipt.files) {
		const content = await fs.readFile(path.join(exported.path, item.path), "utf8");
		expect(content).not.toContain("PRIVATE_PROFILE_CODE");
		expect(content).not.toContain("PRIVATE_PROFILE_ALT");
		expect(content).not.toContain(image.base64);
	}
	expect((await f.service.openEditable(async () => file)).status).toBe("opened");
	expect(await fs.readFile(file, "utf8")).toContain("PRIVATE_PROFILE_CODE");
});
it("plans an explicit half-open ruler range through cuts and speed without rendering or altering source", async () => {
	const f = fixture();
	f.doc.timeline.trimRanges = [
		{
			id: "cut",
			assetId: "a",
			clipId: "c",
			startSec: 3,
			endSec: 5,
			reason: "removed",
			origin: "user",
		},
	];
	f.doc.legacyEditor = { speedRegions: [{ id: "speed", startMs: 5000, endMs: 10000, speed: 2 }] };
	const before = JSON.stringify(f.doc);
	const range = await f.service.planRange({
		projectId: "p",
		documentSha256: await f.digest(),
		startSec: 2,
		endSec: 8,
	});
	expect(range).toMatchObject({
		version: 1,
		provenance: "authored-selection",
		basis: "editor-ruler-seconds",
		startSec: 2,
		endSec: 8,
		keptSpans: [
			{ startSec: 2, endSec: 3 },
			{ startSec: 5, endSec: 8 },
		],
		programme: { basis: "editor-programme-seconds", startSec: 2, endSec: 4.5 },
	});
	expect(f.render).not.toHaveBeenCalled();
	expect(JSON.stringify(f.doc)).toBe(before);
	expect(JSON.stringify(range)).not.toContain("/original-source.mp4");
	const step = { ...newStep(), mediaSelection: range },
		lesson = { ...newLesson(), steps: [step] };
	const reopened = await f.service.openEditable(async () => {
		const target = path.join(await directory(), "range.json");
		await fs.writeFile(target, JSON.stringify(lesson));
		return target;
	});
	if (reopened.status !== "opened") throw new Error("Expected open");
	expect(reopened.lesson.steps[0].mediaSelection).toEqual(range);
});
it("refuses stale range sources, removed/outside boundaries, unprobed and overlapping timeline data", async () => {
	const f = fixture();
	f.doc.timeline.trimRanges = [
		{
			id: "cut",
			assetId: "a",
			clipId: "c",
			startSec: 3,
			endSec: 5,
			reason: "removed",
			origin: "user",
		},
	];
	const request = { projectId: "p", documentSha256: await f.digest(), startSec: 1, endSec: 8 };
	await expect(f.service.planRange({ ...request, documentSha256: "0".repeat(64) })).rejects.toThrow(
		"project-changed",
	);
	for (const [startSec, endSec] of [
		[1, 4],
		[4, 8],
		[1, 11],
		[8, 8],
		[8, 1],
		[-1, 2],
		[0, Infinity],
	])
		await expect(f.service.planRange({ ...request, startSec, endSec })).rejects.toThrow();
	f.doc.timeline.clips.push({
		...f.doc.timeline.clips[0],
		id: "overlap",
		timelineStartSec: 2,
		timelineEndSec: 12,
	});
	await expect(
		f.service.planRange({ ...request, documentSha256: await f.digest() }),
	).rejects.toThrow("range-unavailable");
	f.doc.timeline.clips.pop();
	f.doc.timeline.clips[0].sourceEndSec = undefined;
	await expect(
		f.service.planRange({ ...request, documentSha256: await f.digest() }),
	).rejects.toThrow("range-unavailable");
	expect(f.render).not.toHaveBeenCalled();
});
it("bounds range-plan fragmentation before retaining more than 128 spans", async () => {
	const f = fixture();
	f.doc.timeline.clips[0].sourceEndSec = 300;
	f.doc.timeline.clips[0].timelineEndSec = 300;
	f.doc.timeline.trimRanges = Array.from({ length: 129 }, (_, index) => ({
		id: `cut-${index}`,
		assetId: "a",
		clipId: "c",
		startSec: index * 2 + 1,
		endSec: index * 2 + 2,
		reason: "cut",
		origin: "user" as const,
	}));
	await expect(
		f.service.planRange({
			projectId: "p",
			documentSha256: await f.digest(),
			startSec: 0,
			endSec: 260,
		}),
	).rejects.toThrow("range-unavailable");
	expect(f.render).not.toHaveBeenCalled();
});
