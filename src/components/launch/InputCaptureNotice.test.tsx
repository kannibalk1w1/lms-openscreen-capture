// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InputCaptureNotice } from "./InputCaptureNotice";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
it("updates coverage and warnings after device loss, then stops polling on unmount", async () => {
	vi.useFakeTimers();
	const getInputCaptureHealth = vi
		.fn()
		.mockResolvedValueOnce({ state: "partial", scope: "global-compositor-buttons", warning: null })
		.mockResolvedValue({
			state: "unavailable",
			scope: "global-compositor-buttons",
			warning: "KWin disconnected",
		});
	Object.assign(window, { electronAPI: { getInputCaptureHealth } });
	const view = render(<InputCaptureNotice />);
	await act(async () => {
		await Promise.resolve();
	});
	expect(screen.getByRole("status")).toHaveTextContent("inputCapture.partial");
	expect(screen.getByRole("status")).toHaveTextContent("inputCapture.compositorScope");
	await act(async () => {
		await vi.advanceTimersByTimeAsync(500);
	});
	expect(screen.getByRole("status")).toHaveTextContent("inputCapture.unavailable");
	expect(screen.getByRole("status")).toHaveTextContent("KWin disconnected");
	view.unmount();
	await vi.advanceTimersByTimeAsync(1000);
	expect(getInputCaptureHealth).toHaveBeenCalledTimes(2);
});
it("shows unknown rather than retaining a stale healthy state when IPC fails", async () => {
	vi.useFakeTimers();
	const getInputCaptureHealth = vi
		.fn()
		.mockResolvedValueOnce({
			state: "partial",
			scope: "global-physical-buttons-no-taps",
			warning: null,
		})
		.mockRejectedValue(new Error("IPC unavailable"));
	Object.assign(window, { electronAPI: { getInputCaptureHealth } });
	render(<InputCaptureNotice />);
	await act(async () => {
		await Promise.resolve();
	});
	expect(screen.getByRole("status")).toHaveTextContent("inputCapture.partial");
	await act(async () => {
		await vi.advanceTimersByTimeAsync(500);
	});
	expect(screen.getByRole("status")).toHaveTextContent("inputCapture.unknown");
});
