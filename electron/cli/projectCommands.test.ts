import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	normalizeProjectEditor,
	PROJECT_VERSION,
} from "../../src/components/video-editor/projectPersistence";
import { migrateProjectDataToAxcutDocument } from "../../src/lib/ai-edition/document/migrate";
import { DocumentService } from "../ai-edition/document-service";
import { type PackedProjectData, runInfoCommand, runPackCommand } from "./projectCommands";

let root = "";

/** Absolute path inside the throwaway root, parents created. */
async function make(relative: string, contents = "video-bytes"): Promise<string> {
	const target = path.join(root, relative);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, contents, "utf8");
	return target;
}

async function writeProject(relative: string, data: PackedProjectData): Promise<string> {
	return make(relative, JSON.stringify(data));
}

/**
 * A project file as the editor saves it: the AxcutDocument itself, one zoom on the timeline, an
 * export format a migrated v2 project left in `legacyEditor`, a speed region where the editor
 * keeps them (`legacyEditor.speedRegions`), and one shader effect.
 */
async function writeDocument(relative: string, screenVideoPath: string): Promise<string> {
	const doc = migrateProjectDataToAxcutDocument({
		version: PROJECT_VERSION,
		media: { screenVideoPath },
		editor: normalizeProjectEditor({
			exportFormat: "gif",
			zoomRegions: [{ id: "z1", startMs: 0, endMs: 1000, depth: 3, focus: { cx: 0.5, cy: 0.5 } }],
		}),
	});
	const speedRegions = [{ id: "s1", startMs: 0, endMs: 500, speed: 2 }];
	return make(
		relative,
		JSON.stringify({
			...doc,
			legacyEditor: { ...doc.legacyEditor, speedRegions },
			shaderEffects: [
				{
					id: "fx1",
					name: "Pass-through",
					contract: 1,
					code: "fn effect(uv: vec2<f32>) -> vec4<f32> { return frame(uv); }",
				},
			],
			shaderEffectRanges: [{ id: "fxr1", startMs: 0, endMs: 500, effectId: "fx1" }],
		}),
	);
}

const readProject = async (file: string): Promise<PackedProjectData> =>
	JSON.parse(await fs.readFile(file, "utf8"));

/** Collects CLI output instead of writing to stdout. */
function recorder() {
	const chunks: string[] = [];
	const write = (text: string) => {
		chunks.push(text);
	};
	return { write, text: () => chunks.join("") };
}

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "os-cli-pack-"));
});

afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

