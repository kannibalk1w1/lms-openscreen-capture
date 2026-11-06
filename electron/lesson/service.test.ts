import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { imageFixture, jpegBase64 } from "../../src/lib/lesson/fixtures.test-support";
import { sha256 } from "../../src/lib/lesson/schema";
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
		digest: () => sha256(new TextEncoder().encode(JSON.stringify(doc))),
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
	).rejects.toThrow("changed");
	expect(f.render).not.toHaveBeenCalled();
	await expect(
		f.service.captureFrame({ projectId: "p", rulerSec: 11, documentSha256: await f.digest() }),
	).rejects.toThrow("visible");
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
	).rejects.toThrow("visible");
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
