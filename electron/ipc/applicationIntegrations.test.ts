import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { registerApplicationIntegrationHandlers } from "./applicationIntegrations";

const electron = vi.hoisted(() => ({
	getPath: vi.fn(),
	handle: vi.fn(),
	getAllWindows: vi.fn(),
	open: vi.fn(),
	save: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	ipcMain: { handle: electron.handle },
	BrowserWindow: { getAllWindows: electron.getAllWindows },
	dialog: { showOpenDialog: electron.open, showSaveDialog: electron.save },
}));
let root: string;
afterEach(async () => {
	if (root) await fs.rm(root, { recursive: true, force: true });
});
it("actual IPC callbacks persist configuration and broadcast failures without starting a recorder", async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "integration-ipc-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	const send = vi.fn();
	electron.getAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send } }]);
	registerApplicationIntegrationHandlers();
	const get = electron.handle.mock.calls.find(
		([channel]) => channel === "application-integrations:get",
	)![1];
	const set = electron.handle.mock.calls.find(
		([channel]) => channel === "application-integrations:set",
	)![1];
	const load = electron.handle.mock.calls.find(
		([channel]) => channel === "application-integrations:import-typing",
	)![1];
	expect(get().statuses[0].state).toBe("disabled");
	expect(set(null, { version: 1, enabledAdapterIds: ["godot-codeedit"] }).success).toBe(true);
	expect(send).toHaveBeenCalledWith(
		"application-integrations:changed",
		expect.objectContaining({
			statuses: expect.arrayContaining([expect.objectContaining({ state: "available-offline" })]),
		}),
	);
	await expect(load(null, "PRIVATE_INVALID_CANARY\ninvalid")).resolves.toEqual({
		success: false,
		code: "invalid-typing-source",
	});
	expect(JSON.stringify(send.mock.calls)).not.toContain("PRIVATE_INVALID_CANARY");
	expect(get().statuses[0].state).toBe("error");
	expect(set(null, { version: 1, enabledAdapterIds: ["godot-codeedit"] }).success).toBe(true);
	expect(get().statuses[0].state).toBe("available-offline");
	expect(set(null, { version: 1, enabledAdapterIds: [] }).success).toBe(true);
	expect(get().statuses[0].state).toBe("disabled");
});

it("actual clock IPC uses separate project/save actions and remains active when file decoding is off", async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "clock-ipc-"));
	const project = path.join(root, "godot");
	await fs.mkdir(project);
	await fs.writeFile(path.join(project, "project.godot"), "config_version=5\n");
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	electron.getAllWindows.mockReturnValue([]);
	electron.open.mockResolvedValue({
		canceled: false,
		filePaths: [path.join(project, "project.godot")],
	});
	electron.save.mockResolvedValue({
		canceled: false,
		filePath: path.join(root, "private-clock.json"),
	});
	const verify = vi.fn(async () => undefined);
	registerApplicationIntegrationHandlers({
		clockAvailable: () => true,
		verifyClockHelper: verify,
		queryClock: async () => {
			throw new Error("fixture has no native recording");
		},
	});
	const callback = (channel: string) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1];
	try {
		const paired = await callback("recording-clock:pair")();
		expect(paired.success).toBe(true);
		expect(verify).toHaveBeenCalledTimes(1);
		expect(callback("recording-clock:get")().state).toBe("paired");
		callback("application-integrations:set")(null, { version: 1, enabledAdapterIds: [] });
		expect(callback("recording-clock:get")().state).toBe("paired");
		expect(
			callback("application-integrations:get")().statuses.find(
				(status: { descriptor: { id: string } }) => status.descriptor.id === "godot-codeedit",
			).enabled,
		).toBe(false);
	} finally {
		await callback("recording-clock:stop")();
	}
	expect(await fs.stat(path.join(root, "private-clock.json"))).toBeTruthy();
});

it("Stop invalidates a pending helper probe before any late project dialog or listener", async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "clock-ipc-revoke-"));
	electron.getPath.mockReturnValue(root);
	electron.handle.mockClear();
	electron.open.mockClear();
	let finish: () => void = () => undefined;
	const verify = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	registerApplicationIntegrationHandlers({
		clockAvailable: () => true,
		verifyClockHelper: verify,
		queryClock: async () => {
			throw new Error("no recording");
		},
	});
	const callback = (channel: string) =>
		electron.handle.mock.calls.find(([name]) => name === channel)![1];
	const pending = callback("recording-clock:pair")();
	expect(verify).toHaveBeenCalledTimes(1);
	expect((await callback("recording-clock:pair")()).success).toBe(false);
	await callback("recording-clock:stop")();
	finish();
	expect(await pending).toMatchObject({ success: false, code: "cancelled" });
	expect(electron.open).not.toHaveBeenCalled();
	expect(callback("recording-clock:get")().state).toBe("disabled");
});
