import { ipcMain, type WebContents } from "electron";
import { AI_EDITION_OPEN_PROJECT_CHANNEL } from "../../src/native/contracts";
import type { DocumentService } from "../ai-edition/document-service";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { RangeAuthoringService } from "../lesson/rangeAuthoring";
import { registerRangeAuthoringHandlers } from "./rangeAuthoring";

/** Production registration shared by the main handlers and its focused integration tests.
 * Callbacks retain the existing process-wide approved-path and dirty-state boundaries. */
export function registerEditorRangeAuthoring(options: {
	documents: Pick<DocumentService, "getSavedProject" | "markOpenInEditor">;
	editorHasUnsavedChanges: () => boolean;
	readableApprovedPath: (source: string) => string | null;
}) {
	// The editor says which project it holds, so `openscreen mcp`, a process of its own
	// that cannot ask it, refuses to edit that project behind its back (#1138).
	// Only the window that set the marker clears it, so an older window going away
	// never unmarks the project a newer one holds.
	let markedBy: WebContents | null = null;
	const watchedEditors = new WeakSet<WebContents>();
	registerRangeAuthoringHandlers(
		new RangeAuthoringService((id) => options.documents.getSavedProject(id)),
		(event) => ({
			...editorRangeSessions.capture(event.sender, () => options.editorHasUnsavedChanges()),
			canReadSource: (source) => !!options.readableApprovedPath(source),
		}),
	);
	ipcMain.on(AI_EDITION_OPEN_PROJECT_CHANNEL, (event, projectId: unknown) => {
		const id =
			typeof projectId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(projectId) ? projectId : null;
		if (event.senderFrame === event.sender.mainFrame) editorRangeSessions.select(event.sender, id);
		if (id === null && markedBy !== null && markedBy !== event.sender) return;
		markedBy = id === null ? null : event.sender;
		options.documents.markOpenInEditor(id);
		if (watchedEditors.has(event.sender)) return;
		watchedEditors.add(event.sender);
		event.sender.on("did-start-navigation", () => editorRangeSessions.invalidate(event.sender));
		event.sender.on("render-process-gone", () => editorRangeSessions.invalidate(event.sender));
		event.sender.once("destroyed", () => {
			if (markedBy !== event.sender) return;
			markedBy = null;
			options.documents.markOpenInEditor(null);
		});
	});
}
