import {
	MAX_TYPING_BYTES,
	MAX_TYPING_EVENTS,
	MAX_TYPING_TEXT,
	type TypingEvent,
	type TypingSection,
	type TypingSelection,
	type TypingTake,
	typingTakeSchema,
} from "./schema";

/** Minimal contiguous replacement of actual observed text; never guesses from keys. */
export function textChange(before: string, after: string) {
	const a = Array.from(before),
		b = Array.from(after);
	let start = 0,
		endA = a.length,
		endB = b.length;
	while (start < endA && start < endB && a[start] === b[start]) start++;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}
	return { start, removed: a.slice(start, endA).join(""), inserted: b.slice(start, endB).join("") };
}
export function applyTextEdit(value: string, event: Extract<TypingEvent, { event: "text-edit" }>) {
	const points = Array.from(value),
		count = Array.from(event.removed).length;
	if (
		event.start < 0 ||
		event.start > points.length ||
		points.slice(event.start, event.start + count).join("") !== event.removed
	)
		throw new Error("Text edit precondition mismatch");
	return [
		...points.slice(0, event.start),
		...Array.from(event.inserted),
		...points.slice(event.start + count),
	].join("");
}
export function groupTypingSections(events: TypingEvent[], gapMs = 1500): TypingSection[] {
	const sections: TypingSection[] = [];
	let current: TypingSection | null = null,
		lastEdit = -Infinity;
	for (const event of events) {
		if (event.event === "boundary" && ["pause", "blur", "stop"].includes(event.reason))
			current = null;
		if (event.event !== "text-edit") continue;
		if (!current || event.atMs - lastEdit > gapMs) {
			current = {
				id: `section-${event.id}`,
				label: "",
				startSequence: event.sequence,
				endSequence: event.sequence,
				speed: 1,
			};
			sections.push(current);
		} else current.endSequence = event.sequence;
		lastEdit = event.atMs;
	}
	return sections;
}
type EventPayload = TypingEvent extends infer E
	? E extends TypingEvent
		? Omit<E, "id" | "sequence" | "atMs">
		: never
	: never;
export class TypingCapture {
	private events: TypingEvent[] = [];
	private value: string;
	private startAt: number;
	private pausedAt: number | null = null;
	private pauseMs = 0;
	private stopped = false;
	private bytes = 0;
	private selections: TypingSelection[] = [];
	readonly startedAt = new Date().toISOString();
	constructor(
		readonly initialText: string,
		private readonly now = () => performance.now(),
		readonly id: string = crypto.randomUUID(),
	) {
		if (initialText.length > MAX_TYPING_TEXT) throw new Error("Typing text limit exceeded");
		this.value = initialText;
		this.startAt = now();
		this.bytes = new TextEncoder().encode(initialText).length;
	}
	get text() {
		return this.value;
	}
	get paused() {
		return this.pausedAt !== null;
	}
	get count() {
		return this.events.length;
	}
	private elapsed() {
		return Math.max(0, Math.round((this.pausedAt ?? this.now()) - this.startAt - this.pauseMs));
	}
	private emit(payload: EventPayload, force = false) {
		if (this.stopped || (this.paused && !force)) return;
		const event = {
			...payload,
			id: `${this.id}:${this.events.length}`,
			sequence: this.events.length,
			atMs: force ? Math.min(86400000, this.elapsed()) : this.elapsed(),
		} as TypingEvent;
		const size = new TextEncoder().encode(JSON.stringify(event)).length;
		// Reserve one event for a final stop, even when a capture limit is reached.
		if (
			!force &&
			(event.atMs > 86400000 ||
				this.events.length >= MAX_TYPING_EVENTS - 1 ||
				this.bytes + size > MAX_TYPING_BYTES / 2)
		)
			throw new Error("Typing capture limit reached");
		this.events.push(event);
		this.bytes += size;
	}
	observe(value: string, selections: TypingSelection[], inputType: string) {
		if (this.stopped || this.paused || value === this.value) return;
		if (value.length > MAX_TYPING_TEXT) throw new Error("Typing text limit exceeded");
		this.emit({ event: "text-edit", ...textChange(this.value, value), inputType, selections });
		this.value = value;
		this.selections = selections;
	}
	select(selections: TypingSelection[]) {
		if (this.stopped || this.paused) return;
		if (JSON.stringify(selections) === JSON.stringify(this.selections)) return;
		this.emit({ event: "selection", selections });
		this.selections = selections;
	}
	key(payload: Omit<Extract<TypingEvent, { event: "key" }>, "id" | "sequence" | "atMs" | "event">) {
		this.emit({ event: "key", ...payload });
	}
	boundary(reason: Extract<TypingEvent, { event: "boundary" }>["reason"]) {
		this.emit({ event: "boundary", reason });
	}
	pause() {
		if (this.paused || this.stopped) return;
		this.boundary("pause");
		this.pausedAt = this.now();
	}
	resume() {
		if (!this.paused || this.stopped) return;
		this.pauseMs += this.now() - this.pausedAt!;
		this.pausedAt = null;
		this.boundary("resume");
	}
	finish(
		title = "Typing take",
		documentName = "Capture pad",
		coverage: "complete" | "limited" = "complete",
	): TypingTake {
		if (!this.stopped) {
			this.emit({ event: "boundary", reason: "stop" }, true);
			this.stopped = true;
		}
		return typingTakeSchema.parse({
			version: 1,
			id: this.id,
			title,
			documentName,
			producer: "openscreen-pad",
			coverage,
			offsetEncoding: "unicode-code-points",
			clock: "session-active-ms",
			startedAt: this.startedAt,
			initialText: this.initialText,
			durationMs: this.events.at(-1)?.atMs ?? 0,
			events: this.events,
			sections: groupTypingSections(this.events),
		});
	}
}
export function sectionPlayback(take: TypingTake, section: TypingSection) {
	let value = take.initialText;
	const frames: { atMs: number; text: string }[] = [];
	let beforeText = value;
	const startMs = take.events[section.startSequence].atMs;
	for (const event of take.events) {
		if (event.sequence === section.startSequence) beforeText = value;
		if (event.event === "text-edit") value = applyTextEdit(value, event);
		if (
			event.sequence >= section.startSequence &&
			event.sequence <= section.endSequence &&
			event.event === "text-edit"
		)
			frames.push({ atMs: Math.round((event.atMs - startMs) / section.speed), text: value });
	}
	return { beforeText, frames, finalText: frames.at(-1)?.text ?? beforeText };
}
/** Textarea offsets are UTF-16; journals use Unicode code points across adapters. */
export function padSelection(element: HTMLTextAreaElement): TypingSelection[] {
	const start = Array.from(element.value.slice(0, element.selectionStart)).length;
	const end = Array.from(element.value.slice(0, element.selectionEnd)).length;
	return [
		{
			anchor: element.selectionDirection === "backward" ? end : start,
			focus: element.selectionDirection === "backward" ? start : end,
		},
	];
}
