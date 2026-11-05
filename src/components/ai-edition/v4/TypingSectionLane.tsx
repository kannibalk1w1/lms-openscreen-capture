import { Code2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { formatSec } from "@/lib/ai-edition/timeline/format";
import { sectionPlayback } from "@/lib/typing/capture";
import { downloadTypingSection, type TypingExportKind } from "@/lib/typing/download";
import type { TypingPlaybackMode } from "@/lib/typing/portable";
import {
	type TypingReviewEntry,
	type TypingReviewTarget,
	typingReviewEntries,
} from "@/lib/typing/review";
import styles from "./TypingSectionLane.module.css";

function SectionDetail({
	entry,
	projectId,
	onSeek,
	onReview,
}: {
	entry: TypingReviewEntry;
	projectId: string;
	onSeek: (time: number) => void;
	onReview?: (target: TypingReviewTarget) => void;
}) {
	const t = useScopedT("timeline");
	const [mode, setMode] = useState<TypingPlaybackMode>("captured-edits");
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const excerpt = useMemo(
		() => Array.from(sectionPlayback(entry.take, entry.section).finalText).slice(0, 12000).join(""),
		[entry.take, entry.section],
	);
	return (
		<div className={styles.detail}>
			<strong>
				{entry.section.label || entry.take.title} · {t("typing.section", { number: entry.number })}
			</strong>
			<span>{entry.take.documentName}</span>
			<span>{t(`typingReview.status.${entry.status}`)}</span>
			{entry.take.coverage === "limited" && (
				<p className={styles.hint}>{t("typing.limitedSource")}</p>
			)}
			<div className={styles.actions}>
				{entry.placements.map((placement, index) => (
					<button
						type="button"
						key={placement.clip.id}
						disabled={placement.trimmed}
						onClick={() => onSeek(placement.time)}
					>
						{t("typingReview.seek", { number: index + 1, time: formatSec(placement.time) })}
						{placement.trimmed ? ` · ${t("typingReview.status.trimmed")}` : ""}
					</button>
				))}
			</div>
			<label>
				{t("typingReview.resultExcerpt")}
				<textarea readOnly spellCheck={false} value={excerpt} />
			</label>
			<label>
				{t("typingReview.recipeStyle")}{" "}
				<select
					aria-label={t("typingReview.recipeStyle")}
					value={mode}
					disabled={busy}
					onChange={(e) => setMode(e.target.value as TypingPlaybackMode)}
				>
					<option value="captured-edits">{t("typing.capturedPlayback")}</option>
					<option value="clean">{t("typing.cleanPlayback")}</option>
				</select>
			</label>
			<div className={styles.actions}>
				{(["section", "text", "playback"] as TypingExportKind[]).map((kind) => (
					<button
						type="button"
						key={kind}
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							setError("");
							try {
								await downloadTypingSection(entry.take, entry.section.id, kind, projectId, mode);
							} catch (error) {
								setError(error instanceof Error ? error.message : t("typing.export.error"));
							} finally {
								setBusy(false);
							}
						}}
					>
						{t(`typing.export.${kind}`)}
					</button>
				))}
			</div>
			{error && (
				<p role="alert" className={styles.error}>
					{error}
				</p>
			)}
			{onReview && (
				<button
					type="button"
					onClick={() =>
						onReview({ projectId, takeId: entry.take.id, sectionId: entry.section.id })
					}
				>
					{t("typingReview.edit")}
				</button>
			)}
		</div>
	);
}

export function TypingSectionLane({
	total,
	onSeek,
	onReview,
	onOpenReview,
}: {
	total: number;
	onSeek: (time: number) => void;
	onReview?: (target: TypingReviewTarget) => void;
	onOpenReview?: () => void;
}) {
	const t = useScopedT("timeline");
	const doc = useProjectStore((s) => s.document);
	const entries = useMemo(() => (doc ? typingReviewEntries(doc) : []), [doc]);
	const [visibleCount, setVisibleCount] = useState(100);
	const [open, setOpen] = useState(false),
		[selected, setSelected] = useState<string | null>(null),
		[search, setSearch] = useState("");
	const filtered = entries.filter((entry) =>
		`${entry.section.label} ${entry.take.title} ${entry.take.documentName} ${t("typing.section", { number: entry.number })} ${entry.section.id}`
			.toLocaleLowerCase()
			.includes(search.toLocaleLowerCase()),
	);
	const current = filtered.find((entry) => entry.key === selected) ?? filtered[0];
	return (
		<div
			className={styles.lane}
			data-track-kind="typing"
			role="group"
			aria-label={t("typingReview.title")}
		>
			<div className={styles.caption}>
				<span>{t("typingReview.title")}</span>
				<button
					type="button"
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => {
						e.stopPropagation();
						setSearch("");
						setOpen(true);
						onOpenReview?.();
					}}
				>
					{t("typingReview.all", { count: entries.length })}
				</button>
			</div>
			{total > 0 &&
				entries.flatMap((entry) =>
					entry.placements.map((placement) => {
						const label = `${entry.section.label || entry.take.title} · ${formatSec(placement.time)}${placement.trimmed ? ` · ${t("typingReview.status.trimmed")}` : ""}`;
						return (
							<button
								type="button"
								key={JSON.stringify([entry.key, placement.clip.id])}
								className={styles.marker}
								data-trimmed={placement.trimmed}
								style={{ left: `${(placement.time / total) * 100}%` }}
								aria-label={label}
								title={label}
								onPointerDown={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
								onClick={(e) => {
									e.stopPropagation();
									setSelected(entry.key);
									setSearch("");
									setOpen(true);
									onOpenReview?.();
									if (!placement.trimmed) onSeek(placement.time);
								}}
							>
								<Code2 size={13} />
								<span>{entry.section.label || t("typing.section", { number: entry.number })}</span>
							</button>
						);
					}),
				)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className={styles.dialog}
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<DialogHeader>
						<DialogTitle>{t("typingReview.title")}</DialogTitle>
						<DialogDescription>{t("typingReview.onsetHint")}</DialogDescription>
					</DialogHeader>
					<input
						className={styles.search}
						maxLength={200}
						aria-label={t("typingReview.search")}
						placeholder={t("typingReview.search")}
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setVisibleCount(100);
						}}
					/>
					<p className={styles.hint}>
						{t("typingReview.showing", {
							count: Math.min(visibleCount, filtered.length),
							total: entries.length,
						})}
					</p>
					<div className={styles.layout}>
						<div className={styles.list}>
							{filtered.slice(0, visibleCount).map((entry) => (
								<button
									type="button"
									key={entry.key}
									aria-pressed={current?.key === entry.key}
									onClick={() => setSelected(entry.key)}
								>
									{entry.section.label || entry.take.title} ·{" "}
									{t("typing.section", { number: entry.number })}
									<small>{t(`typingReview.status.${entry.status}`)}</small>
								</button>
							))}
							{filtered.length > visibleCount && (
								<button type="button" onClick={() => setVisibleCount((count) => count + 100)}>
									{t("typingReview.more")}
								</button>
							)}
						</div>
						{doc && current ? (
							<SectionDetail
								key={`${doc.project.id}:${current.key}`}
								entry={current}
								projectId={doc.project.id}
								onSeek={onSeek}
								onReview={
									onReview
										? (target) => {
												setOpen(false);
												onReview(target);
											}
										: undefined
								}
							/>
						) : (
							<p className={styles.hint}>{t("typingReview.empty")}</p>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
