// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { RangeVideoToolUnavailableError } from "../../../../electron/lesson/rangeErrors";
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
it.each([
	"success",
	"destination",
	"tool",
	"cancel",
	"source",
	"dirty",
])("React edit and actual production recovery preserve every draft field across %s", async (kind) => {
	vi.stubGlobal("crypto", webcrypto);
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	root = await fs.mkdtemp(path.join(os.tmpdir(), "reseal-ui-"));
	const f = await packageFixture(root),
		source = await createLessonPackage(
			{
				...f.request,
				stepIds: f.lesson.steps.map((s) => s.id),
				includeCode: true,
				imagePolicy: "include-external-provenance",
			},
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
	const submissions: unknown[] = [],
		results: Array<{ success: boolean; capability?: string }> = [];
	const api: Required<LessonPackageOpenApi> = {
		lessonPackageOpen: (id) => routes.get("lesson:package-open")!(event, id),
		lessonPackageCopy: (input) => routes.get("lesson:package-copy")!(event, input),
		lessonPackageCancel: async (id) => routes.get("lesson:package-cancel")!(event, id),
		lessonPackageRelease: async (token) => routes.get("lesson:package-release")!(event, token),
		lessonPackageReseal: async (input) => {
			submissions.push(JSON.parse(JSON.stringify(input.lesson)));
			const result = await routes.get("lesson:package-reseal")!(event, input);
			results.push(result);
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
	fireEvent.change(screen.getAllByLabelText("Package step instructions")[0], {
		target: { value: "Corrected via actual UI route" },
	});
	fireEvent.change(screen.getAllByLabelText("Included code text")[0], {
		target: { value: "preserved_code();" },
	});
	fireEvent.change(screen.getByLabelText("Included image description"), {
		target: { value: "Preserved alt description" },
	});
	fireEvent.click(screen.getAllByText("Move package step up")[1]);
	const originalGuide = await fs.readFile(path.join(source.path, "index.html"));
	let settlePicker!: (value: unknown) => void, settleDecode!: () => void, started!: () => void;
	const decoding = new Promise<void>((resolve) => {
		started = resolve;
	});
	if (kind === "destination")
		host.open.mockResolvedValueOnce({ canceled: false, filePaths: [source.path] });
	else if (kind === "dirty")
		host.open.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settlePicker = resolve;
				}),
		);
	else host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
	if (kind === "tool")
		vi.mocked(validateRangeVideo).mockRejectedValueOnce(new RangeVideoToolUnavailableError());
	if (kind === "source") await fs.appendFile(path.join(source.path, "index.html"), "tampered");
	if (kind === "cancel")
		vi.mocked(validateRangeVideo).mockImplementation(async (file, expected) => {
			if (!file.startsWith(source.path + path.sep)) {
				started();
				await new Promise<void>((resolve) => {
					settleDecode = resolve;
				});
			}
			return fakePackageVideo(file, expected);
		});
	fireEvent.click(screen.getByText("Save a new package with retained media"));
	if (kind === "cancel") {
		await decoding;
		fireEvent.click(screen.getByText("Cancel package operation"));
		expect(screen.queryAllByLabelText("Package step instructions")).toHaveLength(2);
		expect(
			(
				screen
					.getByLabelText("Included image description")
					.closest("fieldset") as HTMLFieldSetElement
			).disabled,
		).toBe(true);
		settleDecode();
	}
	if (kind === "dirty") {
		await waitFor(() => expect(settlePicker).toBeDefined());
		act(() => useProjectStore.setState({ dirty: true }));
		settlePicker({ canceled: false, filePaths: [root] });
	}
	if (kind !== "success") {
		await waitFor(() => expect(results).toHaveLength(1));
		expect(screen.queryAllByLabelText("Package step instructions")).toHaveLength(2);
		await waitFor(() =>
			expect(
				(
					screen
						.getByLabelText("Included image description")
						.closest("fieldset") as HTMLFieldSetElement
				).disabled,
			).toBe(false),
		);
		expect(output).toBeUndefined();
		expect(
			(screen.getAllByLabelText("Package step instructions")[1] as HTMLTextAreaElement).value,
		).toBe("Corrected via actual UI route");
		expect((screen.getAllByLabelText("Included code text")[1] as HTMLTextAreaElement).value).toBe(
			"preserved_code();",
		);
		expect((screen.getByLabelText("Included image description") as HTMLTextAreaElement).value).toBe(
			"Preserved alt description",
		);
		vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
		if (kind === "source" || kind === "dirty") {
			if (kind === "source")
				await fs.writeFile(path.join(source.path, "index.html"), originalGuide);
			if (kind === "dirty") act(() => useProjectStore.setState({ dirty: false }));
			expect(
				(screen.getByText("Save a new package with retained media") as HTMLButtonElement).disabled,
			).toBe(true);
			host.open.mockResolvedValue({ canceled: false, filePaths: [source.path] });
			fireEvent.click(screen.getByText("Reopen the same package and keep edits"));
			await screen.findByText(/The same package inventory was checked/);
		} else expect(results[0].capability).toBe("retained");
		host.open.mockResolvedValue({ canceled: false, filePaths: [root] });
		fireEvent.click(screen.getByText("Save a new package with retained media"));
	}
	await screen.findByText(/New package checked and saved/);
	if (kind !== "success") expect(submissions[1]).toEqual(submissions[0]);

	expect(output).toBeDefined();
	const verified = await inspectLessonPackage(
		{ directory: output! },
		{
			assertCurrent() {
				/* Chosen output. */
			},
		},
	);
	expect(verified.lesson.steps[1].instructions).toBe("Corrected via actual UI route");
	expect(verified.lesson.steps[1].code?.text).toBe("preserved_code();");
	expect(verified.lesson.steps[1].imageAlt).toBe("Preserved alt description");
	expect(verified.lesson.steps.map((s) => s.id)).toEqual(
		[...f.lesson.steps.map((s) => s.id)].reverse(),
	);
	expect(verified.lesson.steps[0].status).toBe("draft");
	expect(verified.lesson.assets).toHaveLength(1);
	expect(verified.manifest.videos[0].stepId).toBe(f.step.id);
	expect(await fs.readFile(path.join(output!, verified.manifest.videos[0].path))).toEqual(
		await fs.readFile(path.join(source.path, verified.manifest.videos[0].path)),
	);
	expect(await fs.readFile(path.join(source.path, "package-receipt.json"))).toEqual(before);
	expect(useProjectStore.getState().document).toBe(document);
});
