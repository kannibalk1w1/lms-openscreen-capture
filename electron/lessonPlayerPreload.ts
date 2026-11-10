import { contextBridge, ipcRenderer } from "electron";

// The player window's whole bridge: open a package through main's native picker, cancel that, or
// close the open package. No paths, files or other app routes are reachable from this window.
contextBridge.exposeInMainWorld("lessonPlayer", {
	open: () => ipcRenderer.invoke("lesson-player:open"),
	cancel: () => ipcRenderer.invoke("lesson-player:cancel"),
	close: () => ipcRenderer.invoke("lesson-player:close"),
});
