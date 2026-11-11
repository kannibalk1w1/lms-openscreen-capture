import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import {
	type LessonErrorCode,
	type LessonFileHandle,
	LessonOperationError,
} from "@/lib/lesson/api";
import {
	attachLessonIllustration,
	attachLessonMediaSelection,
	draftLessonSteps,
	moveStep,
	newLesson,
	newStep,
	reviseLesson,
} from "@/lib/lesson/authoring";
import { lessonRenderFingerprint } from "@/lib/lesson/frameSource";
import {
	lessonMediaSelectionSchema,
	lessonMediaSelectionV2Schema,
} from "@/lib/lesson/mediaSelection";
import { lessonOutput } from "@/lib/lesson/output";
import type { PackageOpenCode } from "@/lib/lesson/packageOpen";
import {
	type LessonRangeExportProgress,
	lessonRangeExportProgressSchema,
} from "@/lib/lesson/rangeExport";
import { emptyLessonQuery, queryLesson, stepFindings } from "@/lib/lesson/review";
import {
	type LessonManifest,
	type LessonStep,
	validateLesson,
	validateLessonImage,
} from "@/lib/lesson/schema";
import { setLessonUnsavedWork } from "@/lib/lesson/unsavedWork";
import { ApplicationCaptureReview } from "./ApplicationCaptureReview";
import styles from "./LessonGuideDialog.module.css";
import { LessonOutputControls } from "./LessonOutputControls";
import { LessonPackagePanel } from "./LessonPackagePanel";
import { LessonRangeControls } from "./LessonRangeControls";
import { LessonReviewControls } from "./LessonReviewControls";
import { LessonTitleInput } from "./LessonTitleInput";
import { LessonWorkflowControls } from "./LessonWorkflowControls";
import { LocalLessonDraftControls } from "./LocalLessonDraftControls";
export function LessonGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useScopedT("timeline");
	const document = useProjectStore((s) => s.document),
		projectId = useProjectStore((s) => s.projectId);
	const projectDirty = useProjectStore((s) => s.dirty);
	const associationSources = useMemo(
		() =>
			document?.assets.flatMap((asset) =>
				asset.kind === "video" && asset.id.length <= 200 && asset.recordingClock
					? [{ id: asset.id, label: asset.label.slice(0, 300), clock: asset.recordingClock }]
					: [],
			) ?? [],
		[document],
	);
	const [packageDraft, setPackageDraft] = useState(false);
	const requestClose = () => {
		if (!packageDraft || window.confirm(t("lesson.package.discardConfirm"))) onClose();
	};
	const [lesson, setLesson] = useState<LessonManifest>(() => newLesson());
	// The lesson object last opened from or saved to a file; any later edit is unsaved work.
	const [baseline, setBaseline] = useState<LessonManifest | null>(lesson);
	const [file, setFile] = useState<LessonFileHandle | null>(null);
	const lessonDirty = lesson !== baseline;
	useEffect(() => {
		setLessonUnsavedWork("lesson", lessonDirty);
		return () => setLessonUnsavedWork("lesson", false);
	}, [lessonDirty]);
	useEffect(() => {
		setLessonUnsavedWork("package", packageDraft);
		return () => setLessonUnsavedWork("package", false);
	}, [packageDraft]);
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
	const latestTarget = useRef({ lesson, selected });
	latestTarget.current = { lesson, selected };
	const replaceLesson = (value: LessonManifest) => {
		stopExport("stale");
		generation.current++;
		setLesson(value);
		setSelected(value.steps.map((step) => step.id));
		setQuery(emptyLessonQuery());
	};
	const busyRef = useRef(false);
	const exportOperation = useRef<null | {
		id: string;
		cancelled: boolean;
		invalidated: boolean;
		lesson: LessonManifest;
		selected: string[];
		document: typeof document;
		projectId: string;
		current: () => boolean;
	}>(null);
	const [exportProgress, setExportProgress] = useState<LessonRangeExportProgress | null>(null);
	const [exportCancelling, setExportCancelling] = useState(false);
	const stopExport = useCallback((reason: "cancel" | "stale" = "cancel") => {
		const operation = exportOperation.current;
		if (!operation) return;
		if (reason === "stale") operation.invalidated = true;
		if (operation.cancelled) return;
		operation.cancelled = true;
		setExportCancelling(true);
		void window.electronAPI?.lessonRangeExportCancel?.(operation.id).catch(() => undefined);
	}, []);
	useEffect(
		() =>
			window.electronAPI?.onLessonRangeExportProgress?.((input) => {
				const parsed = lessonRangeExportProgressSchema.safeParse(input);
				if (!parsed.success) return;
				const progress = parsed.data;
				const operation = exportOperation.current;
				if (
					operation &&
					operation.id === progress.operationId &&
					!operation.cancelled &&
					operation.current()
				)
					setExportProgress(progress);
			}),
		[],
	);
	useEffect(() => {
		const operation = exportOperation.current;
		if (
			operation &&
			(operation.lesson !== lesson ||
				operation.selected !== selected ||
				operation.document !== document ||
				operation.projectId !== projectId ||
				projectDirty)
		)
			stopExport("stale");
	}, [lesson, selected, document, projectId, projectDirty, stopExport]);
	useEffect(
		() => () => {
			stopExport("stale");
		},
		[stopExport],
	);

	const [packageVideos, setPackageVideos] = useState(false);
	const [packageOperation, setPackageOperation] = useState<string | null>(null);
	const [packageError, setPackageError] = useState<PackageOpenCode | null>(null);
	const packageOperationRef = useRef<string | null>(null);
	useEffect(
		() => () => {
			if (packageOperationRef.current)
				void window.electronAPI
					?.lessonPackageCancel?.(packageOperationRef.current)
					.catch(() => undefined);
		},
		[],
	);
	const rangeOperation = useRef<{ id: string; cancelled: boolean } | null>(null);
	const [confirmingRange, setConfirmingRange] = useState(false);
	const [cancellingRange, setCancellingRange] = useState(false);
	useEffect(
		() => () => {
			const operation = rangeOperation.current;
			if (operation) {
				operation.cancelled = true;
				void window.electronAPI?.lessonCancelRange?.(operation.id);
			}
		},
		[],
	);
	useEffect(() => {
		epoch.current = { projectId };
		return () => {
			epoch.current = { projectId };
		};
	}, [projectId]);
	const author = (operation: () => LessonManifest) => {
		stopExport("stale");
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
			setBusy(false);
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
				if (!value && !busy) requestClose();
			}}
		>
			<DialogContent style={{ maxWidth: 960, maxHeight: "90vh", overflowY: "auto" }}>
				<DialogHeader>
					<DialogTitle>{t("lesson.title")}</DialogTitle>
					<DialogDescription>{t("lesson.scope")}</DialogDescription>
				</DialogHeader>
				<p>{t("lesson.unsaved")}</p>
				<LessonPackagePanel onDraftChange={setPackageDraft} />
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
					<label>
						{t("lesson.lessonRef")}
						<input
							maxLength={200}
							value={lesson.lessonRef ?? ""}
							onChange={(event) =>
								author(() => reviseLesson(lesson, { lessonRef: event.target.value || undefined }))
							}
						/>
					</label>
					<p>
						<small>{t("lesson.refScope")}</small>
					</p>
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
							onClick={() => {
								if (lessonDirty && !window.confirm(t("lesson.replaceConfirm"))) return;
								void run(async (current) => {
									const result = await window.electronAPI.lessonOpen!();
									if (!current()) return;
									if (!result.success) throw new LessonOperationError(result.code);
									if (result.result.status === "opened") {
										const valid = await validateLesson(result.result.lesson);
										if (!current()) return;
										replaceLesson(valid);
										setBaseline(valid);
										setFile(result.result.file ?? null);
										setNotice(t("lesson.opened"));
									}
								});
							}}
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
									if (result.result.status === "saved") {
										// Later edits made while saving stay marked as unsaved.
										setBaseline(lesson);
										setFile(result.result.file ?? null);
										setNotice(t("lesson.saved", { path: result.result.path }));
									}
								})
							}
						>
							{t("lesson.save")}
						</button>
						<button
							type="button"
							disabled={!file || !lessonDirty || !window.electronAPI?.lessonSaveCurrent}
							onClick={() =>
								void run(async (current) => {
									if (!file) return;
									const result = await window.electronAPI.lessonSaveCurrent!({
										token: file.token,
										lesson,
									});
									if (!current()) return;
									if (!result.success) {
										// The old file is untouched and this permission is spent; the work stays here.
										setFile(null);
										throw new LessonOperationError(result.code);
									}
									setBaseline(lesson);
									setFile(result.result.file ?? null);
									setNotice(t("lesson.savedCurrent", { path: result.result.path }));
								})
							}
						>
							{t("lesson.saveCurrent")}
						</button>
					</div>
					<p role="status">
						{lessonDirty
							? file
								? t("lesson.dirtyFile", { path: file.path })
								: t("lesson.dirtyNoFile")
							: file
								? t("lesson.cleanFile", { path: file.path })
								: ""}
					</p>
					<LocalLessonDraftControls
						key={lesson.id}
						lesson={lesson}
						onRestore={(valid) => {
							replaceLesson(valid);
							// A restored copy is not a file on disk: unsaved until explicitly saved.
							setBaseline(null);
							setFile(null);
							setNotice(t("lesson.drafts.restored"));
						}}
					/>

					<ApplicationCaptureReview
						sources={associationSources}
						key={`${projectId}:${lesson.id}`}
						lesson={lesson}
						onAppend={(next) => {
							const appended = next.steps.filter(
								(step) => !lesson.steps.some((previous) => previous.id === step.id),
							);
							if (author(() => next)) {
								setSelected((ids) => [...new Set([...ids, ...appended.map((step) => step.id)])]);
								setPinned((ids) => [...new Set([...ids, ...appended.map((step) => step.id)])]);
							}
						}}
					/>

					<LessonWorkflowControls
						key={`${projectId}:${lesson.id}`}
						lesson={lesson}
						onChange={(next) => author(() => next)}
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
					<label>
						<input
							type="checkbox"
							checked={packageVideos}
							onChange={(event) => setPackageVideos(event.target.checked)}
						/>
						{t("lesson.packageCreate.videos")}
					</label>
					<button
						type="button"
						disabled={
							!active.length ||
							active.length > 32 ||
							hidden > 0 ||
							projectDirty ||
							!projectId ||
							(output.includeImages &&
								lesson.steps.some(
									(step) => active.includes(step.id) && step.imageId && !step.imageAlt.trim(),
								)) ||
							!window.electronAPI?.lessonPackageCreate
						}
						onClick={() => {
							setPackageError(null);
							void run(async (current) => {
								const operationId = crypto.randomUUID();
								packageOperationRef.current = operationId;
								setPackageOperation(operationId);
								try {
									const result = await window.electronAPI.lessonPackageCreate!({
										operationId,
										lesson,
										stepIds: active,
										includeCode: output.includeCode,
										imagePolicy: output.includeImages ? "include-external-provenance" : "exclude",
										includeVideos: packageVideos,
									});
									if (!current()) return;
									if (!result.success) {
										setPackageError(result.code);
										if (result.artifactPath)
											setNotice(t("lesson.package.incomplete", { path: result.artifactPath }));
									} else if (result.result.status === "packaged")
										setNotice(
											t("lesson.packageCreate.created", {
												path: result.result.path,
												steps: result.result.steps,
												images: result.result.images,
												videos: result.result.videos,
											}),
										);
									else setNotice(t("lesson.package.cancelled"));
								} finally {
									if (packageOperationRef.current === operationId)
										packageOperationRef.current = null;
									setPackageOperation(null);
								}
							});
						}}
					>
						{t("lesson.packageCreate.action")}
					</button>
					<p>
						<small>{t("lesson.packageCreate.scope")}</small>
					</p>
					{lesson.steps.map((step, index) => {
						if (!visible.has(step.id)) return null;
						const image = lesson.assets.find((image) => image.id === step.imageId);
						// Each step repeats the same buttons: name the step so they can be told apart without sight.
						const stepName = t("lesson.stepName", { number: index + 1, title: step.title });
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
									{t("lesson.slideRef")}
									<input
										maxLength={200}
										value={step.slideRef ?? ""}
										onChange={(event) =>
											// A destination label is not teaching content: keep the review status.
											update(step.id, {
												slideRef: event.target.value || undefined,
												status: step.status,
											})
										}
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

								<LessonRangeControls
									key={`${lesson.id}-${step.id}-${generation.current}`}
									selection={step.mediaSelection}
									exportAvailable={
										active.includes(step.id) &&
										step.mediaSelection?.version === 2 &&
										step.mediaSelection.projectId === projectId &&
										!!document &&
										!projectDirty &&
										!!window.electronAPI?.lessonRangeExport &&
										!!window.electronAPI?.lessonRangeExportCancel
									}
									onExport={() =>
										void run(async (current) => {
											const store = useProjectStore.getState(),
												snapshot = store.document,
												selection = step.mediaSelection;
											if (
												!snapshot ||
												!store.projectId ||
												store.dirty ||
												selection?.version !== 2 ||
												!active.includes(step.id)
											)
												throw new LessonOperationError("range-export-unattested");
											const isCurrent = () =>
												current() &&
												useProjectStore.getState().document === snapshot &&
												useProjectStore.getState().projectId === store.projectId &&
												!useProjectStore.getState().dirty &&
												latestTarget.current.lesson === lesson &&
												latestTarget.current.selected === selected;
											if (
												selection.projectId !== store.projectId ||
												(await lessonRenderFingerprint(snapshot)) !== selection.documentSha256
											)
												throw new LessonOperationError("range-export-changed");
											if (!isCurrent()) return;
											const operation = {
												id: crypto.randomUUID(),
												cancelled: false,
												invalidated: false,
												lesson,
												selected,
												document: snapshot,
												projectId: store.projectId,
												current: isCurrent,
											};
											exportOperation.current = operation;
											setExportCancelling(false);
											setExportProgress({
												operationId: operation.id,
												phase: "choosing-destination",
											});
											try {
												const result = await window.electronAPI.lessonRangeExport!({
													operationId: operation.id,
													lesson,
													stepId: step.id,
													includedStepIds: active,
												});
												if (!isCurrent() || operation.invalidated) return;
												if (!result.success) {
													if (result.artifactPath)
														setNotice(
															t("lesson.range.exportIncomplete", { path: result.artifactPath }),
														);
													throw new LessonOperationError(result.code);
												}
												if (result.result.status === "materialized")
													setNotice(t("lesson.range.exported", { path: result.result.path }));
												else setNotice(t("lesson.range.exportCancelled"));
											} finally {
												if (exportOperation.current === operation) exportOperation.current = null;
												setExportProgress(null);
												setExportCancelling(false);
											}
										})
									}
									available={!!document && !!projectId && !!window.electronAPI?.lessonPlanRange}
									confirmAvailable={
										!!document &&
										!!projectId &&
										active.includes(step.id) &&
										!!window.electronAPI?.lessonConfirmRange &&
										!!window.electronAPI?.lessonCancelRange
									}
									onConfirm={(startSec, endSec) =>
										void run(async (current) => {
											const store = useProjectStore.getState(),
												snapshot = store.document;
											if (!snapshot || !store.projectId || store.dirty)
												throw new LessonOperationError("project-changed");
											const operation = { id: crypto.randomUUID(), cancelled: false };
											rangeOperation.current = operation;
											setConfirmingRange(true);
											setCancellingRange(false);
											const request = {
												lessonId: lesson.id,
												stepId: step.id,
												revision: lesson.revision,
												previous: step.mediaSelection,
											};
											const isCurrent = () =>
												current() &&
												!operation.cancelled &&
												useProjectStore.getState().document === snapshot &&
												useProjectStore.getState().projectId === store.projectId &&
												!useProjectStore.getState().dirty;
											try {
												const documentSha256 = await lessonRenderFingerprint(snapshot);
												if (!isCurrent()) return;
												const result = await window.electronAPI.lessonConfirmRange!({
													operationId: operation.id,
													lesson,
													stepId: step.id,
													range: { projectId: store.projectId, documentSha256, startSec, endSec },
													intent: step.mediaSelection ? "refresh-current" : "author-current",
												});
												if (!isCurrent()) return;
												if (!result.success) throw new LessonOperationError(result.code);
												const selection = lessonMediaSelectionV2Schema.parse(result.result);
												if (
													selection.projectId !== store.projectId ||
													selection.documentSha256 !== documentSha256 ||
													selection.startSec !== startSec ||
													selection.endSec !== endSec
												)
													throw new LessonOperationError("project-changed");
												setLesson((latest) => {
													if (!isCurrent()) return latest;
													try {
														const attached = attachLessonMediaSelection(latest, request, selection);
														queueMicrotask(() => {
															if (isCurrent()) {
																if (attached === latest) setError("range-target-changed");
																else setNotice(t("lesson.range.confirmedNotice"));
															}
														});
														return attached;
													} catch {
														queueMicrotask(() => {
															if (isCurrent()) setError("lesson-operation-failed");
														});
														return latest;
													}
												});
											} finally {
												if (rangeOperation.current === operation) rangeOperation.current = null;
												setConfirmingRange(false);
												setCancellingRange(false);
												if (operation.cancelled && current())
													setNotice(t("lesson.range.cancelled"));
											}
										})
									}
									onRemove={() => update(step.id, { mediaSelection: undefined })}
									onAttach={(startSec, endSec) =>
										void run(async (current) => {
											if (step.mediaSelection?.version === 2)
												throw new LessonOperationError("range-target-changed");
											const store = useProjectStore.getState(),
												snapshot = store.document;
											if (!snapshot || !store.projectId || store.dirty)
												throw new LessonOperationError("project-changed");
											const documentSha256 = await lessonRenderFingerprint(snapshot);
											if (!current()) return;
											const result = await window.electronAPI.lessonPlanRange!({
												projectId: store.projectId,
												documentSha256,
												startSec,
												endSec,
											});
											if (!current()) return;
											if (!result.success) throw new LessonOperationError(result.code);
											if (useProjectStore.getState().document !== snapshot)
												throw new LessonOperationError("project-changed");
											const selection = lessonMediaSelectionSchema.parse(result.result);
											if (
												selection.projectId !== store.projectId ||
												selection.documentSha256 !== documentSha256 ||
												selection.startSec !== startSec ||
												selection.endSec !== endSec
											)
												throw new LessonOperationError("project-changed");
											const request = {
												lessonId: lesson.id,
												stepId: step.id,
												revision: lesson.revision,
												previous: step.mediaSelection,
											};
											setLesson((latest) => {
												if (!current()) return latest;
												try {
													return attachLessonMediaSelection(latest, request, selection);
												} catch {
													queueMicrotask(() => {
														if (current()) setError("lesson-operation-failed");
													});
													return latest;
												}
											});
										})
									}
								/>

								{stepFindings(step).length > 0 && (
									<ul aria-label={t("lesson.query.checks")}>
										{stepFindings(step).map((kind) => (
											<li key={kind}>{t(`lesson.findings.${kind}`)}</li>
										))}
									</ul>
								)}
								{step.evidence.map((evidence, n) => (
									<div key={`${evidence.kind}-${n}`}>
										<small>
											{t("lesson.evidence", { kind: evidence.kind, clock: evidence.clock })}
										</small>
										{evidence.application?.manualTiming && (
											<>
												<p>
													{t("lesson.association.savedTiming", {
														time: (evidence.application.manualTiming.mediaTimeMs / 1000).toFixed(3),
													})}
												</p>
												<button
													type="button"
													onClick={() => {
														if (!evidence.application) return;
														const application = { ...evidence.application };
														delete application.manualTiming;
														update(step.id, {
															evidence: step.evidence.map((value, index) =>
																index === n ? { ...value, application } : value,
															),
														});
													}}
												>
													{t("lesson.association.removeTiming")}
												</button>
											</>
										)}
										{evidence.application && (
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
													{JSON.stringify(evidence.application, null, 2)}
												</pre>
											</details>
										)}
									</div>
								))}
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
									<button
										type="button"
										disabled={index === 0 || matches.length !== lesson.steps.length}
										onClick={() => author(() => moveStep(lesson, step.id, -1))}
										aria-label={`${t("lesson.up")}: ${stepName}`}
									>
										{t("lesson.up")}
									</button>
									<button
										type="button"
										disabled={
											index === lesson.steps.length - 1 || matches.length !== lesson.steps.length
										}
										onClick={() => author(() => moveStep(lesson, step.id, 1))}
										aria-label={`${t("lesson.down")}: ${stepName}`}
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
														steps.some(
															(value) =>
																value.imageId === asset.id ||
																value.retakes?.some((r) => r.previous.imageId === asset.id),
														),
													),
												}),
											);
											setSelected(active.filter((id) => id !== step.id));
										}}
										aria-label={`${t("lesson.remove")}: ${stepName}`}
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
										aria-label={`${t("lesson.capture")}: ${stepName}`}
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
				{exportProgress && (
					<>
						<button type="button" disabled={exportCancelling} onClick={() => stopExport()}>
							{t("lesson.range.exportCancel")}
						</button>
						<p role="status" aria-live="polite">
							{exportCancelling
								? t("lesson.range.exportCancelling")
								: t(`lesson.range.exportPhases.${exportProgress.phase}`)}
							{!exportCancelling &&
							exportProgress.phase === "rendering" &&
							exportProgress.frames !== undefined &&
							exportProgress.totalFrames !== undefined
								? ` ${t("lesson.range.exportFrames", { frames: exportProgress.frames, total: exportProgress.totalFrames })}`
								: ""}
						</p>
					</>
				)}
				{confirmingRange && (
					<button
						type="button"
						disabled={cancellingRange}
						onClick={() => {
							const operation = rangeOperation.current;
							if (!operation) return;
							operation.cancelled = true;
							setCancellingRange(true);
							void window.electronAPI?.lessonCancelRange?.(operation.id).catch(() => undefined);
						}}
					>
						{t("lesson.range.cancel")}
					</button>
				)}
				<p role="status" aria-live="polite">
					{confirmingRange
						? t(cancellingRange ? "lesson.range.cancelling" : "lesson.range.working")
						: busy
							? t("lesson.busy")
							: ""}
				</p>
				{packageOperation && (
					<button
						type="button"
						onClick={() =>
							void window.electronAPI
								?.lessonPackageCancel?.(packageOperation)
								.catch(() => undefined)
						}
					>
						{t("lesson.package.cancel")}
					</button>
				)}
				{error && <p role="alert">{t(`lesson.errors.${error}`)}</p>}
				{packageError && <p role="alert">{t(`lesson.package.errors.${packageError}`)}</p>}
				<p role="status" style={{ overflowWrap: "anywhere" }}>
					{notice}
				</p>
			</DialogContent>
		</Dialog>
	);
}
