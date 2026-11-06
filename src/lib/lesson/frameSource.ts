import { buildNativeClipList, buildSceneDescription } from "../../native/sceneDescription";
import { readSpeedRegions } from "../ai-edition/document/timeline";
import type { AxcutDocument } from "../ai-edition/schema";
import { sha256 } from "./schema";
/** Only ephemeral projection IDs change; authored IDs, payloads and draw order are retained.
 * Reserve every authored ID, including legacy payloads, before allocating stable fragments. */
export function buildLessonSceneDescription(document: AxcutDocument) {
	const used = new Set<string>();
	const visit = (value: unknown): void => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		const record = value as Record<string, unknown>;
		if (typeof record.id === "string") used.add(record.id);
		for (const item of Object.values(record)) visit(item);
	};
	visit(document);
	let sequence = 0;
	return buildSceneDescription(document, null, (kind) => {
		let id: string;
		do {
			id = `__lesson_fragment_${kind}_${sequence++}`;
		} while (used.has(id));
		used.add(id);
		return id;
	});
}
/** Versioned render-input identity: excludes derived privacy inspection and save timestamps.
 * Includes actual scene, media paths, source/clip geometry, raw cuts and speed projection.
 * It is not a hash/attestation of source media bytes or of the entire editor document. */
export async function lessonRenderFingerprint(document: AxcutDocument): Promise<string> {
	const projection = {
		version: 1,
		projectId: document.project.id,
		clips: buildNativeClipList(document),
		scene: buildLessonSceneDescription(document),
		rawClips: document.timeline.clips.map(
			({ id, assetId, sourceStartSec, sourceEndSec, timelineStartSec, timelineEndSec }) => ({
				id,
				assetId,
				sourceStartSec,
				sourceEndSec,
				timelineStartSec,
				timelineEndSec,
			}),
		),
		trims: document.timeline.trimRanges,
		speed: readSpeedRegions(document),
	};
	const canonical = JSON.stringify(projection, (_key, value: unknown) => {
		if (value && typeof value === "object" && !Array.isArray(value))
			return Object.fromEntries(
				Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
			);
		return value;
	});
	return sha256(new TextEncoder().encode(canonical));
}
