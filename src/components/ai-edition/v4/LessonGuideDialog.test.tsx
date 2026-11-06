// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonApi } from "@/lib/lesson/api";
import { newLesson, newStep } from "@/lib/lesson/authoring";
import { imageFixture } from "@/lib/lesson/fixtures.test-support";
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
	vi.restoreAllMocks();
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
it("persists reading settings and filters source steps without exporting hidden selections", async () => {
	const lessonSave = vi.fn<NonNullable<LessonApi["lessonSave"]>>(async () => ({
		success: true,
		result: { status: "saved", path: "/new/profile.json" },
	}));
	const lessonExport = vi.fn<NonNullable<LessonApi["lessonExport"]>>(async () => ({
		success: true,
		result: { status: "exported", path: "/new/guide", steps: 1, images: 0 },
	}));
	vi.stubGlobal("electronAPI", { lessonSave, lessonExport });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	let title = screen.getByLabelText("Step title");
	fireEvent.change(title, { target: { value: "Alpha" } });
	fireEvent.blur(title);
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	title = screen.getAllByLabelText("Step title")[1];
	fireEvent.change(title, { target: { value: "Beta" } });
	fireEvent.blur(title);
	fireEvent.change(screen.getByLabelText("Reading preset"), { target: { value: "large-print" } });
	fireEvent.change(screen.getByLabelText("Content language (does not translate text)"), {
		target: { value: "ar" },
	});
	fireEvent.change(screen.getByLabelText("Reading direction"), { target: { value: "rtl" } });
	fireEvent.click(screen.getByLabelText("Include optional code"));
	fireEvent.change(screen.getByLabelText("Find by step title"), { target: { value: "Alpha" } });
	expect(screen.getAllByLabelText("Step title")).toHaveLength(1);
	expect(
		(screen.getByRole("button", { name: "Export selected offline guide" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Select matching steps" }));
	expect(
		(screen.getByRole("button", { name: "Export selected offline guide" }) as HTMLButtonElement)
			.disabled,
	).toBe(false);
	fireEvent.click(screen.getByRole("button", { name: "Save new editable copy" }));
	await waitFor(() => expect(lessonSave).toHaveBeenCalledTimes(1));
	expect(lessonSave.mock.calls[0][0].steps).toHaveLength(2);
	expect(lessonSave.mock.calls[0][0].output).toMatchObject({
		preset: "large-print",
		language: "ar",
		direction: "rtl",
		includeCode: false,
	});
	await screen.findByText("Editable copy saved: /new/profile.json");
	fireEvent.click(screen.getByRole("button", { name: "Export selected offline guide" }));
	await waitFor(() => expect(lessonExport).toHaveBeenCalledTimes(1));
	expect(lessonExport.mock.calls[0][1]).toEqual([lessonExport.mock.calls[0][0].steps[0].id]);
});
it("keeps a reviewed row focused and accepts continued typing after it becomes draft", async () => {
	vi.stubGlobal("electronAPI", undefined);
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByLabelText("I have reviewed this step"));
	fireEvent.change(screen.getByLabelText("Source review label"), { target: { value: "reviewed" } });
	const instructions = screen.getByLabelText("Instructions");
	instructions.focus();
	fireEvent.change(instructions, { target: { value: "First" } });
	expect(document.activeElement).toBe(instructions);
	fireEvent.change(instructions, { target: { value: "First and more typing" } });
	expect(screen.getByLabelText("Instructions")).toBe(instructions);
	expect((instructions as HTMLTextAreaElement).value).toBe("First and more typing");
	expect(
		screen.getByText("The edited source step is now draft and stays visible until filters change."),
	).toBeTruthy();
	fireEvent.change(screen.getByLabelText("Find by step title"), { target: { value: "no-match" } });
	expect(screen.queryByLabelText("Instructions")).toBeNull();
});
it("keeps a newly reviewed draft row visible until filters change", () => {
	vi.stubGlobal("electronAPI", undefined);
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Source review label"), { target: { value: "draft" } });
	const reviewed = screen.getByLabelText("I have reviewed this step");
	reviewed.focus();
	fireEvent.click(reviewed);
	expect(screen.getByLabelText("I have reviewed this step")).toBe(reviewed);
	expect(document.activeElement).toBe(reviewed);
	expect(
		screen.getByText("The source step is marked reviewed and stays visible until filters change."),
	).toBeTruthy();
});

it.each([
	false,
	true,
])("ignores a pending illustration after restoring a lesson (same identity: %s)", async (sameIdentity) => {
	const image = await imageFixture();
	let finish: () => void = () => undefined;
	const restored = {
		...newLesson("Restored"),
		steps: [newStep("Restored one"), newStep("Restored two")],
	};
	const frame = vi.fn<NonNullable<LessonApi["lessonFrame"]>>(
		() =>
			new Promise((resolve) => {
				finish = () => resolve({ success: true, result: image });
			}),
	);
	const save = vi.fn<NonNullable<LessonApi["lessonSave"]>>(async (lesson) => {
		if (sameIdentity) {
			restored.id = lesson.id;
			restored.steps[0].id = lesson.steps[0].id;
			restored.revision = lesson.revision + 10;
		}
		return { success: true, result: { status: "cancelled" } };
	});
	vi.stubGlobal("electronAPI", {
		lessonFrame: frame,
		lessonSave: save,
		lessonDraftList: async () => ({
			success: true,
			result: [
				{
					id: crypto.randomUUID(),
					title: "Restored",
					revision: 0,
					bytes: 100,
					savedAt: "2026-11-06T08:00:00Z",
					readable: true,
				},
			],
		}),
		lessonDraftRead: async () => ({ success: true, result: restored }),
	});
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Save new editable copy" }));
	await waitFor(() =>
		expect(
			(screen.getByRole("button", { name: "Save new editable copy" }) as HTMLButtonElement)
				.disabled,
		).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "Illustrate from current saved playhead" }));
	await waitFor(() => expect(frame).toHaveBeenCalledTimes(1));
	// Deliberately inject the independent restore callback while rendering is pending.
	fireEvent.click(screen.getByRole("button", { name: "Show local recovery copies" }));
	await screen.findByRole("button", { name: "Preview restore" });
	fireEvent.click(screen.getByRole("button", { name: "Preview restore" }));
	await screen.findByRole("button", { name: "Restore this copy" });
	fireEvent.click(screen.getByRole("button", { name: "Restore this copy" }));
	await waitFor(() => expect(screen.getAllByLabelText("Step title")).toHaveLength(2));
	await act(async () => finish());
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	expect(
		screen.getAllByLabelText("Step title").map((input) => (input as HTMLInputElement).value),
	).toEqual(["Restored one", "Restored two"]);
	expect(document.querySelector("img")).toBeNull();
});
it("preserves text edits delivered while an illustration is pending", async () => {
	const image = await imageFixture();
	let finish: () => void = () => undefined;
	const frame = vi.fn<NonNullable<LessonApi["lessonFrame"]>>(
		() =>
			new Promise((resolve) => {
				finish = () => resolve({ success: true, result: image });
			}),
	);
	vi.stubGlobal("electronAPI", { lessonFrame: frame });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Illustrate from current saved playhead" }));
	await waitFor(() => expect(frame).toHaveBeenCalledTimes(1));
	fireEvent.change(screen.getByLabelText("Instructions"), {
		target: { value: "Later authored text" },
	});
	await act(async () => finish());
	await waitFor(() => expect(document.querySelector("img")).toBeTruthy());
	expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
		"Later authored text",
	);
});
it("refuses a pending illustration after the source document changes", async () => {
	const image = await imageFixture();
	let finish: () => void = () => undefined;
	const frame = vi.fn<NonNullable<LessonApi["lessonFrame"]>>(
		() =>
			new Promise((resolve) => {
				finish = () => resolve({ success: true, result: image });
			}),
	);
	vi.stubGlobal("electronAPI", { lessonFrame: frame });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Illustrate from current saved playhead" }));
	await waitFor(() => expect(frame).toHaveBeenCalledTimes(1));
	await act(async () => {
		useProjectStore.setState({
			document: createEmptyDocument({ projectId: "p", title: "Changed" }),
		});
		finish();
	});
	await screen.findByText(
		"Save and reload the current video project, then capture the still again. Its render inputs changed or edits are unsaved.",
	);
	expect(document.querySelector("img")).toBeNull();
});

