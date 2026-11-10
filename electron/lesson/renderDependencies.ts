import type { buildLessonSceneDescription } from "../../src/lib/lesson/frameSource";
import type { CompositorClipInput } from "../../src/native/contracts";

export type RenderDependency =
	| "webcam"
	| "added-audio"
	| "click-sound"
	| "image-background"
	| "image-annotation"
	| "webcam-effect";
type Scene = Pick<
	ReturnType<typeof buildLessonSceneDescription>,
	"audioTracks" | "clickSound" | "background" | "annotations" | "webcamEffect"
>;
/**
 * Every input of a composed render that names or embeds a file other than a clip's screen source.
 * Explicit-file lesson media (range export and headless illustration) supports none of them: they
 * are refused by kind, never granted, relinked, substituted or silently dropped. The recorded cursor
 * file beside a screen source is a filesystem fact, checked separately by `requireNoCursorSidecar`.
 */
export function unsupportedRenderDependencies(
	clips: CompositorClipInput[],
	scene: Scene,
): RenderDependency[] {
	const found: RenderDependency[] = [];
	if (clips.some((clip) => !!clip.webcamPath)) found.push("webcam");
	if (scene.audioTracks.length) found.push("added-audio");
	if (scene.clickSound) found.push("click-sound");
	if (scene.background.kind === "image") found.push("image-background");
	if (scene.annotations.some((item) => !!item.imagePath)) found.push("image-annotation");
	if (scene.webcamEffect) found.push("webcam-effect");
	return found;
}
