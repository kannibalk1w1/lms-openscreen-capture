// @vitest-environment jsdom
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { listGodotSceneCheckpoints } from "@/lib/applicationIntegrations/godotScene";
import { newLesson } from "@/lib/lesson/authoring";
import { ApplicationCaptureReview } from "./ApplicationCaptureReview";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
const fixture = (name: string) =>
	readFileSync(path.resolve("integrations/godot-typing/probes/fixtures", name));
const linux = fixture("scene-v5-linux.jsonl");
const windows = fixture("scene-v5-windows.jsonl");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const marker = (bytes: Uint8Array, label: string) =>
	String(
		listGodotSceneCheckpoints(new TextDecoder().decode(bytes)).find(
			(entry) => entry.label === label,
		)?.recordSequence,
	);

function show() {
	render(
		<I18nProvider>
			<ApplicationCaptureReview lesson={newLesson()} onAppend={vi.fn()} />
		</I18nProvider>,
	);
}
function choose(label: string | RegExp, bytes: Uint8Array, name: string) {
	fireEvent.change(screen.getByLabelText(label), {
		target: { files: [new File([bytes as Uint8Array<ArrayBuffer>], name)] },
	});
}

it("binds the original's identity to its exact file bytes, BOM included", async () => {
	vi.stubGlobal("crypto", webcrypto);
	show();
	const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...linux]);
	choose("Import application capture or Godot journal", withBom, "original.jsonl");
	const original = await screen.findByLabelText("Original checkpoint");
	fireEvent.change(original, { target: { value: marker(linux, "3D baseline") } });
	choose("Choose replacement journal (.jsonl or .ndjson)", windows, "retake.jsonl");
	fireEvent.change(await screen.findByLabelText(/Replacement checkpoint in retake\.jsonl/), {
		target: { value: marker(windows, "3D baseline") },
	});
	fireEvent.click(screen.getByRole("button", { name: "Compare original and replacement" }));
	const result = await screen.findByRole("region", { name: "Retake comparison" });
	// The hash is of the file as stored (with its BOM), not of the decoded text.
	expect(result.textContent).toContain(`SHA-256 ${sha(withBom).slice(0, 12)}`);
	expect(result.textContent).not.toContain(`SHA-256 ${sha(linux).slice(0, 12)}`);
	expect(result.textContent).toContain(`SHA-256 ${sha(windows).slice(0, 12)}`);
	expect(result.textContent).toContain("Sampled fields agree.");
});

it("hides only the retake panel when hashing is unavailable", async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(webcrypto.subtle, "digest").mockRejectedValue(new Error("digest unavailable"));
	show();
	choose("Import application capture or Godot journal", linux, "original.jsonl");
	await screen.findByText("Compare scene checkpoints");
	expect(screen.queryByText("Compare with a retake (advisory)")).toBeNull();
	// The generic review still lists observations, and no error banner replaces it.
	expect(screen.getByText(/godot-scene · res:\/\/enemy\.tscn · \d+ observations/)).toBeTruthy();
	expect(screen.queryByRole("alert")).toBeNull();
});
