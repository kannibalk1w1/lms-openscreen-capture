import { createHash } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../cli/args";
import { runLessonCommand } from "../cli/lessonCommands";
import { registerLessonTools } from "../mcp/lesson-tools";

let tmp: string, project: string;
beforeEach(async () => {
	tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-manifest-tools-")));
	project = path.join(tmp, "Disposable Project");
	await fs.mkdir(path.join(project, "scenes"), { recursive: true });
	await fs.writeFile(path.join(project, "project.godot"), "config_version=5\n");
	await fs.writeFile(path.join(project, "scenes", "enemy.tscn"), "[gd_scene format=3]\n");
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(tmp, { recursive: true, force: true });
});

describe("MCP project manifest tools", () => {
	let server: McpServer, client: Client, allowed: boolean;
	const connect = async (transport: "http" | "stdio") => {
		server = new McpServer({ name: "project-manifest-test", version: "0" });
		registerLessonTools(server, { transport, editsAllowed: () => allowed });
		client = new Client({ name: "test", version: "0" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(a), client.connect(b)]);
	};
	afterEach(async () => {
		await client.close();
		await server.close();
	});
	const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
		(result.content as { text?: string }[]).map((part) => part.text ?? "").join("");

	it("annotates the writer and the read-only check and denies HTTP calls before any scan", async () => {
		allowed = false;
		await connect("http");
		const tools = (await client.listTools()).tools;
		expect(
			tools.find((tool) => tool.name === "createProjectManifestFile")?.annotations,
		).toMatchObject({
			readOnlyHint: false,
			destructiveHint: false,
		});
		expect(tools.find((tool) => tool.name === "checkProjectDriftFile")?.annotations).toMatchObject({
			readOnlyHint: true,
			destructiveHint: false,
		});
		const readdir = vi.spyOn(fsPromises, "opendir");
		const lstat = vi.spyOn(fsPromises, "lstat");
		const create = await client.callTool({
			name: "createProjectManifestFile",
			arguments: { rootPath: project, outputPath: path.join(tmp, "m.json") },
		});
		expect(text(create)).toContain("consent_required");
		const check = await client.callTool({
			name: "checkProjectDriftFile",
			arguments: {
				rootPath: project,
				manifestPath: path.join(tmp, "m.json"),
				manifestSha256: "a".repeat(64),
			},
		});
		expect(text(check)).toContain("consent_required");
		expect(readdir).not.toHaveBeenCalled();
		expect(lstat).not.toHaveBeenCalled();
		expect(await fs.readdir(tmp)).toEqual(["Disposable Project"]);
	});

	it("creates and checks through stdio authority with fixed error codes", async () => {
		allowed = false;
		await connect("stdio");
		const outputPath = path.join(tmp, "m.json");
		const receipt = JSON.parse(
			text(
				await client.callTool({
					name: "createProjectManifestFile",
					arguments: { rootPath: project, outputPath },
				}),
			),
		);
		expect(receipt.sha256).toBe(
			createHash("sha256")
				.update(await fs.readFile(outputPath))
				.digest("hex"),
		);
		const drift = JSON.parse(
			text(
				await client.callTool({
					name: "checkProjectDriftFile",
					arguments: {
						rootPath: project,
						manifestPath: outputPath,
						manifestSha256: receipt.sha256,
					},
				}),
			),
		);
		expect(drift.outcome).toBe("no-drift-observed");
		const again = await client.callTool({
			name: "createProjectManifestFile",
			arguments: { rootPath: project, outputPath },
		});
		expect(again.content).toEqual([{ type: "text", text: "manifest-output-exists" }]);
		expect(text(again)).not.toContain(tmp);
	});

	it("rechecks HTTP consent before returning a result", async () => {
		allowed = true;
		await connect("http");
		const original = fsPromises.opendir.bind(fsPromises);
		vi.spyOn(fsPromises, "opendir").mockImplementation((async (
			...args: Parameters<typeof original>
		) => {
			allowed = false;
			return original(...args);
		}) as typeof fsPromises.opendir);
		const result = await client.callTool({
			name: "createProjectManifestFile",
			arguments: { rootPath: project, outputPath: path.join(tmp, "m.json") },
		});
		expect(text(result)).toContain("consent_required");
		expect(await fs.readdir(tmp)).toEqual(["Disposable Project"]);
	});
});

describe("CLI manifest-project / check-project-drift", () => {
	const parse = (...tail: string[]) => parseCliArgs(["electron", "app", "lesson", ...tail], 2, tmp);
	const run = async (command: ReturnType<typeof parse>) => {
		if (command?.kind !== "lesson") throw new Error(JSON.stringify(command));
		const output: string[] = [];
		const status = await runLessonCommand(command, (value) => output.push(value));
		return { status, output: output.join("") };
	};

	it("resolves relative paths against the CLI cwd and round-trips", async () => {
		const created = await run(
			parse("manifest-project", "Disposable Project", "--out", "m.json", "--json"),
		);
		expect(created.status).toBe(0);
		const receipt = JSON.parse(created.output).result;
		const checked = await run(
			parse(
				"check-project-drift",
				"Disposable Project",
				"--manifest",
				"m.json",
				"--sha256",
				receipt.sha256,
				"--json",
			),
		);
		expect(JSON.parse(checked.output).result.outcome).toBe("no-drift-observed");
	});

	it.each([
		[["manifest-project", "Disposable Project"]],
		[["manifest-project", "Disposable Project", "--out", "m.json", "--max-files", "0"]],
		[["manifest-project", "Disposable Project", "--out", "m.json", "--max-files", "1x"]],
		[["manifest-project", "Disposable Project", "--out", "m.json", "--out", "n.json"]],
		[["manifest-project", "Disposable Project", "--out", "m.json", "--sha256", "a"]],
		[["check-project-drift", "Disposable Project", "--manifest", "m.json"]],
		[["check-project-drift", "Disposable Project", "--manifest", "m.json", "--sha256", "bad"]],
		[["check-project-drift", "--manifest", "m.json", "--sha256", "a".repeat(64)]],
	])("refuses %j", (args) => {
		expect(parse(...args)).toMatchObject({ kind: "error" });
	});

	it("prints only fixed codes on failure", async () => {
		const result = await run(
			parse(
				"manifest-project",
				"Disposable Project",
				"--out",
				"Disposable Project/m.json",
				"--json",
			),
		);
		expect(result.status).not.toBe(0);
		expect(result.output).toContain("manifest-output-invalid");
		expect(result.output).not.toContain(tmp);
	});
});
