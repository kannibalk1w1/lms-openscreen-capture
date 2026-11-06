// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecordingClockBridgeControls } from "./RecordingClockBridgeControls";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(cleanup);
it("requires an explicit pair action and stops sharing without touching recording controls", async () => {
	let current: import("@/lib/clockBridge/schema").ClockBridgeStatus = {
		available: true,
		state: "disabled",
		peers: 0,
	};
	const create = vi.fn(async () => {
		current = {
			available: true,
			state: "paired",
			peers: 0,
			pairFilePath: "/tmp/private-link.json",
			projectLabel: "fixture",
		};
		return { success: true, status: current };
	});
	const stop = vi.fn(async () => {
		current = { available: true, state: "disabled", peers: 0 };
		return current;
	});
	Object.assign(window, {
		electronAPI: {
			getRecordingClockBridge: vi.fn(async () => current),
			createRecordingClockPair: create,
			stopRecordingClockBridge: stop,
		},
	});
	render(<RecordingClockBridgeControls projectId="one" />);
	const button = screen.getByRole("button", { name: "typing.clockBridge.pair" });
	await waitFor(() => expect(button).toBeEnabled());
	expect(create).not.toHaveBeenCalled();
	fireEvent.click(button);
	await waitFor(() => expect(screen.getByText("/tmp/private-link.json")).toBeInTheDocument());
	fireEvent.click(screen.getByRole("button", { name: "typing.clockBridge.stop" }));
	await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
	expect(screen.queryByText("/tmp/private-link.json")).not.toBeInTheDocument();
});

it("shows a helper capability failure distinctly and retains ordinary-capture availability", async () => {
	Object.assign(window, {
		electronAPI: {
			getRecordingClockBridge: vi
				.fn()
				.mockResolvedValue({ available: true, state: "disabled", peers: 0 }),
			createRecordingClockPair: vi.fn().mockResolvedValue({
				success: false,
				code: "clock-helper-unavailable",
				status: { available: true, state: "disabled", peers: 0 },
			}),
		},
	});
	render(<RecordingClockBridgeControls />);
	const button = screen.getByRole("button", { name: "typing.clockBridge.pair" });
	await waitFor(() => expect(button).toBeEnabled());
	fireEvent.click(button);
	await waitFor(() =>
		expect(screen.getByRole("alert")).toHaveTextContent("typing.clockBridge.helperError"),
	);
});
it("offers portable inspection even if no live integration API exists", async () => {
	Object.assign(window, { electronAPI: {} });
	render(<RecordingClockBridgeControls />);
	expect(screen.getByLabelText("typing.clockBridge.inspect")).toBeEnabled();
	expect(screen.getByRole("button", { name: "typing.clockBridge.pair" })).toBeDisabled();
});
