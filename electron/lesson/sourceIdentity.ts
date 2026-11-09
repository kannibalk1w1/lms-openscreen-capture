import { randomUUID } from "node:crypto";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { LessonOperationError } from "../../src/lib/lesson/api";
import {
	type LessonRangeRequest,
	lessonMediaSelectionSchema,
	lessonMediaSelectionV2Schema,
	lessonRangeRequestSchema,
	MAX_SOURCE_IDENTITY_HISTORY,
	mediaSelectionSnapshot,
} from "../../src/lib/lesson/mediaSelection";
import { RangeMediaError } from "./rangeErrors";
import { prepareLessonRangeMedia } from "./rangeMedia";
import { planLessonRange } from "./rangePlan";
import {
	checkSourceCancellation,
	observeRangeSources,
	requireMatchingSourceContent,
	resolveRangeSources,
} from "./sourceFiles";
/** Explicit caller-authorized content observation; never invoked by planning/open/export. */
export async function captureLessonSourceIdentity(options: {
	selection: unknown;
	intent: "author-current" | "refresh-current";
	replacement?: LessonRangeRequest;
	readDocument: (id: string) => Promise<AxcutDocument>;
	signal?: AbortSignal;
}) {
	try {
		checkSourceCancellation(options.signal);
		if (process.platform !== "linux") throw new RangeMediaError("range-media-unsupported");
		const previous = lessonMediaSelectionSchema.parse(options.selection);
		if (options.intent !== "author-current" && options.intent !== "refresh-current")
			throw new RangeMediaError("range-media-unsupported");
		if (options.intent === "author-current" && (previous.version !== 1 || options.replacement))
			throw new RangeMediaError("range-media-unsupported");
		if (options.intent === "refresh-current" && !options.replacement)
			throw new RangeMediaError("range-media-unsupported");
		const history =
			previous.version === 2
				? [...previous.previousSelections, mediaSelectionSnapshot(previous)]
				: [mediaSelectionSnapshot(previous)];
		if (history.length > MAX_SOURCE_IDENTITY_HISTORY)
			throw new RangeMediaError("range-media-unsupported");
		const replacement = options.replacement
			? lessonRangeRequestSchema.parse(options.replacement)
			: undefined;
		if (replacement && replacement.projectId !== previous.projectId)
			throw new RangeMediaError("range-media-unsupported");
		const id = replacement?.projectId ?? previous.projectId;
		const document = await options.readDocument(id);
		checkSourceCancellation(options.signal);
		const reference = replacement ? await planLessonRange(document, replacement) : previous;
		const prepared = await prepareLessonRangeMedia(document, reference);
		const sources = resolveRangeSources(prepared.derived, prepared.clips);
		const before = await observeRangeSources(sources, options.signal);
		const current = await prepareLessonRangeMedia(await options.readDocument(id), reference);
		const after = await observeRangeSources(
			resolveRangeSources(current.derived, current.clips),
			options.signal,
		);
		requireMatchingSourceContent(before, after);
		await prepareLessonRangeMedia(await options.readDocument(id), reference);
		checkSourceCancellation(options.signal);
		return lessonMediaSelectionV2Schema.parse({
			...prepared.selection,
			version: 2,
			identity: {
				version: 1,
				observationId: randomUUID(),
				basis:
					options.intent === "author-current"
						? "explicit-author-current"
						: "explicit-refresh-current",
				sources: before,
			},
			previousSelections: history,
		});
	} catch (error) {
		if (error instanceof RangeMediaError || error instanceof LessonOperationError) throw error;
		throw new RangeMediaError("range-media-unsupported");
	}
}
