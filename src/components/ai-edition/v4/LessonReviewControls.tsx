import { useScopedT } from "@/contexts/I18nContext";
import { emptyLessonQuery, type LessonQuery, lessonReview } from "@/lib/lesson/review";
import type { LessonManifest } from "@/lib/lesson/schema";
export function LessonReviewControls({
	lesson,
	query,
	onQuery,
	matches,
	onSelect,
}: {
	lesson: LessonManifest;
	query: LessonQuery;
	onQuery: (query: LessonQuery) => void;
	matches: string[];
	onSelect: (ids: string[]) => void;
}) {
	const t = useScopedT("timeline"),
		review = lessonReview(lesson);
	return (
		<section
			aria-label={t("lesson.query.title")}
			style={{ border: "1px solid var(--border)", padding: 12, display: "grid", gap: 10 }}
		>
			<strong>{t("lesson.query.title")}</strong>
			<p role="status">
				{t("lesson.query.summary", {
					total: review.total,
					reviewed: review.reviewed,
					checks: review.findings.length,
					matches: matches.length,
				})}
			</p>
			<label>
				{t("lesson.query.search")}
				<input
					maxLength={300}
					value={query.title}
					onChange={(event) => onQuery({ ...query, title: event.target.value })}
				/>
			</label>
			<label>
				{t("lesson.query.status")}
				<select
					value={query.status}
					onChange={(event) => {
						const status = event.target.value;
						if (status === "all" || status === "draft" || status === "reviewed")
							onQuery({ ...query, status });
					}}
				>
					{["all", "draft", "reviewed"].map((status) => (
						<option key={status} value={status}>
							{t(`lesson.query.${status}`)}
						</option>
					))}
				</select>
			</label>
			<label>
				{t("lesson.query.source")}
				<select
					value={query.source}
					onChange={(event) => {
						const source = event.target.value;
						if (
							source === "all" ||
							source === "authored" ||
							source === "recording-flag" ||
							source === "typing-section" ||
							source === "application-observation"
						)
							onQuery({ ...query, source });
					}}
				>
					{["all", "authored", "recording-flag", "typing-section", "application-observation"].map(
						(source) => (
							<option key={source} value={source}>
								{t(`lesson.query.${source}`)}
							</option>
						),
					)}
				</select>
			</label>
			<label>
				<input
					type="checkbox"
					checked={query.problemsOnly}
					onChange={(event) => onQuery({ ...query, problemsOnly: event.target.checked })}
				/>
				{t("lesson.query.problems")}
			</label>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<button type="button" onClick={() => onSelect(matches)}>
					{t("lesson.query.select")}
				</button>
				<button type="button" onClick={() => onSelect([])}>
					{t("lesson.query.clearSelection")}
				</button>
				<button type="button" onClick={() => onQuery(emptyLessonQuery())}>
					{t("lesson.query.reset")}
				</button>
			</div>
			<p>{t("lesson.query.scope")}</p>
		</section>
	);
}