describe("runPackCommand", () => {
	it("packs the input journal byte-for-byte beside its recording", async () => {
		const screen = await make("rec/clip.mp4");
		const events = '{"schemaVersion":1,"event":"session-end","durationMs":42}\n';
		await make("rec/clip.mp4.events.ndjson", events);
		const flags = JSON.stringify({ version: 1, flags: [{ id: "f", timeMs: 10, label: "Clap" }] });
		await make("rec/clip.mp4.flags.json", flags);
		const privacy = JSON.stringify({
			version: 1,
			policy: {
				version: 1,
				buttonScope: "global",
				allowedApplications: [],
				excludedApplications: [],
			},
			collectionAllowedAtStart: true,
			applicationIdentity: "unavailable",
			suppressedAtStart: false,
		});
		await make("rec/clip.mp4.capture-policy.json", privacy);
		const project = await writeProject("demo.openscreen", {
			version: 1,
			media: { screenVideoPath: screen },
		});
		const output = path.join(root, "packed");
		await runPackCommand(project, output, false, recorder().write);
		expect(await fs.readFile(path.join(output, "clip.mp4.events.ndjson"), "utf8")).toBe(events);
		expect(await fs.readFile(path.join(output, "clip.mp4.flags.json"), "utf8")).toBe(flags);
		expect(
			JSON.parse(await fs.readFile(path.join(output, "clip.mp4.capture-policy.json"), "utf8")),
		).toMatchObject({ version: 3, policy: { buttonScope: "global" } });
		expect(await fs.readFile(`${screen}.capture-policy.json`, "utf8")).toBe(privacy);
	});

	it("recovers media while excluding malformed privacy and private evidence", async () => {
		const screen = await make("rec/clip.mp4", "video bytes");
		await make("rec/clip.mp4.events.ndjson", "PRIVATE_PACK_CANARY");
		await make("rec/clip.mp4.capture-policy.json", "PRIVATE_RECEIPT_CANARY");
		const project = await writeProject("demo.openscreen", {
			version: 1,
			media: { screenVideoPath: screen },
		});
		const output = path.join(root, "packed");
		const out = recorder();
		await expect(runPackCommand(project, output, true, out.write)).resolves.toBe(0);
		expect((await fs.readdir(output)).sort()).toEqual(["clip.mp4", "demo.openscreen"]);
		expect(JSON.parse(out.text()).warnings[0]).toContain("media only");
		expect(await fs.readFile(path.join(output, "demo.openscreen"), "utf8")).not.toContain(
			"PRIVATE_",
		);
	});
	it("keeps screen and webcam apart when they share a basename", async () => {
		const screen = await make("rec/a/clip.mp4", "screen");
		const webcam = await make("rec/b/clip.mp4", "webcam");
		const project = await writeProject("demo.openscreen", {
			version: 1,
			media: { screenVideoPath: screen, webcamVideoPath: webcam },
		});
		const outDir = path.join(root, "packed");

		const out = recorder();
		expect(await runPackCommand(project, outDir, false, out.write)).toBe(0);

		const packed = await readProject(path.join(outDir, "demo.openscreen"));
		expect(packed.media?.screenVideoPath).not.toBe(packed.media?.webcamVideoPath);
		await expect(fs.readFile(packed.media?.screenVideoPath ?? "", "utf8")).resolves.toBe("screen");
		await expect(fs.readFile(packed.media?.webcamVideoPath ?? "", "utf8")).resolves.toBe("webcam");
	});

	it("copies the cursor sidecar and drops the legacy videoPath", async () => {
		const screen = await make("rec/clip.mp4", "screen");
		await make("rec/clip.mp4.cursor.json", "[]");
		const project = await writeProject("demo.openscreen", { version: 1, videoPath: screen });
		const outDir = path.join(root, "packed");

		const out = recorder();
		expect(await runPackCommand(project, outDir, true, out.write)).toBe(0);

		const packed = await readProject(path.join(outDir, "demo.openscreen"));
		expect(packed.videoPath).toBeUndefined();
		expect(packed.media?.screenVideoPath).toBe(path.join(outDir, "clip.mp4"));
		await expect(fs.readFile(path.join(outDir, "clip.mp4.cursor.json"), "utf8")).resolves.toBe(
			"[]",
		);
		expect(JSON.parse(out.text())).toMatchObject({ event: "done", cursorData: true });
	});

	it("falls back to media sitting next to the project when the stored path is stale", async () => {
		await make("moved/clip.mp4", "screen");
		const project = await writeProject("moved/demo.openscreen", {
			version: 1,
			media: { screenVideoPath: path.join(root, "gone", "clip.mp4") },
		});
		const outDir = path.join(root, "packed");

		const out = recorder();
		expect(await runPackCommand(project, outDir, false, out.write)).toBe(0);
		await expect(fs.readFile(path.join(outDir, "clip.mp4"), "utf8")).resolves.toBe("screen");
	});

	it("fails when the referenced media is nowhere to be found", async () => {
		const project = await writeProject("demo.openscreen", {
			version: 1,
			media: { screenVideoPath: path.join(root, "gone", "clip.mp4") },
		});

		const out = recorder();
		await expect(
			runPackCommand(project, path.join(root, "packed"), false, out.write),
		).rejects.toThrow(/Referenced media not found/);
	});
});

describe("runInfoCommand", () => {
	it("exits 1 when the project's video is missing, 0 when it is there", async () => {
		const missing = await writeProject("missing.openscreen", {
			version: 1,
			media: { screenVideoPath: path.join(root, "gone", "clip.mp4") },
		});
		const present = await writeProject("present.openscreen", {
			version: 1,
			media: { screenVideoPath: await make("rec/clip.mp4") },
		});

		const out = recorder();
		expect(await runInfoCommand(missing, false, out.write)).toBe(1);
		expect(out.text()).toContain("[MISSING]");
		expect(await runInfoCommand(present, false, out.write)).toBe(0);
	});

	it("counts timeline regions in --json mode", async () => {
		const project = await writeProject("demo.openscreen", {
			version: 1,
			media: { screenVideoPath: await make("rec/clip.mp4") },
			editor: { zoomRegions: [{}, {}], trimRegions: [{}], exportFormat: "mp4" },
		});

		const out = recorder();
		expect(await runInfoCommand(project, true, out.write)).toBe(0);
		expect(JSON.parse(out.text())).toMatchObject({
			zoomRegions: 2,
			trimRegions: 1,
			speedRegions: 0,
			annotationRegions: 0,
			shaderEffectRegions: 0,
			exportFormat: "mp4",
			screenVideoExists: true,
		});
	});
});

