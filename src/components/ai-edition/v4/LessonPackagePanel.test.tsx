// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { newLesson, newStep } from "@/lib/lesson/authoring";
import type { LessonPackageOpenApi, OpenedLessonPackage } from "@/lib/lesson/packageOpen";
import { LessonPackagePanel } from "./LessonPackagePanel";

let opened: OpenedLessonPackage;
let api: Required<LessonPackageOpenApi>;
beforeEach(() => {
	vi.stubGlobal("crypto", webcrypto);
	useProjectStore.setState({
		projectId: "p",
		document: createEmptyDocument({ projectId: "p", title: "Current" }),
		dirty: false,
	});
	opened = {
		status: "opened",
		snapshotSha256: "ab".repeat(32),
		token: crypto.randomUUID(),
		lesson: {
			...newLesson("Package title"),
			steps: [
				{
					...newStep("Package step"),
					instructions: "<img src=x onerror=alert(1)>",
					code: { language: "plain", text: "<script>unsafe()</script>" },
				},
			],
		},
		images: "exclude",
		videos: [],
	};
	api = {
		lessonPackageOpen: vi.fn<Required<LessonPackageOpenApi>["lessonPackageOpen"]>(async () => ({
			success: true,
			result: opened,
		})),
		lessonPackageCopy: vi.fn<Required<LessonPackageOpenApi>["lessonPackageCopy"]>(async () => ({
			success: true,
			result: { status: "saved", path: "/explicit/new.json" },
		})),
		lessonPackageReseal: vi.fn<Required<LessonPackageOpenApi>["lessonPackageReseal"]>(async () => ({
			success: true,
			result: {
				status: "packaged",
				path: "/explicit/new-package",
				lessonId: opened.lesson.id,
				steps: 1,
				images: 0,
				videos: opened.videos.length,
			},
		})),
		lessonPackageCancel: vi.fn(async () => true),
		lessonPackageRelease: vi.fn(async () => true),
	};
	vi.stubGlobal("electronAPI", api);
});
afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
	vi.unstubAllGlobals();
});
const show = () =>
	render(
		<I18nProvider>
			<LessonPackagePanel />
		</I18nProvider>,
	);
