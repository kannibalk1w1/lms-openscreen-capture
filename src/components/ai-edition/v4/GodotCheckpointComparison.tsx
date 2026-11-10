import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	compareGodotSceneCheckpoints,
	type GodotSceneCheckpoint,
} from "@/lib/applicationIntegrations/godotScene";

type Comparison = ReturnType<typeof compareGodotSceneCheckpoints>;

export function GodotCheckpointComparison({
	source,
	checkpoints,
}: {
	source: string;
	checkpoints: GodotSceneCheckpoint[];
}) {
	const t = useScopedT("timeline");
	const [fromSequence, setFromSequence] = useState("");
	const [toSequence, setToSequence] = useState("");
	const [comparison, setComparison] = useState<Comparison | null>(null);
	const [error, setError] = useState("");
	const distinctChoices = fromSequence !== "" && toSequence !== "" && fromSequence !== toSequence;

	function compare() {
		if (!distinctChoices) return;
		setComparison(null);
		setError("");
		try {
			setComparison(compareGodotSceneCheckpoints(source, Number(fromSequence), Number(toSequence)));
		} catch {
			setError(t("lesson.checkpoints.failed"));
		}
	}

	function checkpointOption(checkpoint: GodotSceneCheckpoint) {
		return `${checkpoint.label} · record #${checkpoint.recordSequence} · ${checkpoint.atMs} ms`;
	}

	return (
		<details>
			<summary>{t("lesson.checkpoints.title")}</summary>
			<p>{t("lesson.checkpoints.scope")}</p>
			<label>
				{t("lesson.checkpoints.from")}
				<select
					aria-label={t("lesson.checkpoints.from")}
					value={fromSequence}
					onChange={(event) => {
						setFromSequence(event.target.value);
						setComparison(null);
						setError("");
					}}
				>
					<option value="">{t("lesson.checkpoints.choose")}</option>
					{checkpoints.map((checkpoint) => (
						<option key={checkpoint.recordSequence} value={checkpoint.recordSequence}>
							{checkpointOption(checkpoint)}
						</option>
					))}
				</select>
			</label>
			<label>
				{t("lesson.checkpoints.to")}
				<select
					aria-label={t("lesson.checkpoints.to")}
					value={toSequence}
					onChange={(event) => {
						setToSequence(event.target.value);
						setComparison(null);
						setError("");
					}}
				>
					<option value="">{t("lesson.checkpoints.choose")}</option>
					{checkpoints.map((checkpoint) => (
						<option key={checkpoint.recordSequence} value={checkpoint.recordSequence}>
							{checkpointOption(checkpoint)}
						</option>
					))}
				</select>
			</label>
			<button type="button" disabled={!distinctChoices} onClick={compare}>
				{t("lesson.checkpoints.compare")}
			</button>
			{error && <p role="alert">{error}</p>}
			{comparison && (
				<section aria-label={t("lesson.checkpoints.result")} aria-live="polite">
					<p>
						{t("lesson.checkpoints.counts", {
							added: comparison.counts.added,
							removed: comparison.counts.removed,
							changed: comparison.counts.changed,
							changedFields: comparison.counts.changedFields,
						})}
					</p>
					<div
						style={{
							maxHeight: 280,
							overflowY: "auto",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
						}}
					>
						{comparison.added.length > 0 && (
							<section>
								<h4>{t("lesson.checkpoints.added")}</h4>
								<ul>
									{comparison.added.map((node) => (
										<li key={node.id}>
											{t("lesson.checkpoints.node", {
												id: node.id,
												name: node.name,
												type: node.type,
												parent: node.parent || t("lesson.checkpoints.none"),
											})}
										</li>
									))}
								</ul>
							</section>
						)}
						{comparison.removed.length > 0 && (
							<section>
								<h4>{t("lesson.checkpoints.removed")}</h4>
								<ul>
									{comparison.removed.map((node) => (
										<li key={node.id}>
											{t("lesson.checkpoints.node", {
												id: node.id,
												name: node.name,
												type: node.type,
												parent: node.parent || t("lesson.checkpoints.none"),
											})}
										</li>
									))}
								</ul>
							</section>
						)}
						{comparison.changed.length > 0 && (
							<section>
								<h4>{t("lesson.checkpoints.changed")}</h4>
								<ul>
									{comparison.changed.map((node) => (
										<li key={node.id}>
											{t("lesson.checkpoints.changedNode", {
												before: node.nameBefore,
												after: node.nameAfter,
												id: node.id,
												fields: node.fields.join(", "),
											})}
										</li>
									))}
								</ul>
							</section>
						)}
						{comparison.selection && (
							<p>
								{t("lesson.checkpoints.selection", {
									before: comparison.selection.before.join(", ") || t("lesson.checkpoints.none"),
									after: comparison.selection.after.join(", ") || t("lesson.checkpoints.none"),
								})}
							</p>
						)}
					</div>
				</section>
			)}
		</details>
	);
}
