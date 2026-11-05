import type { AxcutDocument } from "../ai-edition/schema";
import { typingSectionPlacements } from "./association";

export type TypingReviewTarget = { projectId: string; takeId: string; sectionId: string };

/** Review uses anchored onsets only: independent typing time is never treated as video time. */
export function typingReviewEntries(doc: AxcutDocument) {
	return (doc.typingTakes ?? []).flatMap((take) =>
		take.sections.map((section, index) => {
			const placements = typingSectionPlacements(doc, section);
			return {
				key: JSON.stringify([take.id, section.id]),
				take,
				section,
				number: index + 1,
				placements,
				status: !section.sourceAnchor
					? ("independent" as const)
					: placements.length === 0
						? ("unavailable" as const)
						: placements.every((p) => p.trimmed)
							? ("trimmed" as const)
							: ("linked" as const),
			};
		}),
	);
}
export type TypingReviewEntry = ReturnType<typeof typingReviewEntries>[number];
