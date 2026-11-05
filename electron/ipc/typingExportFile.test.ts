import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TypingCapture } from "../../src/lib/typing/capture";
import { importTypingFiles } from "../../src/lib/typing/import";
import { exportTypingBundle, serializePortableTypingFile } from "../../src/lib/typing/portable";
import { saveTypingExportFile } from "./typingExportFile";

let directory: string;
beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "typing-save-"));
});
afterEach(async () => {
	await fs.rm(directory, { recursive: true, force: true });
});
it("writes a validated bundle to the explicit dialog-selected path and reimports from disk", async () => {
	const capture = new TypingCapture("before", () => 0, "t");
	capture.observe("日本語😀", [], "insertText");
	const take = capture.finish();
	const content = serializePortableTypingFile(
		exportTypingBundle([{ take, sectionId: take.sections[0].id }], "clean"),
	);
	const destination = path.join(directory, "chosen.json");
	const picker = vi.fn(async () => destination);
	expect(
		await saveTypingExportFile({ name: "typing-sections.typing-bundle.json", content }, picker),
	).toEqual({ status: "saved", path: destination });
	expect(importTypingFiles(await fs.readFile(destination, "utf8"))[0].mode).toBe("clean");
	expect(picker).toHaveBeenCalledWith("typing-sections.typing-bundle.json");
});
it("cancellation writes nothing and a text save preserves exact UTF-8 content", async () => {
	expect(
		await saveTypingExportFile(
			{ name: "code-section-1.gd", content: "日本語😀\n" },
			async () => null,
		),
	).toEqual({ status: "cancelled" });
	expect(await fs.readdir(directory)).toEqual([]);
	const destination = path.join(directory, "code.gd");
	await saveTypingExportFile(
		{ name: "code-section-1.gd", content: "日本語😀\n" },
		async () => destination,
	);
	expect(await fs.readFile(destination, "utf8")).toBe("日本語😀\n");
});
it("rejects unsafe names, malformed/wrong-format JSON and extra renderer paths before showing the picker", async () => {
	const picker = vi.fn(async () => path.join(directory, "invalid"));
	for (const request of [
		{ name: "../evil.gd", content: "code" },
		{ name: "program.sh", content: "code" },
		{ name: "snippet.typing-section.json", content: "{}" },
		{ name: "snippet.gd", content: "code", path: "/unexpected" },
	])
		await expect(saveTypingExportFile(request, picker)).rejects.toThrow();
	expect(picker).not.toHaveBeenCalled();
});

it("enforces UTF-8 byte and plain text limits before requesting a destination", async () => {
	const picker = vi.fn(async () => null);
	await expect(
		saveTypingExportFile(
			{ name: "large.typing-section.json", content: "😀".repeat(3 * 1024 * 1024) },
			picker,
		),
	).rejects.toThrow("8 MiB");
	await expect(
		saveTypingExportFile({ name: "large.txt", content: "a".repeat(200001) }, picker),
	).rejects.toThrow("text limit");
	expect(picker).not.toHaveBeenCalled();
});
