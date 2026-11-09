import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { OpenedLessonPackage } from "@/lib/lesson/packageOpen";
import { validateLesson } from "@/lib/lesson/schema";
/** Separate read-only inspection: never replaces the lesson currently being authored. */
export function LessonPackagePanel() {
	const t = useScopedT("timeline");
	const projectId = useProjectStore((s) => s.projectId),
		document = useProjectStore((s) => s.document),
		dirty = useProjectStore((s) => s.dirty);
	const [opened, setOpened] = useState<OpenedLessonPackage | null>(null);
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	const active = useRef<string | null>(null),
		token = useRef<string | null>(null),
		epoch = useRef(0);
	const clear = useCallback(() => {
		epoch.current++;
		if (active.current)
			void window.electronAPI?.lessonPackageCancel?.(active.current).catch(() => undefined);
		if (token.current)
			void window.electronAPI?.lessonPackageRelease?.(token.current).catch(() => undefined);
		token.current = null;
	}, []);
	useEffect(() => {
		if (projectId || document || dirty || token.current || active.current) clear();
		setOpened(null);
		setMessage("");
		return clear;
	}, [projectId, document, dirty, clear]);
	const run = async (copy: boolean) => {
		if (active.current || dirty || !projectId) return;
		const id = crypto.randomUUID(),
			at = epoch.current;
		active.current = id;
		setBusy(true);
		setMessage(t("lesson.package.checking"));
		try {
			if (copy) {
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
				if (token.current) await window.electronAPI?.lessonPackageRelease?.(token.current);
				token.current = null;
				setOpened(null);
				const result = await window.electronAPI!.lessonPackageOpen!(id);
				if (at !== epoch.current) {
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
				if (at !== epoch.current) {
					void window.electronAPI?.lessonPackageRelease?.(value.token);
					return;
				}
				token.current = value.token;
				setOpened({ ...value, lesson });
				setMessage(t("lesson.package.checked"));
			}
		} catch {
			if (at === epoch.current) setMessage(t("lesson.package.errors.lesson-package-invalid"));
		} finally {
			if (active.current === id) active.current = null;
			setBusy(false);
		}
	};
	return (
		<section aria-label={t("lesson.package.title")}>
			<h3>{t("lesson.package.title")}</h3>
			<p>{t("lesson.package.scope")}</p>
			{dirty && <p>{t("lesson.package.dirty")}</p>}
			<button
				type="button"
				disabled={busy || dirty || !projectId || !window.electronAPI?.lessonPackageOpen}
				onClick={() => void run(false)}
			>
				{t("lesson.package.open")}
			</button>
			{busy && (
				<button
					type="button"
					onClick={() => {
						clear();
						setOpened(null);
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
					<ol>
						{opened.lesson.steps.map((step) => {
							const image = opened.lesson.assets.find((a) => a.id === step.imageId),
								video = opened.videos.find((v) => v.stepId === step.id);
							return (
								<li key={step.id}>
									<h4>{step.title}</h4>
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
					<button
						type="button"
						disabled={
							busy || dirty || !!opened.videos.length || !window.electronAPI?.lessonPackageCopy
						}
						onClick={() => void run(true)}
					>
						{t("lesson.package.copy")}
					</button>
					<p>{t("lesson.package.copyScope")}</p>
					<button
						type="button"
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
