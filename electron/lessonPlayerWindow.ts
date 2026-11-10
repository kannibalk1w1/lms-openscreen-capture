import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, type Session, session } from "electron";
import { LESSON_PLAYER_MEDIA_SCHEME } from "../src/lib/lesson/player";
import { type LessonPlayerOwners, lessonPlayerOwners } from "./ipc/lessonPlayer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

/** The player page, from the built renderer (or the dev server). Never package content. */
export function lessonPlayerPageURL() {
	return VITE_DEV_SERVER_URL
		? new URL("lesson-player.html", VITE_DEV_SERVER_URL).toString()
		: pathToFileURL(path.join(RENDERER_DIST, "lesson-player.html")).toString();
}
/** What the player session may load: its own page and assets, data images and its media scheme. */
export function playerRequestAllowed(url: string, page = lessonPlayerPageURL()) {
	if (url.startsWith("data:") || url.startsWith(`${LESSON_PLAYER_MEDIA_SCHEME}:`)) return true;
	if (url.startsWith("devtools:") && !app.isPackaged) return true;
	try {
		const target = new URL(url),
			own = new URL(page);
		if (own.protocol === "file:")
			return (
				target.protocol === "file:" &&
				target.pathname.startsWith(pathToFileURL(RENDERER_DIST + path.sep).pathname)
			);
		// Dev server: its own origin only (page, modules and the reload socket).
		return target.host === own.host && ["http:", "ws:"].includes(target.protocol);
	} catch {
		return false;
	}
}
/** No permissions, downloads or network: an in-memory session that only this window ever uses. */
function hardenPlayerSession(ses: Session) {
	ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
	ses.setPermissionCheckHandler(() => false);
	ses.on("will-download", (event) => event.preventDefault());
	ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) =>
		callback({ cancel: !playerRequestAllowed(details.url) }),
	);
}

/**
 * A dedicated read-only lesson player window. Each one gets its own unique, in-memory partition, so
 * its media capability is reachable from no other window, frame or session.
 */
export function createLessonPlayerWindow(owners: LessonPlayerOwners = lessonPlayerOwners) {
	const partition = `lesson-player-${randomUUID()}`;
	const ses = session.fromPartition(partition, { cache: false });
	hardenPlayerSession(ses);
	const win = new BrowserWindow({
		width: 1100,
		height: 820,
		minWidth: 640,
		minHeight: 480,
		title: "Lesson player",
		backgroundColor: "#0b0b0f",
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			partition,
			preload: path.join(__dirname, "lessonPlayerPreload.mjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
			webviewTag: false,
			navigateOnDragDrop: false,
			spellcheck: false,
		},
	});
	const contents = win.webContents;
	// Nothing opens, navigates, redirects or embeds from here.
	contents.setWindowOpenHandler(() => ({ action: "deny" }));
	contents.on("will-navigate", (event) => event.preventDefault());
	contents.on("will-redirect", (event) => event.preventDefault());
	contents.on("will-attach-webview", (event) => event.preventDefault());
	contents.on("will-frame-navigate", (event) => {
		if (!event.isMainFrame) event.preventDefault();
	});
	const page = lessonPlayerPageURL();
	const owner = owners.register(contents, page);
	ses.protocol.handle(LESSON_PLAYER_MEDIA_SCHEME, (request) => owner.serve(request));
	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});
	win.on("closed", () => {
		owner.release();
		if (ses.protocol.isProtocolHandled(LESSON_PLAYER_MEDIA_SCHEME))
			ses.protocol.unhandle(LESSON_PLAYER_MEDIA_SCHEME);
		void ses.clearStorageData().catch(() => undefined);
	});
	void win.loadURL(page);
	return win;
}
