import { useScopedT } from "@/contexts/I18nContext";
import { guideAppearance, type LessonOutput } from "@/lib/lesson/output";

const languages = [
	"en",
	"ar",
	"cs",
	"de",
	"es",
	"fr",
	"it",
	"ja-JP",
	"ko-KR",
	"pt-BR",
	"ru",
	"tr",
	"vi",
	"zh-CN",
	"zh-TW",
];
export function LessonOutputControls({
	output,
	onChange,
	sample,
}: {
	output: LessonOutput;
	onChange: (output: LessonOutput) => void;
	sample: string;
}) {
	const t = useScopedT("timeline"),
		appearance = guideAppearance(output);
	return (
		<section
			aria-label={t("lesson.output.title")}
			style={{ border: "1px solid var(--border)", padding: 12, display: "grid", gap: 10 }}
		>
			<strong>{t("lesson.output.title")}</strong>
			<label>
				{t("lesson.output.preset")}
				<select
					value={output.preset}
					onChange={(event) => {
						const preset = event.target.value;
						if (preset === "standard" || preset === "large-print" || preset === "high-contrast")
							onChange({ ...output, preset });
					}}
				>
					{["standard", "large-print", "high-contrast"].map((preset) => (
						<option key={preset} value={preset}>
							{t(`lesson.output.${preset}`)}
						</option>
					))}
				</select>
			</label>
			<label>
				{t("lesson.output.language")}
				<select
					value={output.language}
					onChange={(event) => onChange({ ...output, language: event.target.value })}
				>
					{!languages.includes(output.language) && (
						<option value={output.language}>{output.language}</option>
					)}
					{languages.map((language) => (
						<option key={language} value={language}>
							{language}
						</option>
					))}
				</select>
			</label>
			<label>
				{t("lesson.output.direction")}
				<select
					value={output.direction}
					onChange={(event) => {
						const direction = event.target.value;
						if (direction === "auto" || direction === "ltr" || direction === "rtl")
							onChange({ ...output, direction });
					}}
				>
					{["auto", "ltr", "rtl"].map((direction) => (
						<option key={direction} value={direction}>
							{t(`lesson.output.${direction}`)}
						</option>
					))}
				</select>
			</label>
			<label>
				<input
					type="checkbox"
					checked={output.includeImages}
					onChange={(event) => onChange({ ...output, includeImages: event.target.checked })}
				/>
				{t("lesson.output.images")}
			</label>
			<label>
				<input
					type="checkbox"
					checked={output.includeCode}
					onChange={(event) => onChange({ ...output, includeCode: event.target.checked })}
				/>
				{t("lesson.output.code")}
			</label>
			<p>{t("lesson.output.scope")}</p>
			<div
				aria-label={t("lesson.output.preview")}
				lang={output.language}
				dir={output.direction}
				style={{
					fontSize: appearance.fontSize,
					lineHeight: appearance.lineHeight,
					color: appearance.foreground,
					background: appearance.background,
					padding: 16,
					border: `1px solid ${appearance.muted}`,
					overflowWrap: "anywhere",
				}}
			>
				{sample || t("lesson.output.sample")}
			</div>
		</section>
	);
}
