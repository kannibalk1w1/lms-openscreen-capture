// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { TeachingFlagLane } from "./TeachingFlagLane";

afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
});
it("keeps flags on their own row, seeks on click, renames and removes with undoable writes", async () => {
	const doc = createEmptyDocument({ title: "Flags", projectId: "p" });
	doc.assets = [
		{
			id: "a",
			kind: "video",
			label: "Take",
			originalPath: "/take.mp4",
			cameraTrack: null,
			recordingFlags: [{ id: "f", timeMs: 3000, label: "Clap" }],
		},
	];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			wordRefs: [],
			origin: "user",
			reason: "fixture",
		},
	];
	const save = vi.fn(async (next, options) => {
		expect(options.history).toBe(true);
		useProjectStore.setState({ document: next });
		return true;
	});
	const originalSave = useProjectStore.getState().saveDocument;
	useProjectStore.setState({ projectId: "p", document: doc, saveDocument: save });
	const seek = vi.fn();
	try {
		render(
			<I18nProvider>
				<TeachingFlagLane total={10} onSeek={seek} shortcut="Ctrl + Shift + F" />
			</I18nProvider>,
		);
		const flag = screen.getByRole("button", { name: /Clap/ });
		expect(flag.style.left).toBe("30%");
		fireEvent.click(flag);
		expect(seek).toHaveBeenCalledWith(3);
		const label = screen.getByLabelText("Flag label");
		fireEvent.change(label, { target: { value: "Retry" } });
		fireEvent.blur(label);
		await waitFor(() =>
			expect(useProjectStore.getState().document?.assets[0].recordingFlags?.[0].label).toBe(
				"Retry",
			),
		);
		fireEvent.click(screen.getByRole("button", { name: "Remove flag" }));
		await waitFor(() =>
			expect(useProjectStore.getState().document?.assets[0].recordingFlags).toEqual([]),
		);
	} finally {
		useProjectStore.setState({ saveDocument: originalSave });
	}
});