it("rejects source changes while illustration integrity validation is still pending", async () => {
	const image = await imageFixture();
	let finishFrame: () => void = () => undefined,
		finishDigest: () => void = () => undefined;
	const frame = vi.fn<NonNullable<LessonApi["lessonFrame"]>>(
		() =>
			new Promise((resolve) => {
				finishFrame = () => resolve({ success: true, result: image });
			}),
	);
	vi.stubGlobal("electronAPI", { lessonFrame: frame });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Illustrate from current saved playhead" }));
	await waitFor(() => expect(frame).toHaveBeenCalledTimes(1));
	const original = webcrypto.subtle.digest.bind(webcrypto.subtle);
	const digest = vi
		.spyOn(webcrypto.subtle, "digest")
		.mockImplementation(async (algorithm, data) => {
			await new Promise<void>((resolve) => {
				finishDigest = resolve;
			});
			return original(algorithm, data);
		});
	await act(async () => finishFrame());
	await waitFor(() => expect(digest).toHaveBeenCalledTimes(1));
	await act(async () => {
		useProjectStore.setState({
			document: createEmptyDocument({ projectId: "p", title: "Changed during validation" }),
		});
		finishDigest();
	});
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	await screen.findByText(
		"Save and reload the current video project, then capture the still again. Its render inputs changed or edits are unsaved.",
	);
	expect(document.querySelector("img")).toBeNull();
});
