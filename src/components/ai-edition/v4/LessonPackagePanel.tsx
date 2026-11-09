import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { moveStep, reviseLesson } from "@/lib/lesson/authoring";
import { beginPackageEdit } from "@/lib/lesson/packageEdit";
import type { OpenedLessonPackage } from "@/lib/lesson/packageOpen";
import { type LessonManifest, type LessonStep, validateLesson } from "@/lib/lesson/schema";
import { LessonTitleInput } from "./LessonTitleInput";
/** Separate read-only inspection: never replaces the lesson currently being authored. */
export function LessonPackagePanel({
	onDraftChange,
}: {
	onDraftChange?: (dirty: boolean) => void;
} = {}) {
	const t = useScopedT("timeline");
	const projectId = useProjectStore((s) => s.projectId),
		dirty = useProjectStore((s) => s.dirty);
	const [draft, setDraft] = useState<LessonManifest | null>(null);
	const draftGeneration = useRef(0);
	useEffect(() => {
		onDraftChange?.(!!draft);
		return () => onDraftChange?.(false);
	}, [draft, onDraftChange]);
	const draftTarget = useRef(draft);
	draftTarget.current = draft;
	const [opened, setOpened] = useState<OpenedLessonPackage | null>(null);
	const [needsReopen, setNeedsReopen] = useState(false);
	const translate = useRef(t);
	translate.current = t;
	const sourceTarget = useRef(opened);
	sourceTarget.current = opened;
	const cancelled = useRef(false);
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	const active = useRef<string | null>(null),
		token = useRef<string | null>(null),
		epoch = useRef(0);
	const clear = useCallback(() => {
		epoch.current++;
		draftGeneration.current++;
		if (active.current)
			void window.electronAPI?.lessonPackageCancel?.(active.current).catch(() => undefined);
		if (token.current)
			void window.electronAPI?.lessonPackageRelease?.(token.current).catch(() => undefined);
		token.current = null;
	}, []);
	// Only a different project ends this panel's own hold on a capability. Unsaved project edits just
	// pause the actions: main alone decides, on the next request, whether the capability still stands.
	useEffect(() => {
		if (projectId || token.current || active.current) clear();
		if (draftTarget.current) {
			setNeedsReopen(true);
			setMessage(translate.current("lesson.package.authorityLost"));
		} else {
			setOpened(null);
			setNeedsReopen(false);
			setMessage("");
		}
		return clear;
	}, [projectId, clear]);
	const run = async (action: "open" | "copy" | "reseal" | "resume") => {
		if (
			active.current ||
			dirty ||
			!projectId ||
			((action === "open" || action === "copy") && draftTarget.current)
		)
			return;
		const id = crypto.randomUUID(),
			at = epoch.current,
			generation = draftGeneration.current;
		active.current = id;
		cancelled.current = false;
		setBusy(true);
		setMessage(t("lesson.package.checking"));
		try {
			if (action === "reseal") {
				const submitted = draftTarget.current;
				if (!token.current || !submitted || needsReopen) return;
				const result = await window.electronAPI!.lessonPackageReseal!({
					operationId: id,
					token: token.current,
					lesson: submitted,
				});
				if (at !== epoch.current || generation !== draftGeneration.current) return;
				if (!result.success) {
					// Busy changed nothing in main: the same capability and draft remain usable.
					if (result.capability !== "retained" && result.code !== "lesson-package-busy") {
						if (token.current)
							void window.electronAPI?.lessonPackageRelease?.(token.current).catch(() => undefined);
						token.current = null;
						setNeedsReopen(true);
					}
					setMessage(
						t(`lesson.package.errors.${result.code}`) + " " + t("lesson.package.editsKept"),
					);
					return;
				}
				if (result.result.status === "packaged") setDraft(null);
				setMessage(
					result.result.status === "packaged"
						? t("lesson.package.resealed", { path: result.result.path })
						: t("lesson.package.cancelled"),
				);
			} else if (action === "copy") {
				if (!token.current || !opened || opened.videos.length) return;
				const result = await window.electronAPI!.lessonPackageCopy!({
					operationId: id,
					token: token.current,
				});
				if (at !== epoch.current) return;
				if (!result.success) {
					setOpened(null);
					setMessage(t(`lesson.package.errors.${result.code}`));
					return;
				}
				setMessage(
					result.result.status === "saved"
						? t("lesson.package.saved", { path: result.result.path })
						: t("lesson.package.cancelled"),
				);
			} else {
				const resumeSource = sourceTarget.current;
				if (action === "resume" && (!draftTarget.current || !resumeSource)) return;
				if (token.current) await window.electronAPI?.lessonPackageRelease?.(token.current);
				token.current = null;
				if (action !== "resume") {
					setOpened(null);
					setDraft(null);
				}
				const result = await window.electronAPI!.lessonPackageOpen!(id);
				if (at !== epoch.current || cancelled.current) {
					if (result.success && result.result.status === "opened")
						void window.electronAPI?.lessonPackageRelease?.(result.result.token);
					return;
				}
				if (!result.success) {
					setMessage(t(`lesson.package.errors.${result.code}`));
					return;
				}
				if (result.result.status === "cancelled") {
					setMessage(t("lesson.package.cancelled"));
					return;
				}
				const value = result.result,
					lesson = await validateLesson(value.lesson);
				if (at !== epoch.current || cancelled.current) {
					void window.electronAPI?.lessonPackageRelease?.(value.token);
					return;
				}
				if (
					action === "resume" &&
					(!/^[a-f0-9]{64}$/.test(value.snapshotSha256) ||
						value.snapshotSha256 !== resumeSource!.snapshotSha256)
				) {
					void window.electronAPI?.lessonPackageRelease?.(value.token);
					setNeedsReopen(true);
					setMessage(t("lesson.package.differentPackage"));
					return;
				}
				token.current = value.token;
				setNeedsReopen(false);
				setOpened({ ...value, lesson });
				setMessage(t(action === "resume" ? "lesson.package.resumed" : "lesson.package.checked"));
			}
		} catch {
			if (at === epoch.current) {
				if (draftTarget.current) {
					if (token.current)
						void window.electronAPI?.lessonPackageRelease?.(token.current).catch(() => undefined);
					token.current = null;
					setNeedsReopen(true);
				}
				setMessage(t("lesson.package.errors.lesson-package-invalid"));
			}
		} finally {
			if (active.current === id) active.current = null;
			setBusy(false);
		}
	};
	const edit = (change: () => LessonManifest) => {
		if (active.current || !draft) return;
		try {
			const value = change();
			draftGeneration.current++;
			setDraft(value);
			setMessage(t("lesson.package.editing"));
		} catch {
			setMessage(t("lesson.package.errors.lesson-package-edit-unsupported"));
		}
	};
	const update = (step: LessonStep, change: Partial<LessonStep>) =>
		edit(() =>
			reviseLesson(draft!, {
				steps: draft!.steps.map((s) =>
					s.id === step.id ? { ...s, ...change, status: "draft" } : s,
				),
			}),
		);
	return (
		<section aria-label={t("lesson.package.title")}>
			<h3>{t("lesson.package.title")}</h3>
			<p>{t("lesson.package.scope")}</p>
			{dirty && <p>{t("lesson.package.dirty")}</p>}
			<button
				type="button"
				disabled={busy || dirty || !!draft || !projectId || !window.electronAPI?.lessonPackageOpen}
				onClick={() => void run("open")}
			>
				{t("lesson.package.open")}
			</button>
			{busy && (
				<button
					type="button"
					onClick={() => {
						cancelled.current = true;
						if (active.current)
							void window.electronAPI?.lessonPackageCancel?.(active.current).catch(() => undefined);
						setMessage(t("lesson.package.cancelling"));
					}}
				>
					{t("lesson.package.cancel")}
				</button>
			)}
			<p role="status">{message}</p>
			{opened && (
				<div>
					<h4>{opened.lesson.title}</h4>
					<p>
						{t(
							opened.images === "exclude"
								? "lesson.package.noImages"
								: "lesson.package.imageProvenance",
						)}
					</p>
					{opened.videos.length > 0 && <p>{t("lesson.package.videosReadOnly")}</p>}
					<p>{t("lesson.package.resealScope")}</p>
					<ol>
						{opened.lesson.steps.map((step) => {
							const image = opened.lesson.assets.find((a) => a.id === step.imageId),
								video = opened.videos.find((v) => v.stepId === step.id);
							return (
								<li key={step.id}>
									<h5>{step.title}</h5>
									<p style={{ whiteSpace: "pre-wrap" }}>{step.instructions}</p>
									{image && (
										<img
											src={`data:image/jpeg;base64,${image.base64}`}
											alt={step.imageAlt}
											width={image.width}
											height={image.height}
											style={{ maxWidth: "100%", height: "auto" }}
										/>
									)}
									{step.code && (
										<pre dir="ltr">
											<code>{step.code.text}</code>
										</pre>
									)}
									{video && (
										<p>
											{t("lesson.package.video", {
												frames: video.frames,
												seconds: video.durationSec,
											})}
										</p>
									)}
								</li>
							);
						})}
					</ol>
					{!draft && (
						<button
							type="button"
							disabled={busy || dirty || needsReopen || !window.electronAPI?.lessonPackageReseal}
							onClick={() => {
								if (active.current) return;
								draftGeneration.current++;
								setDraft(beginPackageEdit(opened.lesson));
								setMessage(t("lesson.package.editing"));
							}}
						>
							{t("lesson.package.edit")}
						</button>
					)}
					{draft && (
						<fieldset disabled={busy}>
							<legend>{t("lesson.package.draft")}</legend>
							<p>{t("lesson.package.editsKept")}</p>
							{needsReopen && (
								<div>
									<p>{t("lesson.package.authorityLost")}</p>
									<button
										type="button"
										disabled={dirty || !projectId || !window.electronAPI?.lessonPackageOpen}
										onClick={() => void run("resume")}
									>
										{t("lesson.package.resume")}
									</button>
								</div>
							)}
							<label>
								{t("lesson.lessonTitle")}
								<LessonTitleInput
									value={draft.title}
									onCommit={(title) => edit(() => reviseLesson(draft, { title }))}
								/>
							</label>
							<label>
								{t("lesson.lessonRef")}
								<input
									maxLength={200}
									value={draft.lessonRef ?? ""}
									onChange={(e) =>
										edit(() => reviseLesson(draft, { lessonRef: e.target.value || undefined }))
									}
								/>
							</label>
							{draft.steps.map((step, index) => (
								<div key={step.id}>
									<label>
										{t("lesson.package.stepTitle")}
										<LessonTitleInput
											value={step.title}
											onCommit={(title) => update(step, { title })}
										/>
									</label>
									<label>
										{t("lesson.slideRef")}
										<input
											maxLength={200}
											value={step.slideRef ?? ""}
											onChange={(e) => update(step, { slideRef: e.target.value || undefined })}
										/>
									</label>
									<label>
										{t("lesson.package.instructions")}
										<textarea
											value={step.instructions}
											maxLength={12000}
											onChange={(e) => update(step, { instructions: e.target.value })}
										/>
									</label>
									{step.code && (
										<label>
											{t("lesson.package.code")}
											<textarea
												value={step.code.text}
												maxLength={40000}
												onChange={(e) =>
													update(step, { code: { ...step.code!, text: e.target.value } })
												}
											/>
										</label>
									)}
									{step.imageId && (
										<label>
											{t("lesson.package.imageAlt")}
											<textarea
												value={step.imageAlt}
												maxLength={1000}
												onChange={(e) => update(step, { imageAlt: e.target.value })}
											/>
										</label>
									)}
									<button
										type="button"
										disabled={index === 0}
										onClick={() => edit(() => moveStep(draft, step.id, -1))}
										aria-label={`${t("lesson.package.up")}: ${t("lesson.stepName", { number: index + 1, title: step.title })}`}
									>
										{t("lesson.package.up")}
									</button>
									<button
										type="button"
										disabled={index === draft.steps.length - 1}
										onClick={() => edit(() => moveStep(draft, step.id, 1))}
										aria-label={`${t("lesson.package.down")}: ${t("lesson.stepName", { number: index + 1, title: step.title })}`}
									>
										{t("lesson.package.down")}
									</button>
								</div>
							))}
							<button
								type="button"
								disabled={
									needsReopen || dirty || !projectId || !window.electronAPI?.lessonPackageReseal
								}
								onClick={() => void run("reseal")}
							>
								{t("lesson.package.reseal")}
							</button>
							<button
								type="button"
								onClick={() => {
									if (active.current) return;
									draftGeneration.current++;
									setDraft(null);
									if (needsReopen) {
										// No capability remains: do not leave a snapshot whose actions cannot work.
										clear();
										setOpened(null);
										setNeedsReopen(false);
										setMessage(t("lesson.package.draftDiscardedClosed"));
									} else setMessage("");
								}}
							>
								{t("lesson.package.discardDraft")}
							</button>
						</fieldset>
					)}
					<button
						type="button"
						disabled={
							busy ||
							dirty ||
							!!draft ||
							!!opened.videos.length ||
							!window.electronAPI?.lessonPackageCopy
						}
						onClick={() => void run("copy")}
					>
						{t("lesson.package.copy")}
					</button>
					<p>{t("lesson.package.copyScope")}</p>
					<button
						type="button"
						disabled={!!draft}
						onClick={() => {
							clear();
							setOpened(null);
							setMessage("");
						}}
					>
						{t("lesson.package.close")}
					</button>
				</div>
			)}
		</section>
	);
}
