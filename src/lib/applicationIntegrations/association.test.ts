import { webcrypto } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
	type ApplicationAssociationSpan,
	createApplicationAssociation,
	resolveApplicationObservation,
	resolveApplicationObservations,
} from "./association";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));

function capture() {
	return {
		format: "openscreen-application-capture",
		version: 1,
		adapterId: "fixture-editor",
		instanceId: "editor-instance",
		sessionId: "capture-session",
		scope: "fixture-document",
		clock: "unmapped",
		coverage: "sampled",
		stopReason: "user-stop",
		pollIntervalMs: 100,
		durationMs: 1000,
		baseline: { objects: [{ type: "document", id: "doc" }] },
		observations: [
			{ id: "obs-0", atMs: 0, type: "edit", label: "At start", payload: { value: 0 } },
			{ id: "obs-left", atMs: 100, type: "edit", label: "At span start", payload: { value: 5 } },
			{ id: "obs-1", atMs: 250, type: "edit", label: "Before pause", payload: { value: 1 } },
			{ id: "obs-edge", atMs: 300, type: "edit", label: "At span end", payload: { value: 4 } },
			{ id: "obs-2", atMs: 500, type: "edit", label: "After pause", payload: { value: 2 } },
			{ id: "obs-3", atMs: 800, type: "edit", label: "At span end", payload: { value: 3 } },
		],
	};
}

function recordingClock() {
	return {
		sessionId: "a6b5f61e-00f4-42c1-8d4c-02abc4aa7326",
		clock: "recording-control-active-ms",
		segments: [
			{ id: "segment-one", startMs: 0, endMs: 500 },
			{ id: "segment-two", startMs: 500, endMs: 1000 },
		],
	};
}

const spans: ApplicationAssociationSpan[] = [
	{
		id: "0454cde8-9805-4b61-947d-ebd282f46ccb",
		segmentId: "segment-one",
		applicationStartMs: 100,
		applicationEndMs: 300,
		recordingStartMs: 100,
		recordingEndMs: 300,
	},
	{
		id: "3e45a294-b8cb-4f3f-83e8-2d76975720ab",
		segmentId: "segment-two",
		applicationStartMs: 600,
		applicationEndMs: 800,
		recordingStartMs: 600,
		recordingEndMs: 800,
	},
];

async function planFor(source = capture(), clock = recordingClock(), planSpans = spans) {
	return createApplicationAssociation(source, clock, planSpans);
}

async function unmappedReason(result: ReturnType<typeof resolveApplicationObservation>) {
	const resolution = await result;
	expect(resolution.status).toBe("unmapped");
	if (resolution.status === "mapped") throw new Error("Expected an unmapped observation");
	return resolution.reason;
}

it("maps only explicit manual spans, leaving uncovered pauses and half-open boundaries unmapped", async () => {
	const source = capture();
	const clock = recordingClock();
	const plan = await planFor(source, clock);
	expect(plan).toMatchObject({
		format: "openscreen-application-association",
		version: 1,
		recordingClock: "recording-control-active-ms",
	});
	expect(await resolveApplicationObservation(source, clock, plan, "obs-1")).toEqual({
		status: "mapped",
		method: "manual-two-point",
		recordingSessionId: clock.sessionId,
		segmentId: "segment-one",
		mediaTimeMs: 250,
	});
	expect(await resolveApplicationObservation(source, clock, plan, "obs-left")).toMatchObject({
		status: "mapped",
		segmentId: "segment-one",
		mediaTimeMs: 100,
	});
	expect(await unmappedReason(resolveApplicationObservation(source, clock, plan, "obs-0"))).toBe(
		"unmapped-gap",
	);
	expect(await unmappedReason(resolveApplicationObservation(source, clock, plan, "obs-2"))).toBe(
		"unmapped-gap",
	);
	expect(await unmappedReason(resolveApplicationObservation(source, clock, plan, "obs-edge"))).toBe(
		"unmapped-gap",
	);
	expect(await unmappedReason(resolveApplicationObservation(source, clock, plan, "obs-3"))).toBe(
		"unmapped-gap",
	);
});

it("resolves batches in request order, including missing observations, with two hashes total", async () => {
	const source = capture();
	const clock = recordingClock();
	const plan = await planFor(source, clock);
	const digest = vi.spyOn(webcrypto.subtle, "digest");
	const batch = await resolveApplicationObservations(source, clock, plan, [
		"obs-1",
		"obs-2",
		"absent",
	]);
	expect(digest).toHaveBeenCalledTimes(2);
	digest.mockRestore();
	const singles = await Promise.all(
		["obs-1", "obs-2", "absent"].map((id) =>
			resolveApplicationObservation(source, clock, plan, id),
		),
	);
	expect(batch).toEqual(singles);
});

it("checks adapter, instance, capture session and scope before resolving", async () => {
	const source = capture();
	const clock = recordingClock();
	const plan = await planFor(source, clock);
	for (const [change, reason] of [
		[{ adapterId: "other-editor" }, "wrong-adapter"],
		[{ instanceId: "other-instance" }, "wrong-instance"],
		[{ sessionId: "other-capture" }, "wrong-session"],
		[{ scope: "other-document" }, "wrong-scope"],
	] as const) {
		expect(
			await unmappedReason(
				resolveApplicationObservation({ ...source, ...change }, clock, plan, "obs-1"),
			),
		).toBe(reason);
	}
});

