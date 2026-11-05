import { useRef, useState } from "react";
import { toast } from "sonner";
import type { FigureData } from "@/components/video-editor/types";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ArrowStylePreset,
	arrowStyle,
	loadArrowStyles,
	rememberArrowStyle,
	saveArrowStyles,
} from "@/lib/ai-edition/annotations/arrowStyles";
import { importSvg, type SvgAsset, svgDataUrl } from "@/lib/ai-edition/annotations/svgAssets";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import styles from "./ArrowStyleControls.module.css";
import shell from "./NewEditorShell.module.css";
export function ArrowStyleControls({
	figure,
	onChange,
	onGraphic,
}: {
	figure: FigureData;
	onChange: (patch: Partial<FigureData>) => void;
	onGraphic: (asset: SvgAsset) => void;
}) {
	const t = useScopedT("settings");
	const [busy, setBusy] = useState(false);
	const [presets, setPresets] = useState(loadArrowStyles);
	const [name, setName] = useState("");
	const [selected, setSelected] = useState("");
	const headFile = useRef<HTMLInputElement>(null),
		graphicFile = useRef<HTMLInputElement>(null);
	const apply = (patch: Partial<FigureData>) => {
		onChange(patch);
		rememberArrowStyle(arrowStyle({ ...figure, ...patch }));
	};
	const upload = async (file: File | undefined, graphic: boolean) => {
		if (!file) return;
		const original = useProjectStore.getState().document;
		setBusy(true);
		try {
			const asset = await importSvg(file);
			if (useProjectStore.getState().document !== original) throw new Error("project changed");
			if (graphic) onGraphic(asset);
			else apply({ headSvg: asset, headStyle: "custom" });
		} catch {
			toast.error(t("annotation.svgError"));
		} finally {
			setBusy(false);
		}
	};
	const option = (label: string, value: string, values: string[], change: (v: string) => void) => (
		<label className={styles.field}>
			<span className={shell.fieldLabel}>{t(`annotation.${label}`)}</span>
			<select
				className={shell.control}
				value={value}
				disabled={busy}
				onChange={(e) => change(e.target.value)}
			>
				{values.map((v) => (
					<option key={v} value={v}>
						{t(`annotation.arrowOption_${v}`)}
					</option>
				))}
			</select>
		</label>
	);
	return (
		<div className={styles.controls}>
			{option("linePattern", figure.linePattern ?? "solid", ["solid", "dashed"], (v) =>
				apply({ linePattern: v as FigureData["linePattern"] }),
			)}
			{option("headEnds", figure.headEnds ?? "end", ["end", "both", "none"], (v) =>
				apply({ headEnds: v as FigureData["headEnds"] }),
			)}
			{option(
				"headStyle",
				figure.headStyle ?? "open",
				figure.headSvg ? ["open", "triangle", "custom"] : ["open", "triangle"],
				(v) => apply({ headStyle: v as FigureData["headStyle"] }),
			)}
			<label className={styles.field}>
				<span className={shell.fieldLabel}>{t("annotation.headSize")}</span>
				<input
					type="range"
					min={0.25}
					max={4}
					step={0.05}
					value={figure.headScale ?? 1}
					disabled={busy}
					onChange={(e) => apply({ headScale: Number(e.target.value) })}
				/>
			</label>
			{figure.headSvg && (
				<img
					className={styles.preview}
					alt={t("annotation.headPreview")}
					src={svgDataUrl(figure.headSvg.svg)}
				/>
			)}
			<button
				type="button"
				className={styles.button}
				disabled={busy}
				onClick={() => headFile.current?.click()}
			>
				{t("annotation.importHeadSvg")}
			</button>
			<p className={styles.hint}>{t("annotation.headSvgHint")}</p>
			<input
				hidden
				ref={headFile}
				type="file"
				accept="image/svg+xml,.svg"
				aria-label={t("annotation.importHeadSvg")}
				disabled={busy}
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					void upload(file, false);
				}}
			/>
			<label className={styles.field}>
				<span className={shell.fieldLabel}>{t("annotation.savedArrowStyles")}</span>
				<select
					className={shell.control}
					value={selected}
					disabled={busy}
					onChange={(e) => {
						const preset = presets.find((p) => p.id === e.target.value);
						setSelected(e.target.value);
						if (preset) {
							apply(preset.style);
							setName(preset.name);
						}
					}}
				>
					<option value="">{t("annotation.chooseArrowStyle")}</option>
					{presets.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</label>
			<input
				className={shell.control}
				aria-label={t("annotation.arrowStyleName")}
				placeholder={t("annotation.arrowStyleName")}
				maxLength={80}
				value={name}
				disabled={busy}
				onChange={(e) => setName(e.target.value)}
			/>
			<div className={styles.actions}>
				<button
					className={styles.button}
					type="button"
					disabled={busy || !name.trim()}
					onClick={() => {
						const existing = presets.find(
							(p) => p.name.toLowerCase() === name.trim().toLowerCase(),
						);
						const entry: ArrowStylePreset = {
							id: existing?.id ?? crypto.randomUUID(),
							name: name.trim(),
							style: arrowStyle(figure),
						};
						const next = [...presets.filter((p) => p.id !== entry.id), entry];
						try {
							if (next.length > 20) throw new Error("style limit");
							saveArrowStyles(next);
							rememberArrowStyle(entry.style);
							setPresets(next);
							setSelected(entry.id);
						} catch {
							toast.error(t("annotation.arrowStyleSaveError"));
						}
					}}
				>
					{t("annotation.saveArrowStyle")}
				</button>
				{selected && (
					<button
						className={styles.button}
						type="button"
						disabled={busy}
						onClick={() => {
							const next = presets.filter((p) => p.id !== selected);
							try {
								saveArrowStyles(next);
								setPresets(next);
								setSelected("");
								setName("");
							} catch {
								toast.error(t("annotation.arrowStyleSaveError"));
							}
						}}
					>
						{t("annotation.deleteArrowStyle")}
					</button>
				)}
			</div>
			<details>
				<summary>{t("annotation.svgGraphicTitle")}</summary>
				<p className={styles.hint}>{t("annotation.svgGraphicHint")}</p>
				<button
					type="button"
					className={styles.button}
					disabled={busy}
					onClick={() => graphicFile.current?.click()}
				>
					{t("annotation.importWholeSvg")}
				</button>
			</details>
			<input
				hidden
				ref={graphicFile}
				type="file"
				accept="image/svg+xml,.svg"
				aria-label={t("annotation.importWholeSvg")}
				disabled={busy}
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					void upload(file, true);
				}}
			/>
		</div>
	);
}
