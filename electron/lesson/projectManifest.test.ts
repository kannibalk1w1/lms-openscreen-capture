import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsPromises } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkProjectDriftFile,
	createProjectManifestFile,
	ProjectManifestError,
} from "./projectManifest";

let tmp: string, project: string, out: string;
beforeEach(async () => {
	tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-manifest-")));
	project = path.join(tmp, "Disposable Project");
	out = path.join(tmp, "manifests");
	await fs.mkdir(path.join(project, "scenes", "levels"), { recursive: true });
	await fs.mkdir(path.join(project, ".godot", "imported"), { recursive: true });
	await fs.mkdir(out);
	await fs.writeFile(path.join(project, "project.godot"), "config_version=5\n");
	await fs.writeFile(path.join(project, "scenes", "enemy.tscn"), "[gd_scene format=3]\n");
	await fs.writeFile(path.join(project, "scenes", "levels", "one.tscn"), "LEVEL\n");
	await fs.writeFile(path.join(project, "player.gd"), "# PRIVATE_SCRIPT_CONTENT_CANARY\n");
	await fs.writeFile(path.join(project, ".godot", "imported", "cache.bin"), "CACHE");
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(tmp, { recursive: true, force: true });
});

const create = (name = "m.json", extra: Record<string, unknown> = {}) =>
	createProjectManifestFile({ rootPath: project, outputPath: path.join(out, name), ...extra });
const read = async (name = "m.json") => JSON.parse(await fs.readFile(path.join(out, name), "utf8"));
const drift = async (name = "m.json") => {
	const bytes = await fs.readFile(path.join(out, name));
	return checkProjectDriftFile({
		rootPath: project,
		manifestPath: path.join(out, name),
		manifestSha256: createHash("sha256").update(bytes).digest("hex"),
	});
};
const code = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error instanceof ProjectManifestError ? error.code : `other:${String(error)}`;
	}
	return "ok";
};

