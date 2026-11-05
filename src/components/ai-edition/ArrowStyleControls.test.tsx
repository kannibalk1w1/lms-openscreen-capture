// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { loadArrowStyles } from "@/lib/ai-edition/annotations/arrowStyles";
import * as assets from "@/lib/ai-edition/annotations/svgAssets";
import { ArrowStyleControls } from "./ArrowStyleControls";

const asset = {
	svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20" height="10"><path d="M0 0L20 5L0 10Z"/></svg>',
	width: 20,
	height: 10,
};
const figure = { arrowDirection: "right" as const, color: "#123456", strokeWidth: 5 };
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});
it("offers dashed lines and heads on either or both ends", () => {
	const onChange = vi.fn();
	render(
		<I18nProvider>
			<ArrowStyleControls figure={figure} onChange={onChange} onGraphic={vi.fn()} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Line style"), { target: { value: "dashed" } });
	expect(onChange).toHaveBeenLastCalledWith({ linePattern: "dashed" });
	fireEvent.change(screen.getByLabelText("Arrowheads"), { target: { value: "both" } });
	expect(onChange).toHaveBeenLastCalledWith({ headEnds: "both" });
});
it("imports an SVG arrowhead through a single hidden file field", async () => {
	vi.spyOn(assets, "importSvg").mockResolvedValue(asset);
	const onChange = vi.fn();
	render(
		<I18nProvider>
			<ArrowStyleControls figure={figure} onChange={onChange} onGraphic={vi.fn()} />
		</I18nProvider>,
	);
	const input = screen.getByLabelText("Import SVG arrowhead") as HTMLInputElement;
	expect(input.hidden).toBe(true);
	fireEvent.change(input, {
		target: { files: [new File([asset.svg], "head.svg", { type: "image/svg+xml" })] },
	});
	await waitFor(() =>
		expect(onChange).toHaveBeenCalledWith({ headStyle: "custom", headSvg: asset }),
	);
});
it("keeps whole-arrow import separate and reloads saved style choices", async () => {
	const importer = vi.spyOn(assets, "importSvg").mockResolvedValue(asset);
	const onGraphic = vi.fn();
	const view = render(
		<I18nProvider>
			<ArrowStyleControls
				figure={{ ...figure, headSvg: asset, headStyle: "custom" }}
				onChange={vi.fn()}
				onGraphic={onGraphic}
			/>
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Arrow style name"), {
		target: { value: "Lesson arrow" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Save style" }));
	expect(loadArrowStyles()[0]).toMatchObject({ name: "Lesson arrow", style: { headSvg: asset } });
	fireEvent.change(screen.getByLabelText("Import whole-arrow SVG"), {
		target: { files: [new File([asset.svg], "whole.svg", { type: "image/svg+xml" })] },
	});
	await waitFor(() => expect(onGraphic).toHaveBeenCalledWith(asset));
	expect(importer).toHaveBeenCalledOnce();
	view.unmount();
	const onChange = vi.fn();
	render(
		<I18nProvider>
			<ArrowStyleControls figure={figure} onChange={onChange} onGraphic={vi.fn()} />
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Saved arrow styles"), {
		target: { value: loadArrowStyles()[0].id },
	});
	expect(onChange).toHaveBeenCalledWith(
		expect.objectContaining({ headStyle: "custom", headSvg: asset }),
	);
});
