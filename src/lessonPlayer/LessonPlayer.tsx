import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	LESSON_PLAYER_SPEEDS,
	type LessonPlayerApi,
	type LessonPlayerCode,
	type LessonPlayerPlace,
	type LessonPlayerView,
} from "@/lib/lesson/player";

const SPEEDS: readonly number[] = LESSON_PLAYER_SPEEDS;
const ERROR_KEYS: Record<LessonPlayerCode, string> = {
	"lesson-player-unavailable": "lesson.player.errors.unavailable",
	"lesson-player-busy": "lesson.player.errors.busy",
	"lesson-player-limit": "lesson.player.errors.limit",
	"lesson-package-invalid": "lesson.player.errors.invalid",
	"lesson-package-cancelled": "lesson.player.errors.cancelled",
	"lesson-package-unsupported": "lesson.player.errors.unsupported",
	"lesson-package-tool-unavailable": "lesson.player.errors.toolUnavailable",
	"lesson-progress-unavailable": "lesson.player.errors.progressUnavailable",
	"lesson-progress-full": "lesson.player.errors.progressFull",
	"lesson-progress-cancelled": "lesson.player.errors.progressCancelled",
};
/** Keys never taken from text fields, selects, editable content or the video's own controls. */
const OWN_KEYS =
	"input, select, textarea, [contenteditable]:not([contenteditable='false']), video, audio";
const time = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * Read-only learner view of one verified lesson package: ordered steps, their text, code and
 * images, and each step's video with replay, loop and speed. Step changes never start playback.
 * A saved place is written only when the learner presses Save, and is only a bookmark.
 */
