import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AnnotationRegion } from "@/components/video-editor/types";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { codePanelForRegion } from "@/lib/typing/presentation";
import type { CodePresentation } from "@/lib/typing/presentationSchema";
import styles from "./v4/TypingCaptureDialog.module.css";

function CodeNumberInput({
	value,
	min,
	max,
	onCommit,
}: {
	value: number;
	min: number;
	max: number;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => setDraft(String(value)), [value]);
	return (
		<input
			type="number"
			min={min}
			max={max}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={(event) => {
				const raw = event.currentTarget.value,
					next = Number(raw);
				setDraft(String(value));
				if (
					raw.trim() &&
					Number.isFinite(next) &&
					next >= min &&
					next <= max &&
					Math.round(next) !== value
				)
					onCommit(Math.round(next));
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.currentTarget.value = String(value);
					setDraft(String(value));
					event.currentTarget.blur();
				}
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}

export function CodePresentationControls({
	region,
	onChange,
	onCommit,
}: {
	region: AnnotationRegion;
	onChange: (patch: Partial<AnnotationRegion>) => void;
	onCommit: () => void;
}) {
	const t = useScopedT("timeline"),
		data = region.codeData!;
	const change = (patch: Partial<CodePresentation>) => {
		const next = { ...data, ...patch };
		try {
			const doc = useProjectStore.getState().document;
			if (doc) codePanelForRegion(doc, next, 0, 1);
		} catch {
			toast.error(t("code.excerptError"));
			return;
		}
		onChange({ codeData: next });
		onCommit();
	};
	return (
		<div className={styles.sections}>
			<strong>{t("code.title")}</strong>
			<label className={styles.field}>
				{t("code.background")}
				<select
					aria-label={t("code.background")}
					value={data.pauseBackground ? "pause" : "play"}
					onChange={(e) => change({ pauseBackground: e.target.value === "pause" })}
				>
					<option value="pause">{t("code.pause")}</option>
					<option value="play">{t("code.play")}</option>
				</select>
			</label>
			<label className={styles.field}>
				<input
					type="checkbox"
					checked={data.blurBackground}
					onChange={(e) => change({ blurBackground: e.target.checked })}
				/>
				{t("code.blur")}
			</label>
			<label className={styles.field}>
				{t("code.mode")}
				<select
					aria-label={t("code.mode")}
					value={data.mode}
					onChange={(e) => change({ mode: e.target.value as CodePresentation["mode"] })}
				>
					<option value="clean">{t("code.clean")}</option>
					<option value="faithful">{t("code.faithful")}</option>
				</select>
			</label>
			<label className={styles.field}>
				{t("code.theme")}
				<select
					aria-label={t("code.theme")}
					value={data.theme}
					onChange={(e) => change({ theme: e.target.value as CodePresentation["theme"] })}
				>
					<option value="dark">{t("code.dark")}</option>
					<option value="light">{t("code.light")}</option>
				</select>
			</label>
			{(
				[
					["fontSize", 12, 60],
					["firstLine", 1, 200000],
					["lineCount", 1, 60],
				] as const
			).map(([key, min, max]) => (
				<label className={styles.field} key={key}>
					{t(`code.${key}`)}
					<CodeNumberInput
						value={data[key]}
						min={min}
						max={max}
						onCommit={(value) => change({ [key]: value })}
					/>
				</label>
			))}
			<label className={styles.field}>
				<input
					type="checkbox"
					checked={data.lineNumbers}
					onChange={(e) => change({ lineNumbers: e.target.checked })}
				/>
				{t("code.lineNumbers")}
			</label>
			<p className={styles.hint}>{t("code.geometryHint")}</p>
			<p className={styles.hint}>{t("code.clockHint")}</p>
		</div>
	);
}
