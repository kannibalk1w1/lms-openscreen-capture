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
	expect(tools.map((tool) => tool.name)).toEqual([
		"createLessonPackage",
		"verifyLessonPackage",
		"exportLessonRangeFile",
		"confirmLessonRangeFile",
		"queryLessonFile",
		"exportLessonGuide",
		"createLessonFile",
		"addLessonSteps",
		"updateLessonStep",
		"removeLessonStep",
		"moveLessonStep",
		"illustrateLessonStep",
		"inspectApplicationCaptureFile",
		"draftLessonFromApplicationCapture",
		"inspectGodotCheckpointsFile",
		"compareGodotCheckpointsFile",
		"compareGodotReferenceFile",
	]);
	tools.splice(0, 4);
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
		"lesson-mapping.json",
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
it("lets an agent start a lesson and append draft steps only with edits enabled, always as new files", async () => {
	const first = path.join(root, "first.json"),
		second = path.join(root, "second.json");
	const create = { outputPath: first, title: "Enemy", lessonRef: "RPG C1 / L1" },
		add = {
			manifestPath: first,
			outputPath: second,
			steps: [
				{ title: "Add a Node2D", instructions: "Click +", slideRef: "slide 12" },
				{ title: "Attach a script", code: { language: "gdscript", text: "extends Node2D" } },
			],
		};
	allowed = false;
	for (const [name, args] of [
		["createLessonFile", create],
		["addLessonSteps", add],
	] as const)
		expect(text(await client.callTool({ name, arguments: args }))).toContain("consent_required");
	expect(await fs.readdir(root)).toEqual([]);
	allowed = true;
	const created = await client.callTool({ name: "createLessonFile", arguments: create });
	expect(JSON.parse(text(created))).toMatchObject({ status: "created", path: first });
	const before = await fs.readFile(first, "utf8");
	const added = JSON.parse(text(await client.callTool({ name: "addLessonSteps", arguments: add })));
	expect(added).toMatchObject({
		status: "saved",
		totalSteps: 2,
		addedSteps: [{ number: 1 }, { number: 2 }],
	});
	expect(await fs.readFile(first, "utf8")).toBe(before);
	const lesson = JSON.parse(await fs.readFile(second, "utf8"));
	expect(lesson.steps.map((step: { status: string }) => step.status)).toEqual(["draft", "draft"]);
	expect(lesson.steps[0].id).toBe(added.addedSteps[0].id);
	// No overwrite, no unknown fields such as a claimed review status, fixed error text.
	for (const args of [
		add,
		{ ...add, outputPath: path.join(root, "x.json"), steps: [{ title: "T", status: "reviewed" }] },
	])
		expect(text(await client.callTool({ name: "addLessonSteps", arguments: args }))).not.toContain(
			"saved",
		);
	expect(text(await client.callTool({ name: "createLessonFile", arguments: create }))).toBe(
		"lesson-file-operation-failed",
	);
	expect((await fs.readdir(root)).sort()).toEqual(["first.json", "second.json"]);
	const query = JSON.parse(
		text(await client.callTool({ name: "queryLessonFile", arguments: { manifestPath: second } })),
	);
	expect(query).toMatchObject({ lessonRef: "RPG C1 / L1", steps: [{ slideRef: "slide 12" }, {}] });
});
it("updates and removes a step through MCP only with edits enabled, into new files", async () => {
	const step = { ...newStep("Old"), status: "reviewed" as const },
		source = path.join(root, "source.json"),
		raw = JSON.stringify({ ...newLesson(), steps: [step, newStep("Other")] });
	await fs.writeFile(source, raw);
	const update = {
			manifestPath: source,
			outputPath: path.join(root, "updated.json"),
			stepId: step.id,
			changes: { instructions: "Agent text", slideRef: "slide 2" },
		},
		remove = { manifestPath: source, outputPath: path.join(root, "removed.json"), stepId: step.id };
	allowed = false;
	expect(text(await client.callTool({ name: "updateLessonStep", arguments: update }))).toContain(
		"consent_required",
	);
	expect(text(await client.callTool({ name: "removeLessonStep", arguments: remove }))).toContain(
		"consent_required",
	);
	allowed = true;
	expect(
		JSON.parse(text(await client.callTool({ name: "updateLessonStep", arguments: update }))),
	).toMatchObject({ status: "saved", step: { id: step.id, status: "draft" } });
	expect(
		JSON.parse(text(await client.callTool({ name: "removeLessonStep", arguments: remove }))),
	).toMatchObject({ status: "saved", totalSteps: 1 });
	expect(await fs.readFile(source, "utf8")).toBe(raw);
	expect((await fs.readdir(root)).sort()).toEqual(["removed.json", "source.json", "updated.json"]);
});
it("moves a step through MCP only with edits enabled, into a new file", async () => {
	const steps = [newStep("A"), newStep("B")],
		source = path.join(root, "source.json"),
		args = {
			manifestPath: source,
			outputPath: path.join(root, "moved.json"),
			stepId: steps[1].id,
			position: 1,
		};
	await fs.writeFile(source, JSON.stringify({ ...newLesson(), steps }));
	allowed = false;
	expect(text(await client.callTool({ name: "moveLessonStep", arguments: args }))).toContain(
		"consent_required",
	);
	allowed = true;
	const moved = JSON.parse(
		text(await client.callTool({ name: "moveLessonStep", arguments: args })),
	);
	expect(moved.order.map((step: { id: string }) => step.id)).toEqual([steps[1].id, steps[0].id]);
	expect((await fs.readdir(root)).sort()).toEqual(["moved.json", "source.json"]);
});