export function LessonPlayer({ api }: { api?: LessonPlayerApi }) {
	const t = useScopedT("timeline");
	const [view, setView] = useState<LessonPlayerView | null>(null);
	const [index, setIndex] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<LessonPlayerCode | null>(null);
	const [speed, setSpeed] = useState(1);
	const [loop, setLoop] = useState(false);
	const [announce, setAnnounce] = useState("");
	const [placeBusy, setPlaceBusy] = useState(false);
	const [placeNote, setPlaceNote] = useState("");
	/** What was last saved or restored here, to say honestly whether the current place is saved. */
	const [marker, setMarker] = useState<{ stepId: string; speed: number; loop: boolean } | null>(
		null,
	);
	const video = useRef<HTMLVideoElement>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const moved = useRef(false);
	/** A restored time to apply once that step's video has its metadata; never followed by play. */
	const pendingSeek = useRef<{ stepId: string; timeSec: number } | null>(null);
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
	useEffect(() => {
		if (video.current) video.current.loop = loop;
	}, [loop]);

	const resetPackageState = () => {
		setMarker(null);
		setPlaceNote("");
		setAnnounce("");
		pendingSeek.current = null;
	};
	const open = async () => {
		if (!api) return;
		setBusy(true);
		setError(null);
		try {
			const result = await api.open();
			if (!result.success) {
				setError(result.code);
				// Main ends the previous package once another folder was chosen; never show stale steps.
				if (result.code !== "lesson-player-busy") {
					setView(null);
					resetPackageState();
				}
				return;
			}
			if (result.result.status === "opened") {
				setView(result.result);
				setIndex(0);
				resetPackageState();
			}
		} finally {
			setBusy(false);
		}
	};
	const close = () => {
		video.current?.pause();
		setView(null);
		resetPackageState();
		void api?.close();
	};
	const go = (next: number) => {
		if (!view || next < 0 || next >= view.steps.length || next === index) return;
		video.current?.pause();
		pendingSeek.current = null;
		setPlaceNote("");
		moved.current = true;
		setIndex(next);
	};
	const replay = () => {
		const element = video.current;
		if (!element) return;
		element.currentTime = 0;
		void element.play().catch(() => undefined);
	};
	const togglePlay = () => {
		const element = video.current;
		if (!element) return;
		if (element.paused) void element.play().catch(() => undefined);
		else element.pause();
	};
	const changeLoop = (next: boolean) => {
		setLoop(next);
		setPlaceNote("");
		setAnnounce(t(next ? "lesson.player.loopOn" : "lesson.player.loopOff"));
	};
	const changeSpeed = (next: number) => {
		setSpeed(next);
		setPlaceNote("");
		setAnnounce(t("lesson.player.speedNow", { speed: next }));
	};
	const stepSpeed = (direction: 1 | -1) => {
		const next = SPEEDS[SPEEDS.indexOf(speed) + direction];
		if (next !== undefined) changeSpeed(next);
	};

	// Discoverable single-key shortcuts, only when no modifier is held and focus is not in a field,
	// a select or the video (which keeps its own keys). Nothing here saves or clears a place.
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!view || busy || event.defaultPrevented) return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest?.(OWN_KEYS)) return;
		const actions: Record<string, () => void> = {
			n: () => go(index + 1),
			p: () => go(index - 1),
			k: togglePlay,
			r: replay,
			l: () => changeLoop(!loop),
			"[": () => stepSpeed(-1),
			"]": () => stepSpeed(1),
		};
		const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
		if (!action) return;
		event.preventDefault();
		action();
	};

	const placeCall = async <T,>(
		run: () => Promise<{ success: true; result: T } | { success: false; code: LessonPlayerCode }>,
		done: (result: T) => void,
	) => {
		setPlaceBusy(true);
		setError(null);
		try {
			const result = await run();
			if (!result.success) {
				setError(result.code);
				return;
			}
			done(result.result);
		} finally {
			setPlaceBusy(false);
		}
	};
	const save = () => {
		if (!view || !step || !api?.savePlace) return;
		const place: LessonPlayerPlace = {
			stepId: step.id,
			timeSec: step.video ? Math.max(0, video.current?.currentTime ?? 0) : 0,
			speed,
			loop,
		};
		void placeCall(
			() => api.savePlace!(view.token, place),
			() => {
				setMarker({ stepId: place.stepId, speed, loop });
				setPlaceNote(
					t("lesson.player.placeSaved", { number: index + 1, time: time(place.timeSec) }),
				);
			},
		);
	};
	const restore = () => {
		if (!view || !api?.restorePlace) return;
		void placeCall(
			() => api.restorePlace!(view.token),
			(result) => {
				if (result.status === "none") {
					setPlaceNote(t("lesson.player.placeNone"));
					return;
				}
				const at = view.steps.findIndex((item) => item.id === result.place.stepId);
				if (at < 0) {
					setPlaceNote(t("lesson.player.placeNone"));
					return;
				}
				video.current?.pause();
				setSpeed(result.place.speed);
				setLoop(result.place.loop);
				setMarker({
					stepId: result.place.stepId,
					speed: result.place.speed,
					loop: result.place.loop,
				});
				setPlaceNote(
					t("lesson.player.placeRestored", { number: at + 1, time: time(result.place.timeSec) }),
				);
				if (at === index && video.current && video.current.readyState >= 1) {
					video.current.currentTime = Math.min(result.place.timeSec, video.current.duration || 0);
				} else {
					pendingSeek.current = { stepId: result.place.stepId, timeSec: result.place.timeSec };
					moved.current = at !== index;
					setIndex(at);
				}
			},
		);
	};
	const clear = () => {
		if (!view || !api?.clearPlace) return;
		void placeCall(
			() => api.clearPlace!(view.token),
			(result) => {
				setMarker(null);
				setPlaceNote(t(result.removed ? "lesson.player.placeCleared" : "lesson.player.placeNone"));
			},
		);
	};
	const clearAll = () => {
		if (!api?.clearAllPlaces || !window.confirm(t("lesson.player.clearAllConfirm"))) return;
		void placeCall(
			() => api.clearAllPlaces!(),
			() => {
				setMarker(null);
				setPlaceNote(t("lesson.player.placeAllCleared"));
			},
		);
	};
	const placeSaved =
		!!marker &&
		!!step &&
		marker.stepId === step.id &&
		marker.speed === speed &&
		marker.loop === loop;

	return (
		<div className="player" onKeyDown={onKeyDown}>
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
						<section aria-labelledby="player-shortcuts">
							<h4 id="player-shortcuts">{t("lesson.player.shortcuts")}</h4>
							<p className="note">{t("lesson.player.shortcutsScope")}</p>
							<dl className="shortcuts">
								{(
									[
										["N", "next"],
										["P", "previous"],
										["K", "playPause"],
										["R", "replay"],
										["L", "loop"],
										["[ ]", "speedKeys"],
									] as const
								).map(([key, label]) => (
									<div key={key}>
										<dt>
											<kbd>{key}</kbd>
										</dt>
										<dd>{t(`lesson.player.${label}`)}</dd>
									</div>
								))}
							</dl>
						</section>
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
										const element = event.currentTarget;
										element.playbackRate = speed;
										element.loop = loop;
										const seek = pendingSeek.current;
										if (seek && seek.stepId === step.id) {
											element.currentTime = Math.min(seek.timeSec, element.duration || 0);
											pendingSeek.current = null;
										}
									}}
								/>
								<div className="row">
									<button type="button" onClick={replay} aria-keyshortcuts="R">
										{t("lesson.player.replay")}
									</button>
									<button
										type="button"
										aria-pressed={loop}
										aria-keyshortcuts="L"
										onClick={() => changeLoop(!loop)}
									>
										{t("lesson.player.loop")}
									</button>
									<label>
										{t("lesson.player.speed")}{" "}
										<select
											value={String(speed)}
											aria-keyshortcuts="[ ]"
											onChange={(event) => changeSpeed(Number(event.target.value))}
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
							<button
								type="button"
								disabled={index === 0}
								aria-keyshortcuts="P"
								onClick={() => go(index - 1)}
							>
								{t("lesson.player.previous")}
							</button>
							<button
								type="button"
								disabled={index === view.steps.length - 1}
								aria-keyshortcuts="N"
								onClick={() => go(index + 1)}
							>
								{t("lesson.player.next")}
							</button>
						</div>
						<p className="note" aria-live="polite">
							{announce}
						</p>
						{api?.savePlace && (
							<section aria-labelledby="player-place">
								<h4 id="player-place">{t("lesson.player.place")}</h4>
								<p className="note">{t("lesson.player.placeScope")}</p>
								<div className="row">
									<button type="button" onClick={save} disabled={placeBusy}>
										{t("lesson.player.save")}
									</button>
									<button type="button" onClick={restore} disabled={placeBusy}>
										{t("lesson.player.restore")}
									</button>
									<button type="button" onClick={clear} disabled={placeBusy}>
										{t("lesson.player.clearPlace")}
									</button>
									<button type="button" onClick={clearAll} disabled={placeBusy}>
										{t("lesson.player.clearAll")}
									</button>
								</div>
								<p role="status">
									{placeNote ||
										t(placeSaved ? "lesson.player.placeIsSaved" : "lesson.player.placeNotSaved")}
								</p>
							</section>
						)}
					</main>
				</>
			) : (
				!busy && <p className="note">{t("lesson.player.empty")}</p>
			)}
		</div>
	);
}
