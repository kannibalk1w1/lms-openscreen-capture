export class RangeMediaError extends Error {
	constructor(
		readonly code:
			| "range-media-unsupported"
			| "range-media-changed"
			| "range-media-incomplete"
			| "range-media-unattested"
			| "range-media-cancelled",
		readonly artifactPath?: string,
	) {
		super(code);
	}
}
