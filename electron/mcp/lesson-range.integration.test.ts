import { lstatSync, openSync, realpathSync } from "node:fs";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		realpathSync: vi.fn(actual.realpathSync),
		openSync: vi.fn(actual.openSync),
		lstatSync: vi.fn(actual.lstatSync),
	};
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentService } from "../ai-edition/document-service";
import { confirmLessonFileRange } from "../lesson/fileRange";

vi.mock("../lesson/fileRange", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lesson/fileRange")>();
	return { ...actual, confirmLessonFileRange: vi.fn(actual.confirmLessonFileRange) };
});

import { fixture } from "../lesson/fileRange.test-support";
import { type RunningMcpServer, startMcpHttpServer } from "./openscreen-mcp-server";

let root: string, client: Client, running: RunningMcpServer, allowed: boolean;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(confirmLessonFileRange).mockClear();
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-http-"));
	allowed = false;
	running = await startMcpHttpServer({
		port: 0,
		token: "disposable-test-token",
		deps: {
			transport: "http",
			editsAllowed: () => allowed,
			version: "0",
			host: { snapshot: async () => null, apply: async () => "no-live-document" },
			projects: new DocumentService(path.join(root, "projects"), root),
		},
	});
	client = new Client({ name: "explicit-lesson-client", version: "0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`), {
			requestInit: { headers: { Authorization: "Bearer disposable-test-token" } },
		}),
	);
});
afterEach(async () => {
	await client.close();
	await running.close();
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
	(result.content as { text?: string }[]).map((p) => p.text ?? "").join("");
it("actual authenticated HTTP registration gates confirmation before filesystem access, then pins/saves/reopens redacted", async () => {
	const f = await fixture(root),
		stat = vi.spyOn(fs, "lstat"),
		resolve = vi.mocked(realpathSync),
		open = vi.spyOn(fs, "open");
	resolve.mockClear();
	vi.mocked(openSync).mockClear();
	vi.mocked(lstatSync).mockClear();
	const call = () => client.callTool({ name: "confirmLessonRangeFile", arguments: f.request });
	const denied = await call();
	expect(text(denied)).toContain("consent_required");
	expect(stat).not.toHaveBeenCalled();
	expect(resolve).not.toHaveBeenCalled();
	expect(openSync).not.toHaveBeenCalled();
	expect(lstatSync).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	allowed = true;
	const result = await call();
	expect(result.isError).toBeFalsy();
	expect(JSON.parse(text(result))).toMatchObject({
		status: "confirmed",
		path: f.request.outputPath,
	});
	expect(text(result)).not.toContain("PRIVATE_CODE_CANARY");
	expect(resolve).toHaveBeenCalled();
	const queried = await client.callTool({
		name: "queryLessonFile",
		arguments: { manifestPath: f.request.outputPath },
	});
	expect(JSON.parse(text(queried)).steps[0].sourceIdentityStatus).toBe("content-pinned");
	expect(text(queried)).not.toMatch(/PRIVATE_CODE_CANARY|source.mp4|sha256/);
});
it("revocation during source work refuses certification and discloses no staged/source path", async () => {
	const f = await fixture(root);
	allowed = true;
	const open = fs.open.bind(fs);
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const file = await open(...args);
		allowed = false;
		return file;
	});
	const result = await client.callTool({ name: "confirmLessonRangeFile", arguments: f.request });
	expect(result.isError).toBe(true);
	expect(text(result)).toContain("consent_required");
	expect(text(result)).not.toContain(root);
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("disconnect aborts only its HTTP request and cannot publish after actual source work settles", async () => {
	const f = await fixture(root);
	allowed = true;
	const open = fs.open.bind(fs);
	let finish!: () => void;
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		const file = await open(...args);
		if (args[0] === f.source)
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
		return file;
	});
	const pending = client
		.callTool({ name: "confirmLessonRangeFile", arguments: f.request })
		.catch(() => undefined);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	await client.close();
	finish();
	await Promise.allSettled([pending, vi.mocked(confirmLessonFileRange).mock.results.at(-1)!.value]);
	await expect(fs.stat(f.request.outputPath)).rejects.toHaveProperty("code", "ENOENT");
});
it("does not echo invalid imported intent values in tool errors", async () => {
	const f = await fixture(root);
	allowed = true;
	const result = await client.callTool({
		name: "confirmLessonRangeFile",
		arguments: { ...f.request, intent: "PRIVATE_INVALID_INTENT_CANARY" },
	});
	expect(result.isError).toBe(true);
	expect(text(result)).not.toContain("PRIVATE_INVALID_INTENT_CANARY");
});
