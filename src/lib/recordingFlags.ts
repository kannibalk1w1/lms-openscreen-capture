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

export const recordingFlagSchema = z.object({
	id: z.string().min(1).max(200),
	timeMs: z.number().int().nonnegative(),
	label: z.string().max(200).default(""),
});
export const recordingFlagsFileSchema = z.object({
	version: z.literal(1),
	flags: z.array(recordingFlagSchema).max(10000),
});
export type RecordingFlag = z.infer<typeof recordingFlagSchema>;
