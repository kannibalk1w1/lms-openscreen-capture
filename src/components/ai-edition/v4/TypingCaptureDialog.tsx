import { useEffect, useRef, useState } from "react";
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
import { padSelection, sectionPlayback, TypingCapture } from "@/lib/typing/capture";
import { importTypingTake } from "@/lib/typing/import";
import type { TypingSection, TypingTake } from "@/lib/typing/schema";
import styles from "./TypingCaptureDialog.module.css";

export function TypingCaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useScopedT("timeline");
	const saved = useProjectStore((s) => s.document?.typingTakes);
	const [value, setValue] = useState("");
	const [title, setTitle] = useState("");
	const [take, setTake] = useState<TypingTake | null>(null);
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
	const haltPreview = () => {
		if (animation.current !== null) cancelAnimationFrame(animation.current);
		animation.current = null;
		setPlaying(false);
	};
	useEffect(
		() => () => {
			if (animation.current !== null) cancelAnimationFrame(animation.current);
			capture.current = null;
		},
		[],
	);
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
		const playback = sectionPlayback(take, section);
		setPreview(playback.beforeText);
		setPlaying(true);
		const started = performance.now();
		let index = 0;
		const tick = () => {
			const elapsed = performance.now() - started;
			while (index < playback.frames.length && playback.frames[index].atMs <= elapsed)
				setPreview(playback.frames[index++].text);
			if (index < playback.frames.length) animation.current = requestAnimationFrame(tick);
			else {
				animation.current = null;
				setPlaying(false);
			}
		};
		animation.current = requestAnimationFrame(tick);
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
			const imported = importTypingTake(source);
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
								setValue("");
								setPreview("");
								setTitle("");
								setError("");
							}}
						>
							{t("typing.new")}
						</button>
					</div>
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
							<div className={styles.sections}>
								{take.sections.map((section, index) => (
									<div key={section.id} className={styles.section}>
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
												} catch {
													setError(t("code.addError"));
												} finally {
													setBusy(false);
												}
											}}
										>
											{t("code.add")}
										</button>
									</div>
								))}
							</div>
							<p className={styles.hint}>{t("typing.previewHint")}</p>
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
