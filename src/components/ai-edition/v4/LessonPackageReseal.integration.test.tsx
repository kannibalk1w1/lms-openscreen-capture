// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { LessonPackageOpenApi } from "@/lib/lesson/packageOpen";
import { registerLessonWorkflow } from "../../../../electron/ipc/lessonWorkflow";
import { editorRangeSessions } from "../../../../electron/lesson/editorRangeSession";
import { validateRangeVideo } from "../../../../electron/lesson/encodedVideo";
import { createLessonPackage, inspectLessonPackage } from "../../../../electron/lesson/package";
import { fakePackageVideo, packageFixture } from "../../../../electron/lesson/package.test-support";
import { LessonPackagePanel } from "./LessonPackagePanel";

const host = vi.hoisted(() => ({ handle: vi.fn(), open: vi.fn(), getPath: vi.fn() }));
vi.mock("electron", () => ({
	ipcMain: { handle: host.handle, on: vi.fn() },
	app: { getPath: host.getPath },
	dialog: { showOpenDialog: host.open },
	BrowserWindow: { fromWebContents: () => null },
}));
vi.mock("../../../../electron/lesson/encodedVideo", () => ({ validateRangeVideo: vi.fn() }));
let root: string | undefined;
afterEach(async () => {
	cleanup();
	useProjectStore.getState().clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	if (root) await fs.rm(root, { recursive: true, force: true });
});
it("React edit -> actual registered IPC -> shared writer preserves JPEG/video offline and yields a checked new package", async () => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "reseal-ui-"));
	const f = await packageFixture(root),
		source = await createLessonPackage(
			{ ...f.request, includeCode: true, imagePolicy: "include-external-provenance" },
			{
				assertCurrent() {
					/* Explicit fixture. */
				},
			},
		);
	const before = await fs.readFile(path.join(source.path, "package-receipt.json"));
	await fs.rename(f.authoring, f.authoring + ".offline");
	host.getPath.mockReturnValue(root);
	host.handle.mockClear();
	host.open.mockResolvedValue({ canceled: false, filePaths: [source.path] });
	registerLessonWorkflow({
		documents: { getProject: vi.fn(), getSavedProject: vi.fn(), markOpenInEditor: vi.fn() },
		compositor: { renderFrames: vi.fn(), startExportMulti: vi.fn() },
		editorHasUnsavedChanges: () => useProjectStore.getState().dirty,
		readableApprovedPath: vi.fn(),
	});
	const routes = new Map(host.handle.mock.calls.map(([name, handler]) => [name, handler]));
	const owner = Object.assign(new EventEmitter(), {
		mainFrame: {},
		isDestroyed: () => false,
		getURL: () => "file:///editor",
	});
	editorRangeSessions.register(owner, owner.getURL());
	editorRangeSessions.select(owner, "p");
	const event = { sender: owner, senderFrame: owner.mainFrame };
	let output: string | undefined;
	const api: Required<LessonPackageOpenApi> = {
		lessonPackageOpen: (id) => routes.get("lesson:package-open")!(event, id),
		lessonPackageCopy: (input) => routes.get("lesson:package-copy")!(event, input),
		lessonPackageCancel: async (id) => routes.get("lesson:package-cancel")!(event, id),
		lessonPackageRelease: async (token) => routes.get("lesson:package-release")!(event, token),
		lessonPackageReseal: async (input) => {
			const result = await routes.get("lesson:package-reseal")!(event, input);
			if (result.success && result.result.status === "packaged") output = result.result.path;
			return result;
		},
	};
	vi.stubGlobal("electronAPI", api);
	const document = createEmptyDocument({ projectId: "p", title: "Current authored project" });
	useProjectStore.setState({ projectId: "p", document, dirty: false });
	render(
		<I18nProvider>
			<LessonPackagePanel />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByText("Open and check a package folder"));
	await screen.findByText("Selected step");
	fireEvent.click(screen.getByText("Edit supported text and order as a new draft"));
	fireEvent.change(screen.getByLabelText("Package step instructions"), {
		target: { value: "Corrected via actual UI route" },
	});
	host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	await screen.findByText(/New package checked and saved/);
	expect(output).toBeDefined();
	const verified = await inspectLessonPackage(
		{ directory: output! },
		{
			assertCurrent() {
				/* Chosen output. */
			},
		},
	);
	expect(verified.lesson.steps[0].instructions).toBe("Corrected via actual UI route");
	expect(verified.lesson.steps[0].status).toBe("draft");
	expect(verified.lesson.assets).toHaveLength(1);
	expect(verified.manifest.videos[0].stepId).toBe(f.step.id);
	expect(await fs.readFile(path.join(output!, verified.manifest.videos[0].path))).toEqual(
		await fs.readFile(path.join(source.path, verified.manifest.videos[0].path)),
	);
	expect(await fs.readFile(path.join(source.path, "package-receipt.json"))).toEqual(before);
	expect(useProjectStore.getState().document).toBe(document);
});
