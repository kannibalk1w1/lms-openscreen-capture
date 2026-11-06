import { useScopedT } from "@/contexts/I18nContext";
import type { AxcutAsset } from "@/lib/ai-edition/schema";
/** Receipt association is separate from whether media has been redacted or reviewed. */
export function CapturePrivacyNotice({ asset }: { asset: AxcutAsset }) {
	const t = useScopedT("editor");
	if (asset.kind !== "video") return null;
	const inspection = asset.capturePrivacy;
	return (
		<section
			aria-label={t("capturePrivacy.title")}
			style={{
				marginBottom: 16,
				padding: 10,
				border: "1px solid var(--border)",
				borderRadius: 8,
				fontSize: 12,
			}}
		>
			<strong>{t("capturePrivacy.title")}</strong>
			<p>{t(`capturePrivacy.${inspection?.status ?? "missing"}`)}</p>
			{inspection?.recoveredFrom && (
				<p>
					{t("capturePrivacy.recovered")} {t(`capturePrivacy.${inspection.recoveredFrom}`)}
				</p>
			)}
			{inspection?.receipt && (
				<p>
					{t("capturePrivacy.policyAtStart")}{" "}
					{t(`capturePrivacy.scope_${inspection.receipt.policy.buttonScope}`)}
				</p>
			)}
			<p>{t("capturePrivacy.limit")}</p>
		</section>
	);
}
