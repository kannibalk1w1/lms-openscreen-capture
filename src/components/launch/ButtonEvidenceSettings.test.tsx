// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { disabledCapturePrivacyPolicy } from "@/lib/capturePrivacy";
import { ButtonEvidenceSettings } from "./ButtonEvidenceSettings";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(cleanup);
it("loads durable off policy and saves only an explicit global choice", async () => {
	const setRecordingPrefs = vi.fn(async (patch) => patch);
	Object.assign(window, {
		electronAPI: {
			getRecordingPrefs: vi
				.fn()
				.mockResolvedValue({ capturePrivacyPolicy: disabledCapturePrivacyPolicy() }),
			onRecordingPrefsChanged: vi.fn(),
			setRecordingPrefs,
		},
	});
	render(<ButtonEvidenceSettings />);
	await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
	expect(screen.getByRole("combobox")).toHaveValue("off");
	expect(setRecordingPrefs).not.toHaveBeenCalled();
	fireEvent.change(screen.getByRole("combobox"), { target: { value: "global" } });
	await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("global"));
	expect(setRecordingPrefs).toHaveBeenCalledWith({
		capturePrivacyPolicy: { ...disabledCapturePrivacyPolicy(), buttonScope: "global" },
	});
});
it("shows unsupported application scope and retains the saved policy on write failure", async () => {
	const policy = {
		...disabledCapturePrivacyPolicy(),
		buttonScope: "applications" as const,
		allowedApplications: ["teaching.app"],
	};
	Object.assign(window, {
		electronAPI: {
			getRecordingPrefs: vi.fn().mockResolvedValue({ capturePrivacyPolicy: policy }),
			onRecordingPrefsChanged: vi.fn(),
			setRecordingPrefs: vi.fn().mockRejectedValue(new Error("disk full")),
		},
	});
	render(<ButtonEvidenceSettings />);
	await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
	expect(screen.getByRole("status")).toHaveTextContent("buttonPrivacy.unsupported");
	fireEvent.change(screen.getByRole("combobox"), { target: { value: "global" } });
	await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
	expect(screen.getByRole("combobox")).toHaveValue("applications");
});
it("does not apply an old initial read after a newer preference notification", async () => {
	let resolve: (value: unknown) => void = () => undefined;
	let listener: (value: { capturePrivacyPolicy: unknown }) => void = () => undefined;
	Object.assign(window, {
		electronAPI: {
			getRecordingPrefs: vi.fn(
				() =>
					new Promise((done) => {
						resolve = done;
					}),
			),
			onRecordingPrefsChanged: vi.fn((callback) => {
				listener = callback;
				return vi.fn();
			}),
		},
	});
	render(<ButtonEvidenceSettings />);
	expect(screen.getByRole("combobox")).toHaveValue("pending");
	expect(screen.getByRole("combobox")).toBeDisabled();
	await act(async () => {
		listener({
			capturePrivacyPolicy: { ...disabledCapturePrivacyPolicy(), buttonScope: "global" },
		});
		resolve({ capturePrivacyPolicy: disabledCapturePrivacyPolicy() });
	});
	expect(screen.getByRole("combobox")).toHaveValue("global");
});

it("keeps unsaved application rules through unrelated preference broadcasts", async () => {
	let listener: (value: { capturePrivacyPolicy: unknown }) => void = () => undefined;
	const policy = {
		...disabledCapturePrivacyPolicy(),
		buttonScope: "applications" as const,
		allowedApplications: ["teaching.app"],
	};
	Object.assign(window, {
		electronAPI: {
			getRecordingPrefs: vi.fn().mockResolvedValue({ capturePrivacyPolicy: policy }),
			onRecordingPrefsChanged: vi.fn((callback) => {
				listener = callback;
				return vi.fn();
			}),
		},
	});
	render(<ButtonEvidenceSettings />);
	await waitFor(() => expect(screen.getByRole("combobox")).toBeEnabled());
	const draft = screen.getByLabelText("buttonPrivacy.allowed");
	fireEvent.change(draft, { target: { value: "unsaved.app" } });
	await act(async () => {
		listener({ capturePrivacyPolicy: policy });
	});
	expect(draft).toHaveValue("unsaved.app");
});
