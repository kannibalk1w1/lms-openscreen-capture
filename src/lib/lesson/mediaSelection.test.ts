import { expect, it } from "vitest";
import { newLesson, newStep } from "./authoring";
import { renderLessonGuide } from "./export";
import { lessonMediaSelectionSchema } from "./mediaSelection";
import { parseLesson, validateLesson } from "./schema";

const selectionFixture = () =>
	lessonMediaSelectionSchema.parse({
		version: 1,
		provenance: "authored-selection",
		basis: "editor-ruler-seconds",
		projectId: "PRIVATE_PROJECT_REFERENCE",
		documentSha256: "a".repeat(64),
		fingerprintKind: "render-inputs-v1",
		startSec: 2,
		endSec: 8,
		keptSpans: [
			{ startSec: 2, endSec: 3 },
			{ startSec: 5, endSec: 8 },
		],
		programme: { basis: "editor-programme-seconds", startSec: 2, endSec: 6 },
	});
it("retains authored range plans only in full editable sources, not static guide projections", async () => {
	const selection = selectionFixture(),
		step = { ...newStep(), mediaSelection: selection },
		source = { ...newLesson(), steps: [step] };
	expect((await parseLesson(JSON.stringify(source))).steps[0].mediaSelection).toEqual(selection);
	const guide = await renderLessonGuide(source, [step.id]);
	expect(guide.lesson.steps[0].mediaSelection).toBeUndefined();
	expect(JSON.stringify(guide)).not.toContain("PRIVATE_PROJECT_REFERENCE");
	expect(source.steps[0].mediaSelection).toEqual(selection);
});
it("refuses malformed, unordered and out-of-bounds plans without silently repairing imported claims", async () => {
	const valid = selectionFixture();
	for (const extra of [
		{ version: 2 },
		{ provenance: "observed" },
		{ basis: "native-media-ms" },
		{ startSec: 4 },
		{ endSec: 5 },
		{ programme: { basis: "editor-programme-seconds", startSec: 4, endSec: 3 } },
		{ keptSpans: [] },
		{ keptSpans: [{ startSec: 3, endSec: 8 }] },
		{
			keptSpans: [
				{ startSec: 2, endSec: 6 },
				{ startSec: 5, endSec: 8 },
			],
		},
		{ keptSpans: [{ startSec: 1, endSec: 8 }] },
		{ physicalFrame: 12 },
	])
		await expect(
			validateLesson({
				...newLesson(),
				steps: [{ ...newStep(), mediaSelection: { ...valid, ...extra } }],
			}),
		).rejects.toThrow();
});
it("applies a delayed plan to current authored text and refuses a changed target", async () => {
	const { attachLessonMediaSelection, reviseLesson } = await import("./authoring");
	const step = newStep(),
		lesson = { ...newLesson(), steps: [step] },
		selection = selectionFixture();
	const request = { lessonId: lesson.id, stepId: step.id, revision: 0 };
	const current = reviseLesson(lesson, {
		steps: [{ ...step, instructions: "Later text", status: "reviewed" }],
	});
	const next = attachLessonMediaSelection(current, request, selection);
	expect(next.steps[0]).toMatchObject({
		instructions: "Later text",
		status: "draft",
		mediaSelection: selection,
	});
	expect(next.revision).toBe(2);
	for (const stale of [
		{ ...current, id: crypto.randomUUID() },
		{ ...current, steps: [] },
		{ ...current, steps: [{ ...step, mediaSelection: selection }] },
	])
		expect(attachLessonMediaSelection(stale, request, selection)).toBe(stale);
});

it("refuses v1 over a current confirmed pin at the model boundary, preserving explicit remove and refresh", async () => {
	const { attachLessonMediaSelection, reviseLesson } = await import("./authoring");
	const { lessonMediaSelectionV2Schema } = await import("./mediaSelection");
	const reference = selectionFixture();
	const pin = lessonMediaSelectionV2Schema.parse({
		...reference,
		version: 2,
		identity: {
			version: 1,
			observationId: crypto.randomUUID(),
			basis: "explicit-author-current",
			sources: [{ role: "screen", bindings: ["b".repeat(64)], bytes: 10, sha256: "c".repeat(64) }],
		},
		previousSelections: [reference],
	});
	const step = { ...newStep(), mediaSelection: pin },
		lesson = { ...newLesson(), steps: [step] };
	const request = {
		lessonId: lesson.id,
		stepId: step.id,
		revision: lesson.revision,
		previous: pin,
	};
	expect(attachLessonMediaSelection(lesson, request, reference)).toBe(lesson);
	const refresh = {
		...pin,
		identity: {
			...pin.identity,
			observationId: crypto.randomUUID(),
			basis: "explicit-refresh-current" as const,
		},
	};
	expect(attachLessonMediaSelection(lesson, request, refresh).steps[0].mediaSelection).toEqual(
		refresh,
	);
	const removed = reviseLesson(lesson, { steps: [{ ...step, mediaSelection: undefined }] });
	expect(
		attachLessonMediaSelection(removed, { ...request, previous: undefined }, reference).steps[0]
			.mediaSelection,
	).toEqual(reference);
});
