import { expect, it } from "vitest";
import { attachLessonIllustration, newLesson, newStep, reviseLesson } from "./authoring";
import { projectLesson } from "./export";
import { imageFixture } from "./fixtures.test-support";
import { parseLesson, validateLesson } from "./schema";
import {
	recordLessonHandoff,
	recordRunVerification,
	replaceLessonStep,
	restoreLessonStep,
	verificationSubject,
} from "./workflow";

it("replaces a failed Enemy step, persists history, hands agent work back, and restores without losing accepted steps", async () => {
	const image = await imageFixture();
	const first = {
		...newStep("Create Enemy"),
		status: "reviewed" as const,
		instructions: "Create the node",
	};
	const failed = {
		...newStep("Move Enemy"),
		instructions: "Broken movement",
		slideRef: "slide 4",
		imageId: image.id,
		imageAlt: "Old movement",
	};
	const original = { ...newLesson("Enemy lesson"), steps: [first, failed], assets: [image] };
	const offered = await recordLessonHandoff(original, {
		from: "human",
		to: "agent",
		note: "Replace only broken movement",
		nextStepId: failed.id,
	});
	const prepared = {
		...newLesson("Agent replacement"),
		steps: [
			{
				...newStep("Move Enemy correctly"),
				instructions: "Corrected movement",
				status: "reviewed" as const,
			},
		],
	};
	const replaced = await replaceLessonStep(
		offered,
		failed.id,
		prepared,
		prepared.steps[0].id,
		"Fix failed movement",
	);
	expect(replaced.steps[0]).toEqual(first);
	expect(replaced.steps[1]).toMatchObject({
		id: failed.id,
		slideRef: "slide 4",
		status: "draft",
		instructions: "Corrected movement",
	});
	expect(replaced.steps[1].imageId).toBeUndefined();
	expect(replaced.steps[1].retakes?.[0].previous).toEqual(failed);
	expect(replaced.handoffs?.at(-1)?.lessonRevision).not.toBe(replaced.revision);
	const checked = await recordRunVerification(replaced, failed.id, {
		expected: "Enemy moves right",
		observed: "Moved right; no visible error",
		outcome: "passed",
	});
	expect(checked.steps[1].status).toBe("draft");
	expect(checked.steps[1].verification?.subjectSha256).toBe(
		await verificationSubject(checked, failed.id),
	);
	const returned = await recordLessonHandoff(checked, {
		from: "agent",
		to: "human",
		note: "Review replacement and confirm in the editor",
		nextStepId: failed.id,
	});
	const reopened = await parseLesson(JSON.stringify(returned));
	expect(reopened).toEqual(returned);
	expect(reopened.handoffs?.at(-1)?.lessonRevision).toBe(reopened.revision);
	const restored = await restoreLessonStep(
		reopened,
		failed.id,
		reopened.steps[1].retakes![0].id,
		"Use earlier take",
	);
	expect(restored.steps[0]).toEqual(first);
	expect(restored.steps[1]).toMatchObject({
		instructions: "Broken movement",
		imageId: image.id,
		status: "draft",
	});
	expect(restored.steps[1].verification).toBeUndefined();
	expect(restored.steps[1].retakes).toHaveLength(2);
	expect(restored.steps[1].retakes?.[1].previous.instructions).toBe("Corrected movement");
	expect(original.steps[1]).toEqual(failed);
	const illustration = await imageFixture();
	const illustrated = attachLessonIllustration(
		restored,
		{ lessonId: restored.id, revision: restored.revision, stepId: failed.id, imageId: image.id },
		illustration,
	);
	expect(illustrated.assets.some((a) => a.id === image.id)).toBe(true);
	await expect(validateLesson(illustrated)).resolves.toBeDefined();
});

it("invalidates a manual run check after source/content changes, never treating a run label as proof", async () => {
	const step = newStep("Enemy");
	const lesson = await recordRunVerification({ ...newLesson(), steps: [step] }, step.id, {
		expected: "Move",
		observed: "No interactive session",
		outcome: "unavailable",
	});
	const changed = reviseLesson(lesson, {
		steps: [{ ...lesson.steps[0], instructions: "Different code" }],
	});
	expect(await verificationSubject(changed, step.id)).not.toBe(
		lesson.steps[0].verification?.subjectSha256,
	);
	const reviewed = reviseLesson(lesson, {
		steps: [{ ...lesson.steps[0], status: "reviewed", slideRef: "2" }],
	});
	expect(await verificationSubject(reviewed, step.id)).toBe(
		lesson.steps[0].verification?.subjectSha256,
	);
});

it("rejects unknown targets, blank reasons, history overflow and missing historical assets without mutating inputs", async () => {
	const a = { ...newLesson(), steps: [newStep("A")] },
		b = { ...newLesson(), steps: [newStep("B")] };
	await expect(replaceLessonStep(a, a.steps[0].id, b, b.steps[0].id, " ")).rejects.toThrow();
	await expect(
		replaceLessonStep(a, crypto.randomUUID(), b, b.steps[0].id, "reason"),
	).rejects.toThrow();
	await expect(
		restoreLessonStep(a, a.steps[0].id, crypto.randomUUID(), "reason"),
	).rejects.toThrow();
	let current = a;
	for (let i = 0; i < 8; i++)
		current = await replaceLessonStep(current, a.steps[0].id, b, b.steps[0].id, `Retake ${i}`);
	await expect(
		replaceLessonStep(current, a.steps[0].id, b, b.steps[0].id, "Overflow"),
	).rejects.toThrow();
	expect(current.steps[0].retakes).toHaveLength(8);
	const broken = structuredClone(current);
	broken.steps[0].retakes![0].previous.imageId = crypto.randomUUID();
	await expect(validateLesson(broken)).rejects.toThrow();
	expect(a.revision).toBe(0);
});

it("supports a later take of the same step and remaps colliding image IDs", async () => {
	const image = await imageFixture(),
		other = {
			...(await imageFixture()),
			id: image.id,
			source: { ...image.source, projectId: "other-project" },
		};
	const step = { ...newStep(), imageId: image.id };
	const original = { ...newLesson(), steps: [step], assets: [image] };
	const source = reviseLesson(original, {
		steps: [{ ...step, instructions: "Retaken", imageAlt: "New view" }],
		assets: [other],
	});
	const replaced = await replaceLessonStep(original, step.id, source, step.id, "Later take");
	expect(replaced.steps[0].imageId).not.toBe(image.id);
	expect(replaced.assets.find((a) => a.id === image.id)).toEqual(image);
	expect(replaced.assets).toHaveLength(2);
});

it("strips private retake history, checks, handoffs and old images from selected learner guides", async () => {
	const image = await imageFixture(),
		step = { ...newStep("PRIVATE_OLD"), imageId: image.id, imageAlt: "Old" };
	const source = { ...newLesson(), steps: [newStep("Public")] };
	const replaced = await replaceLessonStep(
		{ ...newLesson(), assets: [image], steps: [step] },
		step.id,
		source,
		source.steps[0].id,
		"PRIVATE_REASON",
	);
	const handed = await recordLessonHandoff(replaced, {
		from: "human",
		to: "tutor",
		note: "PRIVATE_NOTE",
	});
	const projected = await projectLesson(handed, [step.id]);
	expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_/);
	expect(projected.assets).toEqual([]);
	expect(projected.steps[0].retakes).toBeUndefined();
});
