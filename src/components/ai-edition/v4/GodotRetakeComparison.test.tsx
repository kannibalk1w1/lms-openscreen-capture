// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { listGodotSceneCheckpoints } from "@/lib/applicationIntegrations/godotScene";
import { GodotRetakeComparison } from "./GodotRetakeComparison";

vi.mock("@/contexts/I18nContext", () => ({
	useScopedT: () => (key: string, vars?: Record<string, string | number>) =>
		vars ? `${key} ${JSON.stringify(vars)}` : key,
}));

const fixture = (name: string) =>
	readFileSync(path.resolve("integrations/godot-typing/probes/fixtures", name), "utf8");
const linux = fixture("scene-v5-linux.jsonl");
const windows = fixture("scene-v5-windows.jsonl");
const linuxCheckpoints = listGodotSceneCheckpoints(linux);
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const marker = (text: string, label: string) =>
	String(listGodotSceneCheckpoints(text).find((entry) => entry.label === label)?.recordSequence);

afterEach(cleanup);

function setup() {
	render(
		<GodotRetakeComparison
			originalText={linux}
			originalSha256={sha(linux)}
			originalCheckpoints={linuxCheckpoints}
		/>,
	);
	const compare = () => screen.getByRole("button", { name: "lesson.retake.compare" });
	const chooseFile = (text: string, name = "retake.jsonl") =>
		fireEvent.change(screen.getByLabelText("lesson.retake.choose"), {
			target: { files: [new File([text], name)] },
		});
	return { compare, chooseFile };
}

it("compares an explicitly chosen real retake read-only, with identities and policy", async () => {
	const { compare, chooseFile } = setup();
	expect((compare() as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(screen.getByLabelText("lesson.retake.original"), {
		target: { value: marker(linux, "3D baseline") },
	});
	chooseFile(windows);
	const replacement = await screen.findByLabelText(/lesson\.retake\.replacementCheckpointFor/);
	expect((compare() as HTMLButtonElement).disabled).toBe(true);
	fireEvent.change(replacement, { target: { value: marker(windows, "3D baseline") } });
	fireEvent.click(compare());
	const result = await screen.findByRole("region", { name: "lesson.retake.result" });
	expect(result.textContent).toContain("lesson.retake.outcome.sampled-fields-agree");
	expect(result.textContent).toContain("lesson.retake.policy");
	expect(result.textContent).not.toContain("lesson.retake.sameTake");
	// Each identity shows the SHA-256 prefix of its own file bytes.
	expect(result.textContent).toContain(`"sha":"${sha(linux).slice(0, 12)}"`);
	expect(result.textContent).toContain(`"sha":"${sha(windows).slice(0, 12)}"`);
	expect(sha(linux)).not.toBe(sha(windows));
});

it("shows differences and clears the result on any selection change", async () => {
	const { compare, chooseFile } = setup();
	fireEvent.change(screen.getByLabelText("lesson.retake.original"), {
		target: { value: marker(linux, "3D baseline") },
	});
	chooseFile(windows);
	const replacement = await screen.findByLabelText(/lesson\.retake\.replacementCheckpointFor/);
	fireEvent.change(replacement, { target: { value: marker(windows, "Texture and scale set") } });
	fireEvent.click(compare());
	const result = await screen.findByRole("region", { name: "lesson.retake.result" });
	expect(result.textContent).toContain("lesson.retake.outcome.sampled-fields-differ");
	expect(result.textContent).toContain("lesson.retake.replacementOnly");
	fireEvent.change(screen.getByLabelText("lesson.retake.original"), {
		target: { value: marker(linux, "Scene opened") },
	});
	expect(screen.queryByRole("region", { name: "lesson.retake.result" })).toBeNull();
	fireEvent.click(compare());
	await screen.findByRole("region", { name: "lesson.retake.result" });
	fireEvent.change(replacement, { target: { value: marker(windows, "3D baseline") } });
	expect(screen.queryByRole("region", { name: "lesson.retake.result" })).toBeNull();
	fireEvent.click(compare());
	await screen.findByRole("region", { name: "lesson.retake.result" });
	chooseFile(linux, "again.jsonl");
	expect(screen.queryByRole("region", { name: "lesson.retake.result" })).toBeNull();
});

it("labels a comparison of the same take as not independent", async () => {
	const { compare, chooseFile } = setup();
	const sequence = marker(linux, "3D baseline");
	fireEvent.change(screen.getByLabelText("lesson.retake.original"), {
		target: { value: sequence },
	});
	chooseFile(linux);
	fireEvent.change(await screen.findByLabelText(/lesson\.retake\.replacementCheckpointFor/), {
		target: { value: sequence },
	});
	fireEvent.click(compare());
	const result = await screen.findByRole("region", { name: "lesson.retake.result" });
	expect(result.textContent).toContain("lesson.retake.sameTake");
});

it("refuses a replacement file that is not a raw journal with checkpoints", async () => {
	const { chooseFile } = setup();
	chooseFile("{}\n");
	expect((await screen.findByRole("alert")).textContent).toBe("lesson.retake.invalid");
	expect(screen.queryByLabelText(/lesson\.retake\.replacementCheckpointFor/)).toBeNull();
});

it("ignores a slower earlier replacement read once a newer file is chosen", async () => {
	setup();
	let release: (value: ArrayBuffer) => void = () => undefined;
	const slow = {
		name: "slow.jsonl",
		size: 10,
		arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => (release = resolve)),
	};
	fireEvent.change(screen.getByLabelText("lesson.retake.choose"), { target: { files: [slow] } });
	fireEvent.change(screen.getByLabelText("lesson.retake.choose"), {
		target: { files: [new File([windows], "newer.jsonl")] },
	});
	await screen.findByLabelText(/newer\.jsonl/);
	release(new TextEncoder().encode(linux).buffer as ArrayBuffer);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(screen.queryByLabelText(/slow\.jsonl/)).toBeNull();
	expect(screen.getByLabelText(/newer\.jsonl/)).toBeTruthy();
});
