import { z } from "zod";

export const MAX_TYPING_TEXT = 200000;
export const MAX_TYPING_BYTES = 8 * 1024 * 1024;
export const MAX_TYPING_EVENTS = 10000;
const text = z.string().max(MAX_TYPING_TEXT);
const offset = z.number().int().nonnegative().max(MAX_TYPING_TEXT);
const time = z.number().int().nonnegative().max(86400000);
export const selectionSchema = z.object({ anchor: offset, focus: offset });
export type TypingSelection = z.infer<typeof selectionSchema>;
const base = {
	id: z.string().min(1).max(200),
	sequence: z.number().int().nonnegative(),
	atMs: time,
};
export const typingEventSchema = z.discriminatedUnion("event", [
	z.object({
		...base,
		event: z.literal("text-edit"),
		start: offset,
		removed: text,
		inserted: text,
		inputType: z.string().max(100),
		selections: z.array(selectionSchema).max(32),
	}),
	z.object({
		...base,
		event: z.literal("selection"),
		selections: z.array(selectionSchema).max(32),
	}),
	z.object({
		...base,
		event: z.literal("key"),
		key: z.string().max(100),
		code: z.string().max(100),
		pressed: z.boolean(),
		ctrl: z.boolean(),
		shift: z.boolean(),
		alt: z.boolean(),
		meta: z.boolean(),
		repeat: z.boolean(),
	}),
	z.object({
		...base,
		event: z.literal("boundary"),
		reason: z.enum([
			"pause",
			"resume",
			"focus",
			"blur",
			"composition-start",
			"composition-end",
			"stop",
		]),
	}),
]);
export type TypingEvent = z.infer<typeof typingEventSchema>;
export const typingSectionSchema = z.object({
	id: z.string().min(1).max(220),
	label: z.string().max(200),
	startSequence: z.number().int().nonnegative(),
	endSequence: z.number().int().nonnegative(),
	speed: z.number().min(0.25).max(4),
});
export type TypingSection = z.infer<typeof typingSectionSchema>;
export const typingTakeSchema = z
	.object({
		version: z.literal(1),
		id: z.string().min(1).max(200),
		title: z.string().min(1).max(200),
		producer: z.enum(["openscreen-pad", "godot-codeedit"]),
		coverage: z.enum(["complete", "limited"]).default("complete"),
		documentName: z.string().min(1).max(1000),
		offsetEncoding: z.literal("unicode-code-points"),
		clock: z.literal("session-active-ms"),
		startedAt: z.string().datetime(),
		initialText: text,
		durationMs: time,
		events: z.array(typingEventSchema).min(1).max(MAX_TYPING_EVENTS),
		sections: z.array(typingSectionSchema).max(MAX_TYPING_EVENTS),
	})
	.superRefine((take, ctx) => {
		let value = Array.from(take.initialText),
			previousTime = 0,
			paused = false;
		const ids = new Set<string>();
		const fail = (message: string) => ctx.addIssue({ code: "custom", message });
		for (const [i, event] of take.events.entries()) {
			if (
				event.sequence !== i ||
				ids.has(event.id) ||
				event.atMs < previousTime ||
				event.atMs > take.durationMs
			)
				fail("Invalid typing event order or identity");
			previousTime = event.atMs;
			ids.add(event.id);
			if (event.event === "boundary") {
				if (event.reason === "stop" && i !== take.events.length - 1) fail("Events after stop");
				if (event.reason === "pause") {
					if (paused) fail("Already paused");
					paused = true;
				}
				if (event.reason === "resume") {
					if (!paused) fail("Resume without pause");
					paused = false;
				}
			} else {
				if (paused) fail("Events during pause");
				if (event.event === "text-edit") {
					const removed = Array.from(event.removed);
					if (
						event.start > value.length ||
						value.slice(event.start, event.start + removed.length).join("") !== event.removed
					)
						fail("Text edit precondition does not match source");
					value = [
						...value.slice(0, event.start),
						...Array.from(event.inserted),
						...value.slice(event.start + removed.length),
					];
					if (value.join("").length > MAX_TYPING_TEXT) fail("Typing text limit exceeded");
				}
				if (
					"selections" in event &&
					event.selections.some((s) => s.anchor > value.length || s.focus > value.length)
				)
					fail("Selection outside text");
			}
		}
		const last = take.events.at(-1);
		if (last?.event !== "boundary" || last.reason !== "stop") fail("Unfinished typing take");
		if (last?.atMs !== take.durationMs) fail("Stop time must equal take duration");
		let previousEnd = -1;
		const sectionIds = new Set<string>();
		for (const section of take.sections) {
			if (
				sectionIds.has(section.id) ||
				section.startSequence <= previousEnd ||
				section.endSequence < section.startSequence ||
				take.events[section.startSequence]?.event !== "text-edit" ||
				take.events[section.endSequence]?.event !== "text-edit"
			)
				fail("Invalid typing section bounds");
			previousEnd = section.endSequence;
			sectionIds.add(section.id);
		}
		let sectionIndex = 0;
		for (const event of take.events) {
			if (event.event !== "text-edit") continue;
			while (
				sectionIndex < take.sections.length &&
				take.sections[sectionIndex].endSequence < event.sequence
			)
				sectionIndex++;
			const section = take.sections[sectionIndex];
			if (
				!section ||
				event.sequence < section.startSequence ||
				event.sequence > section.endSequence
			)
				fail("Every edit must belong to one section");
		}
		if (new TextEncoder().encode(JSON.stringify(take)).length > MAX_TYPING_BYTES)
			fail("Typing take exceeds 8 MiB");
	});
export type TypingTake = z.infer<typeof typingTakeSchema>;
