import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { InputCaptureHealth } from "@/native/captureEvents";
import styles from "./LaunchWindow.module.css";

/** Mounted only during Linux recording, inside the HUD's measured notice stack. */
export function InputCaptureNotice() {
	const t = useScopedT("launch");
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
				{health?.scope === "global-compositor-buttons"
					? t("inputCapture.compositorScope")
					: t("inputCapture.physicalScope")}
			</div>
			{health?.warning && <div className="mt-1 text-xs text-amber-200">{health.warning}</div>}
		</div>
	);
}