describe("createProjectManifestFile", () => {
	it("records sorted relative paths, sizes and hashes only, excluding root tool folders", async () => {
		const receipt = await create();
		const manifest = await read();
		expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
			"player.gd",
			"project.godot",
			"scenes/enemy.tscn",
			"scenes/levels/one.tscn",
		]);
		expect(manifest.files[0]).toEqual({
			path: "player.gd",
			size: 32,
			sha256: createHash("sha256").update("# PRIVATE_SCRIPT_CONTENT_CANARY\n").digest("hex"),
		});
		expect(manifest.unobserved).toEqual([{ path: ".godot", reason: "excluded-directory" }]);
		expect(manifest).toMatchObject({
			scope: "explicit-folder",
			rootName: "Disposable Project",
			coverage: "complete",
		});
		const text = await fs.readFile(path.join(out, "m.json"), "utf8");
		expect(text).not.toContain("PRIVATE_SCRIPT_CONTENT_CANARY");
		expect(text).not.toContain(tmp);
		expect(receipt).toMatchObject({ coverage: "complete", counts: { files: 4, unobserved: 1 } });
		expect(receipt.sha256).toBe(createHash("sha256").update(text).digest("hex"));
		expect((await fs.stat(path.join(out, "m.json"))).mode & 0o777).toBe(0o600);
	});

	it("is deterministic and never writes into the project", async () => {
		const before = execFileSync("find", [project, "-printf", "%P %s %T@\\n"], { encoding: "utf8" });
		const a = await create("a.json");
		const b = await create("b.json");
		expect(a.sha256).toBe(b.sha256);
		expect(execFileSync("find", [project, "-printf", "%P %s %T@\\n"], { encoding: "utf8" })).toBe(
			before,
		);
	});

	it("lists links and special files as unobserved without following them", async () => {
		const outside = path.join(tmp, "outside");
		await fs.mkdir(outside);
		await fs.writeFile(path.join(outside, "secret.txt"), "OUTSIDE_CANARY");
		await fs.symlink(outside, path.join(project, "linked-dir"));
		await fs.symlink(path.join(outside, "secret.txt"), path.join(project, "linked-file.txt"));
		if (process.platform === "linux") execFileSync("mkfifo", [path.join(project, "pipe")]);
		await create();
		const manifest = await read();
		expect(manifest.unobserved).toEqual(
			expect.arrayContaining([
				{ path: "linked-dir", reason: "symbolic-link" },
				{ path: "linked-file.txt", reason: "symbolic-link" },
				...(process.platform === "linux" ? [{ path: "pipe", reason: "special-file" }] : []),
			]),
		);
		expect(JSON.stringify(manifest)).not.toContain("secret.txt");
	});

	it("lists a file that changes while it is hashed as unstable, not as a recorded hash", async () => {
		const original = fsPromises.lstat.bind(fsPromises);
		let calls = 0;
		vi.spyOn(fsPromises, "lstat").mockImplementation((async (target: string) => {
			const stats = await original(target);
			if (String(target).endsWith("player.gd") && ++calls === 2)
				Object.defineProperty(stats, "mtimeMs", { value: stats.mtimeMs + 1 });
			return stats;
		}) as typeof fsPromises.lstat);
		await create();
		const manifest = await read();
		expect(manifest.unobserved).toContainEqual({ path: "player.gd", reason: "unstable" });
		expect(manifest.files.map((file: { path: string }) => file.path)).not.toContain("player.gd");
	});

	it("stops at file, byte and depth limits with limited coverage", async () => {
		await create("files.json", { maxFiles: 2 });
		expect(await read("files.json")).toMatchObject({
			coverage: "limited",
			limitReason: "file-limit",
			counts: { files: 2 },
		});
		await create("bytes.json", { maxBytes: 40 });
		expect(await read("bytes.json")).toMatchObject({
			coverage: "limited",
			limitReason: "byte-limit",
		});
		let deep = project;
		for (let i = 0; i < 33; i++) deep = path.join(deep, `d${i}`);
		await fs.mkdir(deep, { recursive: true });
		await fs.writeFile(path.join(deep, "deep.txt"), "x");
		await create("deep.json");
		const manifest = await read("deep.json");
		expect(manifest.coverage).toBe("limited");
		expect(
			manifest.unobserved.some((entry: { reason: string }) => entry.reason === "depth-limit"),
		).toBe(true);
	});

	it("refuses unsafe roots and outputs", async () => {
		await fs.symlink(project, path.join(tmp, "project-link"));
		await fs.symlink(tmp, path.join(tmp, "parent-link"));
		await fs.symlink(out, path.join(tmp, "out-link"));
		const cases: Array<[Record<string, unknown>, string]> = [
			[
				{
					rootPath: path.join(tmp, "parent-link", "Disposable Project"),
					outputPath: path.join(out, "x.json"),
				},
				"project-folder-unavailable",
			],
			[
				{ rootPath: path.join(tmp, "project-link"), outputPath: path.join(out, "x.json") },
				"project-folder-unavailable",
			],
			[
				{ rootPath: path.join(project, "player.gd"), outputPath: path.join(out, "x.json") },
				"project-folder-unavailable",
			],
			[
				{ rootPath: path.join(tmp, "missing"), outputPath: path.join(out, "x.json") },
				"project-folder-unavailable",
			],
			[{ rootPath: project, outputPath: path.join(project, "m.json") }, "manifest-output-invalid"],
			[
				{ rootPath: project, outputPath: path.join(project, "scenes", "m.json") },
				"manifest-output-invalid",
			],
			[
				{ rootPath: project, outputPath: path.join(tmp, "out-link", "m.json") },
				"manifest-output-invalid",
			],
			[
				{ rootPath: project, outputPath: path.join(tmp, "nowhere", "m.json") },
				"manifest-output-invalid",
			],
			[{ rootPath: "relative", outputPath: path.join(out, "x.json") }, "invalid-request"],
			[{ rootPath: project, outputPath: path.join(out, "x.json"), maxFiles: 0 }, "invalid-request"],
			[{ rootPath: project, outputPath: path.join(out, "x.json"), extra: 1 }, "invalid-request"],
		];
		for (const [request, expected] of cases)
			expect(await code(createProjectManifestFile(request))).toBe(expected);
		await create();
		expect(await code(create())).toBe("manifest-output-exists");
		expect(await fs.readdir(project)).not.toContain("m.json");
	});

	it("stops before scanning when the caller is no longer current", async () => {
		expect(
			await code(
				createProjectManifestFile(
					{ rootPath: project, outputPath: path.join(out, "x.json") },
					() => {
						throw new ProjectManifestError("invalid-request");
					},
				),
			),
		).toBe("invalid-request");
		expect(await fs.readdir(out)).toEqual([]);
	});
});

