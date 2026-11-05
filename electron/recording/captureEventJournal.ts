import { randomUUID } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import type { CaptureJournalPayload, CaptureJournalRecord } from "../../src/native/captureEvents";

/** Small button/status records are flushed per line, with no cursor sample cap.
 * A failed append disables this journal and reports an error, preserving video.
 * A missing session-end means the recording/journal ended unexpectedly.
 */
export class CaptureEventJournal {
	readonly path: string;
	private readonly sessionId = randomUUID();
	private sequence = 0;
	private failed = false;
	private ended = false;

	constructor(
		videoPath: string,
		private readonly onError: (error: unknown) => void,
	) {
		this.path = `${videoPath}.events.ndjson`;
		try {
			// Never overwrite evidence from a previous recording at the same path.
			writeFileSync(this.path, "", { flag: "wx", mode: 0o600 });
		} catch (error) {
			this.fail(error);
		}
	}

	get available() {
		return !this.failed;
	}

	append(payload: CaptureJournalPayload) {
		if (this.failed || this.ended) return;
		const sequence = this.sequence++;
		const record: CaptureJournalRecord = {
			...payload,
			schemaVersion: 1,
			sessionId: this.sessionId,
			sequence,
			id: `${this.sessionId}:${sequence}`,
			producer: "openscreen-linux",
		};
		try {
			appendFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
		} catch (error) {
			this.fail(error);
		}
		if (payload.event === "session-end") this.ended = true;
	}

	private fail(error: unknown) {
		this.failed = true;
		this.onError(error);
	}
}
