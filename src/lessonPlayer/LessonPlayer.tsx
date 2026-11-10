import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { LessonPlayerApi, LessonPlayerCode, LessonPlayerView } from "@/lib/lesson/player";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const ERROR_KEYS: Record<LessonPlayerCode, string> = {
	"lesson-player-unavailable": "lesson.player.errors.unavailable",
	"lesson-player-busy": "lesson.player.errors.busy",
	"lesson-player-limit": "lesson.player.errors.limit",
	"lesson-package-invalid": "lesson.player.errors.invalid",
	"lesson-package-cancelled": "lesson.player.errors.cancelled",
	"lesson-package-unsupported": "lesson.player.errors.unsupported",
	"lesson-package-tool-unavailable": "lesson.player.errors.toolUnavailable",
};

/**
 * Read-only learner view of one verified lesson package: ordered steps, their text, code and
 * images, and each step's video with replay and speed. Step changes never start playback.
 */
export function LessonPlayer({ api }: { api?: LessonPlayerApi }) {
	const t = useScopedT("timeline");
	const [view, setView] = useState<LessonPlayerView | null>(null);
	const [index, setIndex] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<LessonPlayerCode | null>(null);
	const [speed, setSpeed] = useState(1);
	const video = useRef<HTMLVideoElement>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const moved = useRef(false);
	const step = view?.steps[index];

	// Focus follows an explicit step change, so keyboard and screen-reader users land on it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once per step change by design.
	useEffect(() => {
		if (moved.current) heading.current?.focus();
		moved.current = false;
	}, [index]);
	useEffect(() => {
		if (video.current) video.current.playbackRate = speed;
	}, [speed]);

	const open = async () => {
		if (!api) return;
		setBusy(true);
		setError(null);
		try {
			const result = await api.open();
			if (!result.success) {
				setError(result.code);
				// Main ends the previous package once another folder was chosen; never show stale steps.
				if (result.code !== "lesson-player-busy") setView(null);
				return;
			}
			if (result.result.status === "opened") {
				setView(result.result);
				setIndex(0);
			}
		} finally {
			setBusy(false);
		}
	};
	const close = () => {
		video.current?.pause();
		setView(null);
		void api?.close();
	};
	const go = (next: number) => {
		if (!view || next < 0 || next >= view.steps.length || next === index) return;
		video.current?.pause();
		moved.current = true;
		setIndex(next);
	};
	const replay = () => {
		const element = video.current;
		if (!element) return;
		element.currentTime = 0;
		void element.play().catch(() => undefined);
	};

	return (
		<div className="player">
			<header>
				<h1>{t("lesson.player.title")}</h1>
				<p className="note">{t("lesson.player.scope")}</p>
				<div className="row">
					<button type="button" onClick={() => void open()} disabled={busy || !api}>
						{t("lesson.player.open")}
					</button>
					{busy && (
						<button type="button" onClick={() => void api?.cancel()}>
							{t("lesson.player.cancel")}
						</button>
					)}
					{view && !busy && (
						<button type="button" onClick={close}>
							{t("lesson.player.close")}
						</button>
					)}
				</div>
				<p role="status">{busy ? t("lesson.player.opening") : ""}</p>
				{error && <p role="alert">{t(ERROR_KEYS[error])}</p>}
				{view && (
					<>
						<h2>{view.title}</h2>
						<p className="note">{t("lesson.player.checked")}</p>
					</>
				)}
			</header>
			{view && step ? (
				<>
					<nav aria-label={t("lesson.player.steps")}>
						<ol>
							{view.steps.map((item, at) => (
								<li key={item.id}>
									<button
										type="button"
										aria-current={at === index ? "step" : undefined}
										onClick={() => go(at)}
									>
										{item.title}
									</button>
								</li>
							))}
						</ol>
					</nav>
					<main>
						<p aria-live="polite">
							{t("lesson.player.stepOf", { number: index + 1, total: view.steps.length })}
						</p>
						<h3 ref={heading} tabIndex={-1}>
							{step.title}
						</h3>
						<p className="instructions">{step.instructions}</p>
						{step.image && (
							<img
								src={step.image.src}
								alt={step.image.alt}
								width={step.image.width}
								height={step.image.height}
							/>
						)}
						{step.code && (
							<figure>
								<figcaption>
									{t("lesson.player.code")} ({step.code.language})
								</figcaption>
								<pre dir="ltr">
									<code>{step.code.text}</code>
								</pre>
							</figure>
						)}
						{step.video ? (
							<>
								{/* A new element per step: it starts paused, at the start, never autoplaying. */}
								<video
									key={step.id}
									ref={video}
									src={step.video.src}
									controls
									preload="metadata"
									playsInline
									width={step.video.width}
									height={step.video.height}
									aria-label={t("lesson.player.video", { title: step.title })}
									onLoadedMetadata={(event) => {
										event.currentTarget.playbackRate = speed;
									}}
								/>
								<div className="row">
									<button type="button" onClick={replay}>
										{t("lesson.player.replay")}
									</button>
									<label>
										{t("lesson.player.speed")}{" "}
										<select
											value={String(speed)}
											onChange={(event) => setSpeed(Number(event.target.value))}
										>
											{SPEEDS.map((value) => (
												<option key={value} value={String(value)}>
													{value}×
												</option>
											))}
										</select>
									</label>
								</div>
							</>
						) : (
							<p className="note">{t("lesson.player.noVideo")}</p>
						)}
						<div className="row">
							<button type="button" disabled={index === 0} onClick={() => go(index - 1)}>
								{t("lesson.player.previous")}
							</button>
							<button
								type="button"
								disabled={index === view.steps.length - 1}
								onClick={() => go(index + 1)}
							>
								{t("lesson.player.next")}
							</button>
						</div>
					</main>
				</>
			) : (
				!busy && <p className="note">{t("lesson.player.empty")}</p>
			)}
		</div>
	);
}
