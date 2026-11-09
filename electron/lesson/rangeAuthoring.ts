import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { LessonOperationError } from "../../src/lib/lesson/api";
import { lessonRangeRequestSchema } from "../../src/lib/lesson/mediaSelection";
import { validateLesson } from "../../src/lib/lesson/schema";
import { RangeMediaError } from "./rangeErrors";
import { prepareLessonRangeMedia } from "./rangeMedia";
import { planLessonRange } from "./rangePlan";
import { checkSourceCancellation, resolveRangeSources } from "./sourceFiles";
import { captureLessonSourceIdentity } from "./sourceIdentity";

const requestSchema = z
	.object({
		operationId: z.string().uuid(),
		lesson: z.unknown(),
		stepId: z.string().uuid(),
		range: lessonRangeRequestSchema,
		intent: z.enum(["author-current", "refresh-current"]),
	})
	.strict();
export interface RangeAuthoringAuthority {
	owner: object;
	projectId: string;
	/** Captured editor/project generation; throws when closed, replaced or navigated away. */
	assertCurrent: () => void;
	canReadSource: (canonicalPath: string) => boolean;
}
/** Explicit source observation only: no persistence, rendering, destinations or discovery. */
export class RangeAuthoringService {
	private active?: { owner: object; id: string; abort: AbortController };
	constructor(private readonly readDocument: (id: string) => Promise<AxcutDocument>) {}
	cancel(owner: object, input: unknown) {
		const id = z.string().uuid().parse(input);
		if (this.active?.owner !== owner || this.active.id !== id) return false;
		this.active.abort.abort();
		return true;
	}
	cancelOwner(owner: object) {
		if (this.active?.owner === owner) this.active.abort.abort();
	}
	async confirm(input: unknown, authority: RangeAuthoringAuthority) {
		const request = requestSchema.parse(input);
		authority.assertCurrent();
		if (request.range.projectId !== authority.projectId)
			throw new LessonOperationError("project-changed");
		if (this.active) throw new LessonOperationError("render-busy");
		const active = {
			owner: authority.owner,
			id: request.operationId,
			abort: new AbortController(),
		};
		this.active = active;
		const check = () => {
			checkSourceCancellation(active.abort.signal);
			authority.assertCurrent();
		};
		try {
			if (process.platform !== "linux") throw new RangeMediaError("range-media-unsupported");
			const lesson = await validateLesson(request.lesson);
			check();
			const step = lesson.steps.find((step) => step.id === request.stepId);
			if (!step) throw new LessonOperationError("range-target-changed");
			const previous = step.mediaSelection;
			if (
				(request.intent === "author-current" && previous) ||
				(request.intent === "refresh-current" && !previous) ||
				(previous && previous.projectId !== authority.projectId)
			)
				throw new LessonOperationError("range-target-changed");
			// Every backend read, including post-observation reads, stays under the same grant.
			const readDocument = async (id: string) => {
				check();
				if (id !== authority.projectId) throw new LessonOperationError("project-changed");
				const document = await this.readDocument(id);
				check();
				if (document.project.id !== id) throw new LessonOperationError("project-changed");
				const reference = await planLessonRange(document, request.range);
				const prepared = await prepareLessonRangeMedia(document, reference);
				for (const source of resolveRangeSources(prepared.derived, prepared.clips)) {
					// Refuse unapproved declarations before even resolving their filesystem path.
					if (!path.isAbsolute(source.path) || !authority.canReadSource(path.resolve(source.path)))
						throw new LessonOperationError("range-source-unavailable");
					// No symlink ancestor can widen a lexical picker/recording grant.
					const canonical = await fs.realpath(source.path).catch(() => {
						throw new LessonOperationError("range-source-unavailable");
					});
					check();
					if (canonical !== path.resolve(source.path) || !authority.canReadSource(canonical))
						throw new LessonOperationError("range-source-unavailable");
				}
				check();
				return document;
			};
			const document = await readDocument(authority.projectId);
			const reference = previous ?? (await planLessonRange(document, request.range));
			const selection = await captureLessonSourceIdentity({
				selection: reference,
				intent: request.intent,
				replacement: request.intent === "refresh-current" ? request.range : undefined,
				readDocument,
				signal: active.abort.signal,
			});
			check();
			return selection;
		} finally {
			if (this.active === active) this.active = undefined;
		}
	}
}
