import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import { getEditorSettings } from "@/lib/ai-edition/store/editorSettings";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { useEditorSettings } from "@/lib/ai-edition/store/useEditorSettings";
import { DEFAULT_CURSOR_SPRITES } from "@/lib/cursor/cursorThemes";
import { importCustomCursor } from "@/lib/cursor/customCursors";
import type { NativeCursorType } from "@/native/contracts";
import cursorStyles from "./CustomCursorControls.module.css";
import styles from "./NewEditorShell.module.css";

export function CustomCursorControls() {
	const t = useScopedT("settings");
	const { settings, set, setLive, commit, hasDocument } = useEditorSettings();
	const [type, setType] = useState<NativeCursorType>("arrow");
	const [busy, setBusy] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const custom = settings.cursorCustom[type];
	return (
		<div className={cursorStyles.controls}>
			<label className={cursorStyles.stateField}>
				<span className={styles.fieldLabel}>{t("cursor.customState")}</span>
				<select
					className={`${styles.control} ${cursorStyles.select}`}
					aria-label={t("cursor.customState")}
					value={type}
					disabled={!hasDocument || busy}
					onChange={(e) => setType(e.target.value as NativeCursorType)}
				>
					{Object.keys(DEFAULT_CURSOR_SPRITES).map((key) => (
						<option key={key} value={key}>
							{t(`cursor.customTypes.${key}`)}
						</option>
					))}
				</select>
			</label>
			<button
				type="button"
				className={cursorStyles.button}
				disabled={!hasDocument || busy}
				onClick={() => fileInput.current?.click()}
			>
				<Upload size={14} aria-hidden="true" />
				<span>{busy ? t("cursor.customLoading") : t("cursor.customImport")}</span>
			</button>
			<input
				ref={fileInput}
				hidden
				type="file"
				accept="image/png,.png"
				aria-label={t("cursor.customImport")}
				disabled={!hasDocument || busy}
				onChange={async (event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (!file) return;
					const originalDocument = useProjectStore.getState().document;
					setBusy(true);
					try {
						const image = await importCustomCursor(file);
						const current = useProjectStore.getState().document;
						if (current !== originalDocument || !current)
							throw new Error("document changed during import");
						await set({
							cursorCustom: { ...getEditorSettings(current).cursorCustom, [type]: image },
						});
					} catch {
						toast.error(t("cursor.customError"));
					} finally {
						setBusy(false);
					}
				}}
			/>
			{custom && (
				<>
					<p className={cursorStyles.hotspotLabel}>{t("cursor.customHotspot")}</p>
					<button
						type="button"
						aria-label={t("cursor.customHotspot")}
						title={t("cursor.customHotspotHint")}
						disabled={!hasDocument || busy}
						className={cursorStyles.hotspotPreview}
						onClick={(event) => {
							const rect = event.currentTarget.getBoundingClientRect();
							void set({
								cursorCustom: {
									...settings.cursorCustom,
									[type]: {
										...custom,
										hotspotX: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
										hotspotY: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
									},
								},
							});
						}}
					>
						<img
							src={custom.dataUrl}
							alt=""
							style={{ width: "100%", height: "100%" }}
							draggable={false}
						/>
						<span
							style={{
								position: "absolute",
								left: `${custom.hotspotX * 100}%`,
								top: `${custom.hotspotY * 100}%`,
								transform: "translate(-50%, -50%)",
								color: "#ffcc00",
								fontSize: 20,
								lineHeight: 1,
							}}
						>
							+
						</span>
					</button>
					{(["hotspotX", "hotspotY"] as const).map((axis) => (
						<label key={axis} className={cursorStyles.hotspotField}>
							{t(`cursor.custom${axis === "hotspotX" ? "X" : "Y"}`)}
							<input
								type="range"
								onPointerUp={() => void commit()}
								onKeyUp={() => void commit()}
								onBlur={() => void commit()}
								min={0}
								max={100}
								step={1}
								value={custom[axis] * 100}
								disabled={!hasDocument || busy}
								onChange={(event) =>
									setLive({
										cursorCustom: {
											...settings.cursorCustom,
											[type]: { ...custom, [axis]: Number(event.target.value) / 100 },
										},
									})
								}
							/>
						</label>
					))}
					<button
						type="button"
						className={cursorStyles.button}
						disabled={!hasDocument || busy}
						onClick={() => {
							const next = { ...settings.cursorCustom };
							delete next[type];
							void set({ cursorCustom: next });
						}}
					>
						{t("cursor.customRemove")}
					</button>
				</>
			)}
		</div>
	);
}
