import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { InputCaptureHealth } from "@/native/captureEvents";
import styles from "./LaunchWindow.module.css";

/** Mounted only during Linux recording, inside the HUD's measured notice stack. */
export function InputCaptureNotice() {
	const t = useScopedT("launch");
	const [suppressing, setSuppressing] = useState(false);
	const [suppressError, setSuppressError] = useState(false);
	const [health, setHealth] = useState<InputCaptureHealth | null>(null);
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const next = await window.electronAPI.getInputCaptureHealth();
				if (!disposed) setHealth(next);
			} catch {
				if (!disposed) setHealth(null);
			}
			if (!disposed) timer = setTimeout(poll, 500);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, []);
	const state = health?.state ?? "unknown";
	return (
		<div role="status" aria-live="polite" className={`${styles.hudNotice} w-full p-3 text-white`}>
			<div className="text-sm font-semibold">{t(`inputCapture.${state}`)}</div>
			<div className="mt-1 text-xs text-white/75">
				{!health
					? t("buttonPrivacy.unavailableStatus")
					: health.scope === "global-compositor-buttons"
						? t("inputCapture.compositorScope")
						: t("inputCapture.physicalScope")}
			</div>
			{health?.privacy?.reason === "application-unknown" && (
				<p className="mt-2 text-xs text-amber-200">{t("buttonPrivacy.unknown")}</p>
			)}
			{health?.privacy?.reason === "suppressed" && (
				<p className="mt-2 text-xs">{t("buttonPrivacy.suppressed")}</p>
			)}
			{health?.privacy?.allowed && (
				<button
					type="button"
					disabled={suppressing}
					className="mt-2 rounded bg-zinc-700 px-3 py-2 text-xs"
					onClick={async () => {
						setSuppressing(true);
						setSuppressError(false);
						try {
							const result = await window.electronAPI.suppressNativeButtonEvidence();
							if (!result.success) throw new Error("Suppression was not accepted");
							setHealth(await window.electronAPI.getInputCaptureHealth());
						} catch {
							setSuppressError(true);
						} finally {
							setSuppressing(false);
						}
					}}
				>
					{t("buttonPrivacy.suppress")}
				</button>
			)}
			{suppressError && (
				<p role="alert" className="mt-2 text-xs text-amber-200">
					{t("buttonPrivacy.error")}
				</p>
			)}
			{health?.warning && <div className="mt-1 text-xs text-amber-200">{health.warning}</div>}
		</div>
	);
}
