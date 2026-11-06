// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { newLesson, newStep } from "@/lib/lesson/authoring";
import type { LocalDraftApi, LocalDraftEntry, LocalDraftStatus } from "@/lib/lesson/drafts";
import { LocalLessonDraftControls } from "./LocalLessonDraftControls";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
const status: LocalDraftStatus = {
	path: "/private/app-data/recovery",
	limited: false,
	copies: 0,
	bytes: 0,
	maxCopies: 20,
	maxBytes: 67108864,
};
function api(extra: LocalDraftApi = {}) {
	const value = {
		lessonDraftStatus: vi.fn<NonNullable<LocalDraftApi["lessonDraftStatus"]>>(async () => ({
			success: true,
			result: status,
		})),
		...extra,
	};
	vi.stubGlobal("electronAPI", value);
	return value;
}
function source() {
	return {
		...newLesson("Current source"),
		steps: [{ ...newStep("Keep"), code: { language: "plain", text: "FULL_SOURCE_CODE" } }],
		output: {
			version: 1 as const,
			preset: "standard" as const,
			language: "en",
			direction: "auto" as const,
			includeImages: false,
			includeCode: false,
		},
	};
}
it("discloses location and saves the complete source only on explicit click", async () => {
	const lesson = source(),
		save = vi.fn<NonNullable<LocalDraftApi["lessonDraftSave"]>>(async () => ({
			success: true,
			result: {
				id: crypto.randomUUID(),
				path: "/private/app-data/recovery/copy.json",
				lessonId: lesson.id,
				revision: 1,
			},
		}));
	api({ lessonDraftSave: save });
	const restore = vi.fn();
	const view = render(
		<I18nProvider>
			<LocalLessonDraftControls lesson={lesson} onRestore={restore} />
		</I18nProvider>,
	);
	await screen.findByText(status.path);
	expect(save).not.toHaveBeenCalled();
	view.rerender(
		<I18nProvider>
			<LocalLessonDraftControls lesson={{ ...lesson, revision: 1 }} onRestore={restore} />
		</I18nProvider>,
	);
	expect(save).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Save recovery copy" }));
	await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
	expect(save.mock.calls[0][0].steps[0].code?.text).toBe("FULL_SOURCE_CODE");
	await screen.findByText(
		"Recovery copy saved at revision 1: /private/app-data/recovery/copy.json",
	);
	expect(restore).not.toHaveBeenCalled();
});
it("requires preview confirmation to restore and separate confirmation to delete a copy", async () => {
	const lesson = source(),
		recovered = { ...newLesson("Recovered source"), steps: [newStep()] },
		id = crypto.randomUUID();
	let entries: LocalDraftEntry[] = [
		{
			id,
			title: recovered.title,
			revision: 0,
			bytes: 100,
			savedAt: "2026-11-06T07:00:00Z",
			readable: true,
		},
	];
	const read = vi.fn<NonNullable<LocalDraftApi["lessonDraftRead"]>>(async () => ({
			success: true,
			result: recovered,
		})),
		remove = vi.fn<NonNullable<LocalDraftApi["lessonDraftRemove"]>>(async () => {
			entries = [];
			return { success: true, result: { removed: true } };
		});
	api({
		lessonDraftList: async () => ({ success: true, result: entries }),
		lessonDraftRead: read,
		lessonDraftRemove: remove,
	});
	const restore = vi.fn();
	render(
		<I18nProvider>
			<LocalLessonDraftControls lesson={lesson} onRestore={restore} />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Show local recovery copies" }));
	await screen.findByRole("button", { name: "Preview restore" });
	expect(read).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Preview restore" }));
	await screen.findByRole("button", { name: "Restore this copy" });
	expect(restore).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Restore this copy" }));
	expect(restore).toHaveBeenCalledWith(recovered);
	expect(lesson.title).toBe("Current source");
	fireEvent.click(screen.getByRole("button", { name: "Delete local copy" }));
	expect(remove).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(remove).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Delete local copy" }));
	fireEvent.click(screen.getByRole("button", { name: "Delete this recovery copy" }));
	await waitFor(() => expect(remove).toHaveBeenCalledWith(id));
	await screen.findByText("Local recovery copy deleted.");
});
it("shows retention-limit failure and permits explicit retry without changing source", async () => {
	const lesson = source(),
		before = JSON.stringify(lesson),
		save = vi
			.fn<NonNullable<LocalDraftApi["lessonDraftSave"]>>()
			.mockResolvedValueOnce({ success: false, code: "local-draft-limit" })
			.mockResolvedValueOnce({
				success: true,
				result: {
					id: crypto.randomUUID(),
					path: "/recovery/retry.json",
					lessonId: lesson.id,
					revision: 0,
				},
			});
	api({ lessonDraftSave: save });
	render(
		<I18nProvider>
			<LocalLessonDraftControls lesson={lesson} onRestore={vi.fn()} />
		</I18nProvider>,
	);
	await screen.findByText(status.path);
	fireEvent.click(screen.getByRole("button", { name: "Save recovery copy" }));
	await screen.findByText(
		"The local recovery limit is reached. Delete unwanted local copies or save a new editable file elsewhere. Existing copies are preserved.",
	);
	expect(JSON.stringify(lesson)).toBe(before);
	fireEvent.click(screen.getByRole("button", { name: "Save recovery copy" }));
	await screen.findByText("Recovery copy saved at revision 0: /recovery/retry.json");
	expect(save).toHaveBeenCalledTimes(2);
});
it("cannot save before the storage location is known and rejects an invalid recovery preview", async () => {
	const id = crypto.randomUUID();
	api({
		lessonDraftStatus: async () => ({ success: false, code: "local-draft-unavailable" }),
		lessonDraftSave: vi.fn(),
		lessonDraftList: async () => ({
			success: true,
			result: [
				{
					id,
					title: "Bad copy",
					revision: 0,
					bytes: 10,
					savedAt: "2026-11-06T07:00:00Z",
					readable: true,
				},
			],
		}),
		lessonDraftRead: async () => ({ success: true, result: { ...newLesson(), version: 9 as 1 } }),
	});
	const restore = vi.fn();
	render(
		<I18nProvider>
			<LocalLessonDraftControls lesson={source()} onRestore={restore} />
		</I18nProvider>,
	);
	await screen.findByText(
		"The local recovery operation could not finish. Existing source lessons remain unchanged. Check the visible storage location and retry.",
	);
	expect(
		(screen.getByRole("button", { name: "Save recovery copy" }) as HTMLButtonElement).disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Show local recovery copies" }));
	await screen.findByRole("button", { name: "Preview restore" });
	fireEvent.click(screen.getByRole("button", { name: "Preview restore" }));
	await screen.findByText(
		"The local recovery operation could not finish. Existing source lessons remain unchanged. Check the visible storage location and retry.",
	);
	expect(screen.queryByRole("button", { name: "Restore this copy" })).toBeNull();
	expect(restore).not.toHaveBeenCalled();
});
