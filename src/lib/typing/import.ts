import { z } from "zod";
import { applyTextEdit, groupTypingSections, textChange } from "./capture";
import {
	type ImportedTypingFile,
	parsePortableTypingFile,
	parsePortableTypingFiles,
} from "./portable";
import {
	MAX_TYPING_BYTES,
	MAX_TYPING_EVENTS,
	MAX_TYPING_TEXT,
	selectionSchema,
	type TypingEvent,
	type TypingTake,
	typingEventSchema,
	typingTakeSchema,
} from "./schema";

const headerSchema = z.object({
	schemaVersion: z.literal(1),
	event: z.literal("typing-start"),
	producer: z.literal("godot-codeedit"),
	sessionId: z.string().min(1).max(200),
	sequence: z.literal(0),
	atMs: z.literal(0),
	initialText: z.string().max(MAX_TYPING_TEXT),
	documentName: z.string().min(1).max(1000),
	startedAt: z.string().datetime(),
	offsetEncoding: z.literal("unicode-code-points"),
});
const envelopeSchema = z.object({
	schemaVersion: z.literal(1),
	event: z.string(),
	sessionId: z.string(),
	sequence: z.number().int().nonnegative(),
	atMs: z.number().int().nonnegative().max(86400000),
});
const snapshotSchema = z.object({
	text: z.string().max(MAX_TYPING_TEXT),
	selections: z.array(selectionSchema).max(32),
});

export function importTypingTake(source: string): TypingTake {
	if (new TextEncoder().encode(source).length > MAX_TYPING_BYTES)
		throw new Error("Typing file exceeds 8 MiB");
	if (source.trimStart().startsWith("{")) {
		try {
			const data: unknown = JSON.parse(source);
			if (data && typeof data === "object" && "format" in data)
				return parsePortableTypingFile(data);
			return typingTakeSchema.parse(data);
		} catch (error) {
			if (!(error instanceof SyntaxError)) throw error;
		}
	}
	const lines = source.trim().split(/\r?\n/);
	if (lines.length < 2 || lines.length > MAX_TYPING_EVENTS + 1)
		throw new Error("Invalid typing journal length");
	const header = headerSchema.parse(JSON.parse(lines[0]));
	let value = header.initialText,
		previousTime = 0,
		stopped = false,
		selection = "[]";
	const events: TypingEvent[] = [];
	let coverage: "complete" | "limited" = "complete";
	for (const [index, line] of lines.slice(1).entries()) {
		if (stopped) throw new Error("Events after typing stop");
		const raw: unknown = JSON.parse(line);
		const envelope = envelopeSchema.parse(raw);
		if (
			envelope.sessionId !== header.sessionId ||
			envelope.sequence !== index + 1 ||
			envelope.atMs < previousTime
		)
			throw new Error("Mixed, missing or unordered typing journal records");
		previousTime = envelope.atMs;
		const base = {
			id: `${header.sessionId}:${envelope.sequence}`,
			sequence: events.length,
			atMs: envelope.atMs,
		};
		switch (envelope.event) {
			case "typing-snapshot": {
				const snapshot = snapshotSchema.parse(raw);
				if (snapshot.text !== value) {
					events.push(
						typingEventSchema.parse({
							...base,
							event: "text-edit",
							...textChange(value, snapshot.text),
							inputType: "observed-text-change",
							selections: snapshot.selections,
						}),
					);
					value = snapshot.text;
				} else if (selection !== JSON.stringify(snapshot.selections))
					events.push({ ...base, event: "selection", selections: snapshot.selections });
				selection = JSON.stringify(snapshot.selections);
				break;
			}
			case "typing-edit": {
				const edit = typingEventSchema.parse({
					...(raw as object),
					...base,
					event: "text-edit",
					inputType: "observed-text-change",
				});
				if (edit.event !== "text-edit") throw new Error("Invalid text edit");
				value = applyTextEdit(value, edit);
				events.push(edit);
				selection = JSON.stringify(edit.selections);
				break;
			}
			case "typing-selection": {
				const event = typingEventSchema.parse({ ...(raw as object), ...base, event: "selection" });
				events.push(event);
				if (event.event === "selection") selection = JSON.stringify(event.selections);
				break;
			}
			case "typing-key":
				events.push(typingEventSchema.parse({ ...(raw as object), ...base, event: "key" }));
				break;
			case "typing-boundary":
				events.push(typingEventSchema.parse({ ...(raw as object), ...base, event: "boundary" }));
				break;
			case "typing-stop":
				coverage = z
					.object({ coverage: z.enum(["complete", "limited"]).default("complete") })
					.parse(raw).coverage;
				events.push({ ...base, event: "boundary", reason: "stop" });
				stopped = true;
				break;
			default:
				throw new Error("Unsupported typing journal event");
		}
	}
	if (!stopped) throw new Error("Typing journal is unfinished");
	return typingTakeSchema.parse({
		version: 1,
		id: header.sessionId,
		title: header.documentName.slice(0, 200),
		documentName: header.documentName,
		producer: header.producer,
		coverage,
		offsetEncoding: header.offsetEncoding,
		clock: "session-active-ms",
		startedAt: header.startedAt,
		initialText: header.initialText,
		durationMs: previousTime,
		events,
		sections: groupTypingSections(events),
	});
}

/** Bundle-aware import is all-or-nothing; never merges independent baselines. */
export function importTypingFiles(source: string): ImportedTypingFile[] {
	if (new TextEncoder().encode(source).length > MAX_TYPING_BYTES)
		throw new Error("Typing file exceeds 8 MiB");
	try {
		const data: unknown = JSON.parse(source);
		if (data && typeof data === "object" && "format" in data) return parsePortableTypingFiles(data);
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
	}
	return [{ take: importTypingTake(source), mode: "captured-edits" }];
}
