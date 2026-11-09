import { createHash } from "node:crypto";
import { lstatSync, openSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { exportLessonRangeFile } from "../lesson/fileExport";
import { setup } from "../lesson/fileExport.test-support";
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
vi.mock("../lesson/encodedVideo", () => ({
	validateRangeVideo: vi.fn(async (file: string) => {
		const bytes = await fs.readFile(file);
		return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
	}),
}));
vi.mock("../lesson/fileExport", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lesson/fileExport")>();
	return { ...actual, exportLessonRangeFile: vi.fn(actual.exportLessonRangeFile) };
});
let root: string,
	f: Awaited<ReturnType<typeof setup>>,
	running: RunningMcpServer,
	client: Client,
	allowed: boolean;
async function connect(signal?: AbortSignal) {
	const c = new Client({ name: "range-export-client", version: "0" });
	await c.connect(
		new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${running.port}/mcp`), {
			fetch: (url, init) =>
				fetch(url, {
					...init,
					signal: signal
						? AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])])
						: init?.signal,
				}),
			requestInit: { headers: { Authorization: "Bearer disposable-export-token" } },
		}),
	);
	return c;
}
beforeEach(async () => {
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	root = await fs.mkdtemp(path.join(os.tmpdir(), "http-range-export-"));
	f = await setup(root);
	allowed = false;
	running = await startMcpHttpServer({
		port: 0,
		token: "disposable-export-token",
		deps: {
			transport: "http",
			editsAllowed: () => allowed,
			version: "0",
			host: { snapshot: async () => null, apply: async () => "no-live-document" },
			projects: f.documents,
			startLessonRangeRender: f.render,
		},
	});
	client = await connect();
});
afterEach(async () => {
	await client.close();
	await running.close();
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
	(r.content as { text?: string }[]).map((p) => p.text ?? "").join("");
const call = () => client.callTool({ name: "exportLessonRangeFile", arguments: f.request });
it("registered HTTP checks live permission before FS then exports selected pinned step", async () => {
	const open = vi.spyOn(fs, "open");
	for (const fn of [openSync, lstatSync, realpathSync]) vi.mocked(fn).mockClear();
	const denied = await call();
	expect(text(denied)).toContain("consent_required");
	expect(open).not.toHaveBeenCalled();
	expect(openSync).not.toHaveBeenCalled();
	expect(lstatSync).not.toHaveBeenCalled();
	expect(realpathSync).not.toHaveBeenCalled();
	expect(f.native).not.toHaveBeenCalled();
	allowed = true;
	const result = await call();
	expect(result.isError).toBeFalsy();
	const data = JSON.parse(text(result));
	expect(data).toMatchObject({ status: "materialized", frames: 45 });
	expect(text(result)).not.toContain("PRIVATE_SOURCE");
	expect(
		JSON.parse(await fs.readFile(path.join(data.path, "range-export.json"), "utf8")),
	).toMatchObject({
		target: { stepId: f.step.id },
		mediaDecodedByValidator: true,
		encodedTimingVerified: true,
		audio: { timingVerified: false },
	});
});
it("route denies ungranted lexical source before canonical filesystem resolution", async () => {
	allowed = true;
	vi.mocked(realpathSync).mockClear();
	const result = await client.callTool({
		name: "exportLessonRangeFile",
		arguments: { ...f.request, sourcePaths: [path.join(root, "other.mp4")] },
	});
	expect(result.isError).toBe(true);
	expect(text(result)).not.toContain(root);
	expect(vi.mocked(realpathSync).mock.calls.some((args) => args[0] === f.source)).toBe(false);
	expect(f.native).not.toHaveBeenCalled();
});
it.each([
	"revoke",
	"replace-project",
	"replace-lesson",
])("live %s during decode refuses receipt and paths", async (change) => {
	allowed = true;
	vi.mocked(validateRangeVideo).mockImplementationOnce(async () => {
		if (change === "revoke") allowed = false;
		else {
			const target = change === "replace-project" ? f.request.projectPath : f.request.manifestPath,
				bytes = await fs.readFile(target);
			await fs.rename(target, target + ".old");
			await fs.writeFile(target, bytes);
		}
		return {} as Awaited<ReturnType<typeof validateRangeVideo>>;
	});
	const result = await call();
	expect(result.isError).toBe(true);
	expect(text(result)).not.toContain(root);
	if (change === "revoke") expect(text(result)).toContain("consent_required");
	for (const dir of (await fs.readdir(root)).filter((n) => n.startsWith("lesson-range-")))
		expect(await fs.readdir(path.join(root, dir))).not.toContain("range-export.json");
});
it("HTTP disconnect cancels owned native work and holds process lease through actual settlement", async () => {
	allowed = true;
	let finish!: () => void;
	f.native.mockImplementationOnce(
		async () =>
			new Promise((resolve) => {
				finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
			}),
	);
	const pending = call().catch(() => undefined);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	const work = vi.mocked(exportLessonRangeFile).mock.results.at(-1)!.value;
	await client.close();
	await vi.waitFor(() => expect(f.cancel).toHaveBeenCalledOnce());
	const other = await connect();
	const busy = await other.callTool({ name: "exportLessonRangeFile", arguments: f.request });
	expect(text(busy)).toContain("render-busy");
	expect(f.native).toHaveBeenCalledOnce();
	finish();
	await Promise.allSettled([pending, work]);
	expect(
		(await other.callTool({ name: "exportLessonRangeFile", arguments: f.request })).isError,
	).toBeFalsy();
	await other.close();
});
it("HTTP fetch cancellation reaches native control and drains before a fresh request", async () => {
	allowed = true;
	const abort = new AbortController();
	await client.close();
	client = await connect(abort.signal);
	let finish!: () => void;
	f.native.mockImplementationOnce(
		async () =>
			new Promise((resolve) => {
				finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
			}),
	);
	const pending = client
		.callTool({ name: "exportLessonRangeFile", arguments: f.request }, undefined, {
			signal: abort.signal,
		})
		.catch(() => undefined);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	const work = vi.mocked(exportLessonRangeFile).mock.results.at(-1)!.value;
	abort.abort();
	await vi.waitFor(() => expect(f.cancel).toHaveBeenCalledOnce());
	await expect(f.compositor.renderFrames([], "{}", 30, [0], 64)).rejects.toThrow(/already running/);
	finish();
	await Promise.allSettled([pending, work]);
	await client.close();
	client = await connect();
	expect((await call()).isError).toBeFalsy();
	expect(f.cancel).toHaveBeenCalledOnce();
});

it("HTTP server shutdown aborts its callers and resolves only after actual native settlement", async () => {
	allowed = true;
	let finish!: () => void;
	f.native.mockImplementationOnce(
		async () =>
			new Promise((resolve) => {
				finish = () => resolve({ frames: 45, fps: 30, wallS: 1, videoDurationS: 1.5 });
			}),
	);
	const pending = call().catch(() => undefined);
	await vi.waitFor(() => expect(typeof finish).toBe("function"));
	let stopped = false;
	const close = running.close().then(() => {
		stopped = true;
	});
	await vi.waitFor(() => expect(f.cancel).toHaveBeenCalledOnce()); // Give the actual socket close callback a turn; only native settlement may finish shutdown.
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(stopped).toBe(false);
	await expect(f.compositor.renderFrames([], "{}", 30, [0], 64)).rejects.toThrow(/already running/);
	finish();
	await Promise.all([pending, close]);
	expect(stopped).toBe(true);
});
