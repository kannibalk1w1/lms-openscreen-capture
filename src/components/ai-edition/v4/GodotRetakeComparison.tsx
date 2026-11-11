import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type GodotSceneCheckpoint,
	listGodotSceneCheckpoints,
	MAX_SCENE_JOURNAL_BYTES,
} from "@/lib/applicationIntegrations/godotScene";
import {
	compareGodotCheckpointToReference,
	type GodotReferenceComparison,
} from "@/lib/applicationIntegrations/godotSceneReference";

type Replacement = {
	name: string;
	text: string;
	sha256: string;
	checkpoints: GodotSceneCheckpoint[];
};

/** SHA-256 of the exact file bytes (what `sha256sum` reports). */
export async function bytesSha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Advisory, read-only retake review: compares one authored checkpoint of the ORIGINAL raw
 * Godot journal with one checkpoint of an explicitly chosen REPLACEMENT raw journal.
 * Nothing in the lesson, its steps, media or timeline is changed; results are cleared on any
 * selection change. This is not grading, completion or restore.
 */
export function GodotRetakeComparison({
	originalText,
	originalSha256,
	originalCheckpoints,
}: {
	/** Deterministic decoding of the original file bytes hashed as `originalSha256`. */
	originalText: string;
	originalSha256: string;
	originalCheckpoints: GodotSceneCheckpoint[];
}) {
	const t = useScopedT("timeline");
	const [originalSequence, setOriginalSequence] = useState("");
	const [replacement, setReplacement] = useState<Replacement | null>(null);
	const [replacementSequence, setReplacementSequence] = useState("");
	const [result, setResult] = useState<GodotReferenceComparison | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const epoch = useRef(0);
	// A different original resets everything, including any pending replacement read.
	useEffect(() => {
		void originalText;
		setOriginalSequence("");
		setReplacement(null);
		setReplacementSequence("");
		setResult(null);
		setError("");
		setBusy(false);
		return () => {
			epoch.current++;
		};
	}, [originalText]);

	const clear = () => {
		setResult(null);
		setError("");
	};

	async function choose(file?: File) {
		if (!file) return;
		const current = ++epoch.current;
		setBusy(true);
		setReplacement(null);
		setReplacementSequence("");
		clear();
		try {
			if (file.size > MAX_SCENE_JOURNAL_BYTES) throw new Error("limit");
			const bytes = new Uint8Array(await file.arrayBuffer());
			const text = new TextDecoder().decode(bytes);
			const checkpoints = listGodotSceneCheckpoints(text);
			if (!checkpoints.length) throw new Error("no checkpoints");
			const digest = await bytesSha256(bytes);
			if (current !== epoch.current) return;
			setReplacement({ name: file.name, text, sha256: digest, checkpoints });
		} catch {
			if (current === epoch.current) setError(t("lesson.retake.invalid"));
		} finally {
			if (current === epoch.current) setBusy(false);
		}
	}

	function compare() {
		if (!replacement || originalSequence === "" || replacementSequence === "" || busy) return;
		clear();
		try {
			setResult(
				compareGodotCheckpointToReference(
					originalText,
					Number(originalSequence),
					replacement.text,
					Number(replacementSequence),
				),
			);
		} catch {
			setError(t("lesson.retake.failed"));
		}
	}

	const option = (checkpoint: GodotSceneCheckpoint) =>
		`${checkpoint.label} · record #${checkpoint.recordSequence} · ${checkpoint.atMs} ms`;
	const path = (value: string[]) => (value.length ? value.join(" / ") : t("lesson.retake.root"));
	const source = (side: GodotReferenceComparison["reference"], digest: string) =>
		t("lesson.retake.source", {
			label: side.checkpoint.label,
			scene: side.scene,
			version: side.schemaVersion,
			session: side.sessionId.slice(-8),
			coverage: side.coverage,
			sha: digest.slice(0, 12),
		});
	const canCompare =
		!!replacement && originalSequence !== "" && replacementSequence !== "" && !busy;

	return (
		<details>
			<summary>{t("lesson.retake.title")}</summary>
			<p>{t("lesson.retake.scope")}</p>
			<label>
				{t("lesson.retake.original")}
				<select
					aria-label={t("lesson.retake.original")}
					value={originalSequence}
					onChange={(event) => {
						setOriginalSequence(event.target.value);
						clear();
					}}
				>
					<option value="">{t("lesson.checkpoints.choose")}</option>
					{originalCheckpoints.map((checkpoint) => (
						<option key={checkpoint.recordSequence} value={checkpoint.recordSequence}>
							{option(checkpoint)}
						</option>
					))}
				</select>
			</label>
			<label>
				{t("lesson.retake.choose")}
				<input
					type="file"
					accept=".jsonl,.ndjson"
					disabled={busy}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						void choose(file);
					}}
				/>
			</label>
			{replacement && (
				<label>
					{t("lesson.retake.replacement", { name: replacement.name })}
					<select
						aria-label={t("lesson.retake.replacementCheckpointFor", { name: replacement.name })}
						value={replacementSequence}
						onChange={(event) => {
							setReplacementSequence(event.target.value);
							clear();
						}}
					>
						<option value="">{t("lesson.checkpoints.choose")}</option>
						{replacement.checkpoints.map((checkpoint) => (
							<option key={checkpoint.recordSequence} value={checkpoint.recordSequence}>
								{option(checkpoint)}
							</option>
						))}
					</select>
				</label>
			)}
			<button type="button" disabled={!canCompare} onClick={compare}>
				{t("lesson.retake.compare")}
			</button>
			<p role="status" aria-live="polite">
				{busy ? t("lesson.retake.loading") : ""}
			</p>
			{error && <p role="alert">{error}</p>}
			{result && replacement && (
				<section aria-label={t("lesson.retake.result")} aria-live="polite">
					<p>{t(`lesson.retake.outcome.${result.outcome}`)}</p>
					<p>{t("lesson.retake.policy")}</p>
					{result.relation.sameTake && <p role="note">{t("lesson.retake.sameTake")}</p>}
					{result.unknowns.length > 0 && (
						<ul aria-label={t("lesson.retake.unknowns")}>
							{result.unknowns.map((unknown) => (
								<li key={unknown}>{t(`lesson.retake.unknown.${unknown}`)}</li>
							))}
						</ul>
					)}
					<p>{source(result.reference, originalSha256)}</p>
					<p>{source(result.candidate, replacement.sha256)}</p>
					<p>
						{t("lesson.retake.counts", {
							matched: result.counts.matched,
							partial: result.counts.partiallyCompared,
							differing: result.counts.differing,
							originalOnly: result.counts.referenceOnly,
							replacementOnly: result.counts.candidateOnly,
						})}
					</p>
					{result.connections.status !== "unobserved" && (
						<p>
							{t("lesson.retake.connectionCounts", {
								originalOnly: result.counts.connectionsReferenceOnly,
								replacementOnly: result.counts.connectionsCandidateOnly,
							})}
						</p>
					)}
					{result.truncated.length > 0 && (
						<p role="note">
							{t("lesson.retake.truncated", {
								lists: result.truncated.map((name) => t(`lesson.retake.list.${name}`)).join(", "),
							})}
						</p>
					)}
					<div
						style={{
							maxHeight: 280,
							overflowY: "auto",
							whiteSpace: "pre-wrap",
							overflowWrap: "anywhere",
						}}
					>
						{result.differing.length > 0 && (
							<section>
								<h4>{t("lesson.retake.differing")}</h4>
								<ul>
									{result.differing.map((row) => (
										<li key={JSON.stringify(row.path)}>
											{row.unobservedFields?.length
												? t("lesson.retake.differingRowPartial", {
														path: path(row.path),
														fields: row.fields.join(", "),
														unobserved: row.unobservedFields.join(", "),
													})
												: t("lesson.retake.differingRow", {
														path: path(row.path),
														fields: row.fields.join(", "),
													})}
										</li>
									))}
								</ul>
							</section>
						)}
						{result.referenceOnly.length > 0 && (
							<section>
								<h4>{t("lesson.retake.originalOnly")}</h4>
								<ul>
									{result.referenceOnly.map((row) => (
										<li key={JSON.stringify(row.path)}>{`${path(row.path)} (${row.type})`}</li>
									))}
								</ul>
							</section>
						)}
						{result.candidateOnly.length > 0 && (
							<section>
								<h4>{t("lesson.retake.replacementOnly")}</h4>
								<ul>
									{result.candidateOnly.map((row) => (
										<li key={JSON.stringify(row.path)}>{`${path(row.path)} (${row.type})`}</li>
									))}
								</ul>
							</section>
						)}
						{result.partiallyCompared.length > 0 && (
							<section>
								<h4>{t("lesson.retake.partial")}</h4>
								<ul>
									{result.partiallyCompared.map((row) => (
										<li key={JSON.stringify(row.path)}>
											{t("lesson.retake.differingRow", {
												path: path(row.path),
												fields: row.unobservedFields.join(", "),
											})}
										</li>
									))}
								</ul>
							</section>
						)}
						{result.connections.status !== "unobserved" &&
							result.connections.referenceOnly.length + result.connections.candidateOnly.length >
								0 && (
								<section>
									<h4>{t("lesson.retake.connections")}</h4>
									<ul>
										{[
											...result.connections.referenceOnly.map((row) => ({ row, side: "original" })),
											...result.connections.candidateOnly.map((row) => ({
												row,
												side: "replacement",
											})),
										].map(({ row, side }) => (
											<li key={`${side}:${JSON.stringify(row)}`}>
												{t(`lesson.retake.connection.${side}`, {
													from: path(row.from),
													signal: row.signal,
													to: path(row.to),
													method: row.method,
												})}
											</li>
										))}
									</ul>
								</section>
							)}
					</div>
				</section>
			)}
		</details>
	);
}
