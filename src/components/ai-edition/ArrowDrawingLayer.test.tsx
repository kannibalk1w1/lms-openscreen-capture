// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectorPoints } from "@/lib/ai-edition/annotations/connectors";
import type { AxcutAnnotationRegion } from "@/lib/ai-edition/schema";
import { ArrowDrawingLayer } from "./ArrowDrawingLayer";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
beforeEach(() => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	Element.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
function setup() {
	const onDraw = vi.fn(),
		onCancel = vi.fn();
	render(<ArrowDrawingLayer onDraw={onDraw} onCancel={onCancel} />);
	const canvas = screen.getByRole("application");
	vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
		left: 0,
		top: 0,
		width: 500,
		height: 300,
	} as DOMRect);
	return { canvas, onDraw, onCancel };
}
it("draws tail to head in either direction and saves only on release", () => {
	const { canvas, onDraw } = setup();
	fireEvent.pointerDown(canvas, { button: 0, clientX: 400, clientY: 30 });
	fireEvent.pointerMove(canvas, { clientX: 100, clientY: 240 });
	expect(onDraw).not.toHaveBeenCalled();
	fireEvent.pointerUp(canvas, { clientX: 100, clientY: 240 });
	expect(onDraw).toHaveBeenCalledOnce();
	const patch = onDraw.mock.calls[0][0] as AxcutAnnotationRegion;
	expect(patch.type).toBe("figure");
	expect(connectorPoints(patch).tail.x).toBeCloseTo(80);
	expect(connectorPoints(patch).head.y).toBeCloseTo(80);
});
it("ignores tiny clicks and cancels without creating an annotation", () => {
	const { canvas, onDraw, onCancel } = setup();
	fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 });
	fireEvent.pointerUp(canvas, { clientX: 11, clientY: 10 });
	expect(onDraw).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "Escape" });
	expect(onCancel).toHaveBeenCalledOnce();
});
