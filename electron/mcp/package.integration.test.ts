import { lstatSync, openSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { createLessonPackage } from "../lesson/package";
import { fakePackageVideo, packageFixture } from "../lesson/package.test-support";
import { type RunningMcpServer, startMcpHttpServer } from "./openscreen-mcp-server";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		openSync: vi.fn(actual.openSync),
		realpathSync: vi.fn(actual.realpathSync),
		lstatSync: vi.fn(actual.lstatSync),
	};
});
vi.mock("../lesson/encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
vi.mock("../lesson/package", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lesson/package")>();
	return { ...actual, createLessonPackage: vi.fn(actual.createLessonPackage) };
});
let root: string,
	f: Awaited<ReturnType<typeof packageFixture>>,
	client: Client,
	running: RunningMcpServer,
	allowed: boolean;
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "package-http-"));
	f = await packageFixture(root);
	allowed = false;
	running = await startMcpHttpServer({
		port: 0,
		token: "disposable-package-token",
		deps: {
			transport: "http",
			editsAllowed: () => allowed,
			version: "0",
			host: { snapshot: async () => null, apply: async () => "no-live-document" },
			projects: f.documents,
		},
	});
	client = new Client({ name: "explicit-package-client", version: "0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`), {
			requestInit: { headers: { Authorization: "Bearer disposable-package-token" } },
		}),
	);
});
afterEach(async () => {
	await client.close();
	await running.close();
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
	(r.content as { text?: string }[]).map((p) => p.text ?? "").join("");
const call = () => client.callTool({ name: "createLessonPackage", arguments: f.request });
it("actual authenticated registration refuses both package read/export before any FS when permission is off", async () => {
	const open = vi.spyOn(fs, "open");
	vi.mocked(openSync).mockClear();
	vi.mocked(realpathSync).mockClear();
	vi.mocked(lstatSync).mockClear();
	expect(text(await call())).toContain("consent_required");
	expect(
		text(
			await client.callTool({
				name: "verifyLessonPackage",
				arguments: { directory: f.outputDirectory },
			}),
		),
	).toContain("consent_required");
	expect(open).not.toHaveBeenCalled();
	expect(openSync).not.toHaveBeenCalled();
	expect(realpathSync).not.toHaveBeenCalled();
	expect(lstatSync).not.toHaveBeenCalled();
});
it("registered create and verify provide bounded redacted summaries, preserve originals and reopen without source paths", async () => {
	allowed = true;
	const original = await fs.readFile(f.request.manifestPath),
		result = await call();
	expect(result.isError).toBeFalsy();
	const packaged = JSON.parse(text(result));
	expect(packaged).toMatchObject({ status: "packaged", steps: 1, videos: 1 });
	expect(text(result)).not.toMatch(/PRIVATE_|range-export.json/);
	await fs.rename(f.authoring, f.authoring + ".offline");
	const verified = await client.callTool({
		name: "verifyLessonPackage",
		arguments: { directory: packaged.path },
	});
	expect(verified.isError).toBeFalsy();
	expect(JSON.parse(text(verified))).toMatchObject({
		status: "verified",
		scope: { sourceProjects: "external-unavailable" },
	});
	expect(text(verified)).not.toMatch(/PRIVATE_|source\.mp4|identity|documentSha256/);
	expect(await fs.readFile(path.join(f.authoring + ".offline", "lesson.json"))).toEqual(original);
});
it("revocation during real service output validation cannot publish a completion or disclose its path", async () => {
	allowed = true;
	vi.mocked(validateRangeVideo).mockImplementation(async (file) => {
		const result = await fakePackageVideo(file);
		if (file.includes("/lesson-package-")) allowed = false;
		return result;
	});
	const result = await call();
	expect(result.isError).toBe(true);
	expect(text(result)).toContain("consent_required");
	expect(text(result)).not.toContain(root);
	for (const entry of await fs.readdir(f.outputDirectory))
		expect(await fs.readdir(path.join(f.outputDirectory, entry))).not.toContain(
			"package-receipt.json",
		);
});
it("actual HTTP disconnect cancels only its package, and shutdown drains actual pending decode before returning", async () => {
	allowed = true;
	let finish!: () => void;
	vi.mocked(validateRangeVideo).mockImplementation(async (file) => {
		const result = await fakePackageVideo(file);
		if (file.includes("/lesson-package-"))
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
		return result;
	});
	const pending = call().catch(() => undefined);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	const work = vi.mocked(createLessonPackage).mock.results.at(-1)!.value;
	await client.close();
	let drained = false;
	const close = running.close().then(() => {
		drained = true;
	});
	await new Promise((r) => setTimeout(r, 30));
	expect(drained).toBe(false);
	finish();
	await Promise.allSettled([pending, work, close]);
	expect(drained).toBe(true);
	for (const entry of await fs.readdir(f.outputDirectory))
		expect(await fs.readdir(path.join(f.outputDirectory, entry))).not.toContain(
			"package-receipt.json",
		);
});
