import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ApplicationCapture,
	MAX_APPLICATION_CAPTURE_BYTES,
} from "@/lib/applicationIntegrations/capture";
import {
	type GodotSceneCheckpoint,
	listGodotSceneCheckpoints,
} from "@/lib/applicationIntegrations/godotScene";
import { importApplicationCapture } from "@/lib/applicationIntegrations/importCapture";
import {
	ApplicationTimingSourceChangedError,
	createApplicationTimingBindings,
} from "@/lib/applicationIntegrations/timingBinding";
import { appendApplicationDrafts } from "@/lib/lesson/applicationDraft";
import type { LessonManifest } from "@/lib/lesson/schema";
import {
	ApplicationAssociationControls,
	type ApplicationAssociationSelection,
	type ApplicationAssociationSource,
} from "./ApplicationAssociationControls";
import { GodotCheckpointComparison } from "./GodotCheckpointComparison";
import { GodotRetakeComparison } from "./GodotRetakeComparison";

const NO_SOURCES: ApplicationAssociationSource[] = [];
type CheckpointSource = { id: number; text: string; checkpoints: GodotSceneCheckpoint[] };

export function ApplicationCaptureReview({
	lesson,
	onAppend,
	sources = NO_SOURCES,
}: {
	lesson: LessonManifest;
	onAppend: (next: LessonManifest) => void;
	sources?: ApplicationAssociationSource[];
}) {
	const t = useScopedT("timeline");
	const [journal, setJournal] = useState<ApplicationCapture | null>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [page, setPage] = useState(0);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [calibration, setCalibration] = useState<ApplicationAssociationSelection | null>(null);
	const [checkpointSource, setCheckpointSource] = useState<CheckpointSource | null>(null);
	const latest = useRef({ lesson, selected, journal, calibration, sources });
	latest.current = { lesson, selected, journal, calibration, sources };
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
		setCheckpointSource(null);
		setSelected([]);
		setCalibration(null);
		setMessage("");
		try {
			if (file.size > MAX_APPLICATION_CAPTURE_BYTES) throw new Error("limit");
			const sourceText = await file.text();
			const parsed = importApplicationCapture(sourceText);
			if (current !== epoch.current) return;
			let checkpoints: GodotSceneCheckpoint[] = [];
			if (parsed.adapterId === "godot-scene") {
				let normalized = false;
				try {
					const value: unknown = JSON.parse(sourceText);
					normalized = value !== null && typeof value === "object" && "format" in value;
				} catch {
					// A raw Godot journal is JSONL; its strict decoder below validates every record.
				}
				if (!normalized) {
					try {
						const found = listGodotSceneCheckpoints(sourceText);
						checkpoints = found;
					} catch {
						// Generic review remains available if checkpoint enumeration rejects the raw journal.
					}
				}
			}
			setJournal(parsed);
			setCheckpointSource(
				checkpoints.length >= 1 ? { id: current, text: sourceText, checkpoints } : null,
			);
			setPage(0);
		} catch {
			if (current === epoch.current) setMessage(t("lesson.scene.invalid"));
		} finally {
			if (current === epoch.current) setBusy(false);
		}
	}
	async function append() {
		if (!journal || busy) return;
		const current = ++epoch.current;
		const request = { lesson, selected, journal, calibration };
		const source = sources.find((candidate) => candidate.id === calibration?.sourceId);
		const sourceContext = source ? JSON.stringify([source.id, source.clock]) : "";
		setBusy(true);
		setMessage("");
		try {
			if (calibration && !source)
				throw new ApplicationTimingSourceChangedError("Recording source removed");
			const timings = calibration
				? await createApplicationTimingBindings(
						journal,
						source?.clock,
						calibration.plan,
						calibration.sourceId,
						selected,
					)
				: undefined;
			if (current !== epoch.current) return;
			const active = latest.current;
			const activeSource = active.sources.find(
				(candidate) => candidate.id === calibration?.sourceId,
			);
			if (
				active.lesson !== request.lesson ||
				active.journal !== request.journal ||
				active.selected !== request.selected ||
				active.calibration !== request.calibration ||
				sourceContext !==
					(activeSource ? JSON.stringify([activeSource.id, activeSource.clock]) : "")
			) {
				setMessage(t("lesson.association.stale"));
				return;
			}
			onAppend(appendApplicationDrafts(lesson, journal, selected, timings));
			setSelected([]);
			setMessage(
				calibration
					? t("lesson.association.draftsAdded", {
							mapped: timings?.size ?? 0,
							total: selected.length,
						})
					: t("lesson.scene.appended"),
			);
		} catch (error) {
			if (current === epoch.current)
				setMessage(
					t(
						error instanceof ApplicationTimingSourceChangedError
							? "lesson.association.stale"
							: "lesson.scene.failed",
					),
				);
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
					accept=".json,.jsonl,.ndjson"
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
							scene: journal.scope,
							adapter: journal.adapterId,
							count: journal.observations.length,
							duration: journal.durationMs,
						})}
					</p>
					<p>{t("lesson.scene.unverified", { interval: journal.pollIntervalMs })}</p>
					<fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
						<ApplicationAssociationControls
							capture={journal}
							sources={sources}
							onPlan={setCalibration}
						/>
					</fieldset>
					{checkpointSource && checkpointSource.checkpoints.length >= 2 && (
						<fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
							<GodotCheckpointComparison
								key={checkpointSource.id}
								source={checkpointSource.text}
								checkpoints={checkpointSource.checkpoints}
							/>
						</fieldset>
					)}
					{checkpointSource && (
						<fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
							<GodotRetakeComparison
								key={checkpointSource.id}
								originalText={checkpointSource.text}
								originalCheckpoints={checkpointSource.checkpoints}
							/>
						</fieldset>
					)}
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
					<button type="button" disabled={busy || !selected.length} onClick={() => setSelected([])}>
						{t("lesson.scene.clear")}
					</button>
					<button
						type="button"
						disabled={busy || !selected.length || selected.length + lesson.steps.length > 200}
						onClick={() => void append()}
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
											busy ||
											(!selected.includes(observation.id) &&
												selected.length >= Math.min(200 - lesson.steps.length, 200))
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
							setBusy(false);
							setJournal(null);
							setCheckpointSource(null);
							setSelected([]);
							setCalibration(null);
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
