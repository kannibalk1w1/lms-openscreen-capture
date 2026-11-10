// Real Godot editor/API probe. No installation in lesson projects or physical-input claims.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const fixture = fs.mkdtempSync(
	path.join(process.env.OPENSCREEN_SCENE_PROBE_TMP || os.tmpdir(), "godot-scene-probe-"),
);
fs.cpSync(path.join(root, "integrations/godot-typing/addons"), path.join(fixture, "addons"), {
	recursive: true,
});
fs.mkdirSync(path.join(fixture, "addons/probe"));
fs.copyFileSync(
	path.join(root, "integrations/godot-typing/probes/scene_probe.gd"),
	path.join(fixture, "addons/probe/plugin.gd"),
);
fs.writeFileSync(
	path.join(fixture, "addons/probe/plugin.cfg"),
	'[plugin]\nname="Disposable scene probe"\ndescription="Fixture only"\nauthor="OpenScreen"\nversion="1"\nscript="plugin.gd"\n',
);
fs.writeFileSync(
	path.join(fixture, "project.godot"),
	'config_version=5\n[application]\nconfig/name="Disposable scene probe"\n[editor_plugins]\nenabled=PackedStringArray("res://addons/openscreen_typing/plugin.cfg", "res://addons/probe/plugin.cfg")\n',
);
fs.writeFileSync(
	path.join(fixture, "enemy.tscn"),
	'[gd_scene format=3]\n[node name="Enemy" type="Node2D"]\n',
);
fs.writeFileSync(
	path.join(fixture, "other.tscn"),
	'[gd_scene format=3]\n[node name="OTHER_SCENE_CANARY" type="Node2D"]\n',
);
fs.writeFileSync(
	path.join(fixture, "enemy.gd"),
	"extends Sprite2D\n# PRIVATE_SCRIPT_CONTENT_CANARY\n",
);
fs.writeFileSync(
	path.join(fixture, "slime.svg"),
	'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>',
);
const env = {
	...process.env,
	XDG_DATA_HOME: path.join(fixture, "data"),
	XDG_CONFIG_HOME: path.join(fixture, "config"),
	XDG_CACHE_HOME: path.join(fixture, "cache"),
};
const result = spawnSync(
	process.env.GODOT_BIN || "godot",
	["--headless", "--editor", "--path", fixture, "res://enemy.tscn", "--quit-after", "1800"],
	{ env, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
);
const output = `${result.stdout || ""}\n${result.stderr || ""}`;
fs.writeFileSync(path.join(fixture, "probe.log"), output);
console.log(`Retained fixture: ${fixture}`);
if (
	result.error ||
	result.status !== 0 ||
	!output.includes("SCENE_PROBE_PASSED") ||
	/SCRIPT ERROR|SCENE_PROBE_FAILED/.test(output)
) {
	console.error(output);
	throw result.error || new Error("Godot scene probe failed");
}
const journal = fs.readFileSync(path.join(fixture, "scene.jsonl"), "utf8");
for (const canary of [
	"PRIVATE_METADATA_CANARY",
	"PRIVATE_SCRIPT_CONTENT_CANARY",
	"OTHER_SCENE_CANARY",
	"AFTER_STOP_CANARY",
]) {
	if (journal.includes(canary)) throw new Error(`Out-of-scope content: ${canary}`);
}
const records = journal.trim().split("\n").map(JSON.parse);
if (
	!records.some((entry) => entry.trigger === "selection" && entry.atMs < 250) ||
	!records.some((entry) => entry.trigger === "inspector")
)
	throw new Error("Missing rapid selection/Inspector sampling evidence");
if (records.at(-1).reason !== "scene-changed") throw new Error("Missing scope-change footer");
const disabled = fs
	.readFileSync(path.join(fixture, "disable.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map(JSON.parse);
if (disabled.at(-1).reason !== "plugin-disabled") throw new Error("Missing disable footer");
console.log(
	`SCENE_PROBE_PASSED: ${records.length} records; scope/stop/privacy canaries passed. API-driven editor, no OS-input acceptance.`,
);

for (const name of ["record-limit.jsonl", "byte-limit.jsonl"]) {
	const bytes = fs.readFileSync(path.join(fixture, name));
	const entries = bytes.toString("utf8").trim().split("\n").map(JSON.parse);
	const footer = entries.at(-1);
	if (
		bytes.length > 8 * 1024 * 1024 ||
		entries.length > 4096 ||
		footer.coverage !== "limited" ||
		footer.reason !== "limit" ||
		entries.some((entry, index) => entry.sequence !== index)
	)
		throw new Error(`Invalid limit footer: ${name}`);
	console.log(`${name}: ${entries.length} records, ${bytes.length} bytes, limited footer retained`);
}

// Exercise the production decoder offline, after Godot has exited.
const decoderPath = process.env.OPENSCREEN_SCENE_DECODER || path.join(fixture, "decoder.cjs");
if (!process.env.OPENSCREEN_SCENE_DECODER)
	require("esbuild").buildSync({
		entryPoints: [path.join(root, "scripts/godot-scene-probe-decoder.ts")],
		bundle: true,
		platform: "node",
		format: "cjs",
		outfile: decoderPath,
	});
const { parseGodotSceneJournal } = require(decoderPath);
const decoded = parseGodotSceneJournal(journal);
const kinds = new Set(decoded.observations.map((entry) => entry.type));
for (const kind of [
	"node-appeared",
	"node-changed",
	"node-disappeared",
	"selection-changed",
	"scene-saved",
]) {
	if (!kinds.has(kind)) throw new Error(`Missing real editor evidence: ${kind}`);
}
if (
	!decoded.observations.some((entry) => entry.label.includes("parent")) ||
	!JSON.stringify(decoded).includes("res://slime.svg")
)
	throw new Error("Missing reparent/resource evidence");
for (const name of ["disable.jsonl", "record-limit.jsonl", "byte-limit.jsonl"])
	parseGodotSceneJournal(fs.readFileSync(path.join(fixture, name), "utf8"));
let incompleteRejected = false;
try {
	parseGodotSceneJournal(fs.readFileSync(path.join(fixture, "footer-failure.jsonl"), "utf8"));
} catch {
	incompleteRejected = true;
}
if (!incompleteRejected) throw new Error("Incomplete footer-failure journal was accepted");
fs.writeFileSync(path.join(fixture, "offline-review.json"), JSON.stringify(decoded, null, 2));
console.log(
	`OFFLINE_DECODER_PASSED: ${decoded.observations.length} observations; both limited journals and disable journal valid; incomplete journal rejected`,
);
async function provePortableAuthoring() {
	const {
		godotSceneCapture,
		parseApplicationCapture,
		appendApplicationDrafts,
		newLesson,
		parseLesson,
	} = require(decoderPath);
	const normalized = godotSceneCapture(decoded);
	const reopenedCapture = parseApplicationCapture(JSON.stringify(normalized));
	const chosen = reopenedCapture.observations.find((entry) => entry.type === "node-changed");
	if (!chosen) throw new Error("Missing draft observation");
	const lesson = appendApplicationDrafts(
		newLesson("Disposable Godot scene proof"),
		reopenedCapture,
		[chosen.id],
	);
	const reopened = await parseLesson(JSON.stringify(lesson));
	if (
		reopened.steps.length !== 1 ||
		reopened.steps[0].evidence[0].application.adapterId !== "godot-scene" ||
		reopened.steps[0].evidence[0].clock !== "unmapped"
	)
		throw new Error("Offline authoring lost evidence identity");
	fs.writeFileSync(
		path.join(fixture, "normalized-capture.json"),
		JSON.stringify(normalized, null, 2),
	);
	fs.writeFileSync(path.join(fixture, "lesson.json"), JSON.stringify(reopened, null, 2));
	console.log(
		"PORTABLE_AUTHORING_PASSED: normalized evidence and selected draft lesson reopen without Godot",
	);
}
provePortableAuthoring().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
