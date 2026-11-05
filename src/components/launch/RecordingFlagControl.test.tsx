// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { DEFAULT_SHORTCUTS } from "@/lib/shortcuts";
import { RecordingFlagControl } from "./RecordingFlagControl";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
it("shows failed global registration and still offers the recording button", async () => {
	const status = {
		running: true,
		paused: false,
		count: 0,
		shortcut: DEFAULT_SHORTCUTS.addFlag,
		shortcutAvailable: false,
		error: "shortcut-unavailable",
	};
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			getRecordingFlagsStatus: vi.fn(async () => status),
			addRecordingFlag: vi.fn(async () => ({ ...status, count: 1, success: true })),
		},
	});
	const view = render(
		<I18nProvider>
			<RecordingFlagControl disabled={false} />
		</I18nProvider>,
	);
	await screen.findByText("No hotkey");
	const button = screen.getByRole("button", { name: "Add flag" });
	expect((button as HTMLButtonElement).disabled).toBe(false);
	fireEvent.click(button);
	await waitFor(() => expect(screen.getByRole("status").textContent).toBe("1"));
	view.rerender(
		<I18nProvider>
			<RecordingFlagControl disabled />
		</I18nProvider>,
	);
	expect((button as HTMLButtonElement).disabled).toBe(true);
});
