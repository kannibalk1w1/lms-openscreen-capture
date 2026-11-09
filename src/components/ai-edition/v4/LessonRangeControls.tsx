import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonMediaSelection } from "@/lib/lesson/mediaSelection";
export function LessonRangeControls({
	selection,
	available,
	onAttach,
	onConfirm,
	confirmAvailable,
	onRemove,
}: {
	selection?: LessonMediaSelection;
	available: boolean;
	onAttach: (startSec: number, endSec: number) => void;
	onRemove: () => void;
	confirmAvailable: boolean;
	onConfirm: (startSec: number, endSec: number) => void;
}) {
	const t = useScopedT("timeline");
	const storedStart = selection?.startSec ?? 0,
		storedEnd = selection?.endSec ?? 0;
	const [start, setStart] = useState(String(selection?.startSec ?? 0)),
		[end, setEnd] = useState(String(selection?.endSec ?? 0));
	useEffect(() => {
		setStart(String(storedStart));
		setEnd(String(storedEnd));
	}, [storedStart, storedEnd]);
	const from = Number(start),
		to = Number(end),
		valid =
			start.trim() !== "" &&
			end.trim() !== "" &&
			Number.isFinite(from) &&
			Number.isFinite(to) &&
			from >= 0 &&
			to > from &&
			to <= 86400;
	return (
		<fieldset style={{ border: "1px solid var(--border)", padding: 12, display: "grid", gap: 8 }}>
			<legend>{t("lesson.range.title")}</legend>
			<p>{t("lesson.range.scope")}</p>
			<label>
				{t("lesson.range.start")}
				<input
					type="number"
					min={0}
					max={86400}
					step="any"
					value={start}
					onChange={(event) => setStart(event.target.value)}
				/>
			</label>
			<button
				type="button"
				onClick={() => setStart(String(useProjectStore.getState().currentTimeSec))}
			>
				{t("lesson.range.useStart")}
			</button>
			<label>
				{t("lesson.range.end")}
				<input
					type="number"
					min={0}
					max={86400}
					step="any"
					value={end}
					onChange={(event) => setEnd(event.target.value)}
				/>
			</label>
			<button
				type="button"
				onClick={() => setEnd(String(useProjectStore.getState().currentTimeSec))}
			>
				{t("lesson.range.useEnd")}
			</button>
			<button
				type="button"
				disabled={!available || !valid || selection?.version === 2}
				onClick={() => onAttach(from, to)}
			>
				{t("lesson.range.attach")}
			</button>
			<p>{t("lesson.range.confirmScope")}</p>
			<button
				type="button"
				disabled={!confirmAvailable || !valid}
				onClick={() => onConfirm(from, to)}
			>
				{t(selection ? "lesson.range.refresh" : "lesson.range.confirm")}
			</button>
			<p>{t(selection?.version === 2 ? "lesson.range.confirmed" : "lesson.range.unconfirmed")}</p>
			{selection && (
				<>
					<p>
						{t("lesson.range.stored", {
							start: selection.startSec,
							end: selection.endSec,
							spans: selection.keptSpans.length,
						})}
					</p>
					<button type="button" onClick={onRemove}>
						{t("lesson.range.remove")}
					</button>
				</>
			)}
		</fieldset>
	);
}
