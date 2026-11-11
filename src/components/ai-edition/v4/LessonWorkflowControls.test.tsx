// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { newLesson, newStep, reviseLesson } from "@/lib/lesson/authoring";
import type { LessonManifest } from "@/lib/lesson/schema";
import { LessonWorkflowControls } from "./LessonWorkflowControls";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
it("replaces a selected step, records a manual check and handoff, then restores prior content", async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(window, "confirm").mockReturnValue(true);
	const a = newStep("Failed step"),
		b = { ...newStep("Accepted step"), status: "reviewed" as const };
	let current: LessonManifest = { ...newLesson(), steps: [a, b] };
	function Host() {
		const [lesson, setLesson] = useState(current);
		return (
			<LessonWorkflowControls
				lesson={lesson}
				onChange={(next) => {
					current = next;
					setLesson(next);
				}}
			/>
		);
	}
	render(
		<I18nProvider>
			<Host />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByText("Retakes, run checks and handoff"));
	fireEvent.change(screen.getByLabelText("Target step / next handoff step"), {
		target: { value: a.id },
	});
	const candidate = {
		...newLesson(),
		steps: [{ ...newStep("Fixed step"), instructions: "Move right" }],
	};
	const bytes = new TextEncoder().encode(JSON.stringify(candidate));
	fireEvent.change(screen.getByLabelText("Replacement editable lesson file"), {
		target: { files: [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }] },
	});
	await screen.findByLabelText("Replacement step");
	fireEvent.change(screen.getByLabelText("Replacement step"), {
		target: { value: candidate.steps[0].id },
	});
	fireEvent.change(screen.getByLabelText("Reason for replacement or restore"), {
		target: { value: "Fix movement" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Apply replacement take" }));
	await waitFor(() => expect(current.steps[0].title).toBe("Fixed step"));
	expect(current.steps[1]).toEqual(b);
	fireEvent.change(screen.getByLabelText("Expected result"), { target: { value: "Moves right" } });
	fireEvent.change(screen.getByLabelText("Observed result / errors / unavailable reason"), {
		target: { value: "Moved right in Godot" },
	});
	fireEvent.change(screen.getByLabelText("Manual check outcome"), { target: { value: "passed" } });
	fireEvent.click(screen.getByRole("button", { name: "Record manual run check" }));
	await screen.findByText(/Manual check matches current step content/);
	fireEvent.change(screen.getByLabelText("Handoff instructions, known problems and next action"), {
		target: { value: "Tutor should review movement" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Record handoff in lesson" }));
	await waitFor(() => expect(current.handoffs).toHaveLength(1));
	fireEvent.change(screen.getByLabelText("Earlier takes"), {
		target: { value: current.steps[0].retakes![0].id },
	});
	fireEvent.click(screen.getByRole("button", { name: "Restore earlier take as draft" }));
	await waitFor(() => expect(current.steps[0].title).toBe("Failed step"));
	expect(current.steps[0].verification).toBeUndefined();
	expect(current.steps[0].retakes).toHaveLength(2);
	expect(current.steps[1]).toEqual(b);
	expect(screen.getByText(/Lesson changed since this handoff/)).toBeDefined();
});

it("refuses a replacement load after the target lesson changes", async () => {
	let resolve!: (bytes: ArrayBuffer) => void;
	const pending = new Promise<ArrayBuffer>((r) => {
		resolve = r;
	});
	const original = { ...newLesson(), steps: [newStep("Original")] };
	const change = vi.fn();
	const show = (lesson: LessonManifest) => (
		<I18nProvider>
			<LessonWorkflowControls lesson={lesson} onChange={change} />
		</I18nProvider>
	);
	const view = render(show(original));
	fireEvent.change(screen.getByLabelText("Replacement editable lesson file"), {
		target: { files: [{ size: 100, arrayBuffer: () => pending }] },
	});
	view.rerender(show(reviseLesson(original, { title: "Edited during read" })));
	const bytes = new TextEncoder().encode(JSON.stringify(original));
	await act(async () => resolve(bytes.buffer));
	await screen.findByText(/operation could not be completed/);
	expect(screen.queryByLabelText("Replacement step")).toBeNull();
	expect(change).not.toHaveBeenCalled();
});