const clickOpen = () => fireEvent.click(screen.getByText("Open and check a package folder"));
it("renders checked data as safe read-only React text and saves an explicit copy without changing current work", async () => {
	const current = useProjectStore.getState().document;
	const view = show();
	clickOpen();
	await screen.findByText("Package step");
	expect(view.container.querySelector("script")).toBeNull();
	expect(view.container.querySelector("img")).toBeNull();
	expect(view.container.querySelector("textarea,input,iframe,webview")).toBeNull();
	fireEvent.click(screen.getByText("Save a new editable text and image copy"));
	await screen.findByText(/New editable copy saved/);
	expect(api.lessonPackageCopy).toHaveBeenCalledWith({
		operationId: expect.any(String),
		token: opened.token,
	});
	expect(useProjectStore.getState().document).toBe(current);
});
it("video package stays read-only with no playback paths and preserves visible bindings", async () => {
	opened.videos = [{ stepId: opened.lesson.steps[0].id, frames: 45, durationSec: 1.5 }];
	const view = show();
	clickOpen();
	await screen.findByText(/45 frames, 1.5 seconds/);
	const button = screen.getByText("Save a new editable text and image copy") as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(api.lessonPackageCopy).not.toHaveBeenCalled();
	expect(view.container.querySelector("video,a,iframe")).toBeNull();
});
it("dirty provider disables the button and programmatic clicks cannot start inspection", () => {
	useProjectStore.setState({ dirty: true });
	show();
	expect((screen.getByText("Open and check a package folder") as HTMLButtonElement).disabled).toBe(
		true,
	);
	clickOpen();
	expect(api.lessonPackageOpen).not.toHaveBeenCalled();
});
it("stale project completion is released and cannot populate inspection", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageOpen).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	show();
	clickOpen();
	act(() => useProjectStore.setState({ projectId: "other" }));
	await act(async () => {
		settle({ success: true, result: opened });
	});
	expect(screen.queryByText("Package step")).toBeNull();
	expect(api.lessonPackageCancel).toHaveBeenCalled();
	expect(api.lessonPackageRelease).toHaveBeenCalledWith(opened.token);
});
it("unmount cancels active operation and releases a late capability", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageOpen).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	const view = show();
	clickOpen();
	view.unmount();
	await act(async () => {
		settle({ success: true, result: opened });
	});
	expect(api.lessonPackageCancel).toHaveBeenCalled();
	expect(api.lessonPackageRelease).toHaveBeenCalledWith(opened.token);
});
it("cancel leaves the button busy until settlement and ignores a late opened result", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageOpen).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	show();
	clickOpen();
	fireEvent.click(screen.getByText("Cancel package operation"));
	expect((screen.getByText("Open and check a package folder") as HTMLButtonElement).disabled).toBe(
		true,
	);
	await act(async () => {
		settle({ success: true, result: opened });
	});
	expect(screen.queryByText("Package step")).toBeNull();
	await waitFor(() =>
		expect(
			(screen.getByText("Open and check a package folder") as HTMLButtonElement).disabled,
		).toBe(false),
	);
});
it("fixed verification errors show no imported content", async () => {
	vi.mocked(api.lessonPackageOpen).mockResolvedValueOnce({
		success: false,
		code: "lesson-package-tool-unavailable",
	});
	show();
	clickOpen();
	await screen.findByText(/The video checking tool is unavailable/);
	expect(screen.queryByText("Package step")).toBeNull();
});
it("closing a checked snapshot releases its capability", async () => {
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Close package snapshot"));
	expect(api.lessonPackageRelease).toHaveBeenCalledWith(opened.token);
	expect(screen.queryByText("Package step")).toBeNull();
});
it("edits an existing lesson draft and submits stable video step bindings through the explicit new action", async () => {
	opened.videos = [{ stepId: opened.lesson.steps[0].id, frames: 45, durationSec: 1.5 }];
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Corrected instructions" },
	});
	fireEvent.change(screen.getByLabelText("Included code text"), {
		target: { value: "Corrected code" },
	});
	expect((screen.getByText("Open and check a package folder") as HTMLButtonElement).disabled).toBe(
		true,
	);
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/New package checked and saved/);
	const calls = vi.mocked(api.lessonPackageReseal).mock.calls;
	expect(calls).toHaveLength(1);
	expect(calls[0][0]).toMatchObject({
		token: opened.token,
		operationId: expect.any(String),
		lesson: {
			id: opened.lesson.id,
			steps: [
				{
					id: opened.lesson.steps[0].id,
					instructions: "Corrected instructions",
					status: "draft",
					code: { text: "Corrected code" },
				},
			],
		},
	});
	expect(api.lessonPackageCopy).not.toHaveBeenCalled();
	expect(opened.lesson.steps[0].instructions).toBe("<img src=x onerror=alert(1)>");
});
it("reseal freezes the submitted draft, cancels on project replacement and ignores late completion", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageReseal).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Submitted text" },
	});
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Programmatic stale edit" },
	});
	expect(vi.mocked(api.lessonPackageReseal).mock.calls[0][0].lesson.steps[0].instructions).toBe(
		"Submitted text",
	);
	act(() => useProjectStore.setState({ projectId: "replacement" }));
	await act(async () => {
		settle({
			success: true,
			result: {
				status: "packaged",
				path: "/must-not-attach",
				steps: 1,
				images: 0,
				videos: 0,
				lessonId: opened.lesson.id,
			},
		});
	});
	expect(api.lessonPackageCancel).toHaveBeenCalled();
	expect(api.lessonPackageRelease).toHaveBeenCalledWith(opened.token);
	expect(screen.queryByText(/must-not-attach/)).toBeNull();
	expect(api.lessonPackageOpen).toHaveBeenCalledTimes(1);
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Submitted text",
	);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(true);
});
it("discarding a draft explicitly returns to the original snapshot without changing package data", async () => {
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Not saved" },
	});
	fireEvent.click(screen.getByText("Discard package draft"));
	expect(screen.queryByLabelText("Package step instructions")).toBeNull();
	expect(api.lessonPackageReseal).not.toHaveBeenCalled();
	expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeDefined();
});
it("cancelling reseal keeps the exact draft and allows explicit retry after settlement", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageReseal).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Keep cancelled edits" },
	});
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	fireEvent.click(screen.getByText("Cancel package operation"));
	expect(
		(screen.getByLabelText("Package step instructions").closest("fieldset") as HTMLFieldSetElement)
			.disabled,
	).toBe(true);
	await act(async () => {
		settle({ success: false, code: "lesson-package-cancelled", capability: "retained" });
	});
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Keep cancelled edits",
	);
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/New package checked and saved/);
	expect(vi.mocked(api.lessonPackageReseal).mock.calls[1][0].lesson.steps[0].instructions).toBe(
		"Keep cancelled edits",
	);
});
it.each([
	"lesson-package-invalid",
	"lesson-package-tool-unavailable",
] as const)("recoverable %s keeps exact edits for explicit retry", async (code) => {
	vi.mocked(api.lessonPackageReseal).mockResolvedValueOnce({
		success: false,
		code,
		capability: "retained",
	});
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Keep instructions" },
	});
	fireEvent.change(screen.getByLabelText("Included code text"), {
		target: { value: "keep_code();" },
	});
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/Your unsaved text/, { exact: false });
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Keep instructions",
	);
	expect((screen.getByLabelText("Included code text") as HTMLTextAreaElement).value).toBe(
		"keep_code();",
	);
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/New package checked and saved/);
	expect(vi.mocked(api.lessonPackageReseal).mock.calls[1][0].lesson).toEqual(
		vi.mocked(api.lessonPackageReseal).mock.calls[0][0].lesson,
	);
});
it("source revocation keeps visible edits and only explicit matching reopen can restore authority", async () => {
	vi.mocked(api.lessonPackageReseal).mockResolvedValueOnce({
		success: false,
		code: "lesson-package-invalid",
		capability: "reopen-required",
	});
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Do not rebase" },
	});
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText("Reopen the same package and keep edits");
	expect(api.lessonPackageOpen).toHaveBeenCalledTimes(1);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(true);
	vi.mocked(api.lessonPackageOpen).mockResolvedValueOnce({
		success: true,
		result: { ...opened, token: crypto.randomUUID(), snapshotSha256: "cd".repeat(32) },
	});
	fireEvent.click(screen.getByText("Reopen the same package and keep edits"));
	await waitFor(() =>
		expect(
			(
				screen
					.getByLabelText("Package step instructions")
					.closest("fieldset") as HTMLFieldSetElement
			).disabled,
		).toBe(false),
	);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(true);
	expect(screen.queryByText(/That package differs/)).not.toBeNull();
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Do not rebase",
	);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(true);
	vi.mocked(api.lessonPackageOpen).mockResolvedValueOnce({
		success: true,
		result: { ...opened, token: crypto.randomUUID() },
	});
	fireEvent.click(screen.getByText("Reopen the same package and keep edits"));
	await screen.findByText(/The same package inventory was checked/);
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Do not rebase",
	);
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/New package checked and saved/);
});
it("a late failed request from an unmounted panel cannot clear a new panel draft", async () => {
	let settle!: (value: unknown) => void;
	vi.mocked(api.lessonPackageReseal).mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				settle = resolve as typeof settle;
			}),
	);
	const old = show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	old.unmount();
	show();
	clickOpen();
	await screen.findByText("Package step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "New panel draft" },
	});
	await act(async () => {
		settle({ success: false, code: "lesson-package-invalid", capability: "reopen-required" });
	});
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"New panel draft",
	);
});
const startDraft = async () => {
	show();
	clickOpen();
	fireEvent.click(await screen.findByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Kept instruction" },
	});
};
const save = () => fireEvent.click(screen.getByText("Save a new package with retained media"));
it("only a successful new package clears the draft and returns to the checked snapshot", async () => {
	await startDraft();
	save();
	await screen.findByText(/New package checked and saved/);
	expect(screen.queryByText("Discard package draft")).toBeNull();
	expect(screen.queryByLabelText("Package step instructions")).toBeNull();
	expect(
		(screen.getByText("Edit supported text and order as a new draft") as HTMLButtonElement)
			.disabled,
	).toBe(false);
});
it("a thrown reseal call keeps the draft but releases the token and requires an explicit reopen", async () => {
	vi.mocked(api.lessonPackageReseal).mockRejectedValueOnce(new Error("ipc"));
	await startDraft();
	save();
	await screen.findByText("Reopen the same package and keep edits");
	expect(api.lessonPackageRelease).toHaveBeenCalledWith(opened.token);
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Kept instruction",
	);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(true);
});
it("a busy reply changes nothing: same draft, same token, no reopen demand", async () => {
	vi.mocked(api.lessonPackageReseal).mockResolvedValueOnce({
		success: false,
		code: "lesson-package-busy",
	});
	await startDraft();
	save();
	await screen.findByText(/Another package operation is still finishing/);
	expect(screen.queryByText("Reopen the same package and keep edits")).toBeNull();
	expect(api.lessonPackageRelease).not.toHaveBeenCalled();
	save();
	await screen.findByText(/New package checked and saved/);
	expect(vi.mocked(api.lessonPackageReseal).mock.calls.map(([input]) => input.token)).toEqual([
		opened.token,
		opened.token,
	]);
});
it("a destination mistake names the fix and keeps the draft ready to retry", async () => {
	vi.mocked(api.lessonPackageReseal).mockResolvedValueOnce({
		success: false,
		code: "lesson-package-destination-invalid",
		capability: "retained",
	});
	await startDraft();
	save();
	await screen.findByText(/Choose an existing folder outside the package you opened/);
	expect((screen.getByLabelText("Package step instructions") as HTMLTextAreaElement).value).toBe(
		"Kept instruction",
	);
	expect(
		(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
	).toBe(false);
});
it("discarding a draft whose verification was lost closes the unusable snapshot and says how to continue", async () => {
	vi.mocked(api.lessonPackageReseal).mockResolvedValueOnce({
		success: false,
		code: "lesson-package-invalid",
		capability: "reopen-required",
	});
	await startDraft();
	save();
	await screen.findByText("Reopen the same package and keep edits");
	fireEvent.click(screen.getByText("Discard package draft"));
	await screen.findByText(/Draft discarded. The package view was closed/);
	expect(screen.queryByText("Close package snapshot")).toBeNull();
	expect(screen.queryByText("Edit supported text and order as a new draft")).toBeNull();
	expect(screen.queryByText("Save a new editable text and image copy")).toBeNull();
	expect((screen.getByText("Open and check a package folder") as HTMLButtonElement).disabled).toBe(
		false,
	);
	clickOpen();
	expect(
		((await screen.findByText("Edit supported text and order as a new draft")) as HTMLButtonElement)
			.disabled,
	).toBe(false);
});
it("edits LMS references in a package draft and submits them with the new package", async () => {
	opened.lesson = { ...opened.lesson, lessonRef: "Old lesson ref" };
	await startDraft();
	fireEvent.change(screen.getByLabelText("LMS lesson reference (optional)"), {
		target: { value: "RPG C1 / L1" },
	});
	fireEvent.change(screen.getByLabelText("LMS slide reference (optional)"), {
		target: { value: "slide 12" },
	});
	save();
	await screen.findByText(/New package checked and saved/);
	const sent = vi.mocked(api.lessonPackageReseal).mock.calls[0][0].lesson;
	expect(sent.lessonRef).toBe("RPG C1 / L1");
	expect(sent.steps[0]).toMatchObject({ slideRef: "slide 12", status: "draft" });
});
it("names each package step's move buttons distinctly and keeps step titles below the lesson heading", async () => {
	opened.lesson = { ...opened.lesson, steps: [...opened.lesson.steps, newStep("Second step")] };
	const view = show();
	clickOpen();
	fireEvent.click(await screen.findByText("Edit supported text and order as a new draft"));
	expect(
		screen.getByRole("button", { name: "Move package step up: step 2, Second step" }),
	).toBeDefined();
	expect(
		screen.getByRole("button", { name: "Move package step down: step 1, Package step" }),
	).toBeDefined();
	expect([...view.container.querySelectorAll("h5")].map((h) => h.textContent)).toEqual([
		"Package step",
		"Second step",
	]);
});
