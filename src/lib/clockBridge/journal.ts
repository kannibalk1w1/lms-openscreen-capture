import { z } from "zod";
import { nativeClockSnapshotSchema } from "./schema";

const tick = z.number().int().nonnegative().max(86400000);
const base = {
	schemaVersion: z.literal(1),
	sequence: z.number().int().nonnegative().max(50000),
	atMs: tick,
};
const header = z
	.object({
		...base,
		event: z.literal("clock-start"),
		format: z.literal("openscreen-clock-samples"),
		version: z.literal(1),
		instanceId: z.string().regex(/^[a-zA-Z0-9-]{8,128}$/),
		grantId: z.string().uuid(),
		projectId: z.string().regex(/^[a-f0-9]{64}$/),
		clock: z.literal("session-elapsed-ms"),
	})
	.strict();
const record = z.discriminatedUnion("event", [
	header,
	z
		.object({
			...base,
			event: z.literal("clock-sample"),
			relation: z.literal("round-trip-bracket"),
			requestSequence: z.number().int().nonnegative().max(50000),
			clientSendMs: tick,
			clientReceiveMs: tick,
			nativeClock: nativeClockSnapshotSchema,
		})
		.strict(),
	z
		.object({
			...base,
			event: z.literal("clock-gap"),
			requestSequence: z.number().int().nonnegative().max(50000),
			reason: z.enum([
				"limit",
				"transport-error",
				"clock-invalid",
				"request-limit",
				"native-unavailable",
				"source-changed",
				"source-ended",
			]),
		})
		.strict(),
	z
		.object({
			...base,
			event: z.literal("clock-stop"),
			reason: z.enum(["user-stop", "disconnect", "limit"]),
		})
		.strict(),
]);
export interface ClockJournalSummary {
	samples: number;
	gaps: number;
	pausedSamples: number;
	closed: boolean;
	stopReason?: "user-stop" | "disconnect" | "limit";
	durationMs: number;
	maxRoundTripMs: number;
	nativeClockIds: string[];
	additionalClockIds: boolean;
	instanceId: string;
	projectId: string;
}
/** Portable inspection of sampled clock evidence. Closed never means complete physical coverage. */
export function inspectClockJournal(source: string): ClockJournalSummary {
	if (new TextEncoder().encode(source).byteLength > 8 * 1024 * 1024)
		throw new Error("Clock journal exceeds 8 MiB");
	const lines = source.trim().split(/\r?\n/);
	if (lines.length < 1 || lines.length > 50000) throw new Error("Clock journal record limit");
	const first = header.parse(JSON.parse(lines[0]));
	if (first.sequence !== 0) throw new Error("Clock journal header sequence");
	const result: ClockJournalSummary = {
		samples: 0,
		gaps: 0,
		pausedSamples: 0,
		closed: false,
		durationMs: 0,
		maxRoundTripMs: 0,
		nativeClockIds: [],
		additionalClockIds: false,
		instanceId: first.instanceId,
		projectId: first.projectId,
	};
	let previous = first.atMs,
		lastRequest = -1;
	const ids = new Set<string>();
	for (let i = 1; i < lines.length; i++) {
		if (result.closed) throw new Error("Clock journal contains records after closure");
		const item = record.parse(JSON.parse(lines[i]));
		if (item.event === "clock-start" || item.sequence !== i || item.atMs < previous)
			throw new Error("Mixed or unordered clock journal");
		previous = item.atMs;
		if (item.event === "clock-stop") {
			result.closed = true;
			result.stopReason = item.reason;
			continue;
		}
		if (item.requestSequence < lastRequest) throw new Error("Clock request order changed");
		lastRequest = item.requestSequence;
		if (item.event === "clock-gap") {
			result.gaps++;
			continue;
		}
		if (item.clientReceiveMs !== item.atMs || item.clientSendMs > item.clientReceiveMs)
			throw new Error("Invalid clock round trip");
		result.samples++;
		if (item.nativeClock.state === "paused") result.pausedSamples++;
		result.maxRoundTripMs = Math.max(
			result.maxRoundTripMs,
			item.clientReceiveMs - item.clientSendMs,
		);
		if (!ids.has(item.nativeClock.clockId)) {
			ids.add(item.nativeClock.clockId);
			if (result.nativeClockIds.length < 32) result.nativeClockIds.push(item.nativeClock.clockId);
			else result.additionalClockIds = true;
		}
	}
	result.durationMs = previous - first.atMs;
	return result;
}
