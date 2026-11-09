import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ffmpegCandidates, resolveFfmpeg } from "./audioPeaks";

const mock = vi.hoisted(() => ({ appPath: "" }));
vi.mock("electron", () => ({ app: { getAppPath: () => mock.appPath } }));
const hostPlatform = process.platform;
let root: string;
beforeEach(() => {
	root = mkdtempSync(path.join(os.tmpdir(), "ffmpeg resolution with spaces "));
	vi.spyOn(process, "platform", "get").mockReturnValue("linux");
	vi.spyOn(process, "arch", "get").mockReturnValue("x64");
	mock.appPath = path.join(root, "app", "dist-electron");
	vi.stubEnv("OPENSCREEN_FFMPEG_PATH", "");
	vi.stubEnv("APP_ROOT", "");
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	rmSync(root, { recursive: true, force: true });
});
function stage(base: string) {
	const file = path.join(base, "electron/native/bin/linux-x64/ffmpeg");
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
	return file;
}
it("production default finds the module's app root before arbitrary cwd without an override", () => {
	const directory = path.resolve(__dirname, "../.."),
		candidate = path.join(directory, "electron/native/bin/linux-x64/ffmpeg"),
		cwd = path.join(root, "foreign client");
	const get = vi.spyOn(process, "cwd").mockReturnValue(cwd);
	const candidates = ffmpegCandidates();
	get.mockRestore();
	expect(candidates).toContain(candidate);
	expect(candidates.indexOf(candidate)).toBeLessThan(
		candidates.indexOf(path.join(cwd, "electron/native/bin/linux-x64/ffmpeg")),
	);
	expect(candidates[0]).not.toBe("ffmpeg");
});
it("stable explicit APP_ROOT resolves with spaces and is preferred over the launch-directory fallback", () => {
	const file = stage(path.join(root, "actual app"));
	vi.stubEnv("APP_ROOT", path.join(root, "actual app"));
	expect(resolveFfmpeg()).toBe(file);
});
it("packaged resources remain ahead of app-root/cwd fallback without using PATH", () => {
	const resources = path.join(root, "installed resources"),
		file = stage(resources);
	const descriptor = Object.getOwnPropertyDescriptor(process, "resourcesPath");
	Object.defineProperty(process, "resourcesPath", { configurable: true, value: resources });
	try {
		expect(ffmpegCandidates()[1]).toBe(file);
		expect(resolveFfmpeg(path.join(root, "foreign"))).toBe(file);
	} finally {
		if (descriptor) Object.defineProperty(process, "resourcesPath", descriptor);
		else Reflect.deleteProperty(process, "resourcesPath");
	}
});
it("keeps explicit executable override first, skips missing/directory/non-executable overrides, and isolated missing-tool resolution returns null", () => {
	const base = path.join(root, "chosen"),
		file = stage(base),
		override = path.join(root, "configured ffmpeg");
	writeFileSync(override, "tool", { mode: 0o700 });
	vi.stubEnv("OPENSCREEN_FFMPEG_PATH", override);
	expect(resolveFfmpeg(base)).toBe(override);
	vi.stubEnv("OPENSCREEN_FFMPEG_PATH", root);
	expect(resolveFfmpeg(base)).toBe(file);
	vi.stubEnv("OPENSCREEN_FFMPEG_PATH", path.join(root, "missing"));
	expect(resolveFfmpeg(base)).toBe(file);
	if (hostPlatform === "win32")
		unlinkSync(file); // Windows does not enforce POSIX execute bits.
	else chmodSync(file, 0o600);
	expect(resolveFfmpeg(base)).toBeNull();
});
