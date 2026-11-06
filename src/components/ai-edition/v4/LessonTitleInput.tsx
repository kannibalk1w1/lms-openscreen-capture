import { useEffect, useState } from "react";
/** Allow normal clear/retype without committing an invalid empty manifest title. */
export function LessonTitleInput({
	value,
	onCommit,
}: {
	value: string;
	onCommit: (value: string) => void;
}) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return (
		<input
			maxLength={300}
			value={draft}
			aria-invalid={!draft.trim()}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				if (!draft.trim()) setDraft(value);
				else if (draft !== value) onCommit(draft);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}
