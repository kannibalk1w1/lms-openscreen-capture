// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { MAX_SCENE_JOURNAL_BYTES } from "@/lib/applicationIntegrations/godotScene";
import { sceneSource } from "@/lib/applicationIntegrations/godotScene.test-support";
import { newLesson } from "@/lib/lesson/authoring";
import { ApplicationCaptureReview } from "./ApplicationCaptureReview";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
function show() {
	vi.stubGlobal("crypto", webcrypto);
	const append = vi.fn();
	const view = render(
		<I18nProvider>
			<ApplicationCaptureReview lesson={newLesson()} onAppend={append} />
		</I18nProvider>,
	);
	return { ...view, append };
}
function importFile(text: () => Promise<string>, size?: number) {
	const file = new File(["fixture"], "scene.jsonl");
	Object.defineProperty(file, "text", { value: text });
	if (size !== undefined) Object.defineProperty(file, "size", { value: size });
	fireEvent.change(screen.getByLabelText("Import application capture or Godot journal"), {
		target: { files: [file] },
	});
}
it("requires explicit file and observation choices, then appends only selected evidence", async () => {
	const { append } = show();
	expect(append).not.toHaveBeenCalled();
	importFile(async () => sceneSource());
	await screen.findByText(/6 observations/);
	expect(
		(
			screen.getByRole("button", {
				name: "Add selected observations as draft steps",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("checkbox", { name: /Node changed: Slime/ }));
	fireEvent.click(screen.getByRole("button", { name: "Add selected observations as draft steps" }));
	expect(append).toHaveBeenCalledOnce();
	expect(append.mock.calls[0][0].steps).toHaveLength(1);
	expect(append.mock.calls[0][0].steps[0].evidence[0].application.payload.after.name).toBe("Slime");
	fireEvent.click(screen.getByRole("button", { name: "Close journal review" }));
	expect(screen.queryByText(/6 observations/)).toBeNull();
});
it("rejects oversized and truncated files, never appending a partial import", async () => {
	const { append } = show();
	const read = vi.fn(async () => sceneSource());
	importFile(read, MAX_SCENE_JOURNAL_BYTES + 1);
	await screen.findByText(/Could not read this capture/);
	expect(read).not.toHaveBeenCalled();
	importFile(async () => sceneSource().trimEnd().split("\n").slice(0, -1).join("\n"));
	await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not read"));
	expect(append).not.toHaveBeenCalled();
});
it("ignores a file read that finishes after the component is gone", async () => {
	const { unmount, append } = show();
	let finish: (value: string) => void = () => undefined;
	importFile(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	unmount();
	await act(async () => finish(sceneSource()));
	expect(append).not.toHaveBeenCalled();
});

it("reviews and drafts a normalized non-Godot capture with the same controls", async () => {
	const { append } = show();
	const capture = {
		format: "openscreen-application-capture",
		version: 1,
		adapterId: "fixture-editor",
		instanceId: "instance",
		sessionId: "session",
		scope: "fixture document",
		clock: "unmapped",
		coverage: "sampled",
		stopReason: "user-stop",
		pollIntervalMs: 100,
		durationMs: 1000,
		baseline: { objects: [] },
		observations: [
			{
				id: "1",
				atMs: 100,
				type: "object.properties",
				label: "Object property changed",
				payload: { before: { value: 1 }, after: { value: 2 } },
			},
		],
	};
	importFile(async () => JSON.stringify(capture));
	await screen.findByText(/fixture-editor · fixture document/);
	fireEvent.click(screen.getByRole("checkbox", { name: /Object property changed/ }));
	fireEvent.click(screen.getByRole("button", { name: "Add selected observations as draft steps" }));
	expect(append.mock.calls[0][0].steps[0].evidence[0].application.adapterId).toBe("fixture-editor");
	expect(append.mock.calls[0][0].steps[0].instructions).not.toContain("Godot");
});
