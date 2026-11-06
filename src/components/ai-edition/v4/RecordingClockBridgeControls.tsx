import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type ClockJournalSummary, inspectClockJournal } from "@/lib/clockBridge/journal";
import type { ClockBridgeStatus } from "@/lib/clockBridge/schema";
export function RecordingClockBridgeControls({ projectId }: { projectId?: string | null }) {
	const t = useScopedT("timeline");
	const [inspection, setInspection] = useState<ClockJournalSummary | null>(null),
		[inspectionError, setInspectionError] = useState(false);
	const epoch = useRef({ projectId });
	useEffect(() => {
		epoch.current = { projectId };
		setInspection(null);
		return () => {
			epoch.current = { projectId };
		};
	}, [projectId]);
	const [status, setStatus] = useState<ClockBridgeStatus | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(false),
		[helperError, setHelperError] = useState(false);
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const value = await window.electronAPI?.getRecordingClockBridge?.();
				if (!disposed) setStatus(value ?? null);
			} catch {
				if (!disposed) setStatus(null);
			}
			if (!disposed) timer = setTimeout(poll, 500);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, []);
	return (
		<section
			aria-label={t("typing.clockBridge.title")}
			style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 8, marginBottom: 12 }}
		>
			<strong>{t("typing.clockBridge.title")}</strong>
			<p>{t("typing.clockBridge.scope")}</p>
			<p role="status">
				{t(`typing.clockBridge.${status?.available ? status.state : "unavailable"}`)}
			</p>
			{status?.projectLabel && (
				<p>
					{t("typing.clockBridge.project")} {status.projectLabel}
				</p>
			)}
			{status?.pairFilePath && (
				<p>
					{t("typing.clockBridge.link")}{" "}
					<code style={{ overflowWrap: "anywhere" }}>{status.pairFilePath}</code>
				</p>
			)}
			<button
				type="button"
				disabled={busy || !status?.available || !window.electronAPI?.createRecordingClockPair}
				onClick={async () => {
					setBusy(true);
					setError(false);
					setHelperError(false);
					try {
						const result = await window.electronAPI?.createRecordingClockPair?.();
						if (result) {
							setStatus(result.status);
							if (!result.success && result.code !== "cancelled") {
								if (result.code === "clock-helper-unavailable") setHelperError(true);
								else setError(true);
							}
						}
					} catch {
						setError(true);
					} finally {
						setBusy(false);
					}
				}}
			>
				{t("typing.clockBridge.pair")}
			</button>
			{status &&
				status.state !== "disabled" &&
				status.state !== "expired" &&
				status.state !== "ended" && (
					<button
						type="button"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								const value = await window.electronAPI?.stopRecordingClockBridge?.();
								if (value) setStatus(value);
							} catch {
								setError(true);
							} finally {
								setBusy(false);
							}
						}}
					>
						{t("typing.clockBridge.stop")}
					</button>
				)}
			<label>
				{t("typing.clockBridge.inspect")}{" "}
				<input
					type="file"
					accept=".jsonl,.ndjson"
					onChange={async (event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						const current = epoch.current;
						setInspectionError(false);
						try {
							if (file.size > 8 * 1024 * 1024) throw new Error("limit");
							const value = inspectClockJournal(await file.text());
							if (epoch.current === current) setInspection(value);
						} catch {
							if (epoch.current === current) {
								setInspection(null);
								setInspectionError(true);
							}
						}
					}}
				/>
			</label>
			{inspection && (
				<p>
					{t("typing.clockBridge.inspection", {
						samples: inspection.samples,
						gaps: inspection.gaps,
						paused: inspection.pausedSamples,
						rtt: inspection.maxRoundTripMs,
					})}{" "}
					{t(inspection.closed ? "typing.clockBridge.closed" : "typing.clockBridge.unclosed")}
				</p>
			)}
			{inspectionError && <p role="alert">{t("typing.clockBridge.inspectError")}</p>}
			{helperError && <p role="alert">{t("typing.clockBridge.helperError")}</p>}
			{error && <p role="alert">{t("typing.clockBridge.error")}</p>}
		</section>
	);
}
