// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { annotationRegionSchema } from "@/lib/ai-edition/schema";
import { CodePresentationControls } from "./CodePresentationControls";

afterEach(cleanup);
it("offers independent pause/play and blur switches plus style and excerpt controls", () => {
	const region = annotationRegionSchema.parse({
		id: "a",
		type: "image",
		content: "",
		startMs: 0,
		endMs: 4000,
		position: { x: 10, y: 10 },
		size: { width: 80, height: 80 },
		style: {},
		zIndex: 1,
		codeData: { takeId: "t", sectionId: "s" },
	});
	const change = vi.fn(),
		commit = vi.fn();
	render(
		<I18nProvider>
			<CodePresentationControls region={region} onChange={change} onCommit={commit} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Video behind code"), { target: { value: "play" } });
	expect(change).toHaveBeenLastCalledWith({
		codeData: { ...region.codeData, pauseBackground: false },
	});
	fireEvent.click(screen.getByLabelText("Blur background"));
	expect(change).toHaveBeenLastCalledWith({
		codeData: { ...region.codeData, blurBackground: false },
	});
	expect(screen.getByLabelText("Code font size")).toBeTruthy();
	expect(commit).toHaveBeenCalledTimes(2);
});

it("allows intermediate font digits, commits once on blur and restores invalid numeric drafts", () => {
	const region = annotationRegionSchema.parse({
		id: "a",
		type: "image",
		content: "",
		startMs: 0,
		endMs: 4000,
		position: { x: 10, y: 10 },
		size: { width: 80, height: 80 },
		style: {},
		zIndex: 1,
		codeData: { takeId: "t", sectionId: "s" },
	});
	const change = vi.fn(),
		commit = vi.fn();
	render(
		<I18nProvider>
			<CodePresentationControls region={region} onChange={change} onCommit={commit} />
		</I18nProvider>,
	);
	const input = screen.getByLabelText("Code font size") as HTMLInputElement;
	fireEvent.change(input, { target: { value: "" } });
	fireEvent.change(input, { target: { value: "2" } });
	fireEvent.change(input, { target: { value: "24" } });
	expect(input.value).toBe("24");
	expect(commit).not.toHaveBeenCalled();
	fireEvent.blur(input);
	expect(change).toHaveBeenCalledWith({ codeData: { ...region.codeData, fontSize: 24 } });
	expect(commit).toHaveBeenCalledTimes(1);
	fireEvent.change(input, { target: { value: "999" } });
	fireEvent.blur(input);
	expect(input.value).toBe(String(region.codeData!.fontSize));
	expect(commit).toHaveBeenCalledTimes(1);
});
