#!/usr/bin/env node
// Real production registration smoke: no renderer/handler reconstruction and no rebuild.
// Linux: pinned node scripts/smoke-headless-startup.cjs --evidence-dir /fresh/path
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const root = path.resolve(__dirname, "..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function main() {
	const argv = process.argv.slice(2);
	if (process.platform !== "linux" || argv.length !== 2 || argv[0] !== "--evidence-dir")
		throw new Error(
			"Use on Linux: node scripts/smoke-headless-startup.cjs --evidence-dir <fresh-directory>",
		);
	if (process.version !== "v22.22.1") throw new Error("Use pinned Node 22.22.1");
	const evidence = path.resolve(argv[1]);
	const mainFile = path.join(root, "dist-electron/main.js");
	const binary = path.join(root, "node_modules/electron/dist/electron");
	const entryHash = hash(await fs.readFile(mainFile));
	// The entry is a Vite loader; fingerprint every main chunk too, not just the loader.
	const builtFiles = (await fs.readdir(path.dirname(mainFile))).filter((name) =>
		/^main(?:-.*)?\.js$/.test(name),
	);
	const buildHashes = Object.fromEntries(
		await Promise.all(
			builtFiles.map(async (name) => [
				name,
				hash(await fs.readFile(path.join(root, "dist-electron", name))),
			]),
		),
	);
	await fs.mkdir(evidence);
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([, value]) => typeof value === "string"),
	);
	Object.assign(env, {
		DO_NOT_TRACK: "1",
		OPENSCREEN_DIAGNOSTIC: "1",
		OPENSCREEN_FONTS_DIR: path.join(root, "public/fonts"),
	});
	const launch = (profile, tail) => [
		"-a",
		binary,
		mainFile,
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-gpu",
		"--no-zygote",
		`--user-data-dir=${path.join(evidence, profile)}`,
		...tail,
	];
	const stdioArgs = launch("stdio-profile", ["mcp"]);
	const transport = new StdioClientTransport({
		command: "xvfb-run",
		args: stdioArgs,
		env,
		stderr: "pipe",
	});
	const client = new Client({ name: "headless-startup-smoke", version: "1" });
	let stderr = "";
	transport.stderr?.on("data", (bytes) => {
		stderr += bytes.toString();
	});
	let server, tools;
	try {
		await client.connect(transport, { timeout: 20000 });
		server = client.getServerVersion();
		tools = (await client.listTools({}, { timeout: 20000 })).tools.map((tool) => tool.name);
		if (!server || !tools.includes("confirmLessonRangeFile"))
			throw new Error("Production MCP initialize/listTools failed");
	} finally {
		await client.close();
		await fs.writeFile(path.join(evidence, "stdio-stderr.log"), stderr, { flag: "wx" });
	}
	// A deliberately missing disposable project exercises normal export bootstrap + runner,
	// then must fail validation. It never enumerates devices or starts a native media render.
	const absentProject = path.join(evidence, "intentionally-absent.openscreen");
	const absentOutput = path.join(evidence, "must-not-render.mp4");
	const cliArgs = launch("cli-profile", ["export", absentProject, "--out", absentOutput, "--json"]);
	const cli = spawnSync("xvfb-run", cliArgs, { env, encoding: "utf8", timeout: 30000 });
	await fs.writeFile(path.join(evidence, "cli-stdout.log"), cli.stdout || "", { flag: "wx" });
	await fs.writeFile(path.join(evidence, "cli-stderr.log"), cli.stderr || "", { flag: "wx" });
	const output = (cli.stdout || "") + (cli.stderr || "");
	const bootstrapReached = /app handlers registered/.test(cli.stderr || "");
	const runnerReached = /renderer asked for the request/.test(cli.stderr || "");
	const records = (cli.stdout || "")
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
	const expectedFailure = records.some(
		(record) =>
			record.event === "error" &&
			typeof record.message === "string" &&
			/file not found|ENOENT|project (?:file )?(?:not found|does not exist)/i.test(record.message),
	);
	const absent = async (file) =>
		fs.stat(file).then(
			() => false,
			(error) => error.code === "ENOENT",
		);
	const noInputOrOutput = (await absent(absentProject)) && (await absent(absentOutput));
	const success =
		cli.status === 1 &&
		noInputOrOutput &&
		!cli.error &&
		bootstrapReached &&
		runnerReached &&
		expectedFailure &&
		!output.includes("Editor dirty-state provider is required");
	const result = {
		success,
		mode: "Real production Electron stdio initialize/listTools and CLI export bootstrap/runner; deliberately absent project must fail validation, no actual export/device enumeration/capture/physical acceptance",
		node: process.version,
		entryHash,
		buildHashes,
		stdio: { command: ["xvfb-run", ...stdioArgs], server, tools },
		cli: {
			command: ["xvfb-run", ...cliArgs],
			exit: cli.status,
			signal: cli.signal,
			error: cli.error?.code,
			bootstrapReached,
			runnerReached,
			expectedFailure,
			noInputOrOutput,
			records,
		},
	};
	await fs.writeFile(
		path.join(evidence, "startup-smoke.json"),
		JSON.stringify(result, null, 2) + "\n",
		{ flag: "wx" },
	);
	if (!success)
		throw new Error(
			"Headless startup smoke failed; inspect retained stdout/stderr and startup-smoke.json",
		);
	console.log(
		JSON.stringify({
			success: true,
			mcp: "initialize/listTools",
			cli: "production registration and renderer reached; expected missing-project failure",
			evidence,
		}),
	);
}
main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
