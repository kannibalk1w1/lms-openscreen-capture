import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { type LessonManifest, MAX_LESSON_BYTES, parseLesson } from "@/lib/lesson/schema";
import {
	recordLessonHandoff,
	recordRunVerification,
	replaceLessonStep,
	restoreLessonStep,
	verificationSubject,
} from "@/lib/lesson/workflow";

export function LessonWorkflowControls({
	lesson,
	onChange,
}: {
	lesson: LessonManifest;
	onChange: (next: LessonManifest) => void;
}) {
	const t = useScopedT("timeline");
	const [stepId, setStepId] = useState("");
	const [replacement, setReplacement] = useState<LessonManifest | null>(null);
	const [replacementId, setReplacementId] = useState("");
	const [reason, setReason] = useState("");
	const [restoreId, setRestoreId] = useState("");
	const [expected, setExpected] = useState("");
	const [observed, setObserved] = useState("");
	const [outcome, setOutcome] = useState<"passed" | "failed" | "unavailable">("unavailable");
	const [from, setFrom] = useState<"human" | "tutor" | "agent">("human");
	const [to, setTo] = useState<"human" | "tutor" | "agent">("agent");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [verificationCurrent, setVerificationCurrent] = useState(false);
	const latest = useRef(lesson);
	latest.current = lesson;
	const epoch = useRef(0);
	const working = useRef(false);
	const step = lesson.steps.find((s) => s.id === stepId);
	useEffect(
		() => () => {
			epoch.current++;
		},
		[],
	);
	useEffect(() => {
		void lesson.id;
		setStepId("");
		setReplacement(null);
		setReplacementId("");
		setReason("");
		setNote("");
	}, [lesson.id]);
	useEffect(() => {
		void stepId;
		setRestoreId("");
		setExpected("");
		setObserved("");
		setOutcome("unavailable");
	}, [stepId]);
	useEffect(() => {
		let active = true;
		setVerificationCurrent(false);
		if (step?.verification)
			void verificationSubject(lesson, step.id)
				.then((digest) => {
					if (active) setVerificationCurrent(digest === step.verification?.subjectSha256);
				})
				.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [lesson, step]);
	async function run(operation: (current: () => boolean) => Promise<LessonManifest | null>) {
		if (working.current) return;
		working.current = true;
		const source = lesson,
			token = ++epoch.current;
		const current = () => token === epoch.current && latest.current === source;
		setBusy(true);
		setMessage("");
		try {
			const next = await operation(current);
			if (token !== epoch.current) return;
			if (latest.current !== source) throw new Error("stale");
			if (next) onChange(next);
			setMessage(t(next ? "lesson.workflow.changed" : "lesson.workflow.loaded"));
		} catch {
			if (token === epoch.current) setMessage(t("lesson.workflow.operationFailed"));
		} finally {
			working.current = false;
			if (token === epoch.current) setBusy(false);
		}
	}
	const handoff = lesson.handoffs?.at(-1);
	return (
		<details>
			<summary>{t("lesson.workflow.title")}</summary>
			<p>{t("lesson.workflow.scope")}</p>
			<fieldset disabled={busy}>
				<label>
					{t("lesson.workflow.step")}
					<select
						aria-label={t("lesson.workflow.step")}
						value={stepId}
						onChange={(e) => setStepId(e.target.value)}
					>
						<option value="">{t("lesson.workflow.choose")}</option>
						{lesson.steps.map((s) => (
							<option key={s.id} value={s.id}>
								{s.title}
							</option>
						))}
					</select>
				</label>
				<label>
					{t("lesson.workflow.file")}
					<input
						type="file"
						accept=".json"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (!file) return;
							setReplacement(null);
							setReplacementId("");
							void run(async (current) => {
								if (file.size > MAX_LESSON_BYTES) throw new Error("limit");
								const bytes = await file.arrayBuffer();
								if (bytes.byteLength > MAX_LESSON_BYTES) throw new Error("limit");
								const parsed = await parseLesson(new TextDecoder().decode(bytes));
								// run() also refuses stale commits; don't expose a stale candidate after unmount.
								if (current()) setReplacement(parsed);
								return null;
							});
						}}
					/>
				</label>
				{replacement && (
					<label>
						{t("lesson.workflow.replacement")}
						<select
							aria-label={t("lesson.workflow.replacement")}
							value={replacementId}
							onChange={(e) => setReplacementId(e.target.value)}
						>
							<option value="">{t("lesson.workflow.choose")}</option>
							{replacement.steps.map((s) => (
								<option key={s.id} value={s.id}>
									{s.title}
								</option>
							))}
						</select>
					</label>
				)}
				<label>
					{t("lesson.workflow.reason")}
					<textarea maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
				</label>
				<button
					type="button"
					disabled={!step || !replacement || !replacementId || !reason.trim()}
					onClick={() => {
						if (replacement && window.confirm(t("lesson.workflow.confirm")))
							void run(() => replaceLessonStep(lesson, stepId, replacement, replacementId, reason));
					}}
				>
					{t("lesson.workflow.replace")}
				</button>
				{step?.retakes?.length ? (
					<>
						<label>
							{t("lesson.workflow.history")}
							<select
								aria-label={t("lesson.workflow.history")}
								value={restoreId}
								onChange={(e) => setRestoreId(e.target.value)}
							>
								<option value="">{t("lesson.workflow.choose")}</option>
								{step.retakes.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>{`r${r.lessonRevision}: ${r.previous.title} — ${r.reason}`}</option>
								))}
							</select>
						</label>
						<button
							type="button"
							disabled={!restoreId || !reason.trim()}
							onClick={() => {
								if (window.confirm(t("lesson.workflow.confirm")))
									void run(() => restoreLessonStep(lesson, stepId, restoreId, reason));
							}}
						>
							{t("lesson.workflow.restore")}
						</button>
					</>
				) : null}
				<h4>{t("lesson.workflow.verify")}</h4>
				<p>{t("lesson.workflow.manual")}</p>
				{step?.verification && (
					<p>
						{t(verificationCurrent ? "lesson.workflow.currentCheck" : "lesson.workflow.staleCheck")}{" "}
						{t(`lesson.workflow.${step.verification.outcome}`)}: {step.verification.expected} /{" "}
						{step.verification.observed}
					</p>
				)}
				<label>
					{t("lesson.workflow.expected")}
					<textarea
						maxLength={2000}
						value={expected}
						onChange={(e) => setExpected(e.target.value)}
					/>
				</label>
				<label>
					{t("lesson.workflow.observed")}
					<textarea
						maxLength={4000}
						value={observed}
						onChange={(e) => setObserved(e.target.value)}
					/>
				</label>
				<label>
					{t("lesson.workflow.outcome")}
					<select
						aria-label={t("lesson.workflow.outcome")}
						value={outcome}
						onChange={(e) => setOutcome(e.target.value as typeof outcome)}
					>
						{(["unavailable", "passed", "failed"] as const).map((v) => (
							<option key={v} value={v}>
								{t(`lesson.workflow.${v}`)}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					disabled={!step || !expected.trim() || !observed.trim()}
					onClick={() =>
						void run(() => recordRunVerification(lesson, stepId, { expected, observed, outcome }))
					}
				>
					{t("lesson.workflow.recordCheck")}
				</button>
				<h4>{t("lesson.workflow.handoff")}</h4>
				{handoff && (
					<p>
						{t(
							handoff.lessonRevision === lesson.revision
								? "lesson.workflow.currentHandoff"
								: "lesson.workflow.staleHandoff",
						)}{" "}
						{t(`lesson.workflow.${handoff.from}`)} → {t(`lesson.workflow.${handoff.to}`)}:{" "}
						{handoff.note}
					</p>
				)}
				{(["from", "to"] as const).map((side) => (
					<label key={side}>
						{t(`lesson.workflow.${side}`)}
						<select
							aria-label={t(`lesson.workflow.${side}`)}
							value={side === "from" ? from : to}
							onChange={(e) => (side === "from" ? setFrom : setTo)(e.target.value as typeof from)}
						>
							{(["human", "tutor", "agent"] as const).map((v) => (
								<option key={v} value={v}>
									{t(`lesson.workflow.${v}`)}
								</option>
							))}
						</select>
					</label>
				))}
				<label>
					{t("lesson.workflow.note")}
					<textarea maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
				</label>
				<button
					type="button"
					disabled={!note.trim()}
					onClick={() =>
						void run(() => recordLessonHandoff(lesson, { from, to, note, nextStepId: step?.id }))
					}
				>
					{t("lesson.workflow.recordHandoff")}
				</button>
			</fieldset>
			<p role="status" aria-live="polite">
				{busy ? t("lesson.workflow.busy") : message}
			</p>
		</details>
	);
}
