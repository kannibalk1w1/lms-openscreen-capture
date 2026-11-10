import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_APPLICATION_CAPTURE_BYTES } from "../../src/lib/applicationIntegrations/capture";
import { importApplicationCapture } from "../../src/lib/applicationIntegrations/importCapture";
import { appendApplicationDrafts } from "../../src/lib/lesson/applicationDraft";
import { newLesson } from "../../src/lib/lesson/authoring";
import { type LessonManifest, MAX_LESSON_BYTES, validateLesson } from "../../src/lib/lesson/schema";
import {
	type DraftApplicationCaptureFileRequest,
	draftApplicationCaptureFileSchema,
	type InspectApplicationCaptureFileRequest,
	inspectApplicationCaptureFileSchema,
} from "./applicationCaptureContracts";
import { readSelectedFileSnapshot } from "./selectedFile";

export class ApplicationCaptureFileError extends Error {
	constructor(
		readonly code:
			| "invalid-request"
			| "capture-file-unavailable"
			| "capture-file-changed"
			| "capture-file-invalid"
			| "capture-observation-invalid"
			| "lesson-file-operation-failed",
	) {
		super(code);
	}
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function readCaptureSnapshot(capturePath: string) {
	try {
		return readSelectedFileSnapshot(capturePath, MAX_APPLICATION_CAPTURE_BYTES);
	} catch {
		throw new ApplicationCaptureFileError("capture-file-unavailable");
	}
}
function parseCapture(bytes: Uint8Array) {
	try {
		return importApplicationCapture(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		throw new ApplicationCaptureFileError("capture-file-invalid");
	}
}
/** Metadata only: source payloads and baseline never appear in this inspection result. */
export function inspectApplicationCaptureFile(input: unknown) {
	let request: InspectApplicationCaptureFileRequest;
	try {
		request = inspectApplicationCaptureFileSchema.parse(input);
	} catch {
		throw new ApplicationCaptureFileError("invalid-request");
	}
	const snapshot = readCaptureSnapshot(request.capturePath);
	const capture = parseCapture(snapshot.bytes);
	return {
		format: "openscreen-application-capture-inspection" as const,
		version: 1 as const,
		sha256: digest(snapshot.bytes),
		adapterId: capture.adapterId,
		instanceId: capture.instanceId,
		sessionId: capture.sessionId,
		scope: capture.scope,
		coverage: capture.coverage,
		durationMs: capture.durationMs,
		observationCount: capture.observations.length,
		observations: capture.observations
			.slice(request.offset, request.offset + request.limit)
			.map(({ id, atMs, type, label }) => ({ id, atMs, type, label })),
		nextOffset:
			request.offset + request.limit < capture.observations.length
				? request.offset + request.limit
				: null,
	};
}
/** Re-read and fingerprint the selected source; commit selected evidence to a new lesson only. */
export async function draftApplicationCaptureFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	let request: DraftApplicationCaptureFileRequest;
	try {
		request = draftApplicationCaptureFileSchema.parse(input);
	} catch {
		throw new ApplicationCaptureFileError("invalid-request");
	}
	if (path.resolve(request.capturePath) === path.resolve(request.outputPath))
		throw new ApplicationCaptureFileError("lesson-file-operation-failed");
	assertCurrent();
	const snapshot = readCaptureSnapshot(request.capturePath);
	if (digest(snapshot.bytes) !== request.sha256)
		throw new ApplicationCaptureFileError("capture-file-changed");
	const capture = parseCapture(snapshot.bytes);
	const selectedIds = new Set(request.observationIds);
	if (
		selectedIds.size === 0 ||
		selectedIds.size !== request.observationIds.length ||
		selectedIds.size > 200 ||
		capture.observations.filter(({ id }) => selectedIds.has(id)).length !== selectedIds.size
	)
		throw new ApplicationCaptureFileError("capture-observation-invalid");
	let lesson: LessonManifest;
	try {
		lesson = await validateLesson(
			appendApplicationDrafts(newLesson(request.title), capture, request.observationIds),
		);
	} catch {
		throw new ApplicationCaptureFileError("capture-observation-invalid");
	}
	const bytes = Buffer.from(JSON.stringify(lesson, null, 2) + "\n");
	if (bytes.length > MAX_LESSON_BYTES)
		throw new ApplicationCaptureFileError("lesson-file-operation-failed");
	// Recheck live MCP consent/cancellation after asynchronous lesson validation.
	assertCurrent();
	try {
		await fs.writeFile(request.outputPath, bytes, { flag: "wx", mode: 0o600 });
	} catch {
		throw new ApplicationCaptureFileError("lesson-file-operation-failed");
	}
	return {
		status: "created" as const,
		path: request.outputPath,
		lessonId: lesson.id,
		revision: lesson.revision,
		totalSteps: lesson.steps.length,
		addedSteps: lesson.steps.map(({ id, title }) => ({ id, title })),
	};
}
