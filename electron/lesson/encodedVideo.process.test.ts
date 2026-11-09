import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validateRangeVideo } from "./encodedVideo";

// Real child processes; only resolution is replaced, scoped to disposable tools.
const tool = vi.hoisted(() => ({ path: "" }));
vi.mock("../media/audioPeaks", () => ({ resolveFfmpeg: () => tool.path }));
const fixture = fileURLToPath(new URL("./__fixtures__/range-video.mp4", import.meta.url));
const expected = { width: 64, height: 32, fps: 30, frames: 2 };
let root: string, pidFile: string, marker: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "range-owned-process-"));
	pidFile = path.join(root, "owned-descendant.pid");
	marker = `range-owned-${randomUUID()}`;
});
afterEach(async () => {
	// Clean only a descendant created by this fixture. Verify its unique marker
	// before sending a signal; no process search, process-group or broad kill.
	try {
		const pid = Number(await fs.readFile(pidFile, "utf8"));
		if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Invalid owned pid");
		try {
			const cmd = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
			if (cmd) {
				expect(cmd).toContain(marker);
				process.kill(pid, "SIGKILL");
				await vi.waitFor(
					async () => {
						try {
							expect(await fs.readFile(`/proc/${pid}/cmdline`, "utf8")).toBe("");
						} catch (error) {
							if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
						}
					},
					{ timeout: 1000, interval: 10 },
				);
			}
		} catch (error) {
			if (
				(error as NodeJS.ErrnoException).code !== "ENOENT" &&
				(error as NodeJS.ErrnoException).code !== "ESRCH"
			)
				throw error;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	await fs.rm(root, { recursive: true, force: true });
});
async function wrapper(mode: string) {
	const source = `#!${process.execPath}
const fs = require("node:fs"), {spawn} = require("node:child_process");
const mode = ${JSON.stringify(mode)}, version = process.argv.includes("-version");
const stage = mode.startsWith("decode-") ? "decode" : "version";
const action = mode.replace(/^(?:decode|version)-/, "");
function out(text, code=0) { process.stdout.write(text, () => process.exit(code)); }
if (version && stage === "decode") out("ffmpeg version fixture-1 Copyright\\n");
else if (mode === "success") {
 if (version) out("ffmpeg version fixture-1 Copyright\\n");
 else out("#tb 0: 1/30\\n#dimensions 0: 64x32\\n0, 0, 0, 1, 3072, ${"a".repeat(32)}\\n0, 1, 1, 1, 3072, ${"b".repeat(32)}\\n");
} else {
 const child = spawn(process.execPath, ["-e", "setTimeout(()=>{},8000)", "--", ${JSON.stringify(marker)}], {stdio:["ignore", 1, 2]});
 fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
 if (action === "orphan") out("ffmpeg version fixture-1 Copyright\\n");
 else if (action === "slow") setTimeout(()=>process.exit(0), 8000);
 else if (action === "stdout") out("x".repeat(version ? 20000 : 1100000));
 else if (action === "stderr") process.stderr.write("x".repeat(72000), ()=>process.exit(0));
 else process.exit(3);
}
`;
	tool.path = path.join(root, "wrapper");
	await fs.writeFile(tool.path, source, { mode: 0o700 });
}
it.skipIf(process.platform !== "linux").each([
	["version-orphan", 4500],
	["version-slow", 4500],
	["version-stdout", 2000],
	["version-stderr", 2000],
	["version-exit", 2000],
	["decode-stdout", 2000],
	["decode-exit", 2000],
])(
	"real %s wrapper settles within %sms despite descendant-held stdout/stderr",
	async (mode, budget) => {
		await wrapper(String(mode));
		const started = performance.now();
		await expect(validateRangeVideo(fixture, expected)).rejects.toThrow(
			String(mode).startsWith("version-")
				? /^range-video-tool-unavailable$/
				: /^range-video-validation-failed$/,
		);
		expect(performance.now() - started).toBeLessThan(Number(budget));
		// The descendant really exists and still owns the inherited pipes until this
		// test's marked-PID cleanup. Production releases only its own read ends.
		const pid = Number(await fs.readFile(pidFile, "utf8"));
		expect(await fs.readFile(`/proc/${pid}/cmdline`, "utf8")).toContain(marker);
	},
);
it.skipIf(process.platform !== "linux")(
	"a real symlinked same-user wrapper succeeds with canonical identity and complete output",
	async () => {
		await wrapper("success");
		const canonical = tool.path;
		const link = path.join(root, "linked-tool");
		await fs.symlink(canonical, link);
		tool.path = link;
		const result = await validateRangeVideo(fixture, expected);
		expect(result.decoded.frames).toBe(2);
		expect(result.decoded.decoder.sha256).toBe(
			createHash("sha256")
				.update(await fs.readFile(canonical))
				.digest("hex"),
		);
		expect(result.decoded.decoder.version).toBe("fixture-1");
		expect(JSON.stringify(result)).not.toContain(root);
	},
);
