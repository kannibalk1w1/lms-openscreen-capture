import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { disabledIntegrationSettings } from "../../src/lib/applicationIntegrations/schema";
import { sectionPlayback, TypingCapture } from "../../src/lib/typing/capture";
import { typingTakeSchema } from "../../src/lib/typing/schema";
import { DocumentService } from "../ai-edition/document-service";
import { AppSettingsStore } from "../app-settings";
import { ApplicationIntegrationService } from "./applicationIntegrationService";

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "application-integrations-"));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
export function journal(text = "print(42)") {
	return [
		{
			schemaVersion: 1,
			event: "typing-start",
			producer: "godot-codeedit",
			sessionId: "shared-local-session",
			sequence: 0,
			atMs: 0,
			initialText: "",
			documentName: "fixture.gd",
			startedAt: "2026-11-05T20:00:00Z",
			offsetEncoding: "unicode-code-points",
		},
		{
			schemaVersion: 1,
			event: "typing-edit",
			sessionId: "shared-local-session",
			sequence: 1,
			atMs: 1,
			start: 0,
			removed: "",
			inserted: text,
			selections: [],
		},
		{
			schemaVersion: 1,
			event: "typing-stop",
			sessionId: "shared-local-session",
			sequence: 2,
			atMs: 2,
			coverage: "complete",
		},
	]
		.map((row) => JSON.stringify(row))
		.join("\n");
}
it("is disabled on first launch and persists an explicit individual choice across restart", () => {
	const store = new AppSettingsStore(root);
	store.setRecordingPreferences({ micEnabled: true });
	const service = new ApplicationIntegrationService(store);
	expect(service.snapshot().settings).toEqual(disabledIntegrationSettings());
	expect(service.snapshot().statuses[0].state).toBe("disabled");
	expect(service.setSettings({ version: 1, enabledAdapterIds: ["godot-codeedit"] }).success).toBe(
		true,
	);
	expect(store.getSnapshot().recording.micEnabled).toBe(true);
	store.setRecordingPreferences({ camEnabled: true });
	const restarted = new ApplicationIntegrationService(new AppSettingsStore(root));
	expect(restarted.snapshot().statuses[0].state).toBe("available-offline");
});
it("does not parse or persist a private raw journal while disabled", async () => {
	const service = new ApplicationIntegrationService(new AppSettingsStore(root));
	await expect(service.importTypingSource("PRIVATE_DISABLED_CANARY\ninvalid")).rejects.toThrow(
		"Enable Godot",
	);
	expect(service.snapshot().statuses[0].activeSessions).toBe(0);
	expect(await fs.readdir(root)).toEqual([]);
});
it("imports only after opt-in, preserving unmapped clock and isolated instance provenance", async () => {
	const service = new ApplicationIntegrationService(new AppSettingsStore(root));
	service.setSettings({ version: 1, enabledAdapterIds: ["godot-codeedit"] });
	const [a] = await service.importTypingSource(journal()),
		[b] = await service.importTypingSource(journal("print(99)"));
	expect(a.take.producer).toBe("godot-codeedit");
	expect(a.take.integration).toMatchObject({
		adapterId: "godot-codeedit",
		clockRelation: "unmapped",
		originalClockId: "shared-local-session",
	});
	expect(a.take.integration).not.toEqual(b.take.integration);
	expect(a.take.id).not.toBe(b.take.id);
	const documents = new DocumentService(path.join(root, "projects"), path.join(root, "links"));
	const doc = await documents.createProject("Two instances");
	await documents.saveProject({ ...doc, typingTakes: [a.take, b.take] });
	const reopened = await documents.getProject(doc.project.id);
	expect(reopened.typingTakes).toHaveLength(2);
	expect(
		sectionPlayback(reopened.typingTakes![0], reopened.typingTakes![0].sections[0]).finalText,
	).toBe("print(42)");
	expect(
		sectionPlayback(reopened.typingTakes![1], reopened.typingTakes![1].sections[0]).finalText,
	).toBe("print(99)");

	expect(service.snapshot().statuses[0].activeSessions).toBe(0);
	expect(sectionPlayback(a.take, a.take.sections[0]).finalText).toBe("print(42)");
});
it("core pad/portable files and saved imported takes reopen/replay with every integration disabled", async () => {
	const service = new ApplicationIntegrationService(new AppSettingsStore(root));
	const capture = new TypingCapture("", () => 1, "pad");
	capture.observe("ordinary pad", [], "insertText");
	expect(await service.importTypingSource(JSON.stringify(capture.finish()))).toHaveLength(1);
	service.setSettings({ version: 1, enabledAdapterIds: ["godot-codeedit"] });
	const [imported] = await service.importTypingSource(journal());
	const documents = new DocumentService(path.join(root, "projects"), path.join(root, "links"));
	const doc = await documents.createProject("Offline");
	await documents.saveProject({ ...doc, typingTakes: [imported.take] });
	service.setSettings(disabledIntegrationSettings());
	const reopened = await new DocumentService(
		path.join(root, "projects"),
		path.join(root, "links"),
	).getProject(doc.project.id);
	const take = reopened.typingTakes![0];
	expect(take).toEqual(imported.take);
	expect(sectionPlayback(take, take.sections[0]).finalText).toBe("print(42)");
	expect(service.snapshot().statuses[0].activeSessions).toBe(0);
});
it("fails closed on malformed/future settings and rejects unsupported settings writes", async () => {
	await fs.writeFile(
		path.join(root, "recording-settings.json"),
		JSON.stringify({
			applicationIntegrations: { version: 9, enabledAdapterIds: ["godot-codeedit"] },
		}),
	);
	const service = new ApplicationIntegrationService(new AppSettingsStore(root));
	expect(service.snapshot().statuses[0].state).toBe("disabled");
	expect(() => service.setSettings({ version: 1, enabledAdapterIds: ["unknown"] })).toThrow();
	await expect(service.importTypingSource(journal())).rejects.toThrow("Enable Godot");
});
it("honors process-local disable even if its durable save fails", async () => {
	const store = new AppSettingsStore(root);
	store.setIntegrationSettings({ version: 1, enabledAdapterIds: ["godot-codeedit"] });
	const service = new ApplicationIntegrationService(store);
	await fs.rm(root, { recursive: true, force: true });
	const result = service.setSettings(disabledIntegrationSettings());
	expect(result.success).toBe(false);
	expect(result.statuses[0].enabled).toBe(false);
	await expect(service.importTypingSource(journal())).rejects.toThrow("Enable Godot");
});
it("keeps normalized content when optional provenance is unsupported without retaining private payload", () => {
	const capture = new TypingCapture("", () => 1, "pad");
	capture.observe("content", [], "insertText");
	const take = typingTakeSchema.parse({
		...capture.finish(),
		integration: { version: 9, private: "PRIVATE_PROVENANCE_CANARY" },
	});
	expect(take.integration).toEqual({ version: 1, status: "unsupported" });
	expect(JSON.stringify(take)).not.toContain("PRIVATE_PROVENANCE_CANARY");
});
