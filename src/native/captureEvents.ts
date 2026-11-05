/** Append-only input evidence. These are source events, never editor effects. */
export interface CaptureEventPosition {
	x: number;
	y: number;
	width: number;
	height: number;
	space: "source-pixels";
	observation: "latest-frame";
}

export interface CaptureBoundaryEvidence {
	event: "capture-boundary";
	timestampMs: number;
	monotonicMs: number;
	mediaTimeMs: number;
	reason: "start" | "pause" | "resume" | "stop";
	intervalId: number;
	buttonStateObservation: "dispatch";
	buttonsDown: { device: string; code: number }[];
}

export interface PointerButtonEvidence {
	event: "pointer-button";
	timestampMs: number;
	/** Monotonic milliseconds since the helper clock's first observation. */
	monotonicMs: number;
	/** Encoder's active clock at dispatch; excludes pauses. */
	mediaTimeMs: number;
	/** Linux BTN_* code, 0x110 (left) through 0x117 (task). */
	code: number;
	pressed: boolean;
	device: string;
	/** Unknown in embedded cursor mode; never infer a position from the desktop. */
	position: CaptureEventPosition | null;
	/** Optional for journals written by older helpers. Intervals separate pause boundaries. */
	intervalId?: number;
	continuity?: "unmatched-release" | "repeated-press";
}

export interface InputCaptureStatus {
	event: "input-capture-status";
	state: "partial" | "unavailable" | "disabled" | "unknown";
	driver: "linux-evdev" | "linux-kwin";
	scope: "global-physical-buttons-no-taps" | "global-compositor-buttons";
}

export type CaptureJournalPayload =
	| {
			event: "session-start";
			helperMonotonicMs: number | null;
			mediaTimeMs: number | null;
			timestampMs: number;
			videoPath: string;
			sourceKind: "monitor" | "window" | "virtual" | null;
			application: null;
			window: null;
	  }
	| CaptureBoundaryEvidence
	| PointerButtonEvidence
	| InputCaptureStatus
	| { event: "input-warning"; code: string; message: string }
	| { event: "session-end"; durationMs: number };

export type CaptureJournalRecord = CaptureJournalPayload & {
	schemaVersion: 1;
	sessionId: string;
	sequence: number;
	id: string;
	producer: "openscreen-linux";
};

/** Live capture health; journal errors take precedence over driver availability. */
export interface InputCaptureHealth {
	state: InputCaptureStatus["state"] | "failed" | "interrupted";
	driver: InputCaptureStatus["driver"];
	scope: InputCaptureStatus["scope"];
	warning: string | null;
}
