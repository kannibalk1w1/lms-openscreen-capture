import { describe, expect, it } from "vitest";
import { TypingCapture } from "./capture";
import { prepareTypingDownload } from "./download";
import { importTypingTake } from "./import";
import {
	exportTypingPlayback,
	exportTypingSection,
	replayTypingFile,
	serializePortableTypingFile,
	typingPlaybackFileSchema,
} from "./portable";
import type { TypingTake } from "./schema";

function fixture() {
	let now = 0;
	const capture = new TypingCapture("var hp = 10\n", () => now, "source-take");
	now = 100;
	capture.observe("var hp = 20\n", [], "insertText");
	now = 2000;
	capture.observe('var hp = 20\n\tprint("😀")', [], "insertFromPaste");
	now = 2200;
	capture.key({
		key: "Z",
		code: "KeyZ",
		pressed: true,
		ctrl: true,
		alt: false,
		shift: false,
		meta: false,
		repeat: false,
	});
	capture.observe("var hp = 20\n", [], "historyUndo");
	now = 2400;
	capture.observe('var hp = 20\n\tprint("日本語😀")', [], "historyRedo");
	now = 5000;
	capture.observe("later unrelated text", [], "insertText");
	const take = capture.finish("Example", "res://example.gd");
	take.sections[1].speed = 2;
	take.sections[1].label = "Show Unicode";
	return take;
}

