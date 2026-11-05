import { z } from "zod";
import { applyTextEdit, sectionPlayback, textChange } from "./capture";
import {
	MAX_TYPING_BYTES,
	MAX_TYPING_EVENTS,
	MAX_TYPING_TEXT,
	type TypingTake,
	typingExcerptSourceSchema,
	typingTakeSchema,
} from "./schema";

const portableSectionSchema = z
	.object({
		format: z.literal("openscreen-typing-section"),
		version: z.literal(1),
		source: typingExcerptSourceSchema,
		take: typingTakeSchema,
		finalText: z.string().max(MAX_TYPING_TEXT),
	})
	.strict()
	.superRefine((file, ctx) => {
		const section = file.take.sections[0];
		let finalText: string | undefined;
		try {
			if (section) finalText = sectionPlayback(file.take, section).finalText;
		} catch {
			// A nested take can already have validation issues; keep this a schema rejection.
		}
		if (
			!section ||
			file.take.sections.length !== 1 ||
			section.startSequence !== 0 ||
			section.endSequence !== file.take.events.length - 2 ||
			file.take.events[0].atMs !== 0 ||
			JSON.stringify(file.take.sourceExcerpt) !== JSON.stringify(file.source) ||
			file.source.endSequence < file.source.startSequence ||
			file.source.endSequence - file.source.startSequence !== file.take.events.length - 2 ||
			file.source.endAtMs - file.source.startAtMs !== file.take.durationMs ||
			file.finalText !== finalText
		)
			ctx.addIssue({ code: "custom", message: "Inconsistent portable section" });
	});
export type PortableTypingSection = z.infer<typeof portableSectionSchema>;

const operationSchema = z
	.object({
		atMs: z.number().int().nonnegative().max(345600000),
		start: z.number().int().nonnegative().max(MAX_TYPING_TEXT),
		removed: z.string().max(MAX_TYPING_TEXT),
		inserted: z.string().max(MAX_TYPING_TEXT),
	})
	.strict();

export type TypingPlaybackMode = "captured-edits" | "clean";

function operationsFor(file: PortableTypingSection, mode: TypingPlaybackMode) {
	const section = file.take.sections[0];
	if (!section) return [];
	const speed = section.speed;
	if (mode === "clean") {
		const patch = textChange(file.take.initialText, file.finalText);
		const operations: z.infer<typeof operationSchema>[] = [];
		if (patch.removed)
			operations.push({ atMs: 0, start: patch.start, removed: patch.removed, inserted: "" });
		const points = Array.from(patch.inserted);
		// Preserve Unicode code points while bounding the number of operations for large pastes.
		const chunkSize = Math.max(
			1,
			Math.ceil(points.length / (MAX_TYPING_EVENTS - operations.length)),
		);
		for (let offset = 0; offset < points.length; offset += chunkSize) {
			operations.push({
				atMs: Math.round((offset * 1000) / (30 * speed)),
				start: patch.start + offset,
				removed: "",
				inserted: points.slice(offset, offset + chunkSize).join(""),
			});
		}
		return operations;
	}
	return file.take.events.flatMap((event) =>
		event.event === "text-edit"
			? [
					{
						atMs: Math.round(event.atMs / speed),
						start: event.start,
						removed: event.removed,
						inserted: event.inserted,
					},
				]
			: [],
	);
}

export const typingPlaybackFileSchema = z
	.object({
		format: z.literal("openscreen-typing-playback"),
		version: z.literal(1),
		target: z.literal("controlled-text-buffer"),
		mode: z.enum(["captured-edits", "clean"]),
		section: portableSectionSchema,
		operations: z.array(operationSchema).max(MAX_TYPING_EVENTS),
	})
	.strict()
	.superRefine((recipe, ctx) => {
		if (
			JSON.stringify(recipe.operations) !==
			JSON.stringify(operationsFor(recipe.section, recipe.mode))
		)
			ctx.addIssue({
				code: "custom",
				message: "Playback operations do not match the section evidence and pace",
			});
	});
export type TypingPlaybackFile = z.infer<typeof typingPlaybackFileSchema>;

/** Section bounds are explicit: retain evidence from its first through last edit.
 * Events outside those bounds stay in the original take, which is never mutated. */
