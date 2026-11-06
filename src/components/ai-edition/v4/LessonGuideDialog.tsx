import { useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { type LessonErrorCode, LessonOperationError } from "@/lib/lesson/api";
import {
	attachLessonIllustration,
	draftLessonSteps,
	moveStep,
	newLesson,
	newStep,
	reviseLesson,
} from "@/lib/lesson/authoring";
import { lessonRenderFingerprint } from "@/lib/lesson/frameSource";
import { lessonOutput } from "@/lib/lesson/output";
import { emptyLessonQuery, queryLesson, stepFindings } from "@/lib/lesson/review";
import {
	type LessonManifest,
	type LessonStep,
	validateLesson,
	validateLessonImage,
} from "@/lib/lesson/schema";
import styles from "./LessonGuideDialog.module.css";
import { LessonOutputControls } from "./LessonOutputControls";
import { LessonReviewControls } from "./LessonReviewControls";
import { LessonTitleInput } from "./LessonTitleInput";
import { LocalLessonDraftControls } from "./LocalLessonDraftControls";
export function LessonGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useScopedT("timeline");
	const document = useProjectStore((s) => s.document),
		projectId = useProjectStore((s) => s.projectId);
	const [lesson, setLesson] = useState<LessonManifest>(() => newLesson());
	const [query, setQueryValue] = useState(emptyLessonQuery);
	const [pinned, setPinned] = useState<string[]>([]);
	const [editNotice, setEditNotice] = useState("");
	const setQuery = (query: ReturnType<typeof emptyLessonQuery>) => {
		setPinned([]);
		setEditNotice("");
		setQueryValue(query);
	};
	const [selected, setSelected] = useState<string[]>([]),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<LessonErrorCode | null>(null),
		[notice, setNotice] = useState("");
	const epoch = useRef({ projectId });
	const generation = useRef(0);
	const replaceLesson = (value: LessonManifest) => {
		generation.current++;
		setLesson(value);
		setSelected(value.steps.map((step) => step.id));
		setQuery(emptyLessonQuery());
	};
	const busyRef = useRef(false);
	useEffect(() => {
		epoch.current = { projectId };
		return () => {
			epoch.current = { projectId };
		};
	}, [projectId]);
	const author = (operation: () => LessonManifest) => {
		try {
			setLesson(operation());
			setError(null);
			return true;
		} catch {
			setError("lesson-operation-failed");
			return false;
		}
	};
	const update = (id: string, change: Partial<LessonStep>) => {
		const previous = lesson.steps.find((step) => step.id === id)?.status,
			next = change.status ?? "draft";
		const saved = author(() =>
			reviseLesson(lesson, {
				steps: lesson.steps.map((step) =>
					step.id === id ? { ...step, ...change, status: next } : step,
				),
			}),
		);
		if (saved) {
			setPinned((values) => (values.includes(id) ? values : [...values, id]));
			if (previous !== next)
				setEditNotice(t(next === "draft" ? "lesson.query.demoted" : "lesson.query.promoted"));
		}
	};
	const run = async (action: (current: () => boolean) => Promise<void>) => {
		if (busyRef.current) return;
		busyRef.current = true;
		const projectEpoch = epoch.current,
			lessonGeneration = generation.current;
		const current = () => epoch.current === projectEpoch && generation.current === lessonGeneration;
		setBusy(true);
		setError(null);
		setNotice("");
		try {
			await action(current);
		} catch (error) {
			if (current())
				setError(error instanceof LessonOperationError ? error.code : "lesson-operation-failed");
		} finally {
			busyRef.current = false;
			if (epoch.current === projectEpoch) setBusy(false);
		}
	};
	const active = selected.filter((id) => lesson.steps.some((step) => step.id === id));
	const output = lessonOutput(lesson),
		matches = queryLesson(lesson, query).map((step) => step.id);
	const visible = new Set([
		...matches,
		...pinned.filter((id) => lesson.steps.some((step) => step.id === id)),
	]);
	const hidden = active.filter((id) => !visible.has(id)).length;
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!value && !busy) onClose();
			}}
		>
			<DialogContent style={{ maxWidth: 960, maxHeight: "90vh", overflowY: "auto" }}>
				<DialogHeader>
					<DialogTitle>{t("lesson.title")}</DialogTitle>
					<DialogDescription>{t("lesson.scope")}</DialogDescription>
				</DialogHeader>
				<p>{t("lesson.unsaved")}</p>
				<fieldset
					className={styles.form}
					disabled={busy}
					style={{ display: "grid", gap: 12, border: 0, padding: 0 }}
				>
					<label>
						{t("lesson.lessonTitle")}
						<LessonTitleInput
							value={lesson.title}
							onCommit={(title) => author(() => reviseLesson(lesson, { title }))}
						/>
					</label>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							disabled={lesson.steps.length >= 200}
							onClick={() => {
								const step = newStep(t("lesson.newStep"));
								author(() => reviseLesson(lesson, { steps: [...lesson.steps, step] }));
								setSelected([...active, step.id]);
								setQuery(emptyLessonQuery());
							}}
						>
							{t("lesson.add")}
						</button>
						<button
							type="button"
							disabled={!document || lesson.steps.length >= 200}
							onClick={() => {
								if (!document) return;
								const steps = draftLessonSteps(document).slice(0, 200 - lesson.steps.length);
								author(() => reviseLesson(lesson, { steps: [...lesson.steps, ...steps] }));
								setSelected([...active, ...steps.map((step) => step.id)]);
								setQuery(emptyLessonQuery());
							}}
						>
							{t("lesson.draft")}
						</button>
						<button
							type="button"
							disabled={!window.electronAPI?.lessonOpen}
							onClick={() =>
								void run(async (current) => {
									const result = await window.electronAPI.lessonOpen!();
									if (!current()) return;
									if (!result.success) throw new LessonOperationError(result.code);
									if (result.result.status === "opened") {
										const valid = await validateLesson(result.result.lesson);
										if (!current()) return;
										replaceLesson(valid);
										setNotice(t("lesson.opened"));
									}
								})
							}
						>
							{t("lesson.open")}
						</button>
						<button
							type="button"
							disabled={!window.electronAPI?.lessonSave}
							onClick={() =>
								void run(async (current) => {
									const result = await window.electronAPI.lessonSave!(lesson);
									if (!current()) return;
									if (!result.success) throw new LessonOperationError(result.code);
									if (result.result.status === "saved")
										setNotice(t("lesson.saved", { path: result.result.path }));
								})
							}
						>
							{t("lesson.save")}
						</button>
					</div>
					<LocalLessonDraftControls
						key={lesson.id}
						lesson={lesson}
						onRestore={(valid) => {
							replaceLesson(valid);
							setNotice(t("lesson.drafts.restored"));
						}}
					/>

					<LessonOutputControls
						output={output}
						onChange={(output) => author(() => reviseLesson(lesson, { output }))}
						sample={lesson.steps.find((step) => active.includes(step.id))?.title ?? lesson.title}
					/>
					<LessonReviewControls
						lesson={lesson}
						query={query}
						onQuery={setQuery}
						matches={matches}
						onSelect={setSelected}
					/>
					<p role="status" aria-live="polite">
						{editNotice}
					</p>
					{pinned.some((id) => !matches.includes(id)) && <p>{t("lesson.query.pinned")}</p>}
					{hidden > 0 && <p role="status">{t("lesson.query.hidden", { count: hidden })}</p>}
					{matches.length !== lesson.steps.length && <p>{t("lesson.query.reorder")}</p>}

					<p>
						{t("lesson.inventory", {
							steps: active.length,
							total: lesson.steps.length,
							images: !output.includeImages
								? 0
								: lesson.assets.filter((image) =>
										lesson.steps.some(
											(step) => active.includes(step.id) && step.imageId === image.id,
										),
									).length,
						})}
					</p>
					<p>{t("lesson.privacy")}</p>
					<button
						type="button"
						disabled={
							!active.length ||
							hidden > 0 ||
							(output.includeImages &&
								lesson.steps.some(
									(step) => active.includes(step.id) && step.imageId && !step.imageAlt.trim(),
								)) ||
							!window.electronAPI?.lessonExport
						}
						onClick={() =>
							void run(async (current) => {
								if (!current()) return;
								const result = await window.electronAPI.lessonExport!(lesson, active);
								if (!current()) return;
								if (!result.success) throw new LessonOperationError(result.code);
								if (result.result.status === "exported")
									setNotice(t("lesson.exported", { path: result.result.path }));
							})
						}
					>
						{t("lesson.export")}
					</button>
					{lesson.steps.map((step, index) => {
						if (!visible.has(step.id)) return null;
						const image = lesson.assets.find((image) => image.id === step.imageId);
						return (
							<section
								key={step.id}
								style={{
									border: "1px solid var(--border)",
									borderRadius: 8,
									padding: 16,
									display: "grid",
									gap: 8,
								}}
							>
								<label>
									<input
										type="checkbox"
										checked={active.includes(step.id)}
										onChange={(event) =>
											setSelected(
												event.target.checked
													? [...active, step.id]
													: active.filter((id) => id !== step.id),
											)
										}
									/>
									{t("lesson.include", { number: index + 1 })}
								</label>
								<label>
									{t("lesson.stepTitle")}
									<LessonTitleInput
										value={step.title}
										onCommit={(title) => update(step.id, { title })}
									/>
								</label>
								<label>
									{t("lesson.instructions")}
									<textarea
										rows={4}
										maxLength={12000}
										value={step.instructions}
										onChange={(event) => update(step.id, { instructions: event.target.value })}
									/>
								</label>
								<label>
									{t("lesson.code")}
									<textarea
										rows={3}
										maxLength={40000}
										value={step.code?.text ?? ""}
										onChange={(event) =>
											update(step.id, {
												code: event.target.value
													? { language: step.code?.language ?? "plain", text: event.target.value }
													: undefined,
											})
										}
									/>
								</label>
								<label>
									{t("lesson.reviewed")}
									<input
										type="checkbox"
										checked={step.status === "reviewed"}
										onChange={(event) =>
											update(step.id, { status: event.target.checked ? "reviewed" : "draft" })
										}
									/>
								</label>
								{stepFindings(step).length > 0 && (
									<ul aria-label={t("lesson.query.checks")}>
										{stepFindings(step).map((kind) => (
											<li key={kind}>{t(`lesson.findings.${kind}`)}</li>
										))}
									</ul>
								)}
								{step.evidence.map((evidence, n) => (
									<p key={`${evidence.kind}-${n}`}>
										<small>
											{t("lesson.evidence", { kind: evidence.kind, clock: evidence.clock })}
										</small>
									</p>
								))}
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
									<button
										type="button"
										disabled={index === 0 || matches.length !== lesson.steps.length}
										onClick={() => author(() => moveStep(lesson, step.id, -1))}
									>
										{t("lesson.up")}
									</button>
									<button
										type="button"
										disabled={
											index === lesson.steps.length - 1 || matches.length !== lesson.steps.length
										}
										onClick={() => author(() => moveStep(lesson, step.id, 1))}
									>
										{t("lesson.down")}
									</button>
									<button
										type="button"
										onClick={() => {
											const steps = lesson.steps.filter((value) => value.id !== step.id);
											author(() =>
												reviseLesson(lesson, {
													steps,
													assets: lesson.assets.filter((asset) =>
														steps.some((value) => value.imageId === asset.id),
													),
												}),
											);
											setSelected(active.filter((id) => id !== step.id));
										}}
									>
										{t("lesson.remove")}
									</button>
									<button
										type="button"
										disabled={
											!document ||
											!projectId ||
											!window.electronAPI?.lessonFrame ||
											lesson.assets.length >= 40
										}
										onClick={() =>
											void run(async (current) => {
												setPinned((values) =>
													values.includes(step.id) ? values : [...values, step.id],
												);
												const store = useProjectStore.getState();
												const snapshot = store.document;
												if (!snapshot || !store.projectId || store.dirty)
													throw new LessonOperationError("project-changed");
												const documentSha256 = await lessonRenderFingerprint(snapshot);
												if (!current()) return;
												const result = await window.electronAPI.lessonFrame!({
													projectId: store.projectId,
													rulerSec: store.currentTimeSec,
													documentSha256,
												});
												if (!current()) return;
												if (!result.success) throw new LessonOperationError(result.code);
												if (useProjectStore.getState().document !== snapshot)
													throw new LessonOperationError("project-changed");

												const image = await validateLessonImage(result.result);
												if (!current()) return;
												if (useProjectStore.getState().document !== snapshot)
													throw new LessonOperationError("project-changed");
												const request = {
													lessonId: lesson.id,
													stepId: step.id,
													revision: lesson.revision,
													imageId: step.imageId,
												};
												setLesson((latest) => {
													if (!current()) return latest;
													try {
														return attachLessonIllustration(latest, request, image);
													} catch {
														queueMicrotask(() => {
															if (current()) setError("lesson-operation-failed");
														});
														return latest;
													}
												});
											})
										}
									>
										{t("lesson.capture")}
									</button>
								</div>
								{image && (
									<>
										<img
											src={`data:image/jpeg;base64,${image.base64}`}
											alt={step.imageAlt}
											style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
										/>
										<label>
											{t("lesson.alt")}
											<input
												maxLength={1000}
												value={step.imageAlt}
												onChange={(event) => update(step.id, { imageAlt: event.target.value })}
											/>
										</label>
										<p>
											<small>
												{t("lesson.frameSource", { time: image.source.rulerSec.toFixed(3) })}
											</small>
										</p>
									</>
								)}
							</section>
						);
					})}
				</fieldset>
				<p role="status">{busy ? t("lesson.busy") : ""}</p>
				{error && <p role="alert">{t(`lesson.errors.${error}`)}</p>}
				<p role="status" style={{ overflowWrap: "anywhere" }}>
					{notice}
				</p>
			</DialogContent>
		</Dialog>
	);
}
