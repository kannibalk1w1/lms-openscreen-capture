import { reviseLesson } from "./authoring";
import {
	type LessonManifest,
	type LessonStep,
	lessonHandoffSchema,
	lessonVerificationSchema,
	sha256,
	validateLesson,
} from "./schema";

function snapshot(step: LessonStep) {
	const { retakes: _history, ...content } = step;
	return content;
}

/** The explicit subject excludes review labels/history, but binds evidence, timing and image bytes. */
export async function verificationSubject(lesson: LessonManifest, stepId: string) {
	const step = lesson.steps.find((s) => s.id === stepId);
	if (!step) throw new Error("Unknown step");
	const {
		verification: _verification,
		status: _status,
		slideRef: _slide,
		...content
	} = snapshot(step);
	return sha256(
		new TextEncoder().encode(
			JSON.stringify({
				content,
				imageSha256: lesson.assets.find((a) => a.id === step.imageId)?.sha256 ?? null,
			}),
		),
	);
}

/** Replace one stable lesson step; retain every prior take and unrelated accepted step. */
export async function replaceLessonStep(
	input: LessonManifest,
	stepId: string,
	sourceInput: LessonManifest,
	sourceStepId: string,
	reason: string,
) {
	const lesson = await validateLesson(input),
		source = await validateLesson(sourceInput);
	const previous = lesson.steps.find((s) => s.id === stepId);
	const candidate = source.steps.find((s) => s.id === sourceStepId);
	if (
		!previous ||
		!candidate ||
		(lesson.id === source.id &&
			stepId === sourceStepId &&
			JSON.stringify(snapshot(previous)) === JSON.stringify(snapshot(candidate)))
	)
		throw new Error("Choose a different replacement step");
	let imageId = candidate.imageId;
	const assets = [...lesson.assets];
	if (imageId) {
		const image = source.assets.find((a) => a.id === imageId)!;
		const collision = assets.find((a) => a.id === imageId);
		if (collision && JSON.stringify(collision) !== JSON.stringify(image))
			imageId = crypto.randomUUID();
		if (!collision || imageId !== image.id) assets.push({ ...image, id: imageId });
	}
	const next = reviseLesson(lesson, {
		assets,
		steps: lesson.steps.map((s) =>
			s.id !== stepId
				? s
				: {
						...snapshot(candidate),
						id: previous.id,
						slideRef: previous.slideRef,
						imageId,
						status: "draft" as const,
						verification: undefined,
						retakes: [
							...(previous.retakes ?? []),
							{
								id: crypto.randomUUID(),
								kind: "replacement" as const,
								reason,
								lessonRevision: lesson.revision,
								sourceLessonId: source.id,
								sourceRevision: source.revision,
								sourceStepId,
								previous: snapshot(previous),
							},
						],
					},
		),
	});
	return validateLesson(next);
}

/** Restoration is another revision, never a deletion of the intervening history. */
export async function restoreLessonStep(
	input: LessonManifest,
	stepId: string,
	retakeId: string,
	reason: string,
) {
	const lesson = await validateLesson(input);
	const step = lesson.steps.find((s) => s.id === stepId);
	const previous = step?.retakes?.find((r) => r.id === retakeId);
	if (!step || !previous) throw new Error("Unknown previous take");
	const next = reviseLesson(lesson, {
		steps: lesson.steps.map((s) =>
			s.id !== stepId
				? s
				: {
						...previous.previous,
						status: "draft" as const,
						verification: undefined,
						retakes: [
							...(step.retakes ?? []),
							{
								id: crypto.randomUUID(),
								kind: "restore" as const,
								reason,
								lessonRevision: lesson.revision,
								sourceLessonId: lesson.id,
								sourceRevision: previous.lessonRevision,
								sourceStepId: stepId,
								previous: snapshot(step),
							},
						],
					},
		),
	});
	return validateLesson(next);
}

/** A human-entered test result, bound to exactly this teaching content and source references. */
export async function recordRunVerification(
	input: LessonManifest,
	stepId: string,
	check: { expected: string; observed: string; outcome: "passed" | "failed" | "unavailable" },
) {
	const lesson = await validateLesson(input);
	const verification = lessonVerificationSchema.parse({
		...check,
		id: crypto.randomUUID(),
		method: "manual-run-check",
		subjectSha256: await verificationSubject(lesson, stepId),
		checkedAt: new Date().toISOString(),
	});
	return validateLesson(
		reviseLesson(lesson, {
			steps: lesson.steps.map((s) =>
				s.id !== stepId
					? s
					: {
							...s,
							verification,
							status: "draft" as const,
						},
			),
		}),
	);
}

/** File-carried handoff only: this neither contacts an agent nor attests a project run. */
export async function recordLessonHandoff(
	input: LessonManifest,
	handoff: {
		from: "human" | "tutor" | "agent";
		to: "human" | "tutor" | "agent";
		note: string;
		nextStepId?: string;
	},
) {
	const lesson = await validateLesson(input);
	if (handoff.nextStepId && !lesson.steps.some((s) => s.id === handoff.nextStepId))
		throw new Error("Unknown next step");
	const record = lessonHandoffSchema.parse({
		...handoff,
		id: crypto.randomUUID(),
		lessonRevision: lesson.revision + 1,
	});
	return validateLesson({
		...lesson,
		revision: lesson.revision + 1,
		handoffs: [...(lesson.handoffs ?? []), record],
	});
}
