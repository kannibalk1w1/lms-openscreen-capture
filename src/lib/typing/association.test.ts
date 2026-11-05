import { expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "../ai-edition/schema";
import { recordingClockSchema } from "../recordingFlags";
import {
	associatedTypingPlacement,
	associateTypingSection,
	recordingAnchorChoices,
} from "./association";
import { TypingCapture } from "./capture";
import { importTypingTake } from "./import";

function associationFixture() {
	const doc = createEmptyDocument({ title: "Association", projectId: "p" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Recording",
			originalPath: "/take.mp4",
			cameraTrack: null,
			recordingClock: {
				sessionId: "7570d5c5-7f90-40b3-ace4-ac27839e318b",
				clock: "recording-control-active-ms",
				segments: [
					{ id: "before", startMs: 0, endMs: 5000 },
					{ id: "after", startMs: 5000, endMs: 12000 },
				],
			},
			recordingFlags: [
				{ id: "f", label: "First edit", timeMs: 4000, segmentId: "before" },
				{ id: "r", label: "Resumed edit", timeMs: 5000, segmentId: "after" },
			],
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 2,
			sourceEndSec: 10,
			timelineStartSec: 10,
			timelineEndSec: 18,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	let now = 100000;
	const capture = new TypingCapture("", () => now, "take");
	now += 7000;
	capture.observe("var hp = 10", [], "insertText");
	const take = { ...capture.finish(), producer: "godot-codeedit" as const };
	return { doc, take };
}
it("calibrates onset explicitly without rewriting evidence or using independent typing time", () => {
	const { doc, take } = associationFixture();
	const next = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[0].key,
	);
	expect(next.events).toEqual(take.events);
	expect(next.startedAt).toBe(take.startedAt);
	expect(associatedTypingPlacement(doc, next.sections[0], 0)).toMatchObject({
		time: 12,
		sourceStart: 4,
		maxDuration: 1,
	});
	expect(associatedTypingPlacement(doc, take.sections[0], 12)).toBeNull();
	expect(
		associateTypingSection(doc, next, next.sections[0].id, "").sections[0].sourceAnchor,
	).toBeUndefined();
});
it("uses the resumed interval at a shared media boundary and keeps anchors through JSON and project reopen", () => {
	const { doc, take } = associationFixture();
	const next = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[1].key,
	);
	doc.typingTakes = [next];
	const restored = documentSchema.parse(JSON.parse(JSON.stringify(doc)));
	const reopened = importTypingTake(JSON.stringify(next));
	expect(associatedTypingPlacement(restored, reopened.sections[0], 0)).toMatchObject({
		sourceStart: 5,
		maxDuration: 5,
	});
	// Evidence survives flag removal; the saved clock/session anchor is sufficient.
	restored.assets[0].recordingFlags = [];
	expect(associatedTypingPlacement(restored, reopened.sections[0], 0)?.time).toBe(13);
});
it("resolves a split to the right fragment and requires a playhead choice for repeated footage", () => {
	const { doc, take } = associationFixture();
	const section = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[0].key,
	).sections[0];
	const original = doc.timeline.clips[0];
	doc.timeline.clips = [
		{ ...original, sourceEndSec: 4, timelineEndSec: 12 },
		{ ...original, id: "right", sourceStartSec: 4, timelineStartSec: 12 },
	];
	expect(associatedTypingPlacement(doc, section, 0)?.clip.id).toBe("right");
	doc.timeline.clips.push({ ...original, id: "copy", timelineStartSec: 30, timelineEndSec: 38 });
	expect(() => associatedTypingPlacement(doc, section, 0)).toThrow("Repeated recording");
	expect(associatedTypingPlacement(doc, section, 31)).toMatchObject({
		time: 32,
		clip: { id: "copy" },
	});
});
it("rejects missing/trimmed footage or wrong sessions with no manual fallback", () => {
	const { doc, take } = associationFixture();
	const section = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[0].key,
	).sections[0];
	doc.timeline.clips[0].sourceStartSec = 6;
	expect(() => associatedTypingPlacement(doc, section, 12)).toThrow("missing");
	doc.timeline.clips[0].sourceStartSec = 2;
	doc.assets[0].recordingClock!.sessionId = "15609363-2fad-43b7-9f9f-b654c3cb14ee";
	expect(() => associatedTypingPlacement(doc, section, 12)).toThrow("missing");
});
it("does not offer legacy/editor-created flags or flags at the closed side of a pause", () => {
	const { doc, take } = associationFixture();
	doc.assets[0].recordingFlags!.push({ id: "editor", label: "", timeMs: 3000 });
	doc.assets[0].recordingFlags![0].timeMs = 5000;
	expect(recordingAnchorChoices(doc).map((c) => c.anchor.flagId)).toEqual(["r"]);
	expect(() => associateTypingSection(doc, take, take.sections[0].id, "stale")).toThrow();
	expect(() =>
		associateTypingSection(doc, { ...take, producer: "openscreen-pad" }, take.sections[0].id, ""),
	).toThrow();
});

it("rejects noncontiguous, reversed and duplicate pause intervals on import", () => {
	const { doc } = associationFixture();
	const clock = doc.assets[0].recordingClock!;
	for (const segments of [
		[{ id: "s", startMs: 1, endMs: 3 }],
		[
			{ id: "s", startMs: 0, endMs: 3 },
			{ id: "r", startMs: 2, endMs: 5 },
		],
		[
			{ id: "s", startMs: 0, endMs: 3 },
			{ id: "r", startMs: 3, endMs: 2 },
		],
		[
			{ id: "s", startMs: 0, endMs: 3 },
			{ id: "s", startMs: 3, endMs: 4 },
		],
	])
		expect(recordingClockSchema.safeParse({ ...clock, segments }).success).toBe(false);
});
it("rejects recording anchors on independent pad takes and malformed portable anchors", () => {
	const { doc, take } = associationFixture();
	const next = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[0].key,
	);
	expect(() => importTypingTake(JSON.stringify({ ...next, producer: "openscreen-pad" }))).toThrow();
	next.sections[0].sourceAnchor!.mediaTimeMs = -1;
	expect(() => importTypingTake(JSON.stringify(next))).toThrow();
});

it("rejects UI-trimmed onsets, bounds at the next trim and keeps repeated-clip selection explicit", () => {
	const { doc, take } = associationFixture();
	const section = associateTypingSection(
		doc,
		take,
		take.sections[0].id,
		recordingAnchorChoices(doc)[0].key,
	).sections[0];
	doc.timeline.trimRanges = [
		{
			id: "trim",
			assetId: "a",
			clipId: "c",
			startSec: 3.5,
			endSec: 4.5,
			origin: "user",
			reason: "test",
		},
	];
	expect(() => associatedTypingPlacement(doc, section, 12)).toThrow("trimmed out");
	doc.timeline.clips.push({
		...doc.timeline.clips[0],
		id: "copy",
		timelineStartSec: 30,
		timelineEndSec: 38,
	});
	expect(() => associatedTypingPlacement(doc, section, 12)).toThrow("trimmed out");
	expect(associatedTypingPlacement(doc, section, 31)?.clip.id).toBe("copy");
	doc.timeline.trimRanges[0].startSec = 4.2;
	expect(associatedTypingPlacement(doc, section, 12)?.maxDuration).toBeCloseTo(0.2);
});
it("deduplicates recording cue choices when the same source recording is imported twice", () => {
	const { doc } = associationFixture();
	doc.assets.push({ ...doc.assets[0], id: "duplicate" });
	expect(recordingAnchorChoices(doc)).toHaveLength(2);
});