export function exportTypingSection(take: TypingTake, sectionId: string, projectId?: string) {
	const validated = typingTakeSchema.parse(take);
	const section = validated.sections.find((s) => s.id === sectionId);
	if (!section) throw new Error("Typing section is missing");
	const playback = sectionPlayback(validated, section);
	const first = validated.events[section.startSequence];
	const last = validated.events[section.endSequence];
	const id = `typing-section-${crypto.randomUUID()}`;
	const events = validated.events
		.slice(section.startSequence, section.endSequence + 1)
		.map((event, sequence) => ({
			...event,
			sequence,
			atMs: event.atMs - first.atMs,
		}));
	const prior = validated.sourceExcerpt;
	const source = {
		takeId: prior?.takeId ?? take.id,
		sectionId: prior?.sectionId ?? sectionId,
		projectId: prior?.projectId ?? projectId,
		startSequence: (prior?.startSequence ?? 0) + section.startSequence,
		endSequence: (prior?.startSequence ?? 0) + section.endSequence,
		startAtMs: (prior?.startAtMs ?? 0) + first.atMs,
		endAtMs: (prior?.startAtMs ?? 0) + last.atMs,
	};
	const file = portableSectionSchema.parse({
		format: "openscreen-typing-section",
		version: 1,
		source,
		take: {
			...validated,
			id,
			sourceExcerpt: source,
			title: section.label || validated.title,
			initialText: playback.beforeText,
			durationMs: last.atMs - first.atMs,
			events: [
				...events,
				{
					id: `${id}:stop`,
					sequence: events.length,
					atMs: last.atMs - first.atMs,
					event: "boundary",
					reason: "stop",
				},
			],
			sections: [{ ...section, startSequence: 0, endSequence: events.length - 1 }],
		},
		finalText: playback.finalText,
	});
	return file;
}

export function exportTypingPlayback(
	file: PortableTypingSection,
	mode: TypingPlaybackMode = "captured-edits",
): TypingPlaybackFile {
	const validated = portableSectionSchema.parse(file);
	return typingPlaybackFileSchema.parse({
		format: "openscreen-typing-playback",
		version: 1,
		target: "controlled-text-buffer",
		mode,
		section: validated,
		operations: operationsFor(validated, mode),
	});
}

export const MAX_TYPING_BUNDLE_SECTIONS = 20;
export const typingBundleSchema = z
	.object({
		format: z.literal("openscreen-typing-bundle"),
		version: z.literal(1),
		entries: z.array(typingPlaybackFileSchema).min(1).max(MAX_TYPING_BUNDLE_SECTIONS),
	})
	.strict()
	.superRefine((bundle, ctx) => {
		const sourceIds = new Set<string>(),
			ids = new Set<string>();
		let events = 0,
			operations = 0;
		for (const entry of bundle.entries) {
			const source = entry.section.source;
			const key = JSON.stringify([
				source.takeId,
				source.sectionId,
				source.startSequence,
				source.endSequence,
			]);
			if (sourceIds.has(key) || ids.has(entry.section.take.id))
				ctx.addIssue({ code: "custom", message: "Duplicate bundle section" });
			sourceIds.add(key);
			ids.add(entry.section.take.id);
			events += entry.section.take.events.length;
			operations += entry.operations.length;
		}
		if (events > MAX_TYPING_EVENTS || operations > MAX_TYPING_EVENTS)
			ctx.addIssue({ code: "custom", message: "Bundle exceeds the total event/operation budget" });
	});
export type TypingBundle = z.infer<typeof typingBundleSchema>;

export function exportTypingBundle(
	sections: { take: TypingTake; sectionId: string; mode?: TypingPlaybackMode }[],
	mode: TypingPlaybackMode = "captured-edits",
	projectId?: string,
): TypingBundle {
	if (sections.length === 0 || sections.length > MAX_TYPING_BUNDLE_SECTIONS)
		throw new Error("Choose 1–20 sections per bundle");
	return typingBundleSchema.parse({
		format: "openscreen-typing-bundle",
		version: 1,
		entries: sections.map(({ take, sectionId, mode: entryMode }) =>
			exportTypingPlayback(exportTypingSection(take, sectionId, projectId), entryMode ?? mode),
		),
	});
}

