import { expect, it } from "vitest";
import { parseApplicationCapture, validateApplicationCapture } from "./capture";
import { godotSceneCapture, parseGodotSceneJournal } from "./godotScene";
import { sceneSource } from "./godotScene.test-support";
import { importApplicationCapture } from "./importCapture";

it("normalizes Godot evidence and round-trips without Godot-specific mandatory fields", () => {
	const raw = parseGodotSceneJournal(sceneSource());
	const normalized = godotSceneCapture(raw);
	expect(normalized.scope).toBe(raw.scene);
	expect(normalized.observations).toEqual(raw.observations);
	expect(importApplicationCapture(sceneSource())).toEqual(normalized);
	expect(importApplicationCapture(JSON.stringify(normalized))).toEqual(normalized);
	expect(normalized).not.toHaveProperty("scene");
});
it("accepts a fake non-Godot producer through the same offline boundary", () => {
	const capture = godotSceneCapture(parseGodotSceneJournal(sceneSource()));
	const other = {
		...capture,
		adapterId: "fixture-editor",
		scope: "fixture-document",
		baseline: { objects: [{ id: "block", type: "fixture" }] },
		observations: [
			{
				id: "edit-1",
				atMs: 100,
				type: "object.properties",
				label: "Property changed",
				payload: { before: { value: 1 }, after: { value: 2 } },
			},
		],
	};
	expect(parseApplicationCapture(JSON.stringify(other))).toEqual(other);
});
it("isolates colliding local event IDs by producer, instance and session", () => {
	const base = godotSceneCapture(parseGodotSceneJournal(sceneSource()));
	const other = { ...base, instanceId: "instance-two", sessionId: "session-two" };
	const first = parseApplicationCapture(JSON.stringify(base)),
		second = parseApplicationCapture(JSON.stringify(other));
	second.observations[0].label = "Changed copy";
	expect(first.observations[0].label).not.toBe("Changed copy");
	expect(first.sessionId).not.toBe(second.sessionId);
});
it("rejects invalid versions, clocks, duplicate IDs, order and duration overflow", () => {
	const base = godotSceneCapture(parseGodotSceneJournal(sceneSource()));
	for (const changes of [
		{ version: 2 },
		{ clock: "recording-time" },
		{ enabled: true },
		{ pollIntervalMs: 0 },
		{ observations: [base.observations[0], base.observations[0]] },
		{ observations: [...base.observations].reverse() },
		{ durationMs: 0 },
		{ baseline: "x".repeat(2 * 1024 * 1024 + 1) },
		{ observations: [{ ...base.observations[0], payload: "x".repeat(32769) }] },
	])
		expect(() => validateApplicationCapture({ ...base, ...changes })).toThrow();
	expect(() => importApplicationCapture('{"format":"unsupported","version":1}')).toThrow();
	expect(() => parseApplicationCapture(" ".repeat(8 * 1024 * 1024 + 1))).toThrow();
});
it("retains sampling triggers as context without claiming action causality", () => {
	const source = sceneSource().replace(
		'"event":"scene-state"',
		'"event":"scene-state","trigger":"inspector"',
	);
	const capture = importApplicationCapture(source);
	expect(capture.clock).toBe("unmapped");
	expect(capture.observations[0].payload).toMatchObject({ samplingTrigger: "inspector" });
	expect(capture.observations[0].label).toBe("Node appeared: Sprite2D");
});
