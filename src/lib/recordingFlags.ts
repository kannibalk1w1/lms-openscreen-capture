import { z } from "zod";
import type { ShortcutBinding } from "./shortcuts";

export interface RecordingFlagStatus {
	running: boolean;
	paused: boolean;
	count: number;
	shortcut: ShortcutBinding;
	shortcutAvailable: boolean;
	error: string | null;
}

// This is the flags/control clock, not the native encoder event-journal clock.
export const recordingClockSchema = z
	.object({
		sessionId: z.string().uuid(),
		clock: z.literal("recording-control-active-ms"),
		segments: z
			.array(
				z.object({
					id: z.string().min(1).max(200),
					startMs: z.number().int().nonnegative(),
					endMs: z.number().int().nonnegative(),
				}),
			)
			.min(1)
			.max(10000),
	})
	.superRefine((clock, ctx) => {
		const ids = new Set<string>();
		let end = 0;
		for (const segment of clock.segments) {
			if (ids.has(segment.id) || segment.startMs !== end || segment.endMs < segment.startMs)
				ctx.addIssue({ code: "custom", message: "Invalid recording pause segments" });
			ids.add(segment.id);
			end = segment.endMs;
		}
	});
export type RecordingClock = z.infer<typeof recordingClockSchema>;

export const recordingFlagSchema = z.object({
	id: z.string().min(1).max(200),
	timeMs: z.number().int().nonnegative(),
	label: z.string().max(200).default(""),
	segmentId: z.string().min(1).max(200).optional(),
});
export const recordingFlagsFileSchema = z.object({
	version: z.literal(1),
	flags: z.array(recordingFlagSchema).max(10000),
	recordingClock: recordingClockSchema.optional(),
});
export type RecordingFlag = z.infer<typeof recordingFlagSchema>;
