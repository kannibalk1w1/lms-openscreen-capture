// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { TypingCapture } from "./capture";
import { downloadTypingSection } from "./download";
import { importTypingTake } from "./import";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("requests a valid local JSON download and cleans up its object URL without editing the take", async () => {
	vi.useFakeTimers();
	vi.stubGlobal("Blob", NodeBlob);
	const create = vi.fn<(blob: NodeBlob) => string>(() => "blob:typing-export");
	const revoke = vi.fn();
	vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
	const clicks: { href: string; name: string }[] = [];
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
		this: HTMLAnchorElement,
	) {
		clicks.push({ href: this.href, name: this.download });
	});
	const capture = new TypingCapture("", () => 0, "download-take");
	capture.observe("日本語😀", [], "insertText");
	const take = capture.finish("Lesson snippet");
	const original = JSON.stringify(take);
	await downloadTypingSection(take, take.sections[0].id, "section", "lesson");
	expect(clicks).toEqual([
		{ href: "blob:typing-export", name: "Lesson-snippet-event-1.typing-section.json" },
	]);
	const blob = create.mock.calls[0][0];
	const imported = importTypingTake(await blob.text());
	expect(imported.events[0]).toMatchObject({ inserted: "日本語😀" });
	expect(imported.sourceExcerpt?.projectId).toBe("lesson");
	expect(document.querySelector("a[download]")).toBeNull();
	expect(revoke).not.toHaveBeenCalled();
	vi.advanceTimersByTime(1000);
	expect(revoke).toHaveBeenCalledWith("blob:typing-export");
	expect(JSON.stringify(take)).toBe(original);
});

it("uses the Electron save bridge and propagates write errors without a silent browser fallback", async () => {
	const descriptor = Object.getOwnPropertyDescriptor(window, "electronAPI");
	const save = vi.fn(async () => ({ status: "saved", path: "/chosen.gd" }));
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: { saveTypingExport: save },
	});
	const create = vi.fn();
	vi.stubGlobal("URL", { createObjectURL: create });
	try {
		const capture = new TypingCapture("", () => 0, "electron-take");
		capture.observe("code", [], "insertText");
		const take = capture.finish("Snippet");
		await downloadTypingSection(take, take.sections[0].id, "text");
		expect(save).toHaveBeenCalledWith({ name: "Snippet-event-1.txt", content: "code" });
		expect(create).not.toHaveBeenCalled();
		save.mockRejectedValueOnce(new Error("write failed"));
		await expect(downloadTypingSection(take, take.sections[0].id, "text")).rejects.toThrow(
			"write failed",
		);
		expect(create).not.toHaveBeenCalled();
	} finally {
		if (descriptor) Object.defineProperty(window, "electronAPI", descriptor);
		else Reflect.deleteProperty(window, "electronAPI");
	}
});
