import type { RecordingFlag } from "../../recordingFlags";
import type { AxcutDocument } from "../schema";

/** Raw-ruler points: cuts still occupy space here, matching the rest of the editor. */
export function timelineFlags(doc: AxcutDocument) {
	return doc.timeline.clips.flatMap((clip) => {
		const asset = doc.assets.find((a) => a.id === clip.assetId);
		const end =
			clip.sourceEndSec ?? clip.sourceStartSec + clip.timelineEndSec - clip.timelineStartSec;
		return (asset?.recordingFlags ?? [])
			.map((flag, index) => ({
				...flag,
				assetId: clip.assetId,
				clipId: clip.id,
				number: index + 1,
				timeSec: clip.timelineStartSec + flag.timeMs / 1000 - clip.sourceStartSec,
			}))
			.filter((flag) => flag.timeMs / 1000 >= clip.sourceStartSec && flag.timeMs / 1000 < end);
	});
}

export function addTeachingFlag(
	doc: AxcutDocument,
	timeSec: number,
	id: string,
): AxcutDocument | null {
	if (!Number.isFinite(timeSec)) return null;
	const clips = doc.timeline.clips;
	const lastEnd = Math.max(0, ...clips.map((c) => c.timelineEndSec));
	const clip =
		clips.find((c) => timeSec >= c.timelineStartSec && timeSec < c.timelineEndSec) ??
		(timeSec === lastEnd ? clips.find((c) => c.timelineEndSec === lastEnd) : undefined);
	if (!clip) return null;
	return {
		...doc,
		assets: doc.assets.map((asset) =>
			asset.id === clip.assetId
				? {
						...asset,
						recordingFlags: [
							...(asset.recordingFlags ?? []),
							{
								id,
								timeMs: Math.min(
									Math.round((clip.sourceStartSec + timeSec - clip.timelineStartSec) * 1000),
									Math.ceil(
										(clip.sourceEndSec ??
											clip.sourceStartSec + clip.timelineEndSec - clip.timelineStartSec) * 1000,
									) - 1,
								),
								label: "",
							},
						].sort((a, b) => a.timeMs - b.timeMs),
					}
				: asset,
		),
	};
}

export function changeTeachingFlag(
	doc: AxcutDocument,
	assetId: string,
	id: string,
	patch: Pick<RecordingFlag, "label"> | null,
): AxcutDocument {
	return {
		...doc,
		assets: doc.assets.map((asset) =>
			asset.id === assetId
				? {
						...asset,
						recordingFlags: (asset.recordingFlags ?? []).flatMap((flag) =>
							flag.id === id
								? patch
									? [{ ...flag, label: patch.label.slice(0, 200) }]
									: []
								: [flag],
						),
					}
				: asset,
		),
	};
}
