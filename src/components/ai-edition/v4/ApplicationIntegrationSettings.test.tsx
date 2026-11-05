// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GODOT_JOURNAL_DESCRIPTOR } from "@/lib/applicationIntegrations/schema";
import { ApplicationIntegrationSettings } from "./ApplicationIntegrationSettings";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(cleanup);
const snapshot = (enabled = false) => ({
	settings: { version: 1 as const, enabledAdapterIds: enabled ? ["godot-codeedit" as const] : [] },
	statuses: [
		{
			descriptor: GODOT_JOURNAL_DESCRIPTOR,
			enabled,
			state: enabled ? ("available-offline" as const) : ("disabled" as const),
			activeSessions: 0,
		},
	],
	saveFailed: false,
});
it("loads disabled state and saves only an explicit keyboard-accessible opt-in", async () => {
	const set = vi.fn(async () => ({ success: true, ...snapshot(true) }));
	Object.assign(window, {
		electronAPI: {
			getApplicationIntegrations: vi.fn().mockResolvedValue(snapshot()),
			setApplicationIntegrations: set,
		},
	});
	render(<ApplicationIntegrationSettings />);
	const checkbox = screen.getByRole("checkbox");
	await waitFor(() => expect(checkbox).toBeEnabled());
	expect(checkbox).not.toBeChecked();
	expect(set).not.toHaveBeenCalled();
	fireEvent.click(checkbox);
	await waitFor(() => expect(checkbox).toBeChecked());
	expect(set).toHaveBeenCalledWith({ version: 1, enabledAdapterIds: ["godot-codeedit"] });
	expect(screen.getByRole("status")).toHaveTextContent("available-offline");
});
it("shows unavailable when the optional main API is absent", async () => {
	Object.assign(window, { electronAPI: {} });
	render(<ApplicationIntegrationSettings />);
	await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable"));
	expect(screen.getByRole("checkbox")).toBeDisabled();
});
it("reports a failed durable disable while showing the actual disabled runtime", async () => {
	const set = vi.fn(async () => ({ success: false, ...snapshot(false), saveFailed: true }));
	Object.assign(window, {
		electronAPI: {
			getApplicationIntegrations: vi.fn().mockResolvedValue(snapshot(true)),
			setApplicationIntegrations: set,
		},
	});
	render(<ApplicationIntegrationSettings />);
	await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
	fireEvent.click(screen.getByRole("checkbox"));
	await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
	expect(screen.getByRole("checkbox")).not.toBeChecked();
});
it("discards an old initial read after a newer settings event", async () => {
	let finish: (value: ReturnType<typeof snapshot>) => void = () => undefined;
	let changed: (value: ReturnType<typeof snapshot>) => void = () => undefined;
	Object.assign(window, {
		electronAPI: {
			getApplicationIntegrations: () =>
				new Promise((resolve) => {
					finish = resolve;
				}),
			setApplicationIntegrations: vi.fn(),
			onApplicationIntegrationsChanged: (callback: typeof changed) => {
				changed = callback;
				return vi.fn();
			},
		},
	});
	render(<ApplicationIntegrationSettings />);
	await act(async () => {
		changed(snapshot(true));
		finish(snapshot(false));
	});
	expect(screen.getByRole("checkbox")).toBeChecked();
});
