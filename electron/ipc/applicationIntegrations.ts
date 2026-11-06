import { app, BrowserWindow, ipcMain } from "electron";
import type { TypingImportResult } from "../../src/lib/applicationIntegrations/schema";
import { AppSettingsStore } from "../app-settings";
import {
	ApplicationIntegrationService,
	TypingIntegrationDisabledError,
} from "../integrations/applicationIntegrationService";

export function registerApplicationIntegrationHandlers() {
	const service = new ApplicationIntegrationService(new AppSettingsStore(app.getPath("userData")));
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
