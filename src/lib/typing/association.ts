import type { AxcutDocument } from "../ai-edition/schema";
import { trimAppliesToClip } from "../ai-edition/timeline/trim-mapping";
import type { TypingSection, TypingTake } from "./schema";

/** Explicit human calibration of section onset only. Never aligns by UTC or typing elapsed time. */
export function recordingAnchorChoices(doc: AxcutDocument) {
	const seen = new Set<string>();
	return doc.assets
		.flatMap((asset) =>
			(asset.recordingFlags ?? []).flatMap((flag) => {
				const clock = asset.recordingClock;
				const segment = clock?.segments.find((s) => s.id === flag.segmentId);
				if (
					asset.kind !== "video" ||
					!clock ||
					!segment ||
					flag.timeMs < segment.startMs ||
					flag.timeMs >= segment.endMs
				)
					return [];
				return [
					{
						key: JSON.stringify([asset.id, flag.id]),
						label: `${asset.label} · ${flag.label || "Flag"} · ${(flag.timeMs / 1000).toFixed(3)}s`,
						anchor: {
							method: "manual-recording-flag" as const,
							recordingSessionId: clock.sessionId,
							segmentId: segment.id,
							flagId: flag.id,
							mediaTimeMs: flag.timeMs,
						},
					},
				];
			}),
		)
		.filter((choice) => {
			const a = choice.anchor;
			const key = JSON.stringify([a.recordingSessionId, a.flagId, a.segmentId, a.mediaTimeMs]);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function associateTypingSection(
	doc: AxcutDocument,
	take: TypingTake,
	sectionId: string,
	choiceKey: string,
): TypingTake {
	if (take.producer !== "godot-codeedit")
		throw new Error("Recording association requires a Godot take");
	const choice = recordingAnchorChoices(doc).find((c) => c.key === choiceKey);
	if (choiceKey && !choice) throw new Error("Recording flag is no longer available");
	if (!take.sections.some((s) => s.id === sectionId)) throw new Error("Typing section is missing");
	return {
		...take,
		sections: take.sections.map((s) =>
			s.id === sectionId ? { ...s, sourceAnchor: choice?.anchor } : s,
		),
	};
}

/** All source occurrences, including explicitly trimmed onsets for review. */
export function typingSectionPlacements(doc: AxcutDocument, section: TypingSection) {
	const anchor = section.sourceAnchor;
	if (!anchor) return [];
	const sourceSec = anchor.mediaTimeMs / 1000;
	return doc.timeline.clips.flatMap((clip) => {
		const asset = doc.assets.find((a) => a.id === clip.assetId);
		if (asset?.kind !== "video" || asset.recordingClock?.sessionId !== anchor.recordingSessionId)
			return [];
		const segment = asset.recordingClock.segments.find((s) => s.id === anchor.segmentId);
		if (!segment || anchor.mediaTimeMs < segment.startMs || anchor.mediaTimeMs >= segment.endMs)
			return [];
		const sourceEnd =
			clip.sourceEndSec ?? clip.sourceStartSec + clip.timelineEndSec - clip.timelineStartSec;
		if (sourceSec < clip.sourceStartSec || sourceSec >= sourceEnd) return [];
		const time = clip.timelineStartSec + sourceSec - clip.sourceStartSec;
		if (time < clip.timelineStartSec || time >= clip.timelineEndSec) return [];
		const trims = doc.timeline.trimRanges.filter(
			(trim) => trim.endSec > trim.startSec && trimAppliesToClip(trim, clip),
		);
		const trimmed = trims.some((trim) => sourceSec >= trim.startSec && sourceSec < trim.endSec);
		const nextTrim = Math.min(
			sourceEnd,
			...trims.filter((trim) => trim.startSec > sourceSec).map((trim) => trim.startSec),
		);
		return [
			{
				clip,
				trimmed,
				time,
				sourceStart: sourceSec,
				maxDuration: Math.min(
					nextTrim - sourceSec,
					clip.timelineEndSec - (clip.timelineStartSec + sourceSec - clip.sourceStartSec),
					segment.endMs / 1000 - sourceSec,
				),
			},
		];
	});
}

/** Resolve in source coordinates; a split boundary belongs to the right fragment. */
export function associatedTypingPlacement(
	doc: AxcutDocument,
	section: TypingSection,
	playhead: number,
) {
	if (!section.sourceAnchor) return null;
	const candidates = typingSectionPlacements(doc, section);

	const selected = candidates.filter(
		({ clip }) => playhead >= clip.timelineStartSec && playhead < clip.timelineEndSec,
	);
	if (candidates.length === 1 || selected.length === 1) {
		const choice = candidates.length === 1 ? candidates[0] : selected[0];
		if (choice.trimmed) throw new Error("Associated recording moment is trimmed out");
		return choice;
	}
	throw new Error(
		candidates.length
			? "Repeated recording: place the playhead in the intended clip"
			: "Associated recording moment is missing or outside the source clips",
	);
}
