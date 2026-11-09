import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { createLessonFileLifecycle } from "../lesson/fileLifecycle";
import { serveMcpOverStdio } from "./stdio-server";

const mock = vi.hoisted(() => ({
	deps: null as unknown,
	stdin: null as unknown,
	server: {
		connect: vi.fn(async () => {
			/* Protocol mocked only for stdio close-wiring control. */
		}),
	},
}));
vi.mock("./openscreen-mcp-server", () => ({
	createOpenScreenMcpServer: vi.fn((deps) => {
		mock.deps = deps;
		return mock.server;
	}),
	createToolRunner: () => vi.fn(),
}));
vi.mock("./media-tools", () => ({ createMediaTools: () => ({}) }));
vi.mock("./app-channel", () => ({ routeToApp: () => vi.fn() }));
vi.mock("../cli/stdin", () => ({ openStdin: () => mock.stdin }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
afterEach(() => vi.clearAllMocks());
it("production stdio closure aborts its own lifetime and waits for actual tracked work before exit", async () => {
	const input = new PassThrough();
	mock.stdin = input;
	const onClose = vi.fn(),
		foreign = createLessonFileLifecycle();
	const documents = {
		listProjects: vi.fn(),
		getProjectForUpdate: vi.fn(),
		projectOpenInEditor: vi.fn(),
		saveProjectIfUnchanged: vi.fn(),
	} as unknown as import("../ai-edition/document-service").DocumentService;
	await serveMcpOverStdio({
		mcpToolDeps: {
			lessonLifecycle: foreign,
			transport: "stdio",
			editsAllowed: () => true,
			version: "0",
			host: {
				snapshot: async () => ({
					document: createEmptyDocument({ projectId: "unused", title: "Lifecycle fixture" }),
					revision: 0,
				}),
				apply: async () => "applied",
			},
			projects: documents,
		},
		documents,
		userDataDir: "/explicit-test-unused",
		readCursorTelemetry: async () => [],
		runners: { start: vi.fn() },
		openVideo: vi.fn(),
		onClose,
	});
	const own = (mock.deps as { lessonLifecycle: ReturnType<typeof createLessonFileLifecycle> })
		.lessonLifecycle;
	expect(own).not.toBe(foreign);
	let finish!: () => void;
	own.track(
		new Promise<void>((resolve) => {
			finish = resolve;
		}),
	);
	input.emit("end");
	input.emit("close");
	expect(own.signal.aborted).toBe(true);
	expect(foreign.signal.aborted).toBe(false);
	expect(onClose).not.toHaveBeenCalled();
	finish();
	await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
