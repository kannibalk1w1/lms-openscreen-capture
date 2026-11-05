import { associatedTypingPlacement } from "../../typing/association";
import { sectionPlayback } from "../../typing/capture";
import { codePanelForRegion } from "../../typing/presentation";
import { codePresentationSchema } from "../../typing/presentationSchema";
import { type TypingTake, typingTakeSchema } from "../../typing/schema";
import { createId } from "../document/ids";
import { annotationRegionSchema } from "../schema";
import { saveWithDeadline, useProjectStore, waitForDocumentSaves } from "./projectStore";
import { currentWriteEpoch } from "./undoStack";

/** Explicit save gesture. Never moves a draft into a different project after an await. */
export async function saveTypingTake(take: TypingTake): Promise<boolean> {
	const projectId = useProjectStore.getState().projectId;
	const epoch = currentWriteEpoch();
	if ((await waitForDocumentSaves()) !== "idle") return false;
	const state = useProjectStore.getState();
	if (!state.document || state.projectId !== projectId || currentWriteEpoch() !== epoch)
		return false;
	const validated = typingTakeSchema.parse(take);
	const takes = state.document.typingTakes ?? [];
	const next = [...takes.filter((t) => t.id !== take.id), validated];
	if (next.length > 20) throw new Error("At most 20 typing takes per project");
	return (
		(await saveWithDeadline(
			state.saveDocument({ ...state.document, typingTakes: next }, { history: true }),
		)) === true
	);
}

/** Place at an explicit recording anchor, or at the playhead for independent takes. */
export async function addCodePresentation(take: TypingTake, sectionId: string): Promise<boolean> {
	const initial = useProjectStore.getState(),
		epoch = currentWriteEpoch(),
		projectId = initial.projectId;
	const playhead = initial.currentTimeSec;
	if ((await waitForDocumentSaves()) !== "idle") return false;
	const state = useProjectStore.getState(),
		doc = state.document;
	if (!doc || state.projectId !== projectId || currentWriteEpoch() !== epoch) return false;
	const validated = typingTakeSchema.parse(take);
	const section = validated.sections.find((s) => s.id === sectionId);
	if (!section) throw new Error("Typing section is missing");
	const placement = associatedTypingPlacement(doc, section, playhead);
	const time = placement?.time ?? playhead;
	const clip =
		placement?.clip ??
		doc.timeline.clips.find((c) => time >= c.timelineStartSec && time < c.timelineEndSec);
	if (!clip) throw new Error("Place the playhead inside a video clip first");
	const playback = sectionPlayback(take, section);
	const edit = take.events[section.startSequence];
	const firstLine =
		edit.event === "text-edit"
			? Math.max(
					1,
					Array.from(playback.beforeText).slice(0, edit.start).join("").split("\n").length - 2,
				)
			: 1;
	const sourceStart = placement?.sourceStart ?? clip.sourceStartSec + time - clip.timelineStartSec;
	const duration = Math.min(
		placement?.maxDuration ?? clip.timelineEndSec - time,
		Math.max(
			2,
			Array.from(
				playback.finalText
					.split("\n")
					.slice(firstLine - 1, firstLine + 19)
					.join("\n"),
			).length /
				30 +
				1,
		),
	);
	const codeData = codePresentationSchema.parse({ takeId: take.id, sectionId, firstLine });
	const nextTake = typingTakeSchema.parse(take),
		takes = [...(doc.typingTakes ?? []).filter((t) => t.id !== take.id), nextTake];
	if (takes.length > 20) throw new Error("Too many typing takes");
	const next = { ...doc, typingTakes: takes };
	codePanelForRegion(next, codeData, sourceStart, duration); // Validate the bounded excerpt before saving.
	const region = annotationRegionSchema.parse({
		id: createId("code"),
		type: "image",
		content: take.title,
		codeData,
		space: "frame",
		clipId: clip.id,
		sourceStartSec: sourceStart,
		sourceEndSec: sourceStart + duration,
		startMs: time * 1000,
		endMs: (time + duration) * 1000,
		position: { x: 10, y: 12 },
		size: { width: 80, height: 76 },
		style: {},
		zIndex: Math.max(0, ...doc.annotations.map((a) => a.zIndex)) + 1,
	});
	return (
		(await saveWithDeadline(
			state.saveDocument({ ...next, annotations: [...doc.annotations, region] }, { history: true }),
		)) === true
	);
}