describe("a project the editor saved", () => {
	it("is described by info from its primary asset", async () => {
		const screen = await make("rec/clip.mp4");
		const project = await writeDocument("saved.openscreen", screen);

		const out = recorder();
		expect(await runInfoCommand(project, true, out.write)).toBe(0);
		expect(JSON.parse(out.text())).toMatchObject({
			version: 9,
			screenVideoPath: screen,
			screenVideoExists: true,
			exportFormat: "gif",
			zoomRegions: 1,
			trimRegions: 0,
			speedRegions: 1,
			shaderEffectRegions: 1,
		});
	});

	it("is reported MISSING by info when its media is gone", async () => {
		const project = await writeDocument("saved.openscreen", path.join(root, "gone", "clip.mp4"));

		const out = recorder();
		expect(await runInfoCommand(project, false, out.write)).toBe(1);
		expect(out.text()).toContain("[MISSING]");
	});

	it("is refused by pack with a reason, not as a project without video", async () => {
		const project = await writeDocument("saved.openscreen", await make("rec/clip.mp4"));

		await expect(
			runPackCommand(project, path.join(root, "packed"), false, recorder().write),
		).rejects.toThrow("pack does not support projects saved by the editor yet");
	});
});

it("packages incomplete Off media without sidecars and reports warnings in JSON", async () => {
	const screen = await make("rec/clip.mp4", "recoverable media");
	await make(
		"rec/clip.mp4.capture-policy.json",
		JSON.stringify({
			version: 2,
			captureId: "92a70db4-a3c7-4375-a272-caa5537ed421",
			policy: { version: 1, buttonScope: "off", allowedApplications: [], excludedApplications: [] },
			applicationIdentity: "unavailable",
			collectionAllowedAtStart: false,
			suppressedAtStart: false,
		}),
	);
	await make("rec/clip.mp4.cursor.json", "PRIVATE_CURSOR_CANARY");
	const project = await writeProject("demo.openscreen", {
		version: 1,
		media: { screenVideoPath: screen },
	});
	const output = path.join(root, "recovered");
	const out = recorder();
	expect(await runPackCommand(project, output, true, out.write)).toBe(0);
	expect(JSON.parse(out.text())).toMatchObject({
		success: true,
		cursorData: false,
		warnings: [expect.stringContaining("pending")],
	});
	expect((await fs.readdir(output)).sort()).toEqual(["clip.mp4", "demo.openscreen"]);
	expect(await fs.readFile(path.join(output, "clip.mp4"), "utf8")).toBe("recoverable media");
	expect(await fs.readFile(`${screen}.cursor.json`, "utf8")).toBe("PRIVATE_CURSOR_CANARY");
});
it("minimizes old receipt identifiers in packed metadata and sidecars while preserving originals", async () => {
	const screen = await make("rec/clip.mp4");
	const receipt = JSON.stringify({
		version: 1,
		policy: {
			version: 1,
			buttonScope: "global",
			allowedApplications: ["PRIVATE_APP_CANARY"],
			excludedApplications: [],
		},
		applicationIdentity: "unavailable",
		collectionAllowedAtStart: true,
		suppressedAtStart: false,
	});
	await make("rec/clip.mp4.capture-policy.json", receipt);
	const project = await writeProject("demo.openscreen", {
		version: 1,
		media: { screenVideoPath: screen },
	});
	const output = path.join(root, "packed");
	await runPackCommand(project, output, false, recorder().write);
	for (const file of await fs.readdir(output))
		expect(await fs.readFile(path.join(output, file), "utf8")).not.toContain("PRIVATE_APP_CANARY");
	expect(await fs.readFile(`${screen}.capture-policy.json`, "utf8")).toBe(receipt);
});

it("preserves recovery provenance through real pack, migration and document disk reopen", async () => {
	const screen = await make("rec/clip.mp4", "unverified media");
	await make("rec/clip.mp4.capture-policy.lock", "unknown prior owner");
	const project = await writeProject("demo.openscreen", {
		version: 1,
		media: { screenVideoPath: screen },
	});
	const output = path.join(root, "recovered");
	await runPackCommand(project, output, true, recorder().write);
	const packed = await readProject(path.join(output, "demo.openscreen"));
	expect(packed.capturePrivacy).toMatchObject({
		status: "pending",
		recoveredFrom: "pending",
		journalPresent: false,
	});
	if (!packed.media?.screenVideoPath) throw new Error("Packed screen path missing");
	const migrated = migrateProjectDataToAxcutDocument({
		version: PROJECT_VERSION,
		media: { screenVideoPath: packed.media.screenVideoPath },
		editor: normalizeProjectEditor({}),
		capturePrivacy: packed.capturePrivacy,
	});
	const service = new DocumentService(path.join(root, "projects"), path.join(root, "links"));
	await service.saveProject(migrated);
	const reopened = await service.getProject(migrated.project.id);
	expect(reopened.assets[0].capturePrivacy).toMatchObject({
		status: "pending",
		recoveredFrom: "pending",
		journalPresent: false,
	});
	expect(reopened.assets[0].capturePrivacy?.receipt).toBeUndefined();
	expect(await fs.readFile(`${screen}.capture-policy.lock`, "utf8")).toBe("unknown prior owner");
});

