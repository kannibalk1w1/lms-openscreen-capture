/** Append-only input evidence. These are source events, never editor effects. */
export interface CaptureEventPosition {
	x: number;
	y: number;
	width: number;
	height: number;
	space: "source-pixels";
	observation: "latest-frame";
}

export interface InputDiscontinuityEvidence {
	event: "input-discontinuity";
	monotonicMs: number;
	device: string;
	reason: "device-lost" | "stream-lost" | "kernel-overflow";
	buttonStateObservation: "dispatch";
	clearedButtons: { intervalId: number; code: number }[];
}

export interface InputDrainEvidence {
	event: "input-drain";
	monotonicMs: number;
	scope: "queued-before-fence";
	completed: boolean;
	processedMessages: number;
	acceptedEdges: number;
	excludedEdges: number;
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
	/** Pause-compacted encoder time. Older helpers used dispatch time; see mediaTimeObservation. */
	mediaTimeMs: number;
	/** Linux BTN_* code, 0x110 (left) through 0x117 (task). */
	code: number;
	pressed: boolean;
	device: string;
	/** Unknown in embedded cursor mode; never infer a position from the desktop. */
	position: CaptureEventPosition | null;
	/** Optional for journals written by older helpers. Intervals separate pause boundaries. */
	intervalId?: number;
	continuity?: "unmatched-release" | "repeated-press" | "out-of-order";
	/** Reader receipt time projected through the encoder clock; not physical event time. */
	mediaTimeObservation?: "reader";
	dispatchDelayMs?: number;
	/** Delivered after its interval closed or while recording was paused. */
	late?: boolean;
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
	| InputDiscontinuityEvidence
	| InputDrainEvidence
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
