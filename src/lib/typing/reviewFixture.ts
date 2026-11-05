import { createEmptyDocument } from "../ai-edition/schema";
import { TypingCapture } from "./capture";
export function reviewFixture() {
	const doc = createEmptyDocument({ title: "Review", projectId: "p" });
	const capture = new TypingCapture("before", () => 0, "t");
	capture.observe("final 日本語😀", [], "insertText");
	const take = { ...capture.finish("Godot"), producer: "godot-codeedit" as const };
	take.sections[0].label = "Change health";
	take.sections[0].sourceAnchor = {
		method: "manual-recording-flag",
		recordingSessionId: "7570d5c5-7f90-40b3-ace4-ac27839e318b",
		segmentId: "active",
		flagId: "f",
		mediaTimeMs: 4000,
	};
	doc.typingTakes = [take];
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Take",
			originalPath: "/take.mp4",
			cameraTrack: null,
			recordingClock: {
				sessionId: take.sections[0].sourceAnchor.recordingSessionId,
				clock: "recording-control-active-ms",
				segments: [{ id: "active", startMs: 0, endMs: 10000 }],
			},
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
