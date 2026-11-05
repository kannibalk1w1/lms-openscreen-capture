import { expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "../schema";
import { addTeachingFlag, changeTeachingFlag, timelineFlags } from "./teachingFlags";

function fixture() {
	const doc = createEmptyDocument({ title: "Flags", projectId: "p" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Take",
			originalPath: "/take.mp4",
			cameraTrack: null,
			recordingFlags: [{ id: "f", timeMs: 4000, label: "Clap" }],
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 2,
			sourceEndSec: 8,
			timelineStartSec: 10,
			timelineEndSec: 16,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	return doc;
}
it("maps source flags through offsets, splits and duplicate placements without inventing boundary duplicates", () => {
	const doc = fixture();
	expect(timelineFlags(doc)[0].timeSec).toBe(12);
	doc.timeline.clips = [
		{ ...doc.timeline.clips[0], sourceEndSec: 4, timelineEndSec: 12 },
		{ ...doc.timeline.clips[0], id: "right", sourceStartSec: 4, timelineStartSec: 12 },
		{ ...doc.timeline.clips[0], id: "copy", timelineStartSec: 20, timelineEndSec: 26 },
	];
	expect(timelineFlags(doc).map((f) => [f.clipId, f.timeSec])).toEqual([
		["right", 12],
		["copy", 22],
	]);
});
it("adds at the playhead in source time, saves/reopens and renames/removes without changing video edits", () => {
	const doc = fixture();
	const next = addTeachingFlag(doc, 13, "new")!;
	const restored = documentSchema.parse(JSON.parse(JSON.stringify(next)));
	expect(restored.assets[0].recordingFlags?.at(-1)).toMatchObject({ id: "new", timeMs: 5000 });
	const renamed = changeTeachingFlag(restored, "a", "new", { label: "Retake" });
	expect(timelineFlags(renamed).at(-1)?.label).toBe("Retake");
	expect(timelineFlags(changeTeachingFlag(renamed, "a", "new", null))).toHaveLength(1);
	expect(renamed.timeline).toEqual(doc.timeline);
	expect(addTeachingFlag(doc, 5, "gap")).toBeNull();
	expect(addTeachingFlag(doc, 16, "end")?.assets[0].recordingFlags?.at(-1)?.timeMs).toBe(7999);
});
