import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type GodotSceneJournal,
	MAX_SCENE_JOURNAL_BYTES,
	parseGodotSceneJournal,
} from "@/lib/applicationIntegrations/godotScene";
import { appendSceneDrafts } from "@/lib/lesson/sceneDraft";
import type { LessonManifest } from "@/lib/lesson/schema";

export function GodotSceneReview({
	lesson,
	onAppend,
}: {
	lesson: LessonManifest;
	onAppend: (next: LessonManifest) => void;
}) {
	const t = useScopedT("timeline");
	const [journal, setJournal] = useState<GodotSceneJournal | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [page, setPage] = useState(0);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const epoch = useRef(0);
	useEffect(
		() => () => {
			epoch.current++;
		},
		[],
	);
	async function load(file?: File) {
		if (!file) return;
		const current = ++epoch.current;
		setBusy(true);
		setJournal(null);
		setSelected([]);
		setMessage("");
		try {
			if (file.size > MAX_SCENE_JOURNAL_BYTES) throw new Error("limit");
			const parsed = parseGodotSceneJournal(await file.text());
			if (current !== epoch.current) return;
			setJournal(parsed);
			setPage(0);
		} catch {
			if (current === epoch.current) setMessage(t("lesson.scene.invalid"));
		} finally {
			if (current === epoch.current) setBusy(false);
		}
	}
	return (
		<details>
			<summary>{t("lesson.scene.title")}</summary>
			<p>{t("lesson.scene.scope")}</p>
			<label>
				{t("lesson.scene.import")}
				<input
					type="file"
					accept=".jsonl,.ndjson"
					disabled={busy}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						void load(file);
					}}
				/>
			</label>
			<p role="status" aria-live="polite">
				{busy ? t("lesson.scene.loading") : message}
			</p>
			{journal && (
				<>
					<p>
						{t("lesson.scene.inventory", {
							scene: journal.scene,
							count: journal.observations.length,
							nodes: journal.baseline.nodes.length,
							duration: journal.durationMs,
						})}
					</p>
					<p>{t("lesson.scene.unverified")}</p>
					{journal.coverage === "limited" && <p role="alert">{t("lesson.scene.limited")}</p>}
					<details>
						<summary>{t("lesson.scene.baseline")}</summary>
						<pre
							style={{
								whiteSpace: "pre-wrap",
								overflowWrap: "anywhere",
								maxHeight: 240,
								overflowY: "auto",
							}}
						>
							{JSON.stringify(journal.baseline, null, 2)}
						</pre>
					</details>
					<p>
						{t("lesson.scene.selected", {
							count: selected.length,
							remaining: 200 - lesson.steps.length,
						})}
					</p>
					<button type="button" disabled={!selected.length} onClick={() => setSelected([])}>
						{t("lesson.scene.clear")}
					</button>
					<button
						type="button"
						disabled={!selected.length || selected.length + lesson.steps.length > 200}
						onClick={() => {
							try {
								onAppend(appendSceneDrafts(lesson, journal, selected));
								setSelected([]);
								setMessage(t("lesson.scene.appended"));
							} catch {
								setMessage(t("lesson.scene.failed"));
							}
						}}
					>
						{t("lesson.scene.append")}
					</button>
					<ol start={page * 25 + 1}>
						{journal.observations.slice(page * 25, (page + 1) * 25).map((observation) => (
							<li key={observation.id}>
								<label>
									<input
										type="checkbox"
										checked={selected.includes(observation.id)}
										disabled={
											!selected.includes(observation.id) &&
											selected.length >= Math.min(200 - lesson.steps.length, 200)
										}
										onChange={(event) =>
											setSelected(
												event.target.checked
													? [...selected, observation.id]
													: selected.filter((id) => id !== observation.id),
											)
										}
									/>
									{observation.atMs} ms · {observation.label}
								</label>
								<details>
									<summary>{t("lesson.scene.evidence")}</summary>
									<pre
										style={{
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere",
											maxHeight: 240,
											overflowY: "auto",
										}}
									>
										{JSON.stringify(observation.payload, null, 2)}
									</pre>
								</details>
							</li>
						))}
					</ol>
					<button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
						{t("lesson.scene.previous")}
					</button>
					<button
						type="button"
						disabled={(page + 1) * 25 >= journal.observations.length}
						onClick={() => setPage(page + 1)}
					>
						{t("lesson.scene.next")}
					</button>
					<button
						type="button"
						onClick={() => {
							epoch.current++;
							setJournal(null);
							setSelected([]);
							setMessage("");
						}}
					>
						{t("lesson.scene.forget")}
					</button>
				</>
			)}
		</details>
	);
}
