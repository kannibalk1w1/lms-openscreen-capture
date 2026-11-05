import { createId } from "../document/ids";
import type { AxcutDocument } from "../schema";
import { addTeachingFlag, changeTeachingFlag } from "../timeline/teachingFlags";
import { saveWithDeadline, useProjectStore, waitForDocumentSaves } from "./projectStore";
import { currentWriteEpoch } from "./undoStack";

let pending: Promise<unknown> = Promise.resolve();
function write(build: (doc: AxcutDocument) => AxcutDocument | null): Promise<boolean> {
	const projectId = useProjectStore.getState().projectId;
	const epoch = currentWriteEpoch();
	const run = async () => {
		if ((await waitForDocumentSaves()) !== "idle") return false;
		const state = useProjectStore.getState();
		if (!state.document || state.projectId !== projectId || currentWriteEpoch() !== epoch)
			return false;
		const next = build(state.document);
		return next
			? (await saveWithDeadline(state.saveDocument(next, { history: true }))) === true
			: false;
	};
	const result = pending.then(run, run);
	pending = result;
	return result;
}
export function addFlagAtPlayhead() {
	const timeSec = useProjectStore.getState().currentTimeSec;
	return write((doc) => addTeachingFlag(doc, timeSec, createId("flag")));
}
export function editTeachingFlag(assetId: string, id: string, label: string | null) {
	return write((doc) => changeTeachingFlag(doc, assetId, id, label === null ? null : { label }));
}