describe("portable section files", () => {
	it("exports a middle section with an independent baseline and rebased evidence, without mutating its take", () => {
		const take = fixture();
		const original = JSON.stringify(take);
		const section = take.sections[1];
		const file = exportTypingSection(take, section.id, "lesson-project");
		expect(file.take.id).not.toBe(take.id);
		expect(file.take.initialText).toBe("var hp = 20\n");
		expect(file.finalText).toBe('var hp = 20\n\tprint("日本語😀")');
		expect(file.take.events.map((e) => e.atMs)).toEqual([0, 200, 200, 400, 400]);
		expect(file.take.events[1]).toMatchObject({ event: "key", key: "Z", ctrl: true });
		expect(file.source).toMatchObject({
			takeId: "source-take",
			sectionId: section.id,
			projectId: "lesson-project",
			startAtMs: 2000,
			endAtMs: 2400,
		});
		expect(file.take.sections[0]).toMatchObject({
			label: "Show Unicode",
			speed: 2,
			startSequence: 0,
			endSequence: 3,
		});
		expect(JSON.stringify(take)).toBe(original);
		expect(importTypingTake(serializePortableTypingFile(file))).toEqual(file.take);
		expect(importTypingTake(serializePortableTypingFile(file)).sourceExcerpt).toEqual(file.source);
	});
	it("reimports and plays at adjusted pace with full-buffer and removed-text preconditions", () => {
		const take = fixture();
		const file = exportTypingSection(take, take.sections[1].id);
		const recipe = exportTypingPlayback(file);
		expect(recipe.operations.map((op) => op.atMs)).toEqual([0, 100, 200]);
		expect(replayTypingFile(recipe, file.take.initialText, 99)).toContain('print("😀")');
		expect(replayTypingFile(recipe, file.take.initialText, 100)).toBe(file.take.initialText);
		expect(replayTypingFile(recipe, file.take.initialText)).toBe(file.finalText);
		expect(importTypingTake(serializePortableTypingFile(recipe))).toEqual(file.take);
		expect(() => replayTypingFile(recipe, "wrong starting document")).toThrow("starting text");
		expect(() => replayTypingFile(recipe, file.take.initialText, NaN)).toThrow("time");
	});
	it("rejects tampered recipes, unsupported actions/targets/versions and inconsistent final text", () => {
		const take = fixture();
		const file = exportTypingSection(take, take.sections[1].id);
		const recipe = exportTypingPlayback(file);
		for (const changed of [
			{ ...recipe, target: "godot" },
			{ ...recipe, version: 2 },
			{ ...recipe, runCommand: "type into desktop" },
			{ ...recipe, section: { ...file, take: { ...file.take, sections: [] } } },
			{
				...recipe,
				section: {
					...file,
					take: {
						...file.take,
						events: file.take.events.map((event, i) =>
							i === 0 ? { ...event, removed: "wrong" } : event,
						),
					},
				},
			},
			{
				...recipe,
				operations: recipe.operations.map((op, i) => (i === 1 ? { ...op, removed: "wrong" } : op)),
			},
			{ ...recipe, operations: recipe.operations.slice(1) },
			{ ...recipe, section: { ...file, finalText: "wrong" } },
		]) {
			expect(() => importTypingTake(JSON.stringify(changed))).toThrow();
			expect(typingPlaybackFileSchema.safeParse(changed).success).toBe(false);
		}
	});
	it("preserves explicit Godot source anchors and limited-coverage status without needing the video", () => {
		const take: TypingTake = { ...fixture(), producer: "godot-codeedit", coverage: "limited" };
		take.sections[1].sourceAnchor = {
			method: "manual-recording-flag",
			recordingSessionId: "7570d5c5-7f90-40b3-ace4-ac27839e318b",
			flagId: "f",
			segmentId: "s",
			mediaTimeMs: 4000,
		};
		const file = exportTypingSection(take, take.sections[1].id);
		const reopened = importTypingTake(serializePortableTypingFile(file));
		expect(reopened.coverage).toBe("limited");
		expect(reopened.sections[0].sourceAnchor).toEqual(take.sections[1].sourceAnchor);
	});
	it("exports resulting full code rather than only a fragment, and sanitizes filenames", () => {
		const take = fixture();
		take.sections[1].label = "../../unsafe\\name\n";
		const result = prepareTypingDownload(take, take.sections[1].id, "text");
		expect(result.name).toBe("unsafe-name-event-2.gd");
		expect(result.content).toBe('var hp = 20\n\tprint("日本語😀")');
		expect(
			prepareTypingDownload({ ...take, documentName: "notes" }, take.sections[1].id, "text").name,
		).toMatch(/\.txt$/);
	});
	it("supports a zero-duration one-edit section and rejects missing section requests", () => {
		const take = fixture();
		const file = exportTypingSection(take, take.sections[0].id);
		expect(file.take.durationMs).toBe(0);
		expect(replayTypingFile(exportTypingPlayback(file), file.take.initialText, 0)).toBe(
			file.finalText,
		);
		expect(() => exportTypingSection(take, "missing")).toThrow("missing");
	});
	it("rejects provenance/range inconsistencies and altered playback pacing", () => {
		const take = fixture();
		const file = exportTypingSection(take, take.sections[1].id);
		expect(() =>
			importTypingTake(JSON.stringify({ ...file, source: { ...file.source, startAtMs: 0 } })),
		).toThrow();
		const recipe = exportTypingPlayback(file);
		recipe.section.take.sections[0].speed = 1;
		expect(typingPlaybackFileSchema.safeParse(recipe).success).toBe(false);
	});
});

it("refuses a playback download whose duplicated evidence/operations exceed the portable byte limit", () => {
	const a = "a".repeat(180000),
		b = "b".repeat(180000);
	const events: TypingTake["events"] = Array.from({ length: 12 }, (_, sequence) => ({
		id: `large:${sequence}`,
		sequence,
		atMs: sequence,
		event: "text-edit" as const,
		start: 0,
		removed: sequence % 2 ? b : a,
		inserted: sequence % 2 ? a : b,
		inputType: "insertReplacementText",
		selections: [],
	}));
	events.push({ id: "large:stop", sequence: 12, atMs: 11, event: "boundary", reason: "stop" });
	const take: TypingTake = {
		version: 1,
		id: "large",
		title: "Large snippet",
		documentName: "notes",
		producer: "openscreen-pad",
		coverage: "complete",
		clock: "session-active-ms",
		offsetEncoding: "unicode-code-points",
		startedAt: "2026-11-05T12:00:00Z",
		initialText: a,
		durationMs: 11,
		events,
		sections: [{ id: "s", label: "", startSequence: 0, endSequence: 11, speed: 1 }],
	};
	const file = exportTypingSection(take, "s");
	expect(() => serializePortableTypingFile(file)).not.toThrow();
	expect(() => serializePortableTypingFile(exportTypingPlayback(file))).toThrow("8 MiB");
});
