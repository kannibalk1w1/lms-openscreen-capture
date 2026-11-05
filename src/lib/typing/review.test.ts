import { expect, it } from "vitest";
import { documentSchema } from "../ai-edition/schema";
import { typingReviewEntries } from "./review";
import { reviewFixture } from "./reviewFixture";

it("projects anchored onsets with raw ruler offsets without changing saved evidence", () => {
	const doc = reviewFixture(),
		before = JSON.stringify(doc);
	expect(typingReviewEntries(doc)[0]).toMatchObject({
		status: "linked",
		placements: [{ time: 12, sourceStart: 4, clip: { id: "c" } }],
	});
	expect(JSON.stringify(doc)).toBe(before);
	expect(typingReviewEntries(documentSchema.parse(JSON.parse(before)))[0].placements[0].time).toBe(
		12,
	);
});
it("assigns split boundaries to the right fragment and repeats only actual source occurrences", () => {
	const doc = reviewFixture(),
		clip = doc.timeline.clips[0];
	doc.timeline.clips = [
		{ ...clip, sourceEndSec: 4, timelineEndSec: 12 },
		{ ...clip, id: "right", sourceStartSec: 4, timelineStartSec: 12 },
		{ ...clip, id: "copy", timelineStartSec: 30, timelineEndSec: 36 },
	];
	expect(typingReviewEntries(doc)[0].placements.map((p) => [p.clip.id, p.time])).toEqual([
		["right", 12],
		["copy", 32],
	]);
});
it("preserves trimmed occurrences for review while identifying visible copies", () => {
	const doc = reviewFixture();
	doc.timeline.trimRanges = [
		{ id: "trim", assetId: "a", clipId: "c", startSec: 3, endSec: 5, reason: "", origin: "user" },
	];
	expect(typingReviewEntries(doc)[0]).toMatchObject({
		status: "trimmed",
		placements: [{ trimmed: true }],
	});
	doc.timeline.clips.push({
		...doc.timeline.clips[0],
		id: "copy",
		timelineStartSec: 30,
		timelineEndSec: 36,
	});
	expect(typingReviewEntries(doc)[0].status).toBe("linked");
	expect(typingReviewEntries(doc)[0].placements.map((p) => p.trimmed)).toEqual([true, false]);
});
it("keeps independent, missing-session and out-of-window sections in the catalog without invented video times", () => {
	const doc = reviewFixture();
	doc.timeline.clips[0].sourceStartSec = 5;
	expect(typingReviewEntries(doc)[0]).toMatchObject({ status: "unavailable", placements: [] });
	doc.timeline.clips[0].sourceStartSec = 2;
	doc.assets[0].recordingClock = undefined;
	expect(typingReviewEntries(doc)[0].status).toBe("unavailable");
	doc.typingTakes![0].sections[0].sourceAnchor = undefined;
	expect(typingReviewEntries(doc)[0]).toMatchObject({ status: "independent", placements: [] });
});
it("uses retained source anchors even when the original flag has been removed", () => {
	const doc = reviewFixture();
	doc.assets[0].recordingFlags = [];
	expect(typingReviewEntries(doc)[0].placements).toHaveLength(1);
});
