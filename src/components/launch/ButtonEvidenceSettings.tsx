import { useEffect, useId, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type CapturePrivacyPolicy,
	disabledCapturePrivacyPolicy,
	normalizeCapturePrivacyPolicy,
} from "@/lib/capturePrivacy";
import styles from "./LaunchWindow.module.css";

/** Explicit native button consent; source video and optional adapters are independent. */
export function ButtonEvidenceSettings() {
	const t = useScopedT("launch");
	const id = useId();
	const [policy, setPolicy] = useState(disabledCapturePrivacyPolicy);
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const [allowed, setAllowed] = useState("");
	const [excluded, setExcluded] = useState("");
	useEffect(() => {
		let disposed = false;
		let newer = false;
		const apply = (value: unknown) => {
			if (disposed) return;
			const next = normalizeCapturePrivacyPolicy(value);
			setPolicy(next);
			setAllowed(next.allowedApplications.join("\n"));
			setExcluded(next.excludedApplications.join("\n"));
			setReady(true);
		};
		const stop = window.electronAPI?.onRecordingPrefsChanged?.((prefs) => {
			newer = true;
			apply(prefs.capturePrivacyPolicy);
		});
		void Promise.resolve(window.electronAPI?.getRecordingPrefs?.())
			.then((prefs) => {
				if (!newer) apply(prefs?.capturePrivacyPolicy);
			})
			.catch(() => {
				if (!disposed) setError(true);
			});
		return () => {
			disposed = true;
			stop?.();
		};
	}, []);
	const save = async (next: CapturePrivacyPolicy) => {
		setBusy(true);
		setError(false);
		try {
			const saved = await window.electronAPI.setRecordingPrefs({ capturePrivacyPolicy: next });
			setPolicy(normalizeCapturePrivacyPolicy(saved.capturePrivacyPolicy));
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	};
	const identifiers = (value: string) =>
		value
			.split("\n")
			.map((entry) => entry.trim())
			.filter(Boolean);
	return (
		<div
			role="group"
			aria-labelledby={`${id}-label`}
			className={`${styles.hudNotice} w-full p-3 text-white`}
		>
			<label id={`${id}-label`} htmlFor={`${id}-scope`} className="text-sm font-semibold">
				{t("buttonPrivacy.title")}
			</label>
			<select
				id={`${id}-scope`}
				value={ready ? policy.buttonScope : "pending"}
				disabled={!ready || busy}
				className="mt-2 w-full rounded bg-zinc-800 p-2 text-sm"
				onChange={(event) =>
					void save({
						...policy,
						buttonScope: event.target.value as CapturePrivacyPolicy["buttonScope"],
					})
				}
			>
				{!ready && (
					<option value="pending">
						{t(error ? "buttonPrivacy.unavailableSettings" : "buttonPrivacy.loading")}
					</option>
				)}
				<option value="off">{t("buttonPrivacy.off")}</option>
				<option value="global">{t("buttonPrivacy.global")}</option>
				<option value="applications">{t("buttonPrivacy.applications")}</option>
			</select>
			<p className="mt-2 text-xs text-white/75">{t("buttonPrivacy.description")}</p>
			{policy.buttonScope !== "off" && (
				<>
					{policy.buttonScope === "applications" && (
						<>
							<label htmlFor={`${id}-allowed`} className="mt-2 block text-xs">
								{t("buttonPrivacy.allowed")}
							</label>
							<textarea
								id={`${id}-allowed`}
								rows={2}
								maxLength={8192}
								disabled={busy}
								value={allowed}
								onChange={(event) => setAllowed(event.target.value)}
								className="mt-1 w-full rounded bg-zinc-800 p-2 text-xs"
							/>
						</>
					)}
					<label htmlFor={`${id}-excluded`} className="mt-2 block text-xs">
						{t("buttonPrivacy.excluded")}
					</label>
					<textarea
						id={`${id}-excluded`}
						rows={2}
						maxLength={8192}
						disabled={busy}
						value={excluded}
						onChange={(event) => setExcluded(event.target.value)}
						className="mt-1 w-full rounded bg-zinc-800 p-2 text-xs"
					/>
					<button
						type="button"
						disabled={busy}
						onClick={() =>
							void save({
								...policy,
								allowedApplications: identifiers(allowed),
								excludedApplications: identifiers(excluded),
							})
						}
						className="mt-2 rounded bg-zinc-700 px-3 py-2 text-xs"
					>
						{t("buttonPrivacy.saveRules")}
					</button>
				</>
			)}
			{(policy.buttonScope === "applications" || policy.excludedApplications.length > 0) && (
				<p role="status" className="mt-2 text-xs text-amber-200">
					{t("buttonPrivacy.unsupported")}
				</p>
			)}
			{error && (
				<p role="alert" className="mt-2 text-xs text-amber-200">
					{t("buttonPrivacy.error")}
				</p>
			)}
		</div>
	);
}