/** Validate once; each independent section must be given its own exact starting buffer. */
export function createTypingPlayback(recipe: TypingPlaybackFile, initialText: string) {
	const validated = typingPlaybackFileSchema.parse(recipe);
	if (initialText !== validated.section.take.initialText)
		throw new Error("Playback starting text does not match");
	if (validated.mode === "clean") {
		const patch = textChange(initialText, validated.section.finalText);
		const initialPoints = Array.from(initialText),
			inserted = Array.from(patch.inserted);
		const prefix = initialPoints.slice(0, patch.start).join("");
		const suffix = initialPoints.slice(patch.start + Array.from(patch.removed).length).join("");
		let revealed = 0;
		const revealCounts = validated.operations.map((op) => {
			revealed += Array.from(op.inserted).length;
			return revealed;
		});
		return {
			advanceTo(elapsedMs: number) {
				if (Number.isNaN(elapsedMs) || elapsedMs < 0) throw new Error("Invalid playback time");
				let low = 0,
					high = validated.operations.length;
				while (low < high) {
					const mid = Math.floor((low + high) / 2);
					if (validated.operations[mid].atMs <= elapsedMs) low = mid + 1;
					else high = mid;
				}
				// The canonical clean recipe is one validated contiguous replacement. Build its
				// visible state directly, avoiding thousands of full-buffer edit copies on seek.
				return {
					text: low
						? prefix + inserted.slice(0, revealCounts[low - 1]).join("") + suffix
						: initialText,
					complete: low === validated.operations.length,
				};
			},
		};
	}
	let text = initialText,
		index = 0,
		previousTime = -Infinity;
	return {
		advanceTo(elapsedMs: number) {
			if (Number.isNaN(elapsedMs) || elapsedMs < 0) throw new Error("Invalid playback time");
			if (elapsedMs < previousTime) {
				text = initialText;
				index = 0;
			}
			previousTime = elapsedMs;
			while (index < validated.operations.length && validated.operations[index].atMs <= elapsedMs) {
				const op = validated.operations[index];
				text = applyTextEdit(text, {
					...op,
					id: `playback:${index}`,
					sequence: index,
					event: "text-edit",
					inputType: "portable-playback",
					selections: [],
				});
				index++;
			}
			return { text, complete: index === validated.operations.length };
		},
	};
}

export function replayTypingFile(
	recipe: TypingPlaybackFile,
	initialText: string,
	elapsedMs = Infinity,
) {
	return createTypingPlayback(recipe, initialText).advanceTo(elapsedMs).text;
}

export type ImportedTypingFile = { take: TypingTake; mode: TypingPlaybackMode };
export function parsePortableTypingFiles(data: unknown): ImportedTypingFile[] {
	const format = z.object({ format: z.string() }).parse(data).format;
	if (format === "openscreen-typing-section")
		return [{ take: portableSectionSchema.parse(data).take, mode: "captured-edits" }];
	if (format === "openscreen-typing-playback") {
		const recipe = typingPlaybackFileSchema.parse(data);
		return [{ take: recipe.section.take, mode: recipe.mode }];
	}
	if (format === "openscreen-typing-bundle")
		return typingBundleSchema
			.parse(data)
			.entries.map((recipe) => ({ take: recipe.section.take, mode: recipe.mode }));
	throw new Error("Unsupported portable typing format");
}

export function parsePortableTypingFile(data: unknown): TypingTake {
	const files = parsePortableTypingFiles(data);
	if (files.length !== 1)
		throw new Error("Bundle has multiple independent sections; use the bundle importer");
	return files[0].take;
}

/** Compact serialization keeps the on-disk file within the same bound enforced on import. */
export function serializePortableTypingFile(
	file: PortableTypingSection | TypingPlaybackFile | TypingBundle,
) {
	parsePortableTypingFiles(file);
	const source = JSON.stringify(file);
	if (new TextEncoder().encode(source).length > MAX_TYPING_BYTES)
		throw new Error("Portable typing file exceeds 8 MiB; choose a smaller section");
	return source;
}
