// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { addCodePresentation, saveTypingTake } from "@/lib/ai-edition/store/typingTakes";
import { sectionPlayback, TypingCapture } from "@/lib/typing/capture";
import { TypingCaptureDialog } from "./TypingCaptureDialog";

const originalSave = useProjectStore.getState().saveDocument;
afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
	useProjectStore.setState({ saveDocument: originalSave });
	vi.restoreAllMocks();
});
it("captures real input events, pauses with a read-only pad, edits section metadata and persists source evidence", async () => {
	const doc = createEmptyDocument({ title: "Typing", projectId: "p" });
	const save = vi.fn<typeof originalSave>(async (next, options) => {
		expect(options.history).toBe(true);
		useProjectStore.setState({ document: next });
		return true;
	});
	useProjectStore.setState({ projectId: "p", document: doc, saveDocument: save });
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	const pad = screen.getByLabelText("Capture pad") as HTMLTextAreaElement;
	fireEvent.input(pad, { target: { value: "start" }, inputType: "insertText" });
	fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
	fireEvent.input(pad, { target: { value: "start\n\t😀 paste" }, inputType: "insertFromPaste" });
	fireEvent.input(pad, { target: { value: "start" }, inputType: "historyUndo" });
	fireEvent.click(screen.getByRole("button", { name: "Pause" }));
	expect(pad.readOnly).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Resume" }));
	expect(pad.readOnly).toBe(false);
	fireEvent.input(pad, { target: { value: "start!" }, inputType: "insertText" });
	fireEvent.click(screen.getByRole("button", { name: "Stop capture" }));
	fireEvent.change(screen.getByLabelText("Section 1 label"), {
		target: { value: "Show paste and undo" },
	});
	fireEvent.change(screen.getByLabelText("Section 1 speed"), { target: { value: "0.5" } });
	fireEvent.click(screen.getByRole("button", { name: "Save take to project" }));
	await waitFor(() => expect(useProjectStore.getState().document?.typingTakes).toHaveLength(1));
	const take = useProjectStore.getState().document!.typingTakes![0];
	expect(take.initialText).toBe("start");
	expect(take.sections).toHaveLength(2);
	expect(take.sections[0]).toMatchObject({ label: "Show paste and undo", speed: 0.5 });
	expect(take.events.filter((e) => e.event === "text-edit").map((e) => e.inputType)).toEqual([
		"insertFromPaste",
		"historyUndo",
		"insertText",
	]);
	expect(sectionPlayback(take, take.sections[1]).finalText).toBe("start!");
});
it("does not import a journal into another project if the file read finishes after switching", async () => {
	const doc = createEmptyDocument({ title: "A", projectId: "a" });
	useProjectStore.setState({ projectId: "a", document: doc });
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	let finish: (value: string) => void = () => undefined;
	const selected = new File([""], "take.json");
	Object.defineProperty(selected, "text", {
		value: () =>
			new Promise<string>((resolve) => {
				finish = resolve;
			}),
	});
	fireEvent.change(screen.getByLabelText("Import typing journal"), {
		target: { files: [selected] },
	});
	const other = createEmptyDocument({ title: "B", projectId: "b" });
	useProjectStore.setState({ projectId: "b", document: other });
	const capture = new TypingCapture("", () => 0, "imported");
	capture.observe("must stay in A", [], "insertText");
	finish(JSON.stringify(capture.finish()));
	await waitFor(() =>
		expect((screen.getByRole("button", { name: "New take" }) as HTMLButtonElement).disabled).toBe(
			false,
		),
	);
	expect(useProjectStore.getState().document?.typingTakes).toBeUndefined();
});

it("abandons a pending take save if the project changes before the save begins", async () => {
	const doc = createEmptyDocument({ title: "A", projectId: "a" });
	const save = vi.fn<typeof originalSave>(async () => true);
	useProjectStore.setState({ projectId: "a", document: doc, saveDocument: save });
	const capture = new TypingCapture("", () => 0, "old-project-take");
	const pending = saveTypingTake(capture.finish());
	useProjectStore.setState({
		projectId: "b",
		document: createEmptyDocument({ title: "B", projectId: "b" }),
	});
	expect(await pending).toBe(false);
	expect(save).not.toHaveBeenCalled();
});

it("adds a source-anchored code region and its take in one gesture, bounded by the carrier clip", async () => {
	const doc = createEmptyDocument({ title: "Code", projectId: "p" });
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 20,
			sourceEndSec: 25,
			timelineStartSec: 10,
			timelineEndSec: 15,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	const save = vi.fn<typeof originalSave>(async (next, options) => {
		expect(options.history).toBe(true);
		useProjectStore.setState({ document: next });
		return true;
	});
	useProjectStore.setState({
		projectId: "p",
		document: doc,
		currentTimeSec: 14,
		saveDocument: save,
	});
	const capture = new TypingCapture("", () => 0, "code-take");
	capture.observe("var hp = 10", [], "insertText");
	const take = capture.finish();
	expect(await addCodePresentation(take, take.sections[0].id)).toBe(true);
	expect(save).toHaveBeenCalledTimes(1);
	expect(useProjectStore.getState().document?.typingTakes).toEqual([take]);
	expect(useProjectStore.getState().document?.annotations[0]).toMatchObject({
		clipId: "c",
		sourceStartSec: 24,
		sourceEndSec: 25,
		startMs: 14000,
		endMs: 15000,
		space: "frame",
		codeData: { takeId: take.id, pauseBackground: true, blurBackground: true },
	});
});
it("abandons pending code insertion if the project changes", async () => {
	const save = vi.fn<typeof originalSave>(async () => true);
	useProjectStore.setState({
		projectId: "a",
		document: createEmptyDocument({ title: "A", projectId: "a" }),
		saveDocument: save,
	});
	const capture = new TypingCapture("", () => 0, "t");
	capture.observe("var a = 1", [], "insertText");
	const take = capture.finish();
	const pending = addCodePresentation(take, take.sections[0].id);
	useProjectStore.setState({
		projectId: "b",
		document: createEmptyDocument({ title: "B", projectId: "b" }),
	});
	expect(await pending).toBe(false);
	expect(save).not.toHaveBeenCalled();
});
