import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { LessonOperationError } from "@/lib/lesson/api";
import type { LocalDraftEntry, LocalDraftStatus } from "@/lib/lesson/drafts";
import { type LessonManifest, validateLesson } from "@/lib/lesson/schema";
export function LocalLessonDraftControls({
	lesson,
	onRestore,
}: {
	lesson: LessonManifest;
	onRestore: (lesson: LessonManifest) => void;
}) {
	const t = useScopedT("timeline"),
		[status, setStatus] = useState<LocalDraftStatus | null>(null),
		[entries, setEntries] = useState<LocalDraftEntry[] | null>(null),
		[busy, setBusy] = useState(false),
		[message, setMessage] = useState(""),
		[error, setError] = useState<"" | "limit" | "operation">(""),
		[candidate, setCandidate] = useState<LessonManifest | null>(null),
		[removing, setRemoving] = useState<string | null>(null);
	const epoch = useRef({});
	const inFlight = useRef(false);
	useEffect(() => {
		const current = epoch.current;
		void window.electronAPI
			?.lessonDraftStatus?.()
			.then((result) => {
				if (epoch.current === current) {
					if (result.success) setStatus(result.result);
					else setError("operation");
				}
			})
			.catch(() => {
				if (epoch.current === current) setError("operation");
			});
		return () => {
			epoch.current = {};
		};
	}, []);
	const run = async (work: (current: object) => Promise<void>) => {
		if (inFlight.current) return;
		inFlight.current = true;
		const current = epoch.current;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await work(current);
		} catch (error) {
			if (epoch.current === current)
				setError(
					error instanceof LessonOperationError && error.code === "local-draft-limit"
						? "limit"
						: "operation",
				);
		} finally {
			inFlight.current = false;
			if (epoch.current === current) setBusy(false);
		}
	};
	const refresh = async (current: object) => {
		const result = await window.electronAPI?.lessonDraftStatus?.();
		if (epoch.current === current && result?.success) setStatus(result.result);
	};
	const list = async (current: object) => {
		const result = await window.electronAPI?.lessonDraftList?.();
		if (!result?.success) throw new Error("list");
		if (epoch.current === current) setEntries(result.result);
	};
	return (
		<section
			aria-label={t("lesson.drafts.title")}
			style={{ border: "1px solid var(--border)", padding: 12, display: "grid", gap: 10 }}
		>
			<strong>{t("lesson.drafts.title")}</strong>
			<p>{t("lesson.drafts.scope")}</p>
			{status && (
				<>
					<code style={{ overflowWrap: "anywhere" }}>{status.path}</code>
					<p>
						{t(status.limited ? "lesson.drafts.inventoryLimited" : "lesson.drafts.inventory", {
							copies: status.copies,
							max: status.maxCopies,
							bytes: (status.bytes / 1048576).toFixed(1),
							limit: (status.maxBytes / 1048576).toFixed(0),
						})}
					</p>
				</>
			)}
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button
					type="button"
					disabled={busy || !status || !window.electronAPI?.lessonDraftSave}
					onClick={() =>
						void run(async (current) => {
							const result = await window.electronAPI.lessonDraftSave!(lesson);
							if (!result.success) throw new LessonOperationError(result.code);
							if (epoch.current !== current) return;
							setMessage(
								t("lesson.drafts.saved", {
									path: result.result.path,
									revision: result.result.revision,
								}),
							);
							await refresh(current);
							if (entries) await list(current);
						})
					}
				>
					{t("lesson.drafts.save")}
				</button>
				<button
					type="button"
					disabled={busy || !window.electronAPI?.lessonDraftList}
					onClick={() =>
						void run(async (current) => {
							setCandidate(null);
							setRemoving(null);
							await list(current);
							await refresh(current);
						})
					}
				>
					{t("lesson.drafts.show")}
				</button>
			</div>
			{entries && (
				<ul>
					{entries.length === 0 && <li>{t("lesson.drafts.empty")}</li>}
					{entries.map((entry) => (
						<li key={entry.id} style={{ marginBottom: 12 }}>
							<p>
								{entry.readable ? entry.title : t("lesson.drafts.unreadable")} ·{" "}
								{t("lesson.drafts.revision", { revision: entry.revision })} ·{" "}
								{new Date(entry.savedAt).toLocaleString()}
							</p>
							<button
								type="button"
								disabled={busy || !entry.readable || !window.electronAPI?.lessonDraftRead}
								onClick={() =>
									void run(async (current) => {
										const result = await window.electronAPI.lessonDraftRead!(entry.id);
										if (!result.success) throw new Error("read");
										const valid = await validateLesson(result.result);
										if (epoch.current === current) {
											setCandidate(valid);
											setRemoving(null);
										}
									})
								}
							>
								{t("lesson.drafts.preview")}
							</button>{" "}
							<button
								type="button"
								disabled={busy || !window.electronAPI?.lessonDraftRemove}
								onClick={() => {
									setCandidate(null);
									setRemoving(entry.id);
								}}
							>
								{t("lesson.drafts.remove")}
							</button>
						</li>
					))}
				</ul>
			)}
			{candidate && (
				<div role="group" aria-label={t("lesson.drafts.restoreTitle")}>
					<strong>{candidate.title}</strong>
					<p>
						{t("lesson.drafts.confirmRestore", {
							steps: candidate.steps.length,
							revision: candidate.revision,
						})}
					</p>
					<button
						type="button"
						disabled={busy}
						onClick={() => {
							onRestore(candidate);
							setCandidate(null);
							setMessage("");
						}}
					>
						{t("lesson.drafts.restore")}
					</button>{" "}
					<button type="button" onClick={() => setCandidate(null)}>
						{t("lesson.drafts.cancel")}
					</button>
				</div>
			)}
			{removing && (
				<div role="group" aria-label={t("lesson.drafts.deleteTitle")}>
					<p>{t("lesson.drafts.confirmDelete")}</p>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void run(async (current) => {
								const result = await window.electronAPI.lessonDraftRemove!(removing);
								if (!result.success) throw new Error("remove");
								if (epoch.current !== current) return;
								setRemoving(null);
								setMessage(t("lesson.drafts.removed"));
								await list(current);
								await refresh(current);
							})
						}
					>
						{t("lesson.drafts.confirmRemove")}
					</button>{" "}
					<button type="button" onClick={() => setRemoving(null)}>
						{t("lesson.drafts.cancel")}
					</button>
				</div>
			)}
			<p role="status" aria-live="polite" style={{ overflowWrap: "anywhere" }}>
				{busy ? t("lesson.drafts.busy") : message}
			</p>
			<p role="alert">
				{error ? t(error === "limit" ? "lesson.drafts.limit" : "lesson.drafts.error") : ""}
			</p>
		</section>
	);
}
