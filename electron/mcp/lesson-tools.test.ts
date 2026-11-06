import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { registerLessonTools } from "./lesson-tools";

let root: string,
	server: McpServer,
	client: Client,
	allowed = false;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-mcp-"));
	allowed = false;
	server = new McpServer({ name: "lesson-test", version: "0" });
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
function text(result: Awaited<ReturnType<Client["callTool"]>>) {
	return (result.content as { text?: string }[]).map((part) => part.text ?? "").join("");
}
it("registers only selected-file query/export tools and no recovery channel", async () => {
	const tools = (await client.listTools()).tools;
	expect(tools.map((tool) => tool.name)).toEqual(["queryLessonFile", "exportLessonGuide"]);
	expect(tools[0].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
	expect(tools[1].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
	expect(tools[0].inputSchema.required).toEqual(["manifestPath"]);
	expect(tools[1].inputSchema.required).toEqual(["manifestPath", "outputDirectory", "stepIds"]);
	expect(JSON.stringify(tools)).not.toContain("lessonDraft");
});
it("allows minimal HTTP query with permission and gates export before filesystem access", async () => {
	const step = {
		...newStep("Chosen"),
		instructions: "PRIVATE_INSTRUCTIONS",
		code: { language: "plain", text: "PRIVATE_CODE" },
	};
	const source = path.join(root, "source.json"),
		raw = JSON.stringify({ ...newLesson(), steps: [step, newStep("OMITTED_TITLE")] });
	await fs.writeFile(source, raw);
	allowed = true;
	const query = await client.callTool({
		name: "queryLessonFile",
		arguments: { manifestPath: source, query: { title: "Chosen" } },
	});
	expect(query.isError).toBeFalsy();
	expect(JSON.parse(text(query))).toMatchObject({ matchingSteps: 1, steps: [{ id: step.id }] });
	expect(text(query)).not.toMatch(/PRIVATE_INSTRUCTIONS|PRIVATE_CODE|OMITTED_TITLE/);
	expect(text(query)).not.toContain(source);
	allowed = false;
	const args = { manifestPath: source, outputDirectory: root, stepIds: [step.id] };
	const denied = await client.callTool({ name: "exportLessonGuide", arguments: args });
	expect(denied.isError).toBe(true);
	expect(text(denied)).toContain("consent_required");
	const missing = await client.callTool({
		name: "exportLessonGuide",
		arguments: { ...args, manifestPath: path.join(root, "PRIVATE_MISSING") },
	});
	expect(text(missing)).toBe(text(denied));
	expect(await fs.readdir(root)).toEqual(["source.json"]);
	allowed = true;
	const exported = await client.callTool({ name: "exportLessonGuide", arguments: args });
	expect(exported.isError).toBeFalsy();
	const result = JSON.parse(text(exported));
	expect(result).toMatchObject({ status: "exported", steps: 1 });
	expect((await fs.readdir(result.path)).sort()).toEqual([
		"export-report.json",
		"index.html",
		"lesson.md",
		"lesson.openscreen-lesson.json",
	]);
	allowed = false;
	expect(text(await client.callTool({ name: "exportLessonGuide", arguments: args }))).toContain(
		"consent_required",
	);
	expect(await fs.readFile(source, "utf8")).toBe(raw);
});
it("refuses malformed requests and hides raw parser/OS/source errors", async () => {
	const source = path.join(root, "PRIVATE_USERNAME.json");
	await fs.writeFile(source, '{"secret":"PRIVATE_SECRET"}');
	allowed = true;
	const bad = await client.callTool({
		name: "queryLessonFile",
		arguments: { manifestPath: source },
	});
	expect(text(bad)).toBe("lesson-file-operation-failed");
	expect(bad.isError).toBe(true);
	for (const args of [
		{},
		{ manifestPath: "relative.json" },
		{ manifestPath: source, query: { source: "godot" } },
		{ manifestPath: source, query: { title: "x".repeat(301) } },
		{ manifestPath: source, recoveryDirectory: root },
	]) {
		const result = await client.callTool({ name: "queryLessonFile", arguments: args });
		expect(result.isError).toBe(true);
		expect(text(result)).not.toContain("PRIVATE_SECRET");
	}
	allowed = true;
	for (const stepIds of [
		[],
		["bad"],
		[crypto.randomUUID(), crypto.randomUUID()].fill("12345678-1234-4123-8123-123456789012"),
	]) {
		expect(
			(
				await client.callTool({
					name: "exportLessonGuide",
					arguments: { manifestPath: source, outputDirectory: root, stepIds },
				})
			).isError,
		).toBe(true);
	}
	expect(await fs.readdir(root)).toEqual(["PRIVATE_USERNAME.json"]);
});

it("gates HTTP lesson queries before any filesystem read and honors later revocation", async () => {
	const source = path.join(root, "selected.json");
	await fs.writeFile(source, JSON.stringify({ ...newLesson(), steps: [newStep("Selected")] }));
	const stat = vi.spyOn(fs, "lstat"),
		open = vi.spyOn(fs, "open");
	const request = { name: "queryLessonFile", arguments: { manifestPath: source } };
	const denied = await client.callTool(request);
	expect(denied.isError).toBe(true);
	expect(text(denied)).toContain("consent_required");
	expect(stat).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	allowed = true;
	expect((await client.callTool(request)).isError).toBeFalsy();
	expect(open).toHaveBeenCalled();
	stat.mockClear();
	open.mockClear();
	allowed = false;
	expect(text(await client.callTool(request))).toContain("consent_required");
	expect(stat).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
});
it("keeps stdio selected-file query under its existing explicit-launch authority", async () => {
	await client.close();
	await server.close();
	server = new McpServer({ name: "stdio-authority-test", version: "0" });
	registerLessonTools(server, { transport: "stdio", editsAllowed: () => false });
	client = new Client({ name: "stdio-test", version: "0" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(a), client.connect(b)]);
	const source = path.join(root, "explicit.json");
	await fs.writeFile(source, JSON.stringify({ ...newLesson(), steps: [newStep("Known")] }));
	const result = await client.callTool({
		name: "queryLessonFile",
		arguments: { manifestPath: source },
	});
	expect(result.isError).toBeFalsy();
	expect(JSON.parse(text(result)).matchingSteps).toBe(1);
});
