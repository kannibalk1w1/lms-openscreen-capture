// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { sceneSource } from "@/lib/applicationIntegrations/godotScene.test-support";
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
	fireEvent.click(screen.getByRole("button", { name: /^Move up: step 2, / }));
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

it("appends imported drafts without resetting filters or changing prior selection", async () => {
	vi.stubGlobal("electronAPI", undefined);
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getAllByLabelText("Step title")[0], { target: { value: "Keep this" } });
	fireEvent.blur(screen.getAllByLabelText("Step title")[0]);
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getAllByLabelText("Step title")[1], { target: { value: "Hide this" } });
	fireEvent.blur(screen.getAllByLabelText("Step title")[1]);
	fireEvent.click(screen.getByLabelText("Include step 2"));
	fireEvent.change(screen.getByLabelText("Find by step title"), {
		target: { value: "Keep" },
	});

	fireEvent.click(screen.getByText("Application capture observations"));
	const file = new File(["fixture"], "capture.jsonl");
	Object.defineProperty(file, "text", { value: async () => sceneSource() });
	fireEvent.change(screen.getByLabelText("Import application capture or Godot journal"), {
		target: { files: [file] },
	});
	await screen.findByText(/6 observations/);
	fireEvent.click(screen.getByRole("checkbox", { name: /Node changed: Slime/ }));
	fireEvent.click(screen.getByRole("button", { name: "Add selected observations as draft steps" }));

	expect((screen.getByLabelText("Find by step title") as HTMLInputElement).value).toBe("Keep");
	expect(screen.getByDisplayValue("Keep this")).toBeTruthy();
	expect(screen.queryByDisplayValue("Hide this")).toBeNull();
	expect((screen.getByLabelText("Include step 1") as HTMLInputElement).checked).toBe(true);
	expect((screen.getByLabelText("Include step 3") as HTMLInputElement).checked).toBe(true);
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
	fireEvent.click(
		screen.getByRole("button", { name: /^Illustrate from current saved playhead: / }),
	);
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
	fireEvent.click(
		screen.getByRole("button", { name: /^Illustrate from current saved playhead: / }),
	);
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
	fireEvent.click(
		screen.getByRole("button", { name: /^Illustrate from current saved playhead: / }),
	);
	await waitFor(() => expect(frame).toHaveBeenCalledTimes(1));
	await act(async () => {
		useProjectStore.setState({
			document: createEmptyDocument({ projectId: "p", title: "Changed" }),
		});
		finish();
	});
	await screen.findByText(
		"Save and reload the current video project, then retry the lesson operation. Its render inputs changed or edits are unsaved.",
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
	fireEvent.click(
		screen.getByRole("button", { name: /^Illustrate from current saved playhead: / }),
	);
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
		"Save and reload the current video project, then retry the lesson operation. Its render inputs changed or edits are unsaved.",
	);
	expect(document.querySelector("img")).toBeNull();
});
it("attaches an explicit saved-project range, saves it only in the lesson and permits removal", async () => {
	const plan = vi.fn<NonNullable<LessonApi["lessonPlanRange"]>>(async (input) => ({
		success: true,
		result: {
			...input,
			version: 1,
			provenance: "authored-selection",
			basis: "editor-ruler-seconds",
			fingerprintKind: "render-inputs-v1",
			keptSpans: [{ startSec: input.startSec, endSec: input.endSec }],
			programme: {
				basis: "editor-programme-seconds",
				startSec: input.startSec,
				endSec: input.endSec,
			},
		},
	}));
	const save = vi.fn<NonNullable<LessonApi["lessonSave"]>>(async () => ({
		success: true,
		result: { status: "cancelled" },
	}));
	vi.stubGlobal("electronAPI", { lessonPlanRange: plan, lessonSave: save });
	const source = useProjectStore.getState().document;
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	const attach = screen.getByRole("button", {
		name: "Attach range from saved project",
	}) as HTMLButtonElement;
	expect(attach.disabled).toBe(true);
	fireEvent.change(screen.getByLabelText("Ruler start (seconds)"), { target: { value: "2" } });
	fireEvent.change(screen.getByLabelText("Ruler end (seconds)"), { target: { value: "4" } });
	fireEvent.click(screen.getByLabelText("I have reviewed this step"));
	fireEvent.click(attach);
	await screen.findByText(
		"Stored range: 2–4 ruler seconds, 1 kept spans. Review the source before sharing.",
	);
	expect(plan.mock.calls[0][0]).toMatchObject({ projectId: "p", startSec: 2, endSec: 4 });
	expect((screen.getByLabelText("I have reviewed this step") as HTMLInputElement).checked).toBe(
		false,
	);
	expect(useProjectStore.getState().document).toBe(source);
	fireEvent.click(screen.getByRole("button", { name: "Save new editable copy" }));
	await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
	expect(save.mock.calls[0][0].steps[0].mediaSelection).toMatchObject({
		startSec: 2,
		endSec: 4,
		provenance: "authored-selection",
	});
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "Remove video range reference" }));
	expect(screen.queryByText(/Stored reference:/)).toBeNull();
});
it("ignores a pending range plan when the source document changes", async () => {
	let finish: () => void = () => undefined;
	const plan = vi.fn<NonNullable<LessonApi["lessonPlanRange"]>>(
		(input) =>
			new Promise((resolve) => {
				finish = () =>
					resolve({
						success: true,
						result: {
							...input,
							version: 1,
							provenance: "authored-selection",
							basis: "editor-ruler-seconds",
							fingerprintKind: "render-inputs-v1",
							keptSpans: [{ startSec: input.startSec, endSec: input.endSec }],
							programme: {
								basis: "editor-programme-seconds",
								startSec: input.startSec,
								endSec: input.endSec,
							},
						},
					});
			}),
	);
	vi.stubGlobal("electronAPI", { lessonPlanRange: plan });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Ruler end (seconds)"), { target: { value: "4" } });
	fireEvent.click(screen.getByRole("button", { name: "Attach range from saved project" }));
	await waitFor(() => expect(plan).toHaveBeenCalledTimes(1));
	await act(async () => {
		useProjectStore.setState({
			document: createEmptyDocument({ projectId: "p", title: "Changed" }),
		});
		finish();
	});
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	expect(screen.queryByText(/Stored reference:/)).toBeNull();
	await screen.findByText(
		"Save and reload the current video project, then retry the lesson operation. Its render inputs changed or edits are unsaved.",
	);
});

