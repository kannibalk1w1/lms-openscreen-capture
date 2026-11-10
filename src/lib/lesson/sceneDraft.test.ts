import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { parseGodotSceneJournal } from "../applicationIntegrations/godotScene";
import { sceneSource } from "../applicationIntegrations/godotScene.test-support";
import { newLesson, newStep } from "./authoring";
import { emptyLessonQuery, queryLesson } from "./review";
import { appendSceneDrafts } from "./sceneDraft";
import { parseLesson } from "./schema";

afterEach(() => vi.unstubAllGlobals());
it("saves selected evidence in a portable draft and reopens without any integration", async () => {
	vi.stubGlobal("crypto", webcrypto);
	const journal = parseGodotSceneJournal(sceneSource());
	const lesson = newLesson();
	const next = appendSceneDrafts(lesson, journal, [journal.observations[1].id]);
	expect(lesson.steps).toHaveLength(0);
	expect(next.steps).toHaveLength(1);
	expect(next.steps[0].status).toBe("draft");
	expect(next.steps[0].mediaSelection).toBeUndefined();
	expect(next.steps[0].evidence[0]).toMatchObject({
		kind: "application-observation",
		clock: "unmapped",
		provenance: "observed",
		application: { adapterId: "godot-scene", scope: "res://enemy.tscn" },
	});
	const reopened = await parseLesson(JSON.stringify(next));
	expect(reopened).toEqual(next);
	expect(
		queryLesson(reopened, { ...emptyLessonQuery(), source: "application-observation" }),
	).toHaveLength(1);
	expect(JSON.stringify(next)).not.toContain("node-disappeared");
});
it("refuses invalid selections and step overflow without changing the lesson", () => {
	vi.stubGlobal("crypto", webcrypto);
	const journal = parseGodotSceneJournal(sceneSource()),
		lesson = newLesson();
	for (const selection of [
		[],
		["unknown"],
		[journal.observations[0].id, journal.observations[0].id],
	])
		expect(() => appendSceneDrafts(lesson, journal, selection)).toThrow();
	lesson.steps = Array.from({ length: 200 }, () => newStep());
	expect(() => appendSceneDrafts(lesson, journal, [journal.observations[0].id])).toThrow();
	expect(lesson.revision).toBe(0);
});
it("requires bounded application payloads and observed identities on reopen", async () => {
	vi.stubGlobal("crypto", webcrypto);
	const journal = parseGodotSceneJournal(sceneSource());
	const next = appendSceneDrafts(newLesson(), journal, [journal.observations[0].id]);
	for (const change of [
		{ application: undefined },
		{ sessionId: undefined },
		{ eventId: undefined },
		{ provenance: "authored" },
		{ application: { ...next.steps[0].evidence[0].application, payload: "x".repeat(32769) } },
	]) {
		const invalid = structuredClone(next);
		Object.assign(invalid.steps[0].evidence[0], change);
		await expect(parseLesson(JSON.stringify(invalid))).rejects.toThrow();
	}
});
