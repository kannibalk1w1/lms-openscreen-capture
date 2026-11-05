// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { TypingCapture } from "@/lib/typing/capture";
import * as downloads from "@/lib/typing/download";
import { reviewFixture } from "@/lib/typing/reviewFixture";
import { TypingSectionLane } from "./TypingSectionLane";

afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
	vi.restoreAllMocks();
});
function setup(doc = reviewFixture()) {
	useProjectStore.setState({ projectId: "p", document: doc });
	const seek = vi.fn(),
		review = vi.fn(),
		opened = vi.fn();
	render(
		<I18nProvider>
			<TypingSectionLane total={40} onSeek={seek} onReview={review} onOpenReview={opened} />
		</I18nProvider>,
	);
	return { doc, seek, review, opened };
}
it("positions and selects a source onset, seeks once, and opens the exact saved section for editing", () => {
	const { doc, seek, review, opened } = setup();
	const marker = screen.getByRole("button", { name: /Change health · 0:12/ });
	expect(marker.style.left).toBe("30%");
	fireEvent.click(marker);
	expect(seek).toHaveBeenCalledWith(12);
	expect(opened).toHaveBeenCalledOnce();
	expect(
		(screen.getByLabelText("Result excerpt (up to 12,000 characters)") as HTMLTextAreaElement)
			.value,
	).toBe("final 日本語😀");
	fireEvent.click(screen.getByRole("button", { name: "Open section in typing capture" }));
	expect(review).toHaveBeenCalledWith({
		projectId: "p",
		takeId: "t",
		sectionId: doc.typingTakes![0].sections[0].id,
	});
});
it("offers each repeated source occurrence while refusing seeks into UI trims", () => {
	const doc = reviewFixture();
	doc.timeline.trimRanges = [
		{
			id: "trim",
			assetId: "a",
			clipId: "c",
			startSec: 3.5,
			endSec: 4.5,
			reason: "",
			origin: "user",
		},
	];
	doc.timeline.clips.push({
		...doc.timeline.clips[0],
		id: "copy",
		timelineStartSec: 30,
		timelineEndSec: 36,
	});
	const { seek } = setup(doc);
	fireEvent.click(screen.getByRole("button", { name: /Change health · 0:12/ }));
	expect(seek).not.toHaveBeenCalled();
	expect(
		(screen.getByRole("button", { name: /Seek occurrence 1/ }) as HTMLButtonElement).disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: /Seek occurrence 2/ }));
	expect(seek).toHaveBeenCalledWith(32);
});
it("exports independent sections from the catalog with the chosen style and no project mutation", async () => {
	const doc = reviewFixture();
	doc.typingTakes![0].sections[0].sourceAnchor = undefined;
	const original = JSON.stringify(doc);
	const download = vi.spyOn(downloads, "downloadTypingSection").mockResolvedValue(undefined);
	const { seek } = setup(doc);
	fireEvent.click(screen.getByRole("button", { name: "Review sections (1)" }));
	expect(screen.getAllByText("Independent take · no video time").length).toBeGreaterThan(0);
	fireEvent.change(screen.getByLabelText("Playback recipe style"), { target: { value: "clean" } });
	fireEvent.click(screen.getByRole("button", { name: "Playback recipe" }));
	await waitFor(() =>
		expect(download).toHaveBeenCalledWith(
			doc.typingTakes![0],
			doc.typingTakes![0].sections[0].id,
			"playback",
			"p",
			"clean",
		),
	);
	expect(seek).not.toHaveBeenCalled();
	expect(JSON.stringify(useProjectStore.getState().document)).toBe(original);
});
it("keeps missing footage reviewable and surfaces export failures", async () => {
	const doc = reviewFixture();
	doc.assets = [];
	vi.spyOn(downloads, "downloadTypingSection").mockRejectedValue(new Error("Disk is full"));
	setup(doc);
	fireEvent.click(screen.getByRole("button", { name: "Review sections (1)" }));
	expect(screen.getAllByText("Recording cue unavailable in current clips").length).toBeGreaterThan(
		0,
	);
	fireEvent.click(screen.getByRole("button", { name: "Section JSON" }));
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Disk is full"));
});
it("filters the section catalog without retaining unrelated details and handles empty documents", () => {
	setup();
	fireEvent.click(screen.getByRole("button", { name: "Review sections (1)" }));
	fireEvent.change(screen.getByLabelText("Find typing sections"), {
		target: { value: "no match" },
	});
	expect(
		screen.getByText("No saved sections match. Save a typing take to review it here."),
	).toBeTruthy();
	expect(screen.queryByLabelText("Result excerpt (up to 12,000 characters)")).toBeNull();
});

it("can reach sections beyond the first catalog page, including independent takes", () => {
	const doc = reviewFixture();
	const capture = new TypingCapture("", () => 0, "many");
	for (let i = 0; i < 101; i++) {
		capture.observe(String(i), [], "insertText");
		capture.pause();
		capture.resume();
	}
	doc.typingTakes = [capture.finish("Many")];
	setup(doc);
	fireEvent.click(screen.getByRole("button", { name: "Review sections (101)" }));
	expect(screen.queryByRole("button", { name: /Many · Section 101/ })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Show 100 more sections" }));
	expect(screen.getByRole("button", { name: /Many · Section 101/ })).toBeTruthy();
});