it.each([
	"lock",
	"invalid-sidecar",
])("keeps recovered exclusions after a transient %s, save/reopen and neighboring journal", async (kind) => {
	const screen = await make("rec/clip.mp4", "recovered video");
	const documents = new DocumentService(path.join(root, "projects"), path.join(root, "links"));
	const initial = await documents.createProject("Recovered");
	const added = await documents.addAsset(initial.project.id, { path: screen });
	await documents.saveProject({
		...added,
		assets: added.assets.map((asset) => ({
			...asset,
			capturePrivacy: {
				status: "interrupted",
				recoveredFrom: "interrupted",
				journalPresent: false,
			},
		})),
	});
	const temporary = `${screen}.${kind === "lock" ? "capture-policy.lock" : "capture-policy.json"}`;
	await fs.writeFile(
		temporary,
		kind === "lock" ? "unknown owner" : "PRIVATE_INVALID_RECEIPT_CANARY",
	);
	const transient = await documents.getProject(initial.project.id);
	expect(transient.assets[0].capturePrivacy?.recoveredFrom).toBe("interrupted");
	await documents.saveProject(transient);
	await fs.unlink(temporary);
	const reopened = await documents.getProject(initial.project.id);
	expect(reopened.assets[0].capturePrivacy?.recoveredFrom).toBe("interrupted");
	await fs.writeFile(`${screen}.events.ndjson`, "PRIVATE_ADJACENT_JOURNAL_CANARY");
	const project = await writeProject("recovered.openscreen", {
		version: 1,
		media: { screenVideoPath: screen },
		capturePrivacy: reopened.assets[0].capturePrivacy,
	});
	const output = path.join(root, "recovered-output");
	await runPackCommand(project, output, true, recorder().write);
	expect((await fs.readdir(output)).sort()).toEqual(["clip.mp4", "recovered.openscreen"]);
	expect(await fs.readFile(`${screen}.events.ndjson`, "utf8")).toBe(
		"PRIVATE_ADJACENT_JOURNAL_CANARY",
	);
});
it.runIf(process.platform !== "win32" && process.getuid?.() !== 0)(
	"retains a recovery exclusion through a real transient permission failure",
	async () => {
		const screen = await make("rec/clip.mp4", "recovered video");
		const directory = path.dirname(screen);
		const documents = new DocumentService(path.join(root, "projects"), path.join(root, "links"));
		const initial = await documents.createProject("Recovered permissions");
		const added = await documents.addAsset(initial.project.id, { path: screen });
		await documents.saveProject({
			...added,
			assets: added.assets.map((asset) => ({
				...asset,
				capturePrivacy: {
					status: "interrupted",
					recoveredFrom: "interrupted",
					journalPresent: false,
				},
			})),
		});
		try {
			await fs.chmod(directory, 0);
			const inaccessible = await documents.getProject(initial.project.id);
			expect(inaccessible.assets[0].capturePrivacy).toMatchObject({
				status: "unavailable",
				recoveredFrom: "interrupted",
			});
			await documents.saveProject(inaccessible);
		} finally {
			await fs.chmod(directory, 0o700);
		}
		const reopened = await documents.getProject(initial.project.id);
		expect(reopened.assets[0].capturePrivacy?.recoveredFrom).toBe("interrupted");
		await fs.writeFile(`${screen}.events.ndjson`, "PRIVATE_RESTORED_JOURNAL_CANARY");
		const project = await writeProject("permissions.openscreen", {
			version: 1,
			media: { screenVideoPath: screen },
			capturePrivacy: reopened.assets[0].capturePrivacy,
		});
		const output = path.join(root, "permissions-output");
		await runPackCommand(project, output, true, recorder().write);
		expect((await fs.readdir(output)).sort()).toEqual(["clip.mp4", "permissions.openscreen"]);
	},
);
