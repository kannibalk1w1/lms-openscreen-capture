import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { appendApplicationDrafts } from "../lesson/applicationDraft";
import { newLesson } from "../lesson/authoring";
import { parseLesson } from "../lesson/schema";
import { createApplicationAssociation } from "./association";
import { createApplicationTimingBindings } from "./timingBinding";

afterEach(() => vi.unstubAllGlobals());
function timingFixture() {
	return {
		capture: {
			format: "openscreen-application-capture",
			version: 1,
			adapterId: "fixture-editor",
			instanceId: "instance",
			sessionId: "session",
			scope: "document",
			clock: "unmapped",
			coverage: "sampled",
			stopReason: "user-stop",
			pollIntervalMs: 100,
			durationMs: 1000,
			baseline: { privateContext: "UNSELECTED_BASELINE" },
			observations: [
				{
					id: "selected",
					atMs: 250,
					type: "object.changed",
					label: "Selected",
					payload: { value: 2 },
				},
				{ id: "gap", atMs: 700, type: "object.changed", label: "Gap", payload: null },
				{ id: "terminal", atMs: 1000, type: "object.changed", label: "Terminal", payload: null },
			],
		},
		clock: {
			sessionId: "95734b6d-f7d1-4604-8bba-335748dfe7d8",
			clock: "recording-control-active-ms",
			segments: [{ id: "one", startMs: 0, endMs: 1000 }],
		},
		spans: [
			{
				id: "de4d3d49-7803-4587-9e12-a6a416958c2b",
				segmentId: "one",
				applicationStartMs: 0,
				applicationEndMs: 500,
				recordingStartMs: 100,
				recordingEndMs: 101,
			},
		],
	};
}
it("saves only selected authored integer timing, preserves the raw clock and reopens offline", async () => {
	vi.stubGlobal("crypto", webcrypto);
	const { capture, clock, spans } = timingFixture();
	const plan = await createApplicationAssociation(capture, clock, spans);
	const bindings = await createApplicationTimingBindings(capture, clock, plan, "video", [
		"selected",
		"gap",
		"terminal",
	]);
	expect([...bindings.keys()]).toEqual(["selected"]);
	expect(bindings.get("selected")?.mediaTimeMs).toBe(100);
	const next = appendApplicationDrafts(
		newLesson(),
		capture as Parameters<typeof appendApplicationDrafts>[1],
		["selected", "gap", "terminal"],
		bindings,
	);
	const reopened = await parseLesson(JSON.stringify(next));
	expect(reopened.steps[0].evidence[0]).toMatchObject({
		clock: "unmapped",
		atMs: 250,
		application: { manualTiming: { method: "manual-two-point", mediaTimeMs: 100 } },
	});
	expect(reopened.steps[1].evidence[0].application?.manualTiming).toBeUndefined();
	expect(reopened.steps[0].mediaSelection).toBeUndefined();
	expect(JSON.stringify(reopened)).not.toContain("UNSELECTED_BASELINE");
});
it("refuses altered timing metadata and source identity on lesson reopen", async () => {
	vi.stubGlobal("crypto", webcrypto);
	const { capture, clock, spans } = timingFixture(),
		plan = await createApplicationAssociation(capture, clock, spans);
	const bindings = await createApplicationTimingBindings(capture, clock, plan, "video", [
		"selected",
	]);
	const lesson = appendApplicationDrafts(
		newLesson(),
		capture as Parameters<typeof appendApplicationDrafts>[1],
		["selected"],
		bindings,
	);
	for (const change of [
		{ mediaTimeMs: 101 },
		{ mediaTimeMs: 100.5 },
		{ applicationTimeMs: 251 },
		{ source: { ...plan.source, sessionId: "other" } },
	]) {
		const invalid = structuredClone(lesson);
		const timing = invalid.steps[0].evidence[0].application?.manualTiming;
		if (!timing) throw new Error("Missing fixture timing");
		Object.assign(timing, change);
		await expect(parseLesson(JSON.stringify(invalid))).rejects.toThrow();
	}
	const changed = structuredClone(capture);
	changed.observations[0].payload = { value: 3 };
	await expect(
		createApplicationTimingBindings(changed, clock, plan, "video", ["selected"]),
	).rejects.toThrow();
});
