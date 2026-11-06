import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { TypingImportResult } from "../../src/lib/applicationIntegrations/schema";
import { AppSettingsStore } from "../app-settings";
import {
	ApplicationIntegrationService,
	TypingIntegrationDisabledError,
} from "../integrations/applicationIntegrationService";
import { RecordingClockBridge } from "../integrations/recordingClockBridge";

export function registerApplicationIntegrationHandlers(options?: {
	queryClock: (
		expectedClockId?: string,
	) => Promise<import("../../src/lib/clockBridge/schema").NativeClockSnapshot>;
	clockAvailable: () => boolean;
	verifyClockHelper?: () => Promise<void>;
}) {
	const bridge = new RecordingClockBridge(
		options?.queryClock ?? (() => Promise.reject(new Error("Native clock unavailable"))),
		options?.clockAvailable ?? (() => false),
	);
	const service = new ApplicationIntegrationService(
		new AppSettingsStore(app.getPath("userData")),
		bridge.provider,
	);
	bridge.attachHost(service.host);
	let pairingEpoch = 0;
	let pairing = false;
	app.on?.("before-quit", () => {
		pairingEpoch++;
		void bridge.stop();
	});
	ipcMain.handle("recording-clock:get", () => bridge.snapshot());
	ipcMain.handle("recording-clock:stop", () => {
		pairingEpoch++;
		return bridge.stop();
	});
	ipcMain.handle("recording-clock:pair", async () => {
		if (pairing) return { success: false, code: "pairing-failed", status: bridge.snapshot() };
		pairing = true;
		const epoch = ++pairingEpoch;
		const cancelled = () => ({ success: false, code: "cancelled", status: bridge.snapshot() });
		try {
			if (!bridge.snapshot().available)
				return { success: false, code: "unavailable", status: bridge.snapshot() };
			try {
				await options?.verifyClockHelper?.();
			} catch {
				return { success: false, code: "clock-helper-unavailable", status: bridge.snapshot() };
			}
			if (epoch !== pairingEpoch) return cancelled();
			const project = await dialog.showOpenDialog({
				title: "Choose the Godot project for a read-only clock link",
				properties: ["openFile"],
				filters: [{ name: "Godot project", extensions: ["godot"] }],
			});
			if (epoch !== pairingEpoch || project.canceled || !project.filePaths[0])
				return { success: false, code: "cancelled", status: bridge.snapshot() };
			if (path.basename(project.filePaths[0]) !== "project.godot")
				return { success: false, code: "invalid-project", status: bridge.snapshot() };
			const target = await dialog.showSaveDialog({
				title: "Save private recording clock link",
				defaultPath: path.join(app.getPath("userData"), `recording-clock-${Date.now()}.json`),
				filters: [{ name: "OpenScreen clock link", extensions: ["json"] }],
			});
			if (epoch !== pairingEpoch || target.canceled || !target.filePath)
				return { success: false, code: "cancelled", status: bridge.snapshot() };
			return {
				success: true,
				status: await bridge.createPair(path.dirname(project.filePaths[0]), target.filePath),
			};
		} catch {
			return { success: false, code: "pairing-failed", status: bridge.snapshot() };
		} finally {
			pairing = false;
		}
	});
	ipcMain.handle("application-integrations:get", () => service.snapshot());
	ipcMain.handle("application-integrations:set", (_, settings: unknown) => {
		const result = service.setSettings(settings);
		for (const window of BrowserWindow.getAllWindows())
			if (!window.isDestroyed())
				window.webContents.send("application-integrations:changed", service.snapshot());
		return result;
	});
	ipcMain.handle(
		"application-integrations:import-typing",
		async (_, source: unknown): Promise<TypingImportResult> => {
			try {
				return { success: true, files: await service.importTypingSource(source) };
			} catch (error) {
				return {
					success: false,
					code:
						error instanceof TypingIntegrationDisabledError
							? "integration-disabled"
							: "invalid-typing-source",
				};
			} finally {
				for (const window of BrowserWindow.getAllWindows())
					if (!window.isDestroyed())
						window.webContents.send("application-integrations:changed", service.snapshot());
			}
		},
	);
	return service;
}
