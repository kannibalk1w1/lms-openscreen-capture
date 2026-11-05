import { app, BrowserWindow, ipcMain } from "electron";
import { AppSettingsStore } from "../app-settings";
import { ApplicationIntegrationService } from "../integrations/applicationIntegrationService";

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
	ipcMain.handle("application-integrations:import-typing", async (_, source: unknown) => {
		try {
			return await service.importTypingSource(source);
		} finally {
			for (const window of BrowserWindow.getAllWindows())
				if (!window.isDestroyed())
					window.webContents.send("application-integrations:changed", service.snapshot());
		}
	});
	return service;
}
