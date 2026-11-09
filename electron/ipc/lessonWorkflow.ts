import type { DocumentService } from "../ai-edition/document-service";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { LessonRangeExportService } from "../lesson/rangeExport";
import { LessonService } from "../lesson/service";
import type { CompositorViewService } from "../native-bridge/services/compositorViewService";
import { registerEditorRangeAuthoring } from "./editorRangeAuthoring";
import { registerEditorLessonHandlers } from "./lesson";
import { registerLessonPackageOpenHandlers } from "./lessonPackageOpen";
import { registerLessonRangeExportHandlers } from "./lessonRangeExport";
/** Main supplies its live dirty provider directly; all lesson routes share this production binding. */
export function registerLessonWorkflow(options: {
	documents: Pick<DocumentService, "getProject" | "getSavedProject" | "markOpenInEditor">;
	compositor: Pick<CompositorViewService, "renderFrames" | "startExportMulti">;
	editorHasUnsavedChanges: () => boolean;
	readableApprovedPath: (source: string) => string | null;
}) {
	if (typeof options.editorHasUnsavedChanges !== "function")
		throw new Error("Editor dirty-state provider is required.");
	registerEditorLessonHandlers(
		new LessonService(
			(id) => options.documents.getProject(id),
			(...args) => options.compositor.renderFrames(...args),
		),
		options.editorHasUnsavedChanges,
	);
	registerEditorRangeAuthoring(options);
	registerLessonPackageOpenHandlers((event) =>
		editorRangeSessions.capture(event.sender, options.editorHasUnsavedChanges),
	);
	registerLessonRangeExportHandlers(
		new LessonRangeExportService(
			(id) => options.documents.getSavedProject(id),
			(clips, out, scene, params, progress) =>
				options.compositor.startExportMulti(clips, out, scene, params, progress),
		),
		(event) => ({
			...editorRangeSessions.capture(event.sender, options.editorHasUnsavedChanges),
			canReadSource: (source) => !!options.readableApprovedPath(source),
		}),
	);
}
