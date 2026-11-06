import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { registerApplicationIntegrationHandlers } from "./applicationIntegrations";

const electron = vi.hoisted(() => ({ getPath: vi.fn(), handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock("electron", () => ({
	app: { getPath: electron.getPath },
	ipcMain: { handle: electron.handle },
	BrowserWindow: { getAllWindows: electron.getAllWindows },
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
			statuses: [expect.objectContaining({ state: "available-offline" })],
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
