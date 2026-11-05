// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { addCodePresentation, saveTypingTake } from "@/lib/ai-edition/store/typingTakes";
import { recordingAnchorChoices } from "@/lib/typing/association";
import { sectionPlayback, TypingCapture } from "@/lib/typing/capture";
import * as typingDownloads from "@/lib/typing/download";
import {
	exportTypingBundle,
	exportTypingPlayback,
	exportTypingSection,
	serializePortableTypingFile,
} from "@/lib/typing/portable";
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

it("pairs a Godot section to a recorded flag in the dialog and atomically places it away from the playhead", async () => {
	const doc = createEmptyDocument({ title: "Associated", projectId: "p" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Take",
			originalPath: "/take.mp4",
			cameraTrack: null,
			recordingClock: {
				sessionId: "7570d5c5-7f90-40b3-ace4-ac27839e318b",
				clock: "recording-control-active-ms",
				segments: [
					{ id: "s", startMs: 0, endMs: 5000 },
					{ id: "r", startMs: 5000, endMs: 9000 },
				],
			},
			recordingFlags: [{ id: "f", label: "First edit", timeMs: 4000, segmentId: "s" }],
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 2,
			sourceEndSec: 8,
			timelineStartSec: 10,
			timelineEndSec: 16,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	const capture = new TypingCapture("", () => 0, "godot");
	capture.observe("var hp = 10", [], "insertText");
	const take = { ...capture.finish(), producer: "godot-codeedit" as const };
	doc.typingTakes = [take];
	const save = vi.fn<typeof originalSave>(async (next, options) => {
		expect(options.history).toBe(true);
		useProjectStore.setState({ document: next });
		return true;
	});
	const close = vi.fn();
	useProjectStore.setState({
		projectId: "p",
		document: doc,
		currentTimeSec: 99,
		saveDocument: save,
	});
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={close} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Saved typing takes"), { target: { value: take.id } });
	fireEvent.change(screen.getByLabelText("Recording anchor for section 1"), {
		target: { value: recordingAnchorChoices(doc)[0].key },
	});
	fireEvent.click(screen.getByRole("button", { name: "Add code at recording flag" }));
	await waitFor(() => expect(close).toHaveBeenCalledOnce());
	expect(save).toHaveBeenCalledOnce();
	const saved = useProjectStore.getState().document!;
	expect(saved.annotations[0]).toMatchObject({
		clipId: "c",
		sourceStartSec: 4,
		sourceEndSec: 5,
		startMs: 12000,
		endMs: 13000,
	});
	expect(saved.typingTakes![0].sections[0].sourceAnchor).toMatchObject({
		flagId: "f",
		segmentId: "s",
	});
	expect(saved.typingTakes![0].events).toEqual(take.events);
});

it("exports the current section in all three formats without a project save", () => {
	const save = vi.fn<typeof originalSave>(async () => true);
	const download = vi
		.spyOn(typingDownloads, "downloadTypingSection")
		.mockImplementation(async () => undefined);
	const doc = createEmptyDocument({ title: "Exports", projectId: "p" });
	useProjectStore.setState({ projectId: "p", document: doc, saveDocument: save });
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
	fireEvent.input(screen.getByLabelText("Capture pad"), {
		target: { value: "var hp = 10" },
		inputType: "insertFromPaste",
	});
	fireEvent.click(screen.getByRole("button", { name: "Stop capture" }));
	fireEvent.change(screen.getByLabelText("Section 1 speed"), { target: { value: "2" } });
	for (const name of [
		"Export section 1 as JSON",
		"Export section 1 resulting text",
		"Export section 1 playback recipe",
	])
		fireEvent.click(screen.getByRole("button", { name }));
	expect(download.mock.calls.map((args) => [args[2], args[3]])).toEqual([
		["section", "p"],
		["text", "p"],
		["playback", "p"],
	]);
	expect(download.mock.calls[0][0].sections[0].speed).toBe(2);
	expect(save).not.toHaveBeenCalled();
	expect(useProjectStore.getState().document).toBe(doc);
});

it("selects multiple sections and exports a clean bundle without changing the captured evidence", () => {
	const doc = createEmptyDocument({ title: "Bundle", projectId: "p" });
	const capture = new TypingCapture("", () => 0, "multi");
	capture.observe("first", [], "insertText");
	capture.pause();
	capture.resume();
	capture.observe("second", [], "insertText");
	const take = capture.finish();
	doc.typingTakes = [take];
	const original = JSON.stringify(take);
	const bundle = vi
		.spyOn(typingDownloads, "downloadTypingBundle")
		.mockImplementation(async () => undefined);
	const single = vi
		.spyOn(typingDownloads, "downloadTypingSection")
		.mockImplementation(async () => undefined);
	const save = vi.fn<typeof originalSave>(async () => true);
	useProjectStore.setState({ projectId: "p", document: doc, saveDocument: save });
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Saved typing takes"), { target: { value: take.id } });
	expect(
		(screen.getByRole("button", { name: "Export selected bundle (0)" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	fireEvent.click(screen.getByLabelText("Include section 1 in bundle"));
	fireEvent.click(screen.getByLabelText("Include section 2 in bundle"));
	fireEvent.change(screen.getByLabelText("Preview / recipe style"), { target: { value: "clean" } });
	fireEvent.click(screen.getByRole("button", { name: "Export selected bundle (2)" }));
	expect(bundle).toHaveBeenCalledWith(
		take.sections.map((section) => ({ take, sectionId: section.id })),
		"clean",
		"p",
	);
	fireEvent.click(screen.getByRole("button", { name: "Export section 1 playback recipe" }));
	expect(single.mock.calls[0].slice(2)).toEqual(["playback", "p", "clean"]);
	expect(save).not.toHaveBeenCalled();
	expect(JSON.stringify(take)).toBe(original);
});

it("opens bundle members with independent buffers and styles, previews clean text, and retains draft edits when switching", async () => {
	const a = new TypingCapture("a=old", () => 0, "a");
	a.observe("a=wrong", [], "insertText");
	a.observe("a=new", [], "insertText");
	const b = new TypingCapture("unrelated baseline", () => 0, "b");
	b.observe("unrelated result", [], "insertText");
	const first = a.finish("First"),
		second = b.finish("Second");
	const bundle = exportTypingBundle([{ take: first, sectionId: first.sections[0].id }], "clean");
	bundle.entries.push(exportTypingPlayback(exportTypingSection(second, second.sections[0].id)));
	const exportBundle = vi
		.spyOn(typingDownloads, "downloadTypingBundle")
		.mockImplementation(async () => undefined);
	const doc = createEmptyDocument({ title: "Imports", projectId: "p" });
	useProjectStore.setState({ projectId: "p", document: doc });
	render(
		<I18nProvider>
			<TypingCaptureDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	const file = new File([], "sections.typing-bundle.json");
	Object.defineProperty(file, "text", { value: async () => serializePortableTypingFile(bundle) });
	fireEvent.change(screen.getByLabelText("Import typing journal"), { target: { files: [file] } });
	await waitFor(() => expect(screen.getByLabelText("Imported bundle section")).toBeTruthy());
	expect((screen.getByLabelText("Capture pad") as HTMLTextAreaElement).value).toBe("a=old");
	expect((screen.getByLabelText("Preview / recipe style") as HTMLSelectElement).value).toBe(
		"clean",
	);
	let tick: FrameRequestCallback = () => undefined;
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
		tick = callback;
		return 1;
	});
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
	const clock = vi.spyOn(performance, "now").mockReturnValue(0);
	fireEvent.click(screen.getByRole("button", { name: "Preview 1" }));
	clock.mockReturnValue(10000);
	act(() => tick(10000));
	expect((screen.getByLabelText("Typing replay preview") as HTMLTextAreaElement).value).toBe(
		"a=new",
	);
	fireEvent.change(screen.getByLabelText("Section 1 label"), { target: { value: "Edited draft" } });
	fireEvent.change(screen.getByLabelText("Section 1 speed"), { target: { value: "2" } });
	fireEvent.change(screen.getByLabelText("Imported bundle section"), {
		target: { value: bundle.entries[1].section.take.id },
	});
	expect((screen.getByLabelText("Capture pad") as HTMLTextAreaElement).value).toBe(
		"unrelated baseline",
	);
	expect((screen.getByLabelText("Preview / recipe style") as HTMLSelectElement).value).toBe(
		"captured-edits",
	);
	fireEvent.change(screen.getByLabelText("Imported bundle section"), {
		target: { value: bundle.entries[0].section.take.id },
	});
	expect((screen.getByLabelText("Section 1 label") as HTMLInputElement).value).toBe("Edited draft");
	expect((screen.getByLabelText("Section 1 speed") as HTMLSelectElement).value).toBe("2");
	expect((screen.getByLabelText("Preview / recipe style") as HTMLSelectElement).value).toBe(
		"clean",
	);
	fireEvent.click(screen.getByRole("button", { name: "Export imported bundle" }));
	expect(exportBundle.mock.calls[0][0].map((entry) => entry.mode)).toEqual([
		"clean",
		"captured-edits",
	]);
	expect(exportBundle.mock.calls[0][0][0].take.sections[0]).toMatchObject({
		label: "Edited draft",
		speed: 2,
	});
	expect(useProjectStore.getState().document).toBe(doc);
});

it("opens and highlights the exact saved section requested from the timeline", () => {
	const doc = createEmptyDocument({ title: "Review", projectId: "p" });
	const capture = new TypingCapture("", () => 0, "review-take");
	capture.observe("first", [], "insertText");
	capture.pause();
	capture.resume();
	capture.observe("second", [], "insertText");
	const take = capture.finish();
	doc.typingTakes = [take];
	useProjectStore.setState({ projectId: "p", document: doc });
	render(
		<I18nProvider>
			<TypingCaptureDialog
				open
				onClose={vi.fn()}
				initialSelection={{ projectId: "p", takeId: take.id, sectionId: take.sections[1].id }}
			/>
		</I18nProvider>,
	);
	const label = screen.getByLabelText("Section 2 label");
	expect(label.closest("[data-typing-section-id]")?.getAttribute("data-selected")).toBe("true");
	expect((screen.getByLabelText("Saved typing takes") as HTMLSelectElement).value).toBe(take.id);
	expect(useProjectStore.getState().document).toBe(doc);
});
it("ignores timeline review requests for a different project", () => {
	const doc = createEmptyDocument({ title: "Current", projectId: "current" });
	const capture = new TypingCapture("private baseline", () => 0, "t");
	capture.observe("private result", [], "insertText");
	const take = capture.finish();
	doc.typingTakes = [take];
	useProjectStore.setState({ projectId: "current", document: doc });
	render(
		<I18nProvider>
			<TypingCaptureDialog
				open
				onClose={vi.fn()}
				initialSelection={{
					projectId: "old-project",
					takeId: take.id,
					sectionId: take.sections[0].id,
				}}
			/>
		</I18nProvider>,
	);
	expect(screen.queryByLabelText("Section 1 label")).toBeNull();
	expect((screen.getByLabelText("Capture pad") as HTMLTextAreaElement).value).toBe("");
});

it("discards an optional importer response after the project changes", async () => {
	const before = window.electronAPI;
	try {
		const doc = createEmptyDocument({ title: "A", projectId: "ipc-a" });
		useProjectStore.setState({ projectId: "ipc-a", document: doc });
		const capture = new TypingCapture("", () => 0, "late-api-take");
		capture.observe("PRIVATE_OTHER_PROJECT_CANARY", [], "insertText");
		const take = capture.finish();
		let finish: (value: unknown) => void = () => undefined;
		const importTypingSource = vi.fn(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		Object.assign(window, { electronAPI: { importTypingSource } });
		render(
			<I18nProvider>
				<TypingCaptureDialog open onClose={vi.fn()} />
			</I18nProvider>,
		);
		const selected = new File([], "take.json");
		Object.defineProperty(selected, "text", { value: async () => JSON.stringify(take) });
		fireEvent.change(screen.getByLabelText("Import typing journal"), {
			target: { files: [selected] },
		});
		await waitFor(() => expect(importTypingSource).toHaveBeenCalledTimes(1));
		const other = createEmptyDocument({ title: "B", projectId: "ipc-b" });
		useProjectStore.setState({ projectId: "ipc-b", document: other });
		await act(async () => {
			finish([{ take, mode: "captured-edits" }]);
		});
		expect(useProjectStore.getState().document?.typingTakes).toBeUndefined();
		expect(
			(screen.getByRole("textbox", { name: "Capture pad" }) as HTMLTextAreaElement).value,
		).not.toContain("PRIVATE_OTHER_PROJECT_CANARY");
	} finally {
		window.electronAPI = before;
	}
});
