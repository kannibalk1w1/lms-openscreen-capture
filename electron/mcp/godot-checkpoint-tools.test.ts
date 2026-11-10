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

const fixture = fileURLToPath(
	new URL("../../integrations/godot-typing/probes/fixtures/checkpoints.jsonl", import.meta.url),
);
let root: string,
	server: McpServer,
	client: Client,
	allowed = false;
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "godot-checkpoint-mcp-")));
	allowed = false;
	server = new McpServer({ name: "godot-checkpoint-test", version: "0" });
	registerLessonTools(server, { transport: "http", editsAllowed: () => allowed });
	client = new Client({ name: "test", version: "0" });
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

it("registers both tools read-only and denies HTTP reads before any selected-file access", async () => {
	const tools = (await client.listTools()).tools;
	const inspect = tools.find((item) => item.name === "inspectGodotCheckpointsFile"),
		compare = tools.find((item) => item.name === "compareGodotCheckpointsFile");
	expect(inspect?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	expect(compare?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot"),
		missing = path.join(root, "DO_NOT_READ.jsonl");
	const denied = await client.callTool({
		name: "inspectGodotCheckpointsFile",
		arguments: { journalPath: missing },
	});
	expect(text(denied)).toContain("consent_required");
	const deniedComparison = await client.callTool({
		name: "compareGodotCheckpointsFile",
		arguments: {
			journalPath: missing,
			fromRecordSequence: 1,
			toRecordSequence: 6,
			sha256: "a".repeat(64),
		},
	});
	expect(text(deniedComparison)).toContain("consent_required");
	expect(read).not.toHaveBeenCalled();
});

it("returns same fingerprint-bound comparison through MCP without source path or resource values", async () => {
	const journalPath = path.join(root, "scene.jsonl");
	await fs.copyFile(fixture, journalPath);
	allowed = true;
	const inspection = JSON.parse(
		text(
			await client.callTool({ name: "inspectGodotCheckpointsFile", arguments: { journalPath } }),
		),
	);
	const result = JSON.parse(
		text(
			await client.callTool({
				name: "compareGodotCheckpointsFile",
				arguments: {
					journalPath,
					fromRecordSequence: 1,
					toRecordSequence: 6,
					sha256: inspection.sha256,
				},
			}),
		),
	);
	expect(result.comparison).toMatchObject({
		from: { recordSequence: 1 },
		to: { recordSequence: 6 },
	});
	expect(JSON.stringify(result)).not.toContain(journalPath);
	expect(JSON.stringify(result)).not.toContain("res://");
});

it("rechecks HTTP permission before returning inspected data", async () => {
	const journalPath = path.join(root, "scene.jsonl");
	await fs.copyFile(fixture, journalPath);
	allowed = true;
	const original = selectedFile.readSelectedFileSnapshot;
	vi.spyOn(selectedFile, "readSelectedFileSnapshot").mockImplementation((...args) => {
		const value = original(...args);
		allowed = false;
		return value;
	});
	const response = await client.callTool({
		name: "inspectGodotCheckpointsFile",
		arguments: { journalPath },
	});
	expect(text(response)).toContain("consent_required");
});
