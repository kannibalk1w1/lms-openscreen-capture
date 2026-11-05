import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { addCodePresentation, saveTypingTake } from "@/lib/ai-edition/store/typingTakes";
import { currentWriteEpoch } from "@/lib/ai-edition/store/undoStack";
import { associateTypingSection, recordingAnchorChoices } from "@/lib/typing/association";
import { padSelection, TypingCapture } from "@/lib/typing/capture";
import {
	downloadTypingBundle,
	downloadTypingSection,
	type TypingExportKind,
} from "@/lib/typing/download";
import { importTypingFiles } from "@/lib/typing/import";
import {
	createTypingPlayback,
	exportTypingPlayback,
	exportTypingSection,
	type ImportedTypingFile,
	type TypingPlaybackMode,
} from "@/lib/typing/portable";
import type { TypingReviewTarget } from "@/lib/typing/review";
import type { TypingSection, TypingTake } from "@/lib/typing/schema";
import styles from "./TypingCaptureDialog.module.css";

export function TypingCaptureDialog({
	open,
	onClose,
	initialSelection,
}: {
	open: boolean;
	onClose: () => void;
	initialSelection?: TypingReviewTarget | null;
}) {
	const t = useScopedT("timeline");
	const projectId = useProjectStore((s) => s.projectId);
	const [reviewSectionId, setReviewSectionId] = useState<string | null>(null);
	const sectionList = useRef<HTMLDivElement>(null);
	const document = useProjectStore((s) => s.document);
	const anchorChoices = document ? recordingAnchorChoices(document) : [];
	const saved = useProjectStore((s) => s.document?.typingTakes);
	const [value, setValue] = useState("");
	const [title, setTitle] = useState("");
	const [take, setTake] = useState<TypingTake | null>(null);
	const [bundleDrafts, setBundleDrafts] = useState<ImportedTypingFile[]>([]);
	const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
	const [playbackMode, setPlaybackMode] = useState<TypingPlaybackMode>("captured-edits");
	const [recording, setRecording] = useState(false);
	const [paused, setPaused] = useState(false);
	const [count, setCount] = useState(0);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState("");
	const [playing, setPlaying] = useState(false);
	const capture = useRef<TypingCapture | null>(null);
	const pad = useRef<HTMLTextAreaElement>(null);
	const file = useRef<HTMLInputElement>(null);
	const animation = useRef<number | null>(null);
	const selectionTakeId = useRef<string | null>(null);
	const haltPreview = useCallback(() => {
		if (animation.current !== null) cancelAnimationFrame(animation.current);
		animation.current = null;
		setPlaying(false);
	}, []);
	useEffect(
		() => () => {
			if (animation.current !== null) cancelAnimationFrame(animation.current);
			capture.current = null;
		},
		[],
	);
	useEffect(() => {
		if (selectionTakeId.current !== (take?.id ?? null)) {
			setSelectedSectionIds([]);
			selectionTakeId.current = take?.id ?? null;
		}
	}, [take?.id]);
	useEffect(() => {
		if (take)
			setBundleDrafts((items) =>
				items.map((item) => (item.take.id === take.id ? { take, mode: playbackMode } : item)),
			);
	}, [take, playbackMode]);
	useEffect(() => {
		if (!open || !initialSelection || initialSelection.projectId !== projectId) return;
		const savedTake = useProjectStore
			.getState()
			.document?.typingTakes?.find((item) => item.id === initialSelection.takeId);
		if (!savedTake?.sections.some((section) => section.id === initialSelection.sectionId)) return;
		haltPreview();
		setBundleDrafts([]);
		setTake(savedTake);
		setTitle(savedTake.title);
		setValue(savedTake.initialText);
		setPlaybackMode("captured-edits");
		setPreview("");
		setError("");
		setReviewSectionId(initialSelection.sectionId);
	}, [open, initialSelection, projectId, haltPreview]);
	useEffect(() => {
		if (!open || !reviewSectionId || !take?.id) return;
		const row = Array.from(
			sectionList.current?.querySelectorAll<HTMLElement>("[data-typing-section-id]") ?? [],
		).find((node) => node.dataset.typingSectionId === reviewSectionId);
		row?.scrollIntoView?.({ block: "nearest" });
	}, [open, reviewSectionId, take?.id]);
	const finish = (limited = false) => {
		const current = capture.current;
		if (!current) return;
		const result = current.finish(
			title.trim() || t("typing.defaultTitle"),
			t("typing.padName"),
			limited ? "limited" : "complete",
		);
		capture.current = null;
		setTake(result);
		setRecording(false);
		setPaused(false);
		setCount(result.events.length);
	};
	const record = (action: (current: TypingCapture) => void) => {
		const current = capture.current;
		if (!current) return false;
		try {
			action(current);
			setCount(current.count);
			return true;
		} catch {
			finish(true);
			setValue(current.text);
			setError(t("typing.limit"));
			return false;
		}
	};
	const previewSection = (section: TypingSection) => {
		if (!take) return;
		haltPreview();
		try {
			const file = exportTypingSection(take, section.id);
			const recipe = exportTypingPlayback(file, playbackMode);
			const playback = createTypingPlayback(recipe, file.take.initialText);
			setPreview(file.take.initialText);
			setPlaying(true);
			setError("");
			const started = performance.now();
			const tick = () => {
				const frame = playback.advanceTo(performance.now() - started);
				setPreview(frame.text);
				if (!frame.complete) animation.current = requestAnimationFrame(tick);
				else {
					animation.current = null;
					setPlaying(false);
				}
			};
			animation.current = requestAnimationFrame(tick);
		} catch (error) {
			setError(error instanceof Error ? error.message : t("typing.export.error"));
		}
	};
	const updateSection = (id: string, patch: Partial<Pick<TypingSection, "label" | "speed">>) => {
		haltPreview();
		setTake((current) =>
			current
				? {
						...current,
						sections: current.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
					}
				: current,
		);
	};
	const loadFile = async (selected: File | undefined) => {
		if (!selected) return;
		const projectId = useProjectStore.getState().projectId,
			epoch = currentWriteEpoch();
		setBusy(true);
		setError("");
		try {
			if (selected.size > 8 * 1024 * 1024) throw new Error("size");
			const source = await selected.text();
			if (useProjectStore.getState().projectId !== projectId || currentWriteEpoch() !== epoch)
				return;
			const files = importTypingFiles(source);
			const imported = files[0].take;
			setBundleDrafts(files.length > 1 ? files : []);
			setPlaybackMode(files[0].mode);
			haltPreview();
			setTake(imported);
			setTitle(imported.title);
			setValue(imported.initialText);
			setPreview("");
		} catch {
			setError(t("typing.importError"));
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					finish();
					haltPreview();
					onClose();
				}
			}}
		>
			<DialogContent className={styles.dialog}>
				<DialogHeader>
					<DialogTitle>{t("typing.title")}</DialogTitle>
					<DialogDescription>{t("typing.scope")}</DialogDescription>
				</DialogHeader>
				<div className={styles.body}>
					<div className={styles.toolbar}>
						<button
							type="button"
							disabled={recording || busy}
							onClick={() => file.current?.click()}
						>
							{t("typing.import")}
						</button>
						<input
							hidden
							ref={file}
							type="file"
							accept=".json,.jsonl,.ndjson,application/json"
							aria-label={t("typing.import")}
							onChange={(e) => {
								const selected = e.target.files?.[0];
								e.target.value = "";
								void loadFile(selected);
							}}
						/>
						<select
							disabled={recording || busy}
							aria-label={t("typing.saved")}
							value={saved?.some((item) => item.id === take?.id) ? take?.id : ""}
							onChange={(e) => {
								const selected = saved?.find((item) => item.id === e.target.value);
								if (selected) {
									setBundleDrafts([]);
									setPlaybackMode("captured-edits");
									haltPreview();
									setTake(selected);
									setTitle(selected.title);
									setValue(selected.initialText);
									setPreview("");
								}
							}}
						>
							<option value="">{t("typing.saved")}</option>
							{saved?.map((item) => (
								<option key={item.id} value={item.id}>
									{item.title}
								</option>
							))}
						</select>
						<button
							type="button"
							disabled={recording || busy}
							onClick={() => {
								haltPreview();
								setTake(null);
								setBundleDrafts([]);
								setPlaybackMode("captured-edits");
								setValue("");
								setPreview("");
								setTitle("");
								setError("");
							}}
						>
							{t("typing.new")}
						</button>
					</div>
					{bundleDrafts.length > 1 && (
						<div className={styles.field}>
							{t("typing.bundle.member")}
							<select
								aria-label={t("typing.bundle.member")}
								value={take?.id ?? ""}
								disabled={busy || recording}
								onChange={(e) => {
									const selected = bundleDrafts.find((item) => item.take.id === e.target.value);
									if (!selected) return;
									haltPreview();
									setTake(selected.take);
									setTitle(selected.take.title);
									setValue(selected.take.initialText);
									setPlaybackMode(selected.mode);
									setPreview("");
									setError("");
								}}
							>
								{bundleDrafts.map(({ take: item }, index) => (
									<option key={item.id} value={item.id}>
										{index + 1}. {item.title}
									</option>
								))}
							</select>
							<span className={styles.hint}>{t("typing.bundle.importHint")}</span>
							<button
								type="button"
								disabled={busy || recording}
								onClick={async () => {
									try {
										const entries = bundleDrafts.map((entry) =>
											take && entry.take.id === take.id ? { take, mode: playbackMode } : entry,
										);
										await downloadTypingBundle(
											entries.flatMap((entry) =>
												entry.take.sections.map((section) => ({
													take: entry.take,
													sectionId: section.id,
													mode: entry.mode,
												})),
											),
											"captured-edits",
											useProjectStore.getState().projectId ?? undefined,
										);
										setError("");
									} catch (error) {
										setError(error instanceof Error ? error.message : t("typing.export.error"));
									}
								}}
							>
								{t("typing.bundle.reexport")}
							</button>
						</div>
					)}
					<label className={styles.field}>
						{t("typing.name")}
						<input
							value={title}
							maxLength={200}
							disabled={recording || busy}
							placeholder={t("typing.defaultTitle")}
							onChange={(e) => {
								setTitle(e.target.value);
								setTake((current) =>
									current
										? { ...current, title: e.target.value.trim() || t("typing.defaultTitle") }
										: current,
								);
							}}
						/>
					</label>
					<label className={styles.field}>
						{t("typing.padName")}
						<textarea
							ref={pad}
							aria-label={t("typing.padName")}
							className={styles.pad}
							value={value}
							readOnly={paused || (!recording && take !== null) || busy}
							spellCheck={false}
							onChange={() => {
								/* InputEvent below supplies the real edit cause. */
							}}
							onInput={(e) => {
								const target = e.currentTarget;
								if (capture.current) {
									if (
										record((current) =>
											current.observe(
												target.value,
												padSelection(target),
												(e.nativeEvent as InputEvent).inputType || "observed-text-change",
											),
										)
									)
										setValue(target.value);
								} else if (!take) setValue(target.value);
							}}
							onSelect={(e) => record((current) => current.select(padSelection(e.currentTarget)))}
							onKeyDown={(e) =>
								record((current) =>
									current.key({
										key: e.key,
										code: e.code,
										pressed: true,
										ctrl: e.ctrlKey,
										shift: e.shiftKey,
										alt: e.altKey,
										meta: e.metaKey,
										repeat: e.repeat,
									}),
								)
							}
							onKeyUp={(e) =>
								record((current) =>
									current.key({
										key: e.key,
										code: e.code,
										pressed: false,
										ctrl: e.ctrlKey,
										shift: e.shiftKey,
										alt: e.altKey,
										meta: e.metaKey,
										repeat: e.repeat,
									}),
								)
							}
							onFocus={() => record((current) => current.boundary("focus"))}
							onBlur={() => record((current) => current.boundary("blur"))}
							onCompositionStart={() => record((current) => current.boundary("composition-start"))}
							onCompositionEnd={() => record((current) => current.boundary("composition-end"))}
						/>
					</label>
					<div className={styles.toolbar}>
						{!recording ? (
							<button
								type="button"
								disabled={!!take || busy}
								onClick={() => {
									haltPreview();
									try {
										capture.current = new TypingCapture(value);
									} catch {
										setError(t("typing.startError"));
										return;
									}
									setRecording(true);
									setPaused(false);
									setCount(0);
									setError("");
									pad.current?.focus();
								}}
							>
								{t("typing.start")}
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={() => {
										record((current) => (paused ? current.resume() : current.pause()));
										setPaused(capture.current?.paused ?? false);
									}}
								>
									{t(paused ? "typing.resume" : "typing.pause")}
								</button>
								<button type="button" onClick={() => finish()}>
									{t("typing.stop")}
								</button>
							</>
						)}
						<span role="status" className={styles.status}>
							{recording
								? t(paused ? "typing.paused" : "typing.recording", { count })
								: take
									? t("typing.ready", { count: take.events.length, sections: take.sections.length })
									: t("typing.seedHint")}
						</span>
					</div>
					{error && (
						<p role="alert" className={styles.error}>
							{error}
						</p>
					)}
					{take && (
						<>
							{take.coverage === "limited" && (
								<p className={styles.error}>{t("typing.limitedSource")}</p>
							)}
							<p className={styles.hint}>
								{take.producer === "godot-codeedit"
									? t("typing.godotSource", { name: take.documentName })
									: t("typing.padSource")}
							</p>
							{take.producer === "godot-codeedit" && (
								<p className={styles.hint}>{t("typing.anchorHint")}</p>
							)}
							<div className={styles.toolbar}>
								<label>
									{t("typing.playbackMode")}{" "}
									<select
										aria-label={t("typing.playbackMode")}
										value={playbackMode}
										onChange={(e) => {
											haltPreview();
											setPlaybackMode(e.target.value as TypingPlaybackMode);
										}}
									>
										<option value="captured-edits">{t("typing.capturedPlayback")}</option>
										<option value="clean">{t("typing.cleanPlayback")}</option>
									</select>
								</label>
								<button
									type="button"
									disabled={busy || selectedSectionIds.length === 0}
									onClick={async () => {
										try {
											await downloadTypingBundle(
												take.sections
													.filter((section) => selectedSectionIds.includes(section.id))
													.map((section) => ({ take, sectionId: section.id })),
												playbackMode,
												useProjectStore.getState().projectId ?? undefined,
											);
											setError("");
										} catch (error) {
											setError(error instanceof Error ? error.message : t("typing.export.error"));
										}
									}}
								>
									{t("typing.bundle.export", { count: selectedSectionIds.length })}
								</button>
							</div>
							<p className={styles.hint}>{t("typing.bundle.hint")}</p>
							<div className={styles.sections} ref={sectionList}>
								{take.sections.map((section, index) => (
									<div
										key={section.id}
										className={styles.section}
										data-typing-section-id={section.id}
										data-selected={reviewSectionId === section.id}
									>
										<label className={styles.sectionSelection}>
											<input
												type="checkbox"
												aria-label={t("typing.bundle.includeLabel", { number: index + 1 })}
												checked={selectedSectionIds.includes(section.id)}
												disabled={busy}
												onChange={(e) =>
													setSelectedSectionIds((ids) =>
														e.target.checked
															? [...ids, section.id]
															: ids.filter((id) => id !== section.id),
													)
												}
											/>
											{t("typing.bundle.include")}
										</label>
										<input
											aria-label={t("typing.sectionLabel", { number: index + 1 })}
											value={section.label}
											placeholder={t("typing.section", { number: index + 1 })}
											maxLength={200}
											onChange={(e) => updateSection(section.id, { label: e.target.value })}
										/>
										<select
											aria-label={t("typing.sectionSpeed", { number: index + 1 })}
											value={section.speed}
											onChange={(e) => updateSection(section.id, { speed: Number(e.target.value) })}
										>
											{Array.from(new Set([0.25, 0.5, 1, 1.5, 2, 4, section.speed]))
												.sort((a, b) => a - b)
												.map((speed) => (
													<option key={speed} value={speed}>
														{speed}×
													</option>
												))}
										</select>
										{take.producer === "godot-codeedit" && (
											<select
												aria-label={t("typing.recordingAnchor", { number: index + 1 })}
												value={
													anchorChoices.find(
														(c) =>
															c.anchor.recordingSessionId ===
																section.sourceAnchor?.recordingSessionId &&
															c.anchor.flagId === section.sourceAnchor?.flagId,
													)?.key ?? (section.sourceAnchor ? "retained" : "")
												}
												onChange={(e) => {
													if (!document) return;
													try {
														setTake(
															associateTypingSection(document, take, section.id, e.target.value),
														);
														setError("");
													} catch (error) {
														setError(error instanceof Error ? error.message : t("code.addError"));
													}
												}}
											>
												<option value="">{t("typing.manualPlacement")}</option>
												{section.sourceAnchor &&
													!anchorChoices.some(
														(c) =>
															c.anchor.recordingSessionId ===
																section.sourceAnchor?.recordingSessionId &&
															c.anchor.flagId === section.sourceAnchor?.flagId,
													) && (
														<option value="retained" disabled>
															{t("typing.retainedAnchor")}
														</option>
													)}
												{anchorChoices.map((choice) => (
													<option key={choice.key} value={choice.key}>
														{choice.label}
													</option>
												))}
											</select>
										)}
										<button type="button" onClick={() => previewSection(section)}>
											{t("typing.previewSection", { number: index + 1 })}
										</button>
										<button
											type="button"
											disabled={busy}
											onClick={async () => {
												setBusy(true);
												try {
													if (await addCodePresentation(take, section.id)) {
														toast.success(t("code.added"));
														onClose();
													} else setError(t("code.addError"));
												} catch (error) {
													setError(error instanceof Error ? error.message : t("code.addError"));
												} finally {
													setBusy(false);
												}
											}}
										>
											{t(section.sourceAnchor ? "typing.addAssociated" : "code.add")}
										</button>
										{(["section", "text", "playback"] as TypingExportKind[]).map((kind) => (
											<button
												type="button"
												key={kind}
												disabled={busy}
												aria-label={t(`typing.export.${kind}Label`, { number: index + 1 })}
												onClick={async () => {
													try {
														await downloadTypingSection(
															take,
															section.id,
															kind,
															useProjectStore.getState().projectId ?? undefined,
															playbackMode,
														);
														setError("");
													} catch (error) {
														setError(
															error instanceof Error ? error.message : t("typing.export.error"),
														);
													}
												}}
											>
												{t(`typing.export.${kind}`)}
											</button>
										))}
									</div>
								))}
							</div>
							<p className={styles.hint}>{t("typing.previewHint")}</p>
							<p className={styles.hint}>{t("typing.export.hint")}</p>
							<textarea
								className={styles.pad}
								aria-label={t("typing.preview")}
								value={preview}
								readOnly
								spellCheck={false}
							/>
							<div className={styles.toolbar}>
								{playing && (
									<button type="button" onClick={haltPreview}>
										{t("typing.stopPreview")}
									</button>
								)}
								<button
									type="button"
									disabled={busy}
									onClick={async () => {
										setBusy(true);
										try {
											if (await saveTypingTake(take)) toast.success(t("typing.savedNotice"));
											else setError(t("typing.saveError"));
										} catch {
											setError(t("typing.saveError"));
										} finally {
											setBusy(false);
										}
									}}
								>
									{t("typing.save")}
								</button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
