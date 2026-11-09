import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { newLesson, newStep } from "../../src/lib/lesson/authoring";
import { jpegBase64 } from "../../src/lib/lesson/fixtures.test-support";
import { createLessonFileLifecycle } from "../lesson/fileLifecycle";
import { registerLessonTools } from "./lesson-tools";

let root: string,
	client: Client,
	server: McpServer,
	allowed: boolean,
	lifecycle: ReturnType<typeof createLessonFileLifecycle>;
const render = vi.fn(async (_clips: unknown, _scene: string, _fps: number, frames: number[]) => [
	{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") },
]);
let args: Record<string, unknown>, raw: string;
async function connect(withRenderer: boolean) {
	server = new McpServer({ name: "lesson-illustrate-test", version: "0" });
	registerLessonTools(server, {
		transport: "http",
		editsAllowed: () => allowed,
		lifecycle,
		...(withRenderer ? { renderFrames: render } : {}),
	});
	client = new Client({ name: "test", version: "0" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(a), client.connect(b)]);
}
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-illustrate-mcp-"));
	allowed = true;
	render.mockClear();
	lifecycle = createLessonFileLifecycle();
	const source = path.join(root, "PRIVATE_SOURCE.mp4"),
		step = newStep("Shown"),
		doc = createEmptyDocument({ projectId: "p", title: "PRIVATE_PROJECT" });
	await fs.writeFile(source, "video");
	doc.assets = [{ id: "a", kind: "video", label: "S", originalPath: source, cameraTrack: null }];
	doc.timeline.clips = [
		{
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 5,
			timelineStartSec: 0,
			timelineEndSec: 5,
			origin: "user",
			wordRefs: [],
			reason: "fixture",
		},
	];
	raw = JSON.stringify({ ...newLesson(), steps: [step] });
	await fs.writeFile(path.join(root, "lesson.json"), raw);
	await fs.writeFile(path.join(root, "project.openscreen"), JSON.stringify(doc));
	args = {
		manifestPath: path.join(root, "lesson.json"),
		projectPath: path.join(root, "project.openscreen"),
		projectId: "p",
		stepId: step.id,
		rulerSec: 2,
		imageAlt: "Described frame",
		sourcePaths: [source],
		outputPath: path.join(root, "out.json"),
	};
});
afterEach(async () => {
	await client.close();
	await server.close();
	await fs.rm(root, { recursive: true, force: true });
});
const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
	(result.content as { text?: string }[]).map((part) => part.text ?? "").join("");
const call = (input: Record<string, unknown> = args) =>
	client.callTool({ name: "illustrateLessonStep", arguments: input });

it("illustrates a step for a consenting client and gates consent before any file or render access", async () => {
	await connect(true);
	allowed = false;
	const lstat = vi.spyOn(fs, "lstat"),
		open = vi.spyOn(fs, "open");
	expect(text(await call())).toContain("consent_required");
	expect(lstat).not.toHaveBeenCalled();
	expect(open).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
	vi.restoreAllMocks();
	allowed = true;
	const result = JSON.parse(text(await call()));
	expect(result).toMatchObject({ status: "saved", path: args.outputPath, image: { width: 2 } });
	const saved = JSON.parse(await fs.readFile(args.outputPath as string, "utf8"));
	expect(saved.steps[0]).toMatchObject({ imageAlt: "Described frame", status: "draft" });
	expect(await fs.readFile(args.manifestPath as string, "utf8")).toBe(raw);
});
it("returns only fixed codes for a trimmed time, an ungranted source and an existing output", async () => {
	await connect(true);
	const trimmed = text(await call({ ...args, rulerSec: 9 }));
	const ungranted = text(await call({ ...args, sourcePaths: [args.manifestPath] }));
	await fs.writeFile(args.outputPath as string, "KEEP");
	const existing = text(await call());
	expect([trimmed, ungranted, existing]).toEqual([
		"frame-unavailable",
		"lesson-file-operation-failed",
		"lesson-file-operation-failed",
	]);
	expect(await fs.readFile(args.outputPath as string, "utf8")).toBe("KEEP");
});
it("consent withdrawn while the frame renders publishes nothing; a closed connection or missing renderer refuses", async () => {
	await connect(true);
	render.mockImplementationOnce(async (_c, _s, _f, frames) => {
		allowed = false;
		return [{ index: frames[0], width: 2, height: 2, jpeg: Buffer.from(jpegBase64, "base64") }];
	});
	expect(text(await call())).toContain("consent_required");
	await expect(fs.stat(args.outputPath as string)).rejects.toThrow();
	allowed = true;
	lifecycle.abort();
	expect(text(await call())).toBe("lesson-file-operation-failed");
	await client.close();
	await server.close();
	lifecycle = createLessonFileLifecycle();
	await connect(false);
	expect(text(await call())).toBe("lesson-file-operation-failed");
	await expect(fs.stat(args.outputPath as string)).rejects.toThrow();
});
