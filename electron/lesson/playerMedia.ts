import { constants, lstatSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { LESSON_PLAYER_MEDIA_SCHEME } from "../../src/lib/lesson/player";
import { identity } from "./packageIO";

/** Largest byte range one request may return. */
export const PLAYER_MAX_RANGE_BYTES = 8 * 1024 * 1024;
/** Requests one capability may have in flight at once. */
export const PLAYER_MAX_INFLIGHT = 2;
/** Bytes buffered across every player window at once. */
export const PLAYER_MAX_BUFFERED_BYTES = 32 * 1024 * 1024;

/** One verified, inventory-listed MP4, pinned when the capability was installed. */
export interface PlayerMediaFile {
	path: string;
	size: number;
	identity: string;
}
export interface PlayerMediaCapability {
	token: string;
	videos: ReadonlyMap<string, PlayerMediaFile>;
	/** Aborted when the capability is revoked; pending reads stop and return nothing. */
	signal: AbortSignal;
	/** Still the owner's live capability. */
	isCurrent(): boolean;
	/** Ends the capability: a pinned file is no longer what was verified. */
	revoke(): void;
	inflight: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let buffered = 0;
export const playerBufferedBytes = () => buffered;

/** One `bytes=` range only; suffix ranges allowed; a missing header means the start of the file. */
export function parsePlayerRange(
	header: string | null,
	size: number,
): { start: number; end: number } | null {
	if (size < 1) return null;
	let start: number, end: number;
	if (header === null) {
		start = 0;
		end = size - 1;
	} else {
		const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(header);
		if (!match || (match[1] === "" && match[2] === "")) return null;
		if (match[1] === "") {
			const suffix = Number(match[2]);
			if (suffix < 1) return null;
			start = Math.max(0, size - suffix);
			end = size - 1;
		} else {
			start = Number(match[1]);
			end = match[2] === "" ? size - 1 : Number(match[2]);
			if (end < start || start >= size) return null;
			end = Math.min(end, size - 1);
		}
	}
	return { start, end: Math.min(end, start + PLAYER_MAX_RANGE_BYTES - 1) };
}

const empty = (status: number, headers: Record<string, string> = {}) =>
	new Response(null, {
		status,
		headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
	});
class Changed extends Error {}

/**
 * Serves one bounded range of one verified step video. The URL names an opaque capability token
 * and a step ID, never a path; everything else is refused with an empty fixed response.
 */
export async function servePlayerMedia(
	request: Request,
	capability: () => PlayerMediaCapability | undefined,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") return empty(405);
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return empty(404);
	}
	const stepId = url.pathname.slice(1);
	if (
		url.protocol !== `${LESSON_PLAYER_MEDIA_SCHEME}:` ||
		!UUID.test(url.hostname) ||
		!UUID.test(stepId) ||
		url.search ||
		url.hash ||
		url.username ||
		url.password ||
		url.port
	)
		return empty(404);
	const cap = capability();
	if (!cap || cap.token !== url.hostname || !cap.isCurrent() || cap.signal.aborted)
		return empty(404);
	const file = cap.videos.get(stepId);
	if (!file) return empty(404);
	const rangeHeader = request.headers.get("range");
	const range = parsePlayerRange(rangeHeader, file.size);
	if (!range) return empty(416, { "Content-Range": `bytes */${file.size}` });
	const base = {
		"Content-Type": "video/mp4",
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	};
	const pathCurrent = () =>
		realpathSync(file.path) === path.resolve(file.path) &&
		identity(lstatSync(file.path)) === file.identity;
	if (request.method === "HEAD") {
		try {
			if (!pathCurrent()) throw new Changed();
		} catch {
			cap.revoke();
			return empty(404);
		}
		return rangeHeader === null
			? empty(200, { ...base, "Content-Length": String(file.size) })
			: empty(206, {
					...base,
					"Content-Length": String(range.end - range.start + 1),
					"Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
				});
	}
	const length = range.end - range.start + 1;
	if (cap.inflight >= PLAYER_MAX_INFLIGHT || buffered + length > PLAYER_MAX_BUFFERED_BYTES)
		return empty(503, { "Retry-After": "1" });
	cap.inflight++;
	buffered += length;
	try {
		const handle = await fs.open(
			file.path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			if (identity(await handle.stat()) !== file.identity) throw new Changed();
			const bytes = Buffer.alloc(length);
			for (let at = 0; at < length; ) {
				if (cap.signal.aborted || request.signal?.aborted) return empty(404);
				const { bytesRead } = await handle.read(bytes, at, length - at, range.start + at);
				if (!bytesRead) throw new Changed();
				at += bytesRead;
			}
			// Final checks immediately before any byte leaves: the descriptor and the path are still
			// the verified file, and the capability is still live.
			if (identity(await handle.stat()) !== file.identity || !pathCurrent()) throw new Changed();
			if (cap.signal.aborted || !cap.isCurrent() || request.signal?.aborted) return empty(404);
			return new Response(bytes, {
				status: 206,
				headers: {
					...base,
					"Content-Length": String(length),
					"Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
				},
			});
		} finally {
			await handle.close();
		}
	} catch {
		// Changed, replaced, missing or unreadable: no bytes, no detail, and no more playback.
		cap.revoke();
		return empty(404);
	} finally {
		cap.inflight--;
		buffered -= length;
	}
}
