import { useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { IntegrationSnapshot } from "../../../../electron/integrations/applicationIntegrationService";

/** A functional control for the current selected-file decoder; never claims a live connection. */
export function ApplicationIntegrationSettings() {
	const t = useScopedT("timeline");
	const [snapshot, setSnapshot] = useState<IntegrationSnapshot | null>(null);
	const [ready, setReady] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(false);
	useEffect(() => {
		let disposed = false,
			newer = false;
		const stop = window.electronAPI?.onApplicationIntegrationsChanged?.((value) => {
			newer = true;
			if (!disposed) {
				setSnapshot(value);
				setReady(true);
			}
		});
		void Promise.resolve(window.electronAPI?.getApplicationIntegrations?.())
			.then((value) => {
				if (!disposed && !newer) {
					setSnapshot(value ?? null);
					setReady(true);
				}
			})
			.catch(() => {
				if (!disposed) {
					setError(true);
					setReady(true);
				}
			});
		return () => {
			disposed = true;
			stop?.();
		};
	}, []);
	const godot = snapshot?.statuses.find((status) => status.descriptor.id === "godot-codeedit");
	return (
		<section
			aria-label={t("typing.integrations.title")}
			style={{ border: "1px solid var(--border)", padding: 12, borderRadius: 8, marginBottom: 12 }}
		>
			<strong>{t("typing.integrations.title")}</strong>
			<p>{t("typing.integrations.scope")}</p>
			<label style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<input
					type="checkbox"
					checked={godot?.enabled ?? false}
					disabled={!ready || busy || !godot || !window.electronAPI?.setApplicationIntegrations}
					onChange={async (event) => {
						const enabled = event.target.checked;
						setBusy(true);
						setError(false);
						try {
							const result = await window.electronAPI.setApplicationIntegrations?.({
								version: 1,
								enabledAdapterIds: enabled ? ["godot-codeedit"] : [],
							});
							if (!result) throw new Error("unavailable");
							setSnapshot(result);
							if (!result.success) setError(true);
						} catch {
							setError(true);
						} finally {
							setBusy(false);
						}
					}}
				/>
				{t("typing.integrations.godot")}
			</label>
			<p role="status">
				{t(
					`typing.integrations.${!ready ? "loading" : godot?.state === "error" ? "failed" : (godot?.state ?? "unavailable")}`,
				)}
			</p>
			<p>{t("typing.integrations.capability")}</p>
			{(error || snapshot?.saveFailed) && <p role="alert">{t("typing.integrations.error")}</p>}
		</section>
	);
}
