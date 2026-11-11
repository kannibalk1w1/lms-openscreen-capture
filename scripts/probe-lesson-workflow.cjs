// Production CLI/MCP and Electron workflow probe. Isolated profiles; only file-picker
// destinations and confirmation dialogs are supplied by automation. No mocked authoring logic.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { _electron } = require("playwright");
const root = path.resolve(__dirname, "..");
const output = path.resolve(process.argv[2]);
const binary = path.join(root, "node_modules/electron/dist/electron");
const entry = path.join(root, "dist-electron/main.js");
const env = { ...process.env, DO_NOT_TRACK: "1", OPENSCREEN_DIAGNOSTIC: "1" };
const checks = [];
const check = (name, passed) => {
	checks.push({ name, passed: !!passed });
	if (!passed) throw new Error(name);
};
const read = async (name) => JSON.parse(await fs.readFile(path.join(output, name), "utf8"));
const step = (title, status = "draft") => ({
	id: crypto.randomUUID(),
	title,
	instructions: title,
	status,
	evidence: [],
	imageAlt: "",
});
const lesson = (steps) => ({
	format: "openscreen-lesson",
	version: 1,
	id: crypto.randomUUID(),
	revision: 0,
	title: "Enemy workflow",
	steps,
	assets: [],
});
async function main() {
	await fs.mkdir(output);
	const original = lesson([step("Accepted first step", "reviewed"), step("Broken Enemy movement")]);
	const candidate = lesson([step("Fixed Enemy movement")]);
	await fs.writeFile(path.join(output, "original.json"), JSON.stringify(original));
	await fs.writeFile(path.join(output, "candidate.json"), JSON.stringify(candidate));
	const originalHash = crypto.createHash("sha256").update(JSON.stringify(original)).digest("hex");
	const change = {
		operation: "replace",
		stepId: original.steps[1].id,
		sourcePath: path.join(output, "candidate.json"),
		sourceStepId: candidate.steps[0].id,
		reason: "Replace failed movement",
	};
	const cli = spawnSync(
		binary,
		[
			entry,
			"--no-sandbox",
			`--user-data-dir=${output}/cli-profile`,
			"lesson",
			"workflow",
			path.join(output, "original.json"),
			"--revision",
			"0",
			"--out",
			path.join(output, "cli-replaced.json"),
			"--change",
			JSON.stringify(change),
			"--json",
		],
		{ env, encoding: "utf8", timeout: 30000 },
	);
	await fs.writeFile(path.join(output, "cli.log"), cli.stdout + cli.stderr);
	check("production CLI replacement", cli.status === 0);
	const transport = new StdioClientTransport({
		command: binary,
		args: [entry, "--no-sandbox", `--user-data-dir=${output}/mcp-profile`, "mcp"],
		env,
		stderr: "pipe",
	});
	const client = new Client({ name: "workflow-probe", version: "1" });
	let stderr = "";
	transport.stderr?.on("data", (b) => {
		stderr += b;
	});
	try {
		await client.connect(transport);
		check(
			"production MCP tool discovery",
			(await client.listTools()).tools.some((t) => t.name === "applyLessonWorkflowFile"),
		);
		const apply = async (source, target, revision, change) => {
			const result = await client.callTool({
				name: "applyLessonWorkflowFile",
				arguments: {
					manifestPath: path.join(output, source),
					outputPath: path.join(output, target),
					expectedRevision: revision,
					change,
				},
			});
			check(`MCP ${change.operation}`, !result.isError);
		};
		await apply("original.json", "mcp-replaced.json", 0, change);
		const replaced = await read("mcp-replaced.json");
		check(
			"stable target and unrelated reviewed step",
			replaced.steps[1].id === original.steps[1].id &&
				JSON.stringify(replaced.steps[0]) === JSON.stringify(original.steps[0]),
		);
		check(
			"history retained and replacement draft",
			replaced.steps[1].retakes[0].previous.title === "Broken Enemy movement" &&
				replaced.steps[1].status === "draft",
		);
		await apply("mcp-replaced.json", "checked.json", 1, {
			operation: "verify",
			stepId: original.steps[1].id,
			check: {
				expected: "Enemy moves",
				observed: "Probe records a manual check, no game run claimed",
				outcome: "unavailable",
			},
		});
		await apply("checked.json", "handoff.json", 2, {
			operation: "handoff",
			handoff: {
				from: "agent",
				to: "human",
				note: "Review movement in Godot",
				nextStepId: original.steps[1].id,
			},
		});
		await apply("handoff.json", "restored.json", 3, {
			operation: "restore",
			stepId: original.steps[1].id,
			retakeId: replaced.steps[1].retakes[0].id,
			reason: "Restore previous take",
		});
		check(
			"restore persists and clears verification",
			(await read("restored.json")).steps[1].title === "Broken Enemy movement" &&
				!(await read("restored.json")).steps[1].verification,
		);
	} finally {
		await client.close();
		await fs.writeFile(path.join(output, "mcp-stderr.log"), stderr);
	}
	const app = await _electron.launch({
		executablePath: binary,
		args: [entry, `--user-data-dir=${output}/gui-profile`, "--no-sandbox", "--mute-audio"],
		env,
		timeout: 60000,
	});
	try {
		await app.firstWindow();
		const editor = app.waitForEvent("window", {
			predicate: (p) => p.url().includes("windowType=editor"),
		});
		await app.evaluate(({ ipcMain, BrowserWindow }) =>
			ipcMain._invokeHandlers.get("switch-to-editor")({
				sender: BrowserWindow.getAllWindows()[0].webContents,
			}),
		);
		const page = await editor;
		await page.waitForLoadState("load");
		page.on("console", (m) => {
			if (m.type() === "error") console.error("GUI:", m.text());
		});
		page.on("pageerror", (e) => console.error("PAGE:", e));
		await page.evaluate(() =>
			window.electronAPI.invokeNativeBridge({
				requestId: crypto.randomUUID(),
				domain: "aiEdition",
				action: "document.create",
				payload: { title: "Workflow probe" },
			}),
		);
		await page.reload();
		await app.evaluate(({ dialog }, output) => {
			dialog.showOpenDialog = async () => ({
				canceled: false,
				filePaths: [output + "/original.json"],
			});
			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: output + "/gui-saved.json",
			});
		}, output);
		page.on("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: "Lesson guide", exact: true }).click();
		await page.getByRole("button", { name: "Open editable lesson", exact: true }).click();
		await page.getByText("Retakes, run checks and handoff", { exact: true }).click();
		await page.getByLabel("Target step / next handoff step").selectOption(original.steps[1].id);
		await page
			.getByLabel("Replacement editable lesson file")
			.setInputFiles(path.join(output, "candidate.json"));
		await page
			.getByLabel("Replacement step", { exact: true })
			.waitFor({ state: "attached", timeout: 10000 })
			.catch(async (e) => {
				await page.screenshot({ path: path.join(output, "failed-gui.png") });
				await fs.writeFile(
					path.join(output, "failed-gui.txt"),
					await page.locator("body").innerText(),
				);
				throw e;
			});
		await page.getByLabel("Replacement step", { exact: true }).scrollIntoViewIfNeeded();
		await page.getByLabel("Replacement step", { exact: true }).selectOption(candidate.steps[0].id);
		await page.getByLabel("Reason for replacement or restore").fill("Fix Enemy");
		await page.getByRole("button", { name: "Apply replacement take" }).click();
		await page.getByLabel("Earlier takes").waitFor();
		await page.getByLabel("Expected result", { exact: true }).fill("Enemy moves right");
		await page
			.getByLabel("Observed result / errors / unavailable reason")
			.fill("Not run during this file-workflow probe");
		await page.getByRole("button", { name: "Record manual run check" }).click();
		await page.getByText(/Manual check matches current step content/).waitFor();
		await page
			.getByLabel("Handoff instructions, known problems and next action")
			.fill("Human should run the disposable Enemy scene");
		await page.getByRole("button", { name: "Record handoff in lesson" }).click();
		await page.getByText(/Handoff recorded for this lesson revision/).waitFor();
		await page.getByRole("button", { name: "Save new editable copy", exact: true }).click();
		await page.getByText(/^Editable copy saved:/).waitFor();
		const saved = await read("gui-saved.json");
		check(
			"production GUI saved retake/check/handoff",
			saved.steps[1].retakes.length === 1 &&
				saved.steps[1].verification.outcome === "unavailable" &&
				saved.handoffs.length === 1,
		);
		check(
			"GUI retained accepted step",
			JSON.stringify(saved.steps[0]) === JSON.stringify(original.steps[0]),
		);
		await page.screenshot({ path: path.join(output, "workflow.png") });
	} finally {
		await app.close();
	}
	check(
		"source unchanged",
		crypto
			.createHash("sha256")
			.update(await fs.readFile(path.join(output, "original.json")))
			.digest("hex") === originalHash,
	);
	await fs.writeFile(
		path.join(output, "result.json"),
		JSON.stringify(
			{
				checks,
				sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], {
					cwd: root,
					encoding: "utf8",
				}).stdout.trim(),
				builtEntrySha256: crypto
					.createHash("sha256")
					.update(await fs.readFile(entry))
					.digest("hex"),
			},
			null,
			2,
		),
	);
	console.log(`WORKFLOW_PROBE_PASSED: ${checks.length}/${checks.length}`);
}
main().catch(async (error) => {
	console.error(error);
	await fs
		.writeFile(
			path.join(output, "failed.json"),
			JSON.stringify({ checks, error: String(error) }, null, 2),
		)
		.catch(() => undefined);
	process.exitCode = 1;
});
