import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { RecordingFlagStatus } from "@/lib/recordingFlags";
import { formatBinding } from "@/lib/shortcuts";
import { isMac } from "@/utils/platformUtils";
import styles from "./LaunchWindow.module.css";

export function RecordingFlagControl({ disabled }: { disabled: boolean }) {
	const t = useScopedT("launch");
	const [status, setStatus] = useState<RecordingFlagStatus | null>(null);
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const next = await window.electronAPI?.getRecordingFlagsStatus?.();
				if (!disposed) setStatus(next ?? null);
			} catch {
				if (!disposed) setStatus(null);
			} finally {
				if (!disposed) timer = setTimeout(poll, 300);
			}
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, []);
	const key = status ? formatBinding(status.shortcut, isMac()) : "";
	return (
		<button
			type="button"
			className={`${styles.electronNoDrag} flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs text-amber-300 hover:bg-white/10 disabled:opacity-40`}
			disabled={disabled || !status?.running || status.paused}
			aria-label={t("flags.add")}
			title={
				status?.error === "shortcut-approval-pending"
					? t("flags.approvalPending", { key })
					: status?.shortcutAvailable
						? t("flags.shortcut", { key })
						: t("flags.unavailable")
			}
			onClick={() => {
				void window.electronAPI
					.addRecordingFlag()
					.then(setStatus)
					.catch(() => setStatus(null));
			}}
		>
			<Flag size={16} fill="currentColor" />
			<span role="status" aria-live="polite">
				{status?.count ?? 0}
			</span>
			{status && !status.shortcutAvailable && (
				<span>
					{t(status.error === "shortcut-approval-pending" ? "flags.requested" : "flags.noHotkey")}
				</span>
			)}
		</button>
	);
}