describe("checkProjectDriftFile", () => {
	it("reports partial no-drift when excluded paths exist, and changed/missing/added drift", async () => {
		await create();
		expect(await drift()).toMatchObject({
			outcome: "partial-no-drift-observed",
			unknowns: ["unobserved-paths"],
			counts: { unchanged: 4, changed: 0, missing: 0, added: 0 },
			rootNameMatches: true,
		});
		await fs.writeFile(path.join(project, "player.gd"), "# PRIVATE_SCRIPT_CONTENT_CANARZ\n");
		await fs.rm(path.join(project, "scenes", "levels", "one.tscn"));
		await fs.writeFile(path.join(project, "new.gd"), "extends Node\n");
		const result = await drift();
		expect(result.outcome).toBe("drift-observed");
		expect(result.changed.rows).toEqual([{ path: "player.gd", fields: ["sha256"] }]);
		expect(result.missing.rows).toEqual(["scenes/levels/one.tscn"]);
		expect(result.added.rows).toEqual(["new.gd"]);
		expect(JSON.stringify(result)).not.toContain("CANAR");
	});

	it("reports no drift only when nothing was unobserved on either side", async () => {
		await fs.rm(path.join(project, ".godot"), { recursive: true });
		await create();
		expect((await drift()).outcome).toBe("no-drift-observed");
	});

	it("treats a file replaced by a link as unobserved, not missing", async () => {
		await create();
		await fs.rm(path.join(project, "player.gd"));
		await fs.symlink(path.join(project, "project.godot"), path.join(project, "player.gd"));
		const result = await drift();
		expect(result.nowUnobserved.rows).toEqual([{ path: "player.gd", reason: "symbolic-link" }]);
		expect(result.counts.missing).toBe(0);
	});

	it("reports paths beyond a limited scan as not reached, not added or missing", async () => {
		await create("limited.json", { maxFiles: 2 });
		// Sorts first: the new scan reaches it and no longer reaches project.godot.
		await fs.writeFile(path.join(project, "aaa.gd"), "extends Node\n");
		const result = await drift("limited.json");
		expect(result.notReached.rows).toEqual(["aaa.gd", "project.godot"]);
		expect(result.counts).toMatchObject({ added: 0, missing: 0 });
		expect(result.counts.notReached).toBeGreaterThan(0);
		expect(result.unknowns).toEqual(
			expect.arrayContaining(["manifest-coverage-limited", "current-coverage-limited"]),
		);
		expect(result.outcome).toBe("partial-no-drift-observed");
	});

	it("binds the manifest to its hash and validates it", async () => {
		await create();
		const manifestPath = path.join(out, "m.json");
		expect(
			await code(
				checkProjectDriftFile({ rootPath: project, manifestPath, manifestSha256: "0".repeat(64) }),
			),
		).toBe("manifest-changed");
		const tampered = (await fs.readFile(manifestPath, "utf8")).replace('"size": 32', '"size": 33');
		await fs.writeFile(path.join(out, "t.json"), tampered);
		const sha = createHash("sha256").update(tampered).digest("hex");
		expect(
			await code(
				checkProjectDriftFile({
					rootPath: project,
					manifestPath: path.join(out, "t.json"),
					manifestSha256: sha,
				}),
			),
		).toBe("manifest-invalid");
		expect(
			await code(
				checkProjectDriftFile({
					rootPath: project,
					manifestPath: path.join(out, "missing.json"),
					manifestSha256: sha,
				}),
			),
		).toBe("manifest-unavailable");
		const claimed = (await fs.readFile(manifestPath, "utf8")).replace(
			'"coverage": "complete",',
			'"coverage": "complete",\n  "limitReason": "file-limit",',
		);
		await fs.writeFile(path.join(out, "c.json"), claimed);
		expect(
			await code(
				checkProjectDriftFile({
					rootPath: project,
					manifestPath: path.join(out, "c.json"),
					manifestSha256: createHash("sha256").update(claimed).digest("hex"),
				}),
			),
		).toBe("manifest-invalid");
	});

	it("flags a different root name without failing", async () => {
		await create();
		const renamed = path.join(tmp, "Renamed");
		await fs.rename(project, renamed);
		project = renamed;
		expect((await drift()).rootNameMatches).toBe(false);
	});
});