it("fingerprints validated evidence independent of object key order, and detects changed payload", async () => {
	const source = capture();
	const plan = await planFor(source);
	const reordered = {
		...source,
		baseline: { objects: [{ id: "doc", type: "document" }] },
		observations: source.observations.map((observation) => ({
			payload: { value: observation.payload.value },
			label: observation.label,
			type: observation.type,
			atMs: observation.atMs,
			id: observation.id,
		})),
	};
	expect(
		(await resolveApplicationObservation(reordered, recordingClock(), plan, "obs-1")).status,
	).toBe("mapped");
	const changed = structuredClone(source);
	changed.observations[1].payload.value = 77;
	expect(
		await unmappedReason(resolveApplicationObservation(changed, recordingClock(), plan, "obs-1")),
	).toBe("evidence-changed");
});

it("detects recording metadata changes and a missing observation", async () => {
	const source = capture();
	const clock = recordingClock();
	const plan = await planFor(source, clock);
	const wrongSession = { ...clock, sessionId: "9c635a36-8246-4dfb-a4b2-780163ca65a0" };
	expect(
		await unmappedReason(resolveApplicationObservation(source, wrongSession, plan, "obs-1")),
	).toBe("recording-session-mismatch");
	const changedClock = structuredClone(clock);
	changedClock.segments[0].endMs = 450;
	changedClock.segments[1].startMs = 450;
	expect(
		await unmappedReason(resolveApplicationObservation(source, changedClock, plan, "obs-1")),
	).toBe("recording-metadata-changed");
	expect(await unmappedReason(resolveApplicationObservation(source, clock, plan, "missing"))).toBe(
		"observation-missing",
	);
});

it("validates spans, segment containment, duration, limits and version", async () => {
	const source = capture();
	const clock = recordingClock();
	const overlap = [spans[0], { ...spans[1], applicationStartMs: 250 }];
	const overlapRecording = [spans[0], { ...spans[1], recordingStartMs: 250 }];
	const badSegment = [{ ...spans[0], segmentId: "missing" }];
	const outsideSegment = [{ ...spans[0], recordingEndMs: 501 }];
	const outsideCapture = [{ ...spans[0], applicationEndMs: 1001 }];
	const zeroRange = [{ ...spans[0], recordingEndMs: spans[0].recordingStartMs }];
	const zeroDurationClock = {
		...clock,
		segments: [{ id: "empty", startMs: 0, endMs: 0 }],
	};
	const overLimit = Array.from({ length: 129 }, (_, index) => ({
		...spans[0],
		id: `0454cde8-9805-4b61-947d-${String(index).padStart(12, "0")}`,
	}));
	for (const invalid of [
		overlap,
		overlapRecording,
		badSegment,
		outsideSegment,
		outsideCapture,
		zeroRange,
		overLimit,
	])
		await expect(createApplicationAssociation(source, clock, invalid)).rejects.toThrow();
	await expect(
		createApplicationAssociation(source, zeroDurationClock, [spans[0]]),
	).rejects.toThrow();
	const valid = await planFor();
	await expect(
		resolveApplicationObservation(source, clock, { ...valid, version: 2 }, "obs-1"),
	).rejects.toThrow();
	await expect(
		resolveApplicationObservation(
			source,
			clock,
			{ ...valid, spans: [{ ...valid.spans[0], segmentId: "not-a-segment" }] },
			"obs-1",
		),
	).rejects.toThrow();
});

it("does not mutate the caller capture, clock or spans", async () => {
	const source = capture();
	const clock = recordingClock();
	const providedSpans = structuredClone(spans);
	const before = structuredClone({ source, clock, providedSpans });
	const plan = await createApplicationAssociation(source, clock, providedSpans);
	(plan.spans[0] as { applicationStartMs: number }).applicationStartMs = 0;
	expect({ source, clock, providedSpans }).toEqual(before);
});
it("identifies exact capture-end observations and floors fractional positions inside the same range", async () => {
	const source = {
		...capture(),
		durationMs: 86400000,
		observations: [
			{ id: "last-interior", atMs: 86399999, type: "edit", label: "Interior", payload: null },
			{ id: "terminal", atMs: 86400000, type: "edit", label: "Terminal", payload: null },
		],
	};
	const clock = { ...recordingClock(), segments: [{ id: "long", startMs: 0, endMs: 86400000 }] };
	const plan = await createApplicationAssociation(source, clock, [
		{
			...spans[0],
			segmentId: "long",
			applicationStartMs: 0,
			applicationEndMs: 86400000,
			recordingStartMs: 86399999,
			recordingEndMs: 86400000,
		},
	]);
	expect(await resolveApplicationObservation(source, clock, plan, "last-interior")).toMatchObject({
		status: "mapped",
		segmentId: "long",
		mediaTimeMs: 86399999,
	});
	expect(await resolveApplicationObservation(source, clock, plan, "terminal")).toEqual({
		status: "unmapped",
		reason: "end-of-capture",
	});
});
