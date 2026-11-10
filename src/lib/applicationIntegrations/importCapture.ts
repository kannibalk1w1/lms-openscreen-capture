import {
	type ApplicationCapture,
	MAX_APPLICATION_CAPTURE_BYTES,
	parseApplicationCapture,
} from "./capture";
import { godotSceneCapture, parseGodotSceneJournal } from "./godotScene";

/** Explicit local-file import. Unknown live adapters are never loaded or enabled. */
export function importApplicationCapture(source: string): ApplicationCapture {
	if (
		source.length > MAX_APPLICATION_CAPTURE_BYTES ||
		new TextEncoder().encode(source).byteLength > MAX_APPLICATION_CAPTURE_BYTES
	)
		throw new Error("Application capture exceeds 8 MiB");
	// A normalized capture is a single JSON object; a Godot journal is JSONL.
	// Distinguish structurally, without swallowing a malformed normalized file as a legacy format.
	let object: unknown;
	try {
		object = JSON.parse(source);
	} catch {
		return godotSceneCapture(parseGodotSceneJournal(source));
	}
	if (object && typeof object === "object" && "format" in object)
		return parseApplicationCapture(source);
	throw new Error("Unsupported application capture format");
}
