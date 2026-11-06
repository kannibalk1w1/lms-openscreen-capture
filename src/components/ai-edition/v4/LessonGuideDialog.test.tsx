// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonApi } from "@/lib/lesson/api";
import { newLesson, newStep } from "@/lib/lesson/authoring";
import { LessonGuideDialog } from "./LessonGuideDialog";

beforeEach(() => {
	vi.stubGlobal("crypto", webcrypto);
	const doc = createEmptyDocument({ projectId: "p", title: "Generic" });
	useProjectStore.setState({ projectId: "p", document: doc, dirty: false });
});
afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
	vi.unstubAllGlobals();
});
function show() {
	return render(
		<I18nProvider>
			<LessonGuideDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
}
it("authors and renumbers stable steps with every integration/API absent", () => {
	vi.stubGlobal("electronAPI", undefined);
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Step title"), { target: { value: "First" } });
	fireEvent.blur(screen.getByLabelText("Step title"));
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getAllByLabelText("Step title")[1], { target: { value: "Second" } });
	fireEvent.blur(screen.getAllByLabelText("Step title")[1]);
	fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]);
	expect(
		screen.getAllByLabelText("Step title").map((input) => (input as HTMLInputElement).value),
	).toEqual(["Second", "First"]);
	expect(
		(screen.getByRole("button", { name: "Export selected offline guide" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
it("exports only included steps and keeps editable save separate", async () => {
	const lessonSave = vi.fn<NonNullable<LessonApi["lessonSave"]>>(async () => ({
		success: true as const,
		result: { status: "saved" as const, path: "/new/lesson.json" },
	}));
	const lessonExport = vi.fn<NonNullable<LessonApi["lessonExport"]>>(async () => ({
		success: true as const,
		result: { status: "exported" as const, path: "/new/guide", steps: 1, images: 0 },
	}));
	vi.stubGlobal("electronAPI", { lessonSave, lessonExport });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByLabelText("Include step 2"));
	fireEvent.click(screen.getByRole("button", { name: "Export selected offline guide" }));
	await waitFor(() => expect(lessonExport).toHaveBeenCalledTimes(1));
	expect(lessonExport.mock.calls[0][0].steps).toHaveLength(2);
	expect(lessonExport.mock.calls[0][1]).toHaveLength(1);
	expect(lessonSave).not.toHaveBeenCalled();
	await screen.findByText("Guide folder verified: /new/guide");
});
it("ignores an opened lesson that returns after the active project changes", async () => {
	const old = { ...newLesson("OLD_PROJECT_CANARY"), steps: [newStep()] };
	let finish: () => void = () => undefined;
	vi.stubGlobal("electronAPI", {
		lessonOpen: () =>
			new Promise((resolve) => {
				finish = () => resolve({ success: true, result: { status: "opened", lesson: old } });
			}),
	});
	const view = show();
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await act(async () => {
		useProjectStore.setState({
			projectId: "other",
			document: createEmptyDocument({ projectId: "other", title: "Other" }),
		});
	});
	view.rerender(
		<I18nProvider>
			<LessonGuideDialog open onClose={vi.fn()} />
		</I18nProvider>,
	);
	await act(async () => finish());
	expect(screen.queryByDisplayValue("OLD_PROJECT_CANARY")).toBeNull();
});

it("permits clear/retype and commits a valid title on blur", () => {
	vi.stubGlobal("electronAPI", undefined);
	show();
	const input = screen.getByLabelText("Lesson title");
	fireEvent.change(input, { target: { value: "" } });
	expect((input as HTMLInputElement).value).toBe("");
	fireEvent.change(input, { target: { value: "Retyped" } });
	fireEvent.blur(input);
	expect((input as HTMLInputElement).value).toBe("Retyped");
});
