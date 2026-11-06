import { expect, it, vi } from "vitest";
import { buildSceneDescription } from "../../native/sceneDescription";
import {
	annotationRegionSchema,
	createEmptyDocument,
	shaderEffectSchema,
	zoomRegionSchema,
} from "../ai-edition/schema";
import { buildLessonSceneDescription, lessonRenderFingerprint } from "./frameSource";

function documentFor(kind: string, geometry: "trim" | "clips") {
	const doc = createEmptyDocument({ projectId: "p", title: "Fragments" });
	doc.assets = [
		{ id: "a", kind: "video", label: "Source", originalPath: "/source.mp4", cameraTrack: null },
	];
	const base = {
		id: "c",
		assetId: "a",
		sourceStartSec: 0,
		sourceEndSec: 10,
		timelineStartSec: 0,
		timelineEndSec: 10,
		wordRefs: [],
		origin: "user" as const,
		reason: "",
	};
	doc.timeline.clips = [base];
	if (geometry === "trim")
		doc.timeline.trimRanges = [
			{ id: "cut", assetId: "a", clipId: "c", startSec: 3, endSec: 5, origin: "user", reason: "" },
		];
	else
		doc.timeline.clips = [
			{ ...base, id: "c1", sourceEndSec: 5, timelineEndSec: 5 },
			{ ...base, id: "c2", sourceStartSec: 5, timelineStartSec: 5 },
		];
	const span = { id: "authored", startMs: 1000, endMs: 9000 };
	if (kind === "zoom")
		doc.zoomRanges = [zoomRegionSchema.parse({ ...span, depth: 2, focus: { cx: 0.4, cy: 0.6 } })];
	if (kind === "annotation" || kind === "caption")
		doc.annotations = [
			annotationRegionSchema.parse({
				...span,
				type: "text",
				content: "Visible source",
				position: { x: 10, y: 10 },
				size: { width: 30, height: 20 },
				style: {
					color: "#ffffff",
					backgroundColor: "transparent",
					fontSize: 32,
					fontFamily: "Inter",
					fontWeight: "bold",
					fontStyle: "normal",
					textDecoration: "none",
					textAlign: "center",
				},
				zIndex: 0,
				...(kind === "caption" ? { annotationSource: "auto-caption" } : {}),
			}),
		];
	if (kind === "speed") doc.legacyEditor = { speedRegions: [{ ...span, speed: 2 }] };
	if (kind === "camera") doc.legacyEditor = { cameraFullscreenRegions: [span] };
	if (kind === "layout") doc.layoutRegions = [{ ...span, preset: "camera-only" }];
	if (kind === "shader") {
		doc.shaderEffects = [
			shaderEffectSchema.parse({
				id: "effect",
				name: "Plain",
				description: "",
				contract: 1,
				code: "fn effect(uv: vec2<f32>) -> vec4<f32> { return frame(uv); }",
				origin: "user",
				params: [],
			}),
		];
		doc.shaderEffectRanges = [{ ...span, effectId: "effect", values: {}, target: "image" }];
	}
	return doc;
}
const pixels = (value: unknown) =>
	JSON.parse(JSON.stringify(value, (key, value) => (key === "id" ? undefined : value)));
for (const geometry of ["trim", "clips"] as const) {
	it.each([
		"zoom",
		"annotation",
		"caption",
		"speed",
		"camera",
		"layout",
		"shader",
	])(`keeps %s fragments deterministic across ${geometry} without changing render payload/order`, async (kind) => {
		const doc = documentFor(kind, geometry),
			first = buildLessonSceneDescription(doc),
			second = buildLessonSceneDescription(doc);
		expect(second).toEqual(first);
		expect(pixels(first)).toEqual(pixels(buildSceneDescription(doc)));
		let allocation = 0;
		const allocated = vi.fn((kind: string) => `injected_${kind}_${allocation++}`);
		buildSceneDescription(doc, null, allocated);
		const expected = (
			{
				zoom: "zoom",
				annotation: "ann",
				caption: "ann",
				speed: "speed",
				camera: "camfull",
				layout: "layout",
				shader: "fxr",
			} as Record<string, string>
		)[kind];
		if (kind === "layout" && geometry === "clips") {
			expect(first.layoutRegions?.length).toBeGreaterThanOrEqual(2);
			expect(allocated.mock.calls.some(([prefix]) => prefix === expected)).toBe(false);
		} else expect(allocated.mock.calls.some(([prefix]) => prefix === expected)).toBe(true);
		const digest = await lessonRenderFingerprint(doc);
		expect(await lessonRenderFingerprint(doc)).toBe(digest);
		doc.timeline.clips[0].sourceStartSec = 0.25;
		expect(await lessonRenderFingerprint(doc)).not.toBe(digest);
	});
}
it("reserves authored IDs when allocating stable ephemeral fragment identities", async () => {
	const doc = documentFor("annotation", "trim");
	doc.annotations[0].id = "__lesson_fragment_ann_0";
	const scene = buildLessonSceneDescription(doc),
		ids = scene.annotations.map((annotation) => annotation.id);
	expect(ids).toHaveLength(2);
	expect(ids[0]).toBe(doc.annotations[0].id);
	expect(new Set(ids).size).toBe(ids.length);
	expect(buildLessonSceneDescription(doc)).toEqual(scene);
});
