import { type GodotSceneJournal, godotSceneCapture } from "../applicationIntegrations/godotScene";
import { appendApplicationDrafts } from "./applicationDraft";
import type { LessonManifest } from "./schema";

/** Godot adapter convenience; shared authoring only consumes normalized application captures. */
export function appendSceneDrafts(
	lesson: LessonManifest,
	journal: GodotSceneJournal,
	selected: string[],
): LessonManifest {
	return appendApplicationDrafts(lesson, godotSceneCapture(journal), selected);
}
