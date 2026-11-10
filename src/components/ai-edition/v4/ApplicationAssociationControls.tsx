import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type ApplicationAssociation,
	type ApplicationAssociationSpan,
	createApplicationAssociation,
} from "@/lib/applicationIntegrations/association";
import type { ApplicationCapture } from "@/lib/applicationIntegrations/capture";
import type { RecordingClock } from "@/lib/recordingFlags";

export type ApplicationAssociationSource = {
	id: string;
	label: string;
	clock: RecordingClock;
};

export type ApplicationAssociationSelection = {
	sourceId: string;
	plan: ApplicationAssociation;
};

type TimeFields = {
	applicationStart: string;
	applicationEnd: string;
	recordingStart: string;
	recordingEnd: string;
};

const emptyTimes: TimeFields = {
	applicationStart: "",
	applicationEnd: "",
	recordingStart: "",
	recordingEnd: "",
};

function parseSeconds(value: string): number | null {
	if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) return null;
	const [whole, fraction = ""] = value.split(".");
	const milliseconds = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
	return milliseconds <= 86400000 ? milliseconds : null;
}

function contextKey(source: ApplicationAssociationSource | undefined): string {
	return source ? JSON.stringify([source.id, source.clock]) : "";
}

export function ApplicationAssociationControls({
	capture,
	sources,
	onPlan,
}: {
	capture: ApplicationCapture;
	sources: ApplicationAssociationSource[];
	onPlan: (selection: ApplicationAssociationSelection | null) => void;
}) {
	const t = useScopedT("timeline");
	const [sourceId, setSourceId] = useState("");
	const [segmentId, setSegmentId] = useState("");
	const [times, setTimes] = useState<TimeFields>(emptyTimes);
	const [spans, setSpans] = useState<ApplicationAssociationSpan[]>([]);
	const [plan, setPlan] = useState<ApplicationAssociation | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const generation = useRef(0);
	const hasPublishedPlan = useRef(false);
	const selectedSource = sources.find((source) => source.id === sourceId);
	const selectedContextKey = contextKey(selectedSource);
	const currentContext = useRef({ capture, selectedContextKey });
	currentContext.current = { capture, selectedContextKey };
	const previousContext = useRef({ capture, selectedContextKey });
	const onPlanRef = useRef(onPlan);
	onPlanRef.current = onPlan;

	useEffect(() => {
		const previous = previousContext.current;
		if (previous.capture !== capture || previous.selectedContextKey !== selectedContextKey) {
			generation.current++;
			setBusy(false);
			if (sourceId && !selectedContextKey) setSourceId("");
			setSegmentId("");
			setTimes(emptyTimes);
			setSpans([]);
			setPlan(null);
			setError("");
			if (hasPublishedPlan.current) onPlanRef.current(null);
			hasPublishedPlan.current = false;
		}
		previousContext.current = { capture, selectedContextKey };
	}, [capture, selectedContextKey, sourceId]);
	useEffect(
		() => () => {
			generation.current++;
		},
		[],
	);

	function changeSource(nextId: string) {
		generation.current++;
		setBusy(false);
		setSourceId(nextId);
		setSegmentId("");
		setTimes(emptyTimes);
		setSpans([]);
		setPlan(null);
		setError("");
		onPlan(null);
		hasPublishedPlan.current = false;
	}

	async function saveSpans(nextSpans: ApplicationAssociationSpan[]) {
		if (!selectedSource) {
			setError(t("lesson.association.selectSource"));
			return;
		}
		const operation = ++generation.current;
		const operationCapture = capture;
		const operationContextKey = selectedContextKey;
		const operationSourceId = selectedSource.id;
		setBusy(true);
		setError("");
		try {
			const nextPlan = await createApplicationAssociation(
				operationCapture,
				selectedSource.clock,
				nextSpans,
			);
			if (
				generation.current !== operation ||
				currentContext.current.capture !== operationCapture ||
				currentContext.current.selectedContextKey !== operationContextKey
			)
				return;
			setSpans(nextSpans);
			setPlan(nextPlan);
			hasPublishedPlan.current = true;
			onPlanRef.current({ sourceId: operationSourceId, plan: nextPlan });
		} catch {
			if (generation.current === operation) setError(t("lesson.association.invalid"));
		} finally {
			if (generation.current === operation) setBusy(false);
		}
	}

	async function addRange() {
		if (spans.length >= 128) {
			setError(t("lesson.association.limit"));
			return;
		}
		const applicationStartMs = parseSeconds(times.applicationStart);
		const applicationEndMs = parseSeconds(times.applicationEnd);
		const recordingStartMs = parseSeconds(times.recordingStart);
		const recordingEndMs = parseSeconds(times.recordingEnd);
		if (
			applicationStartMs === null ||
			applicationEndMs === null ||
			recordingStartMs === null ||
			recordingEndMs === null
		) {
			setError(t("lesson.association.invalidTime"));
			return;
		}
		if (applicationEndMs <= applicationStartMs || recordingEndMs <= recordingStartMs) {
			setError(t("lesson.association.invalidRange"));
			return;
		}
		if (!selectedSource) {
			setError(t("lesson.association.selectSource"));
			return;
		}
		if (!segmentId) {
			setError(t("lesson.association.selectSegment"));
			return;
		}
		const nextSpan: ApplicationAssociationSpan = {
			id: crypto.randomUUID(),
			segmentId,
			applicationStartMs,
			applicationEndMs,
			recordingStartMs,
			recordingEndMs,
		};
		await saveSpans(
			[...spans, nextSpan].sort(
				(left, right) => left.applicationStartMs - right.applicationStartMs,
			),
		);
	}

	function clearAssociation() {
		generation.current++;
		setBusy(false);
		setSpans([]);
		setPlan(null);
		setError("");
		onPlan(null);
		hasPublishedPlan.current = false;
	}

	function removeRange(index: number) {
		const nextSpans = spans.filter((_, item) => item !== index);
		if (nextSpans.length === 0) clearAssociation();
		else void saveSpans(nextSpans);
	}

	return (
		<details>
			<summary>{t("lesson.association.title")}</summary>
			<p>{t("lesson.association.scope")}</p>
			<p>{t("lesson.association.clockNote")}</p>
			{sources.length === 0 && <p>{t("lesson.association.noSources")}</p>}
			<fieldset disabled={busy} style={{ display: "grid", gap: 10, border: 0, padding: 0 }}>
				<label>
					{t("lesson.association.source")}
					<select
						aria-label={t("lesson.association.source")}
						value={sourceId}
						onChange={(event) => changeSource(event.target.value)}
					>
						<option value="">{t("lesson.association.chooseSource")}</option>
						{sources.map((source) => (
							<option key={source.id} value={source.id}>
								{source.label}
							</option>
						))}
					</select>
				</label>
				<label>
					{t("lesson.association.segment")}
					<select
						aria-label={t("lesson.association.segment")}
						value={segmentId}
						disabled={!selectedSource}
						onChange={(event) => setSegmentId(event.target.value)}
					>
						<option value="">{t("lesson.association.chooseSegment")}</option>
						{selectedSource?.clock.segments
							.filter((segment) => segment.endMs > segment.startMs)
							.map((segment) => (
								<option key={segment.id} value={segment.id}>
									{t("lesson.association.segmentOption", {
										id: segment.id,
										start: (segment.startMs / 1000).toFixed(3),
										end: (segment.endMs / 1000).toFixed(3),
									})}
								</option>
							))}
					</select>
				</label>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
					{(
						[
							["applicationStart", "applicationStart"],
							["applicationEnd", "applicationEnd"],
							["recordingStart", "recordingStart"],
							["recordingEnd", "recordingEnd"],
						] as const
					).map(([field, label]) => (
						<label key={field}>
							{t(`lesson.association.${label}`)}
							<input
								aria-label={t(`lesson.association.${label}`)}
								inputMode="decimal"
								value={times[field]}
								onChange={(event) => setTimes({ ...times, [field]: event.target.value })}
							/>
						</label>
					))}
				</div>
				<p>{t("lesson.association.formNote")}</p>
				<p>{t("lesson.association.pendingNote")}</p>
				<button type="button" disabled={busy} onClick={() => void addRange()}>
					{busy ? t("lesson.association.working") : t("lesson.association.add")}
				</button>
				{spans.length > 0 && (
					<ol aria-label={t("lesson.association.ranges")}>
						{spans.map((span, index) => (
							<li key={span.id}>
								{t("lesson.association.range", {
									applicationStart: (span.applicationStartMs / 1000).toFixed(3),
									applicationEnd: (span.applicationEndMs / 1000).toFixed(3),
									recordingStart: (span.recordingStartMs / 1000).toFixed(3),
									recordingEnd: (span.recordingEndMs / 1000).toFixed(3),
								})}{" "}
								<button
									type="button"
									disabled={busy}
									aria-label={t("lesson.association.remove", { number: index + 1 })}
									onClick={() => removeRange(index)}
								>
									{t("lesson.association.removeButton")}
								</button>
							</li>
						))}
					</ol>
				)}
				{plan && <p role="status">{t("lesson.association.saved", { count: plan.spans.length })}</p>}
				{error && <p role="alert">{error}</p>}
				<button
					type="button"
					disabled={busy || (!plan && spans.length === 0)}
					onClick={clearAssociation}
				>
					{t("lesson.association.clear")}
				</button>
			</fieldset>
		</details>
	);
}
