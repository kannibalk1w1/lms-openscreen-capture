import { useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useScopedT } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import {
	draftLessonSteps,
	moveStep,
	newLesson,
	newStep,
	reviseLesson,
} from "@/lib/lesson/authoring";
import { projectLesson } from "@/lib/lesson/export";
import { type LessonManifest, type LessonStep, sha256, validateLesson } from "@/lib/lesson/schema";
import styles from "./LessonGuideDialog.module.css";
export function LessonGuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const t = useScopedT("timeline");
	const document = useProjectStore((s) => s.document),
		projectId = useProjectStore((s) => s.projectId);
	const [lesson, setLesson] = useState<LessonManifest>(() => newLesson());
	const [selected, setSelected] = useState<string[]>([]),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(false),
		[notice, setNotice] = useState("");
	const epoch = useRef({ projectId });
	const busyRef = useRef(false);
	useEffect(() => {
		epoch.current = { projectId };
		return () => {
			epoch.current = { projectId };
		};
	}, [projectId]);
	const update = (id: string, change: Partial<LessonStep>) =>
		setLesson((value) =>
			reviseLesson(value, {
				steps: value.steps.map((step) =>
					step.id === id ? { ...step, ...change, status: change.status ?? "draft" } : step,
				),
			}),
		);
	const run = async (action: (current: object) => Promise<void>) => {
		if (busyRef.current) return;
		busyRef.current = true;
		const current = epoch.current;
		setBusy(true);
		setError(false);
		setNotice("");
		try {
			await action(current);
		} catch {
			if (epoch.current === current) setError(true);
		} finally {
			busyRef.current = false;
			if (epoch.current === current) setBusy(false);
		}
	};
	const active = selected.filter((id) => lesson.steps.some((step) => step.id === id));
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!value && !busy) onClose();
			}}
		>
			<DialogContent style={{ maxWidth: 960, maxHeight: "90vh", overflowY: "auto" }}>
				<DialogHeader>
					<DialogTitle>{t("lesson.title")}</DialogTitle>
					<DialogDescription>{t("lesson.scope")}</DialogDescription>
				</DialogHeader>
				<p>{t("lesson.unsaved")}</p>
				<fieldset
					className={styles.form}
					disabled={busy}
					style={{ display: "grid", gap: 12, border: 0, padding: 0 }}
				>
					<label>
						{t("lesson.lessonTitle")}
						<input
							maxLength={300}
							value={lesson.title}
							onChange={(event) => {
								if (event.target.value)
									setLesson(reviseLesson(lesson, { title: event.target.value }));
							}}
						/>
					</label>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							disabled={lesson.steps.length >= 200}
							onClick={() => {
								const step = newStep(t("lesson.newStep"));
								setLesson(reviseLesson(lesson, { steps: [...lesson.steps, step] }));
								setSelected([...active, step.id]);
							}}
						>
							{t("lesson.add")}
						</button>
						<button
							type="button"
							disabled={!document || lesson.steps.length >= 200}
							onClick={() => {
								if (!document) return;
								const steps = draftLessonSteps(document).slice(0, 200 - lesson.steps.length);
								setLesson(reviseLesson(lesson, { steps: [...lesson.steps, ...steps] }));
								setSelected([...active, ...steps.map((step) => step.id)]);
							}}
						>
							{t("lesson.draft")}
						</button>
						<button
							type="button"
							disabled={!window.electronAPI?.lessonOpen}
							onClick={() =>
								void run(async (current) => {
									const result = await window.electronAPI.lessonOpen!();
									if (epoch.current !== current) return;
									if (!result.success) throw new Error("open");
									if (result.result.status === "opened") {
										const valid = await validateLesson(result.result.lesson);
										if (epoch.current !== current) return;
										setLesson(valid);
										setSelected(valid.steps.map((step) => step.id));
										setNotice(t("lesson.opened"));
									}
								})
							}
						>
							{t("lesson.open")}
						</button>
						<button
							type="button"
							disabled={!window.electronAPI?.lessonSave}
							onClick={() =>
								void run(async (current) => {
									const result = await window.electronAPI.lessonSave!(lesson);
									if (epoch.current !== current) return;
									if (!result.success) throw new Error("save");
									if (result.result.status === "saved")
										setNotice(t("lesson.saved", { path: result.result.path }));
								})
							}
						>
							{t("lesson.save")}
						</button>
					</div>
					<p>
						{t("lesson.inventory", {
							steps: active.length,
							total: lesson.steps.length,
							images: lesson.assets.filter((image) =>
								lesson.steps.some((step) => active.includes(step.id) && step.imageId === image.id),
							).length,
						})}
					</p>
					<p>{t("lesson.privacy")}</p>
					<button
						type="button"
						disabled={
							!active.length ||
							lesson.steps.some(
								(step) => active.includes(step.id) && step.imageId && !step.imageAlt.trim(),
							) ||
							!window.electronAPI?.lessonExport
						}
						onClick={() =>
							void run(async (current) => {
								const projection = await projectLesson(lesson, active);
								if (epoch.current !== current) return;
								const result = await window.electronAPI.lessonExport!(projection, active);
								if (epoch.current !== current) return;
								if (!result.success) throw new Error("export");
								if (result.result.status === "exported")
									setNotice(t("lesson.exported", { path: result.result.path }));
							})
						}
					>
						{t("lesson.export")}
					</button>
					{lesson.steps.map((step, index) => {
						const image = lesson.assets.find((image) => image.id === step.imageId);
						return (
							<section
								key={step.id}
								style={{
									border: "1px solid var(--border)",
									borderRadius: 8,
									padding: 16,
									display: "grid",
									gap: 8,
								}}
							>
								<label>
									<input
										type="checkbox"
										checked={active.includes(step.id)}
										onChange={(event) =>
											setSelected(
												event.target.checked
													? [...active, step.id]
													: active.filter((id) => id !== step.id),
											)
										}
									/>
									{t("lesson.include", { number: index + 1 })}
								</label>
								<label>
									{t("lesson.stepTitle")}
									<input
										maxLength={300}
										value={step.title}
										onChange={(event) => {
											if (event.target.value) update(step.id, { title: event.target.value });
										}}
									/>
								</label>
								<label>
									{t("lesson.instructions")}
									<textarea
										rows={4}
										maxLength={12000}
										value={step.instructions}
										onChange={(event) => update(step.id, { instructions: event.target.value })}
									/>
								</label>
								<label>
									{t("lesson.code")}
									<textarea
										rows={3}
										maxLength={40000}
										value={step.code?.text ?? ""}
										onChange={(event) =>
											update(step.id, {
												code: event.target.value
													? { language: step.code?.language ?? "plain", text: event.target.value }
													: undefined,
											})
										}
									/>
								</label>
								<label>
									{t("lesson.reviewed")}
									<input
										type="checkbox"
										checked={step.status === "reviewed"}
										onChange={(event) =>
											update(step.id, { status: event.target.checked ? "reviewed" : "draft" })
										}
									/>
								</label>
								{step.evidence.map((evidence, n) => (
									<p key={`${evidence.kind}-${n}`}>
										<small>
											{t("lesson.evidence", { kind: evidence.kind, clock: evidence.clock })}
										</small>
									</p>
								))}
								<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
									<button
										type="button"
										disabled={index === 0}
										onClick={() => setLesson(moveStep(lesson, step.id, -1))}
									>
										{t("lesson.up")}
									</button>
									<button
										type="button"
										disabled={index === lesson.steps.length - 1}
										onClick={() => setLesson(moveStep(lesson, step.id, 1))}
									>
										{t("lesson.down")}
									</button>
									<button
										type="button"
										onClick={() => {
											const steps = lesson.steps.filter((value) => value.id !== step.id);
											setLesson(
												reviseLesson(lesson, {
													steps,
													assets: lesson.assets.filter((asset) =>
														steps.some((value) => value.imageId === asset.id),
													),
												}),
											);
											setSelected(active.filter((id) => id !== step.id));
										}}
									>
										{t("lesson.remove")}
									</button>
									<button
										type="button"
										disabled={
											!document ||
											!projectId ||
											!window.electronAPI?.lessonFrame ||
											lesson.assets.length >= 40
										}
										onClick={() =>
											void run(async (current) => {
												const store = useProjectStore.getState();
												const snapshot = store.document;
												if (!snapshot || !store.projectId || store.dirty)
													throw new Error("Save project first");
												const documentSha256 = await sha256(
													new TextEncoder().encode(JSON.stringify(snapshot)),
												);
												if (epoch.current !== current) return;
												const result = await window.electronAPI.lessonFrame!({
													projectId: store.projectId,
													rulerSec: store.currentTimeSec,
													documentSha256,
												});
												if (epoch.current !== current) return;
												if (!result.success) throw new Error("frame");
												if (useProjectStore.getState().document !== snapshot)
													throw new Error("Project changed");
												const steps = lesson.steps.map((value) =>
													value.id === step.id
														? { ...value, imageId: result.result.id, status: "draft" as const }
														: value,
												);
												const next = await validateLesson(
													reviseLesson(lesson, {
														steps,
														assets: [
															...lesson.assets.filter((asset) =>
																steps.some((value) => value.imageId === asset.id),
															),
															result.result,
														],
													}),
												);
												if (epoch.current === current) setLesson(next);
											})
										}
									>
										{t("lesson.capture")}
									</button>
								</div>
								{image && (
									<>
										<img
											src={`data:image/jpeg;base64,${image.base64}`}
											alt={step.imageAlt}
											style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
										/>
										<label>
											{t("lesson.alt")}
											<input
												maxLength={1000}
												value={step.imageAlt}
												onChange={(event) => update(step.id, { imageAlt: event.target.value })}
											/>
										</label>
										<p>
											<small>
												{t("lesson.frameSource", { time: image.source.rulerSec.toFixed(3) })}
											</small>
										</p>
									</>
								)}
							</section>
						);
					})}
				</fieldset>
				{busy && <p role="status">{t("lesson.busy")}</p>}
				{error && <p role="alert">{t("lesson.error")}</p>}
				{notice && (
					<p role="status" style={{ overflowWrap: "anywhere" }}>
						{notice}
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
