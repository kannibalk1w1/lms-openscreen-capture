import { z } from "zod";

const ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const clockFields = {
	observedMonotonicMs: ms,
	state: z.enum(["waiting", "recording", "paused", "stopped"]),
	mediaTimeMs: ms.nullable(),
	intervalId: ms.nullable(),
	intervalStartMonotonicMs: ms.nullable(),
	intervalEndMonotonicMs: ms.nullable(),
	intervalMediaStartMs: ms.nullable(),
};
export const nativeClockSnapshotEventSchema = z.object({
	event: z.literal("clock-snapshot"),
	schemaVersion: z.literal(1),
	requestId: z.string().uuid(),
	...clockFields,
});
export const nativeClockSnapshotSchema = z
	.object({ version: z.literal(1), clockId: z.string().uuid(), ...clockFields })
	.strict()
	.superRefine((point, ctx) => {
		const invalid = () =>
			ctx.addIssue({ code: "custom", message: "Invalid native clock interval" });
		if (point.state === "waiting") {
			if (
				point.mediaTimeMs !== null ||
				point.intervalId !== null ||
				point.intervalStartMonotonicMs !== null ||
				point.intervalEndMonotonicMs !== null ||
				point.intervalMediaStartMs !== null
			)
				invalid();
			return;
		}
		if (point.intervalId === null) {
			if (
				point.state !== "stopped" ||
				point.mediaTimeMs !== null ||
				point.intervalStartMonotonicMs !== null ||
				point.intervalEndMonotonicMs !== null ||
				point.intervalMediaStartMs !== null
			)
				invalid();
			return;
		}
		if (
			point.mediaTimeMs === null ||
			point.intervalStartMonotonicMs === null ||
			point.intervalMediaStartMs === null
		) {
			invalid();
			return;
		}
		if (
			point.intervalStartMonotonicMs > point.observedMonotonicMs ||
			point.mediaTimeMs < point.intervalMediaStartMs
		)
			invalid();
		if (point.state === "recording" && point.intervalEndMonotonicMs !== null) invalid();
		if (
			point.state !== "recording" &&
			(point.intervalEndMonotonicMs === null ||
				point.intervalEndMonotonicMs < point.intervalStartMonotonicMs ||
				point.intervalEndMonotonicMs > point.observedMonotonicMs)
		)
			invalid();
	});
export type NativeClockSnapshot = z.infer<typeof nativeClockSnapshotSchema>;

export const clockRequestSchema = z
	.object({
		version: z.literal(1),
		grantId: z.string().uuid(),
		instanceId: z.string().regex(/^[a-zA-Z0-9-]{8,128}$/),
		projectId: z.string().regex(/^[a-f0-9]{64}$/),
		sequence: z.number().int().nonnegative().max(50000),
		clientSendMs: z.number().int().nonnegative().max(86400000),
	})
	.strict();
export type ClockRequest = z.infer<typeof clockRequestSchema>;
export const clockLinkSchema = z
	.object({
		format: z.literal("openscreen-clock-link"),
		version: z.literal(1),
		endpoint: z.string().regex(/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/clock$/),
		token: z.string().regex(/^[a-f0-9]{64}$/),
		grantId: z.string().uuid(),
		projectId: z.string().regex(/^[a-f0-9]{64}$/),
		projectPath: z.string().min(1).max(4096),
	})
	.strict();
export type ClockLink = z.infer<typeof clockLinkSchema>;
export type ClockBridgeStatus = {
	available: boolean;
	state: "disabled" | "paired" | "waiting" | "recording" | "paused" | "stale" | "expired" | "ended";
	peers: number;
	pairFilePath?: string;
	projectLabel?: string;
	lastSampleAgeMs?: number;
};

export class NativeClockSourceEndedError extends Error {
	constructor() {
		super("Native recording clock session ended");
	}
}
