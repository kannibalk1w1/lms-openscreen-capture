import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as selectedFile from "../lesson/selectedFile";
import { registerLessonTools } from "./lesson-tools";

let root: string,
	server: McpServer,
	client: Client,
	allowed = false;
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "capture-mcp-")));
	allowed = false;
	server = new McpServer({ name: "capture-test", version: "0" });
	registerLessonTools(server, {
		transport: "http",
		editsAllowed: () => allowed,
	});
	client = new Client({ name: "capture-client", version: "0" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(a), client.connect(b)]);
});
afterEach(async () => {
	await client.close();
	await server.close();
	await fs.rm(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});
const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
	(result.content as { text?: string }[]).map((part) => part.text ?? "").join("");
it("requires HTTP edits before any inspect/draft filesystem read", async () => {
	const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
	const source = path.join(root, "DO_NOT_READ.json"),
		args = {
			capturePath: source,
			outputPath: path.join(root, "draft.json"),
			title: "T",
			sha256: "a".repeat(64),
			observationIds: ["event-a"],
		};
	const deniedInspect = await client.callTool({
		name: "inspectApplicationCaptureFile",
		arguments: { capturePath: source },
	});
	const deniedDraft = await client.callTool({
		name: "draftLessonFromApplicationCapture",
		arguments: args,
	});
	expect(text(deniedInspect)).toContain("consent_required");
	expect(text(deniedDraft)).toContain("consent_required");
	expect(read).not.toHaveBeenCalled();
});
it("lists metadata only and drafts selected real Godot evidence through MCP", async () => {
	const fixture = fileURLToPath(
		new URL("../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
	);
	const source = path.join(root, "scene.jsonl"),
		outputPath = path.join(root, "draft.json");
	const raw = await fs.readFile(fixture, "utf8");
	await fs.writeFile(source, raw);
	const tools = (await client.listTools()).tools;
	expect(tools.slice(-6, -3).map((tool) => tool.name)).toEqual([
		"illustrateLessonStep",
		"inspectApplicationCaptureFile",
		"draftLessonFromApplicationCapture",
	]);
	allowed = true;
	const inspected = JSON.parse(
		text(
			await client.callTool({
				name: "inspectApplicationCaptureFile",
				arguments: { capturePath: source, offset: 0, limit: 200 },
			}),
		),
	);
	expect(inspected.observationCount).toBe(8);
	expect(
		text(
			await client.callTool({
				name: "inspectApplicationCaptureFile",
				arguments: { capturePath: source },
			}),
		),
	).not.toMatch(/res:\/\/slime\.svg|baseline|properties/);
	const id = inspected.observations.find((item: { label: string }) =>
		item.label.includes("Slime"),
	).id;
	const result = JSON.parse(
		text(
			await client.callTool({
				name: "draftLessonFromApplicationCapture",
				arguments: {
					capturePath: source,
					outputPath,
					title: "Enemy",
					sha256: inspected.sha256,
					observationIds: [id],
				},
			}),
		),
	);
	expect(result).toMatchObject({ status: "created", totalSteps: 1 });
	const lesson = JSON.parse(await fs.readFile(outputPath, "utf8"));
	expect(lesson.steps[0].evidence[0]).toMatchObject({
		eventId: id,
		clock: "unmapped",
	});
	expect(await fs.readFile(source, "utf8")).toBe(raw);
});

it("rechecks live consent after reading and before creating the output", async () => {
	const source = path.join(root, "scene.jsonl"),
		outputPath = path.join(root, "must-not-exist.json");
	await fs.copyFile(
		fileURLToPath(
			new URL("../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
		),
		source,
	);
	allowed = true;
	const inspection = JSON.parse(
		text(
			await client.callTool({
				name: "inspectApplicationCaptureFile",
				arguments: { capturePath: source },
			}),
		),
	);
	const original = selectedFile.readSelectedFileSnapshot;
	vi.spyOn(selectedFile, "readSelectedFileSnapshot").mockImplementationOnce((...args) => {
		const snapshot = original(...args);
		allowed = false;
		return snapshot;
	});
	const result = await client.callTool({
		name: "draftLessonFromApplicationCapture",
		arguments: {
			capturePath: source,
			outputPath,
			title: "T",
			sha256: inspection.sha256,
			observationIds: [inspection.observations[0].id],
		},
	});
	expect(text(result)).toContain("consent_required");
	await expect(fs.stat(outputPath)).rejects.toThrow();
});
