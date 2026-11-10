import { contextBridge, ipcRenderer } from "electron";

// The player window's whole bridge: open a package through main's native picker, cancel that, close
// the open package, and the learner's explicit saved-place actions. No paths, files or other app
// routes are reachable from this window.
contextBridge.exposeInMainWorld("lessonPlayer", {
	open: () => ipcRenderer.invoke("lesson-player:open"),
	cancel: () => ipcRenderer.invoke("lesson-player:cancel"),
	close: () => ipcRenderer.invoke("lesson-player:close"),
	// Saved places: explicit learner actions only. Main adds the package fingerprint itself.
	savePlace: (token: string, place: unknown) =>
		ipcRenderer.invoke("lesson-player:place-save", token, place),
	restorePlace: (token: string) => ipcRenderer.invoke("lesson-player:place-restore", token),
	clearPlace: (token: string) => ipcRenderer.invoke("lesson-player:place-clear", token),
	clearAllPlaces: () => ipcRenderer.invoke("lesson-player:place-clear-all"),
});
