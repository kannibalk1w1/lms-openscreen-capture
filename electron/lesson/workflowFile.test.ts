import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, expect, it } from "vitest";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { parseLesson } from "../../src/lib/lesson/schema";
import { parseCliArgs } from "../cli/args";
import { runLessonCommand } from "../cli/lessonCommands";
import { registerLessonTools } from "../mcp/lesson-tools";
import { applyLessonWorkflowFile } from "./workflowFile";

let root: string;
it("does not echo private change payloads in CLI parse errors", () => {
	for (const change of [
		"PRIVATE_BROKEN_JSON",
		JSON.stringify({ operation: "PRIVATE_OPERATION", note: "PRIVATE_NOTE" }),
	]) {
		const result = parseCliArgs(
			[
				"lesson",
				"workflow",
				"/tmp/lesson.json",
				"--revision",
				"0",
				"--out",
				"/tmp/new.json",
				"--change",
				change,
			],
			0,
		);
		expect(result).toMatchObject({ kind: "error" });
		expect(JSON.stringify(result)).not.toContain("PRIVATE_");
		expect(JSON.stringify(result)).toMatch(/workflow/);
	}
});
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-workflow-"));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
	const source = { ...newLesson(), steps: [newStep("Enemy")] };
	const manifestPath = path.join(root, "source.json");
	await fs.writeFile(manifestPath, JSON.stringify(source));
	return {
		source,
		request: {
			manifestPath,
			outputPath: path.join(root, "next.json"),
			expectedRevision: 0,
			change: {
				operation: "handoff" as const,
				handoff: {
					from: "human" as const,
					to: "agent" as const,
					note: "Check Enemy",
					nextStepId: source.steps[0].id,
				},
			},
		},
	};
}
it("writes a new handoff file through the real CLI runner, refusing stale revisions and overwrites", async () => {
	const { source, request } = await fixture();
	const command = parseCliArgs(
		[
			"lesson",
			"workflow",
			"source.json",
			"--revision",
			"0",
			"--out",
			"next.json",
			"--change",
			JSON.stringify(request.change),
			"--json",
		],
		0,
		root,
	);
	if (command?.kind !== "lesson") throw new Error("Expected lesson command");
	const output: string[] = [];
	expect(await runLessonCommand(command, (v) => output.push(v))).toBe(0);
	expect(JSON.parse(output[0]).result).toMatchObject({ revision: 1, operation: "handoff" });
	const next = await parseLesson(await fs.readFile(request.outputPath, "utf8"));
	expect(next.handoffs?.[0].note).toBe("Check Enemy");
	expect(await parseLesson(await fs.readFile(request.manifestPath, "utf8"))).toEqual(source);
	await expect(applyLessonWorkflowFile(request)).rejects.toThrow();
	await expect(
		applyLessonWorkflowFile({
			...request,
			outputPath: path.join(root, "stale.json"),
			expectedRevision: 1,
		}),
	).rejects.toThrow();
	await expect(fs.stat(path.join(root, "stale.json"))).rejects.toThrow();
});

it("gates MCP before reads and observes revocation before writes", async () => {
	const { request } = await fixture();
	const server = new McpServer({ name: "workflow", version: "0" });
	let allowed = false;
	registerLessonTools(server, { transport: "http", editsAllowed: () => allowed });
	const client = new Client({ name: "test", version: "0" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(a), client.connect(b)]);
	try {
		const denied = await client.callTool({
			name: "applyLessonWorkflowFile",
			arguments: { ...request, manifestPath: path.join(root, "PRIVATE_MISSING") },
		});
		expect(denied.isError).toBe(true);
		expect(JSON.stringify(denied)).toContain("consent_required");
		allowed = true;
		const result = await client.callTool({ name: "applyLessonWorkflowFile", arguments: request });
		expect(result.isError).toBeFalsy();
	} finally {
		await client.close();
		await server.close();
	}
	let calls = 0;
	const other = path.join(root, "revoked.json");
	await expect(
		applyLessonWorkflowFile({ ...request, outputPath: other }, () => {
			if (++calls === 3) throw new Error("revoked");
		}),
	).rejects.toThrow("revoked");
	await expect(fs.stat(other)).rejects.toThrow();
});
