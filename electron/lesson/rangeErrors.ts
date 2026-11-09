/** Fixed decoder/setup failure. No local executable path or diagnostics escape main. */
export class RangeVideoToolUnavailableError extends Error {
	constructor() {
		super("range-video-tool-unavailable");
	}
}
export class RangeMediaError extends Error {
	constructor(
		readonly code:
			| "range-media-unsupported"
			| "range-media-changed"
			| "range-media-incomplete"
			| "range-media-tool-unavailable"
			| "range-media-unattested"
			| "range-media-cancelled",
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
