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