it("refuses a dirty non-render edit before calling the range planner", async () => {
	const plan = vi.fn();
	vi.stubGlobal("electronAPI", { lessonPlanRange: plan });
	useProjectStore.setState({ dirty: true });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Ruler end (seconds)"), { target: { value: "2" } });
	fireEvent.click(screen.getByRole("button", { name: "Attach range from saved project" }));
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	expect(plan).not.toHaveBeenCalled();
	expect(screen.queryByText(/Stored reference:/)).toBeNull();
});
it("rejects a structurally valid range response that does not echo the requested interval", async () => {
	const plan = vi.fn<NonNullable<LessonApi["lessonPlanRange"]>>(async (input) => ({
		success: true,
		result: {
			...input,
			version: 1,
			provenance: "authored-selection",
			basis: "editor-ruler-seconds",
			fingerprintKind: "render-inputs-v1",
			startSec: 1,
			endSec: 3,
			keptSpans: [{ startSec: 1, endSec: 3 }],
			programme: { basis: "editor-programme-seconds", startSec: 1, endSec: 3 },
		},
	}));
	vi.stubGlobal("electronAPI", { lessonPlanRange: plan });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.change(screen.getByLabelText("Ruler end (seconds)"), { target: { value: "2" } });
	fireEvent.click(screen.getByRole("button", { name: "Attach range from saved project" }));
	await waitFor(() => expect(plan).toHaveBeenCalledTimes(1));
	await waitFor(() =>
		expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false),
	);
	expect(screen.queryByText(/Stored reference:/)).toBeNull();
});
it("closing the guide asks before discarding an unsaved package draft", async () => {
	const lesson = {
		...newLesson("Portable draft source"),
		steps: [newStep("Portable source step")],
	};
	vi.stubGlobal("electronAPI", {
		lessonPackageOpen: vi.fn(async () => ({
			success: true,
			result: {
				status: "opened",
				token: crypto.randomUUID(),
				lesson,
				videos: [],
				images: "exclude",
			},
		})),
		lessonPackageReseal: vi.fn(),
		lessonPackageRelease: vi.fn(async () => true),
	});
	const onClose = vi.fn(),
		confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
	render(
		<I18nProvider>
			<LessonGuideDialog open onClose={onClose} />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByText("Open and check a package folder"));
	await screen.findByText("Portable source step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
	expect(confirm).toHaveBeenCalledWith(
		"Discard the unsaved package draft and close? The source package is unchanged.",
	);
	expect(onClose).not.toHaveBeenCalled();
	confirm.mockReturnValue(true);
	fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
	expect(onClose).toHaveBeenCalledTimes(1);
});
it("records optional LMS references without demoting a reviewed step, and clears them when emptied", async () => {
	const lessonExport = vi.fn<NonNullable<LessonApi["lessonExport"]>>(async () => ({
		success: true as const,
		result: { status: "exported" as const, path: "/new/guide", steps: 1, images: 0 },
	}));
	vi.stubGlobal("electronAPI", { lessonExport });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByLabelText("I have reviewed this step"));
	fireEvent.change(screen.getByLabelText("LMS lesson reference (optional)"), {
		target: { value: "RPG Course 1 / Lesson 1" },
	});
	fireEvent.change(screen.getByLabelText("LMS slide reference (optional)"), {
		target: { value: "slide 12" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Export selected offline guide" }));
	await waitFor(() => expect(lessonExport).toHaveBeenCalledTimes(1));
	expect(lessonExport.mock.calls[0][0]).toMatchObject({
		lessonRef: "RPG Course 1 / Lesson 1",
		steps: [{ slideRef: "slide 12", status: "reviewed" }],
	});
	fireEvent.change(screen.getByLabelText("LMS slide reference (optional)"), {
		target: { value: "" },
	});
	fireEvent.change(screen.getByLabelText("LMS lesson reference (optional)"), {
		target: { value: "" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Export selected offline guide" }));
	await waitFor(() => expect(lessonExport).toHaveBeenCalledTimes(2));
	expect(lessonExport.mock.calls[1][0].lessonRef).toBeUndefined();
	expect(lessonExport.mock.calls[1][0].steps[0].slideRef).toBeUndefined();
});
const fileLesson = () => ({ ...newLesson("From file"), steps: [newStep("Opened step")] });
it("marks unsaved lesson work, tells main, and saves edits back to the opened file by its permission only", async () => {
	const opened = fileLesson(),
		handle = { token: crypto.randomUUID(), path: "/chosen/lesson.json" };
	const lessonOpen = vi.fn<NonNullable<LessonApi["lessonOpen"]>>(async () => ({
		success: true as const,
		result: { status: "opened" as const, lesson: opened, file: handle },
	}));
	const lessonSaveCurrent = vi.fn<NonNullable<LessonApi["lessonSaveCurrent"]>>(async () => ({
		success: true as const,
		result: { status: "saved" as const, path: handle.path, file: handle },
	}));
	const setLessonUnsavedWork = vi.fn();
	vi.stubGlobal("electronAPI", { lessonOpen, lessonSaveCurrent, setLessonUnsavedWork });
	show();
	const sameFile = () =>
		screen.getByRole("button", { name: "Save changes to the opened file" }) as HTMLButtonElement;
	expect(sameFile().disabled).toBe(true);
	// The guide's own explanation matches both save actions.
	expect(screen.queryByText(/never replaces an existing file/)).toBeNull();
	screen.getByText(/Save changes to the opened file updates only the lesson file you opened/);
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByText("All lesson changes are saved in: /chosen/lesson.json");
	expect(sameFile().disabled).toBe(true);
	fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Edited text" } });
	await screen.findByText("Unsaved lesson changes. Last saved file: /chosen/lesson.json");
	expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(true);
	fireEvent.click(sameFile());
	await screen.findByText("Saved to the same file: /chosen/lesson.json");
	expect(lessonSaveCurrent).toHaveBeenCalledTimes(1);
	const sent = lessonSaveCurrent.mock.calls[0][0];
	expect(Object.keys(sent).sort()).toEqual(["lesson", "token"]);
	expect(sent.token).toBe(handle.token);
	expect(sent.lesson.steps[0].instructions).toBe("Edited text");
	await screen.findByText("All lesson changes are saved in: /chosen/lesson.json");
	expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(false);
});
it("a refused same-file save keeps every edit, stays marked unsaved and falls back to saving a new copy", async () => {
	const handle = { token: crypto.randomUUID(), path: "/chosen/lesson.json" };
	vi.stubGlobal("electronAPI", {
		lessonOpen: vi.fn(async () => ({
			success: true as const,
			result: { status: "opened" as const, lesson: fileLesson(), file: handle },
		})),
		lessonSaveCurrent: vi.fn(async () => ({
			success: false as const,
			code: "lesson-file-changed" as const,
		})),
	});
	show();
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByText("All lesson changes are saved in: /chosen/lesson.json");
	fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Must survive" } });
	fireEvent.click(screen.getByRole("button", { name: "Save changes to the opened file" }));
	await screen.findByText(/so it was not replaced. Your work is still here/);
	expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe("Must survive");
	await screen.findByText("Unsaved lesson changes. This lesson has not been saved to a file.");
	expect(
		(screen.getByRole("button", { name: "Save changes to the opened file" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
it("asks before opening another lesson over unsaved work and keeps the work when declined", async () => {
	const lessonOpen = vi.fn<NonNullable<LessonApi["lessonOpen"]>>(async () => ({
		success: true as const,
		result: { status: "opened" as const, lesson: fileLesson() },
	}));
	vi.stubGlobal("electronAPI", { lessonOpen });
	const confirm = vi.fn(() => false);
	vi.stubGlobal("confirm", confirm);
	show();
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByDisplayValue("Opened step");
	expect(confirm).not.toHaveBeenCalled();
	fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Unsaved" } });
	await screen.findByText("Unsaved lesson changes. This lesson has not been saved to a file.");
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	expect(confirm).toHaveBeenCalledTimes(1);
	expect(lessonOpen).toHaveBeenCalledTimes(1);
	expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe("Unsaved");
	confirm.mockReturnValue(true);
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await waitFor(() => expect(lessonOpen).toHaveBeenCalledTimes(2));
});
it("creates a package from the selected steps with the dialog's output settings and reports refusals as alerts", async () => {
	const lessonPackageCreate = vi
		.fn()
		.mockResolvedValueOnce({
			success: false,
			code: "lesson-package-video-selection-invalid",
		})
		.mockResolvedValueOnce({
			success: true,
			result: {
				status: "packaged",
				path: "/chosen/lesson-package-1",
				steps: 1,
				images: 0,
				videos: 1,
			},
		});
	vi.stubGlobal("electronAPI", {
		lessonPackageCreate,
		lessonPackageCancel: vi.fn(async () => true),
	});
	show();
	const create = () =>
		screen.getByRole("button", {
			name: "Create a portable package from selected steps",
		}) as HTMLButtonElement;
	expect(create().disabled).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByLabelText("Include step 2"));
	fireEvent.click(
		screen.getByLabelText("Include exported step MP4s (you choose their export folders next)"),
	);
	fireEvent.click(create());
	expect(
		(await screen.findByText(/Those folders cannot be used for videos/)).getAttribute("role"),
	).toBe("alert");
	const sent = lessonPackageCreate.mock.calls[0][0];
	expect(Object.keys(sent).sort()).toEqual([
		"imagePolicy",
		"includeCode",
		"includeVideos",
		"lesson",
		"operationId",
		"stepIds",
	]);
	expect(sent).toMatchObject({
		includeCode: true,
		imagePolicy: "include-external-provenance",
		includeVideos: true,
	});
	expect(sent.stepIds).toEqual([sent.lesson.steps[0].id]);
	fireEvent.click(create());
	await screen.findByText(
		"Package checked and saved: /chosen/lesson-package-1 (1 steps, 0 images, 1 videos). Review it before sharing.",
	);
	expect(screen.queryByText(/Those folders cannot be used for videos/)).toBeNull();
	act(() => useProjectStore.setState({ dirty: true }));
	expect(create().disabled).toBe(true);
});
it("names every repeated step button with its step number and title", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"));
	for (const action of [
		"Move up",
		"Move down",
		"Remove step",
		"Illustrate from current saved playhead",
	])
		for (const number of [1, 2])
			expect(names.filter((name) => name?.startsWith(`${action}: step ${number}, `))).toHaveLength(
				1,
			);
	// The visible words stay inside the accessible name.
	expect(screen.getAllByText("Move up")).toHaveLength(2);
});
it("keeps unsaved lesson work marked while the guide is hidden, and clears the mark only when the work itself is gone", async () => {
	const setLessonUnsavedWork = vi.fn();
	vi.stubGlobal("electronAPI", { setLessonUnsavedWork });
	const view = (open: boolean) => (
		<I18nProvider>
			<LessonGuideDialog open={open} onClose={vi.fn()} />
		</I18nProvider>
	);
	const { rerender, unmount } = render(view(true));
	fireEvent.click(screen.getByRole("button", { name: "Add authored step" }));
	await waitFor(() => expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(true));
	// Hiding the guide keeps its state, so closing the editor must still ask.
	rerender(view(false));
	expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(true);
	rerender(view(true));
	expect(screen.getAllByLabelText("Step title")).toHaveLength(1);
	expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(true);
	// Unmounting (a project switch remounts the guide) discards the work and the mark with it.
	unmount();
	expect(setLessonUnsavedWork).toHaveBeenLastCalledWith(false);
});
it("a same-file save that committed as the window's context ended is shown saved, with no further same-file permission", async () => {
	const handle = { token: crypto.randomUUID(), path: "/chosen/lesson.json" };
	const lessonSaveCurrent = vi.fn<NonNullable<LessonApi["lessonSaveCurrent"]>>(async () => ({
		success: true as const,
		result: { status: "saved" as const, path: handle.path },
	}));
	vi.stubGlobal("electronAPI", {
		lessonOpen: vi.fn(async () => ({
			success: true as const,
			result: { status: "opened" as const, lesson: fileLesson(), file: handle },
		})),
		lessonSaveCurrent,
	});
	show();
	fireEvent.click(screen.getByRole("button", { name: "Open editable lesson" }));
	await screen.findByText("All lesson changes are saved in: /chosen/lesson.json");
	fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Committed" } });
	const sameFile = () =>
		screen.getByRole("button", { name: "Save changes to the opened file" }) as HTMLButtonElement;
	fireEvent.click(sameFile());
	await screen.findByText("Saved to the same file: /chosen/lesson.json");
	expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe("Committed");
	// Saved, so not unsaved; but nothing more can be written to that file without a fresh open.
	expect(screen.queryByText(/Unsaved lesson changes/)).toBeNull();
	fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "Later" } });
	await screen.findByText("Unsaved lesson changes. This lesson has not been saved to a file.");
	expect(sameFile().disabled).toBe(true);
	expect(lessonSaveCurrent).toHaveBeenCalledTimes(1);
});
