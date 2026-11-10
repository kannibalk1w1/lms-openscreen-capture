// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson } from "@/lib/lesson/authoring";
import { ApplicationCaptureReview } from "./ApplicationCaptureReview";

const { importCapture, listCheckpoints } = vi.hoisted(() => ({
	importCapture: vi.fn(),
	listCheckpoints: vi.fn(),
}));
vi.mock("@/lib/applicationIntegrations/importCapture", () => ({
	importApplicationCapture: importCapture,
}));
vi.mock("@/lib/applicationIntegrations/godotScene", () => ({
	listGodotSceneCheckpoints: listCheckpoints,
}));
vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string, vars?: Record<string, string | number>) => {
		const messages: Record<string, string> = {
			"lesson.scene.title": "Application capture observations",
			"lesson.scene.import": "Import application capture or Godot journal",
			"lesson.scene.scope": "Optional local scene observation review.",
			"lesson.scene.loading": "Reading application capture…",
			"lesson.scene.invalid": "Could not read this capture.",
			"lesson.scene.inventory": `${vars?.adapter} · ${vars?.scene} · ${vars?.count} observations · ${vars?.duration} ms`,
			"lesson.scene.unverified": "Imported producer claims.",
			"lesson.scene.forget": "Close journal review",
			"lesson.association.title": "Associate recording times",
			"lesson.checkpoints.title": "Compare scene checkpoints",
			"lesson.checkpoints.scope": "Compare in the selected order.",
			"lesson.checkpoints.from": "From checkpoint",
			"lesson.checkpoints.to": "To checkpoint",
			"lesson.checkpoints.choose": "Choose a checkpoint",
			"lesson.checkpoints.compare": "Compare checkpoints",
		};
		return messages[key] ?? key;
	},
}));

const checkpoints = [
	{ recordSequence: 5, label: "Sprite configured", atMs: 1200, snapshotSequence: 4 },
	{ recordSequence: 9, label: "Sprite configured", atMs: 2450, snapshotSequence: 8 },
];
const capture = {
	format: "openscreen-application-capture",
	version: 1,
	adapterId: "godot-scene",
	instanceId: "instance",
	sessionId: "session",
	scope: "res://enemy.tscn",
	clock: "unmapped",
	coverage: "sampled",
	stopReason: "user-stop",
	pollIntervalMs: 250,
	durationMs: 2500,
	baseline: { nodes: [] },
	observations: [
		{ id: "obs-1", atMs: 1200, type: "node-changed", label: "Observed change", payload: {} },
	],
};

beforeEach(() => {
	importCapture.mockReset().mockReturnValue(capture);
	listCheckpoints.mockReset().mockReturnValue(checkpoints);
});
afterEach(cleanup);
function show() {
	const view = render(<ApplicationCaptureReview lesson={newLesson()} onAppend={vi.fn()} />);
	fireEvent.click(screen.getByText("Application capture observations"));
	return view;
}
function chooseFile(contents: string) {
	const file = new File([contents], "capture.jsonl");
	Object.defineProperty(file, "text", { value: async () => contents });
	fireEvent.change(screen.getByLabelText("Import application capture or Godot journal"), {
		target: { files: [file] },
	});
}
it("offers comparison only for raw validated Godot journals with at least two authored markers", async () => {
	show();
	const raw = '{"event":"scene-start"}\n{"event":"scene-checkpoint"}\n';
	chooseFile(raw);
	await screen.findByText(/godot-scene · res:\/\/enemy.tscn · 1 observations/);
	expect(listCheckpoints).toHaveBeenCalledWith(raw);
	expect(screen.getByText("Compare scene checkpoints")).toBeTruthy();

	listCheckpoints.mockReturnValueOnce([checkpoints[0]]);
	chooseFile('{"event":"another-raw-journal"}\n');
	await screen.findByText(/godot-scene · res:\/\/enemy.tscn · 1 observations/);
	expect(screen.queryByText("Compare scene checkpoints")).toBeNull();
});
it("does not invent checkpoint states from normalized Godot or other application captures", async () => {
	show();
	const normalizedGodot = JSON.stringify({ format: "openscreen-application-capture", version: 1 });
	chooseFile(normalizedGodot);
	await screen.findByText(/godot-scene · res:\/\/enemy.tscn/);
	expect(listCheckpoints).not.toHaveBeenCalled();
	expect(screen.queryByText("Compare scene checkpoints")).toBeNull();

	importCapture.mockReturnValueOnce({ ...capture, adapterId: "fixture-editor" });
	chooseFile(JSON.stringify({ format: "openscreen-application-capture", version: 1 }));
	await screen.findByText(/fixture-editor · res:\/\/enemy.tscn/);
	expect(listCheckpoints).not.toHaveBeenCalled();
	expect(screen.queryByText("Compare scene checkpoints")).toBeNull();
});
it("clears raw source and component selection/results on reimport and forget", async () => {
	show();
	chooseFile("raw journal first\n");
	await screen.findByText("Compare scene checkpoints");
	fireEvent.click(screen.getByText("Compare scene checkpoints"));
	fireEvent.change(screen.getByLabelText("From checkpoint"), { target: { value: "5" } });
	fireEvent.change(screen.getByLabelText("To checkpoint"), { target: { value: "9" } });
	fireEvent.click(screen.getByRole("button", { name: "Compare checkpoints" }));

	const normalized = JSON.stringify({ format: "openscreen-application-capture", version: 1 });
	chooseFile(normalized);
	await waitFor(() => expect(screen.queryByText("Compare scene checkpoints")).toBeNull());
	chooseFile("raw journal second\n");
	await screen.findByText("Compare scene checkpoints");
	fireEvent.click(screen.getByText("Close journal review"));
	expect(screen.queryByText("Compare scene checkpoints")).toBeNull();
});
it("falls back to generic journal review if strict checkpoint enumeration fails", async () => {
	listCheckpoints.mockImplementationOnce(() => {
		throw new Error("PRIVATE_MARKER_DATA");
	});
	show();
	chooseFile("raw journal invalid marker sequence\n");
	await screen.findByText(/godot-scene · res:\/\/enemy.tscn/);
	expect(screen.queryByText("Compare scene checkpoints")).toBeNull();
	expect(screen.queryByText("PRIVATE_MARKER_DATA")).toBeNull();
});
