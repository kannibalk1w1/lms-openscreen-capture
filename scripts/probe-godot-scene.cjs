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
	'config_version=5\n[application]\nconfig/name="Disposable scene probe"\nrun/main_scene="res://main.tscn"\n[editor_plugins]\nenabled=PackedStringArray("res://addons/openscreen_typing/plugin.cfg", "res://addons/probe/plugin.cfg")\n',
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
fs.writeFileSync(
	path.join(fixture, "connections.gd"),
	"@tool\nextends Area2D\n# PRIVATE_CONNECTION_SCRIPT_CANARY\nfunc _on_timeout(_a = null): pass\nfunc _on_ready(_v = null): pass\nfunc nonpersistent_canary(): pass\nfunc resource_canary(): pass\nfunc make_lambda():\n\treturn func _on_timeout(_x = null): print(self)\n",
);
fs.writeFileSync(
	path.join(fixture, "connections.tscn"),
	'[gd_scene format=3]\n[ext_resource type="Script" path="res://connections.gd" id="1"]\n[node name="ConnectionsRoot" type="Node2D"]\n[node name="Timer" type="Timer" parent="."]\n[node name="Hitbox" type="Area2D" parent="."]\nscript = ExtResource("1")\n[connection signal="timeout" from="Timer" to="Hitbox" method="_on_timeout"]\n',
);
fs.writeFileSync(
	path.join(fixture, "history.tscn"),
	'[gd_scene format=3]\n[node name="HistoryRoot" type="Node2D"]\n',
);
fs.writeFileSync(
	path.join(fixture, "main.tscn"),
	'[gd_scene format=3]\n[node name="MainScene" type="Node2D"]\n',
);
fs.writeFileSync(
	path.join(fixture, "spatial.tscn"),
	'[gd_scene format=3]\n[node name="SpatialRoot" type="Node3D"]\n',
);
const env = {
	...process.env,
	XDG_DATA_HOME: path.join(fixture, "data"),
	XDG_CONFIG_HOME: path.join(fixture, "config"),
	XDG_CACHE_HOME: path.join(fixture, "cache"),
};
const result = spawnSync(
	process.env.GODOT_BIN || "godot",
	["--headless", "--editor", "--path", fixture, "res://enemy.tscn", "--quit-after", "4000"],
	{ env, encoding: "utf8", timeout: 150000, maxBuffer: 4 * 1024 * 1024 },
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
if (records.some((entry) => entry.schemaVersion !== 5))
	throw new Error("New producer did not write schema v5 consistently");
for (const label of ["3D baseline", "3D transforms later", "3D stop boundary"])
	if (!records.some((entry) => entry.event === "scene-checkpoint" && entry.label === label))
		throw new Error(`Missing ${label} marker`);
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

for (const name of ["record-limit.jsonl", "byte-limit.jsonl", "marker-limit.jsonl"]) {
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
const { parseGodotSceneJournal, listGodotSceneCheckpoints, compareGodotSceneCheckpoints } = require(
	decoderPath,
);
const decoded = parseGodotSceneJournal(journal);
if (
	decoded.baseline.nodes.find((node) => node.name === "SpatialCanary")?.properties.position3
		?.length !== 3 ||
	!["position3", "rotation3", "scale3"].every((field) =>
		decoded.observations.some(
			(entry) => entry.type === "node-changed" && entry.label.includes(field),
		),
	)
)
	throw new Error("Missing Node3D transform baseline/change evidence");
const spatialText = fs.readFileSync(path.join(fixture, "spatial.jsonl"), "utf8");
const spatialJournal = parseGodotSceneJournal(spatialText);
if (
	spatialJournal.baseline.nodes[0].type !== "Node3D" ||
	spatialJournal.baseline.nodes[1].type !== "GridMap" ||
	!spatialJournal.baseline.nodes[1].properties.position3
)
	throw new Error("Missing real Node3D root or unsuffixed native subclass evidence");
const spatialChange = spatialJournal.observations.find(
	(entry) => entry.type === "node-changed" && entry.payload.after?.name === "SpatialRoot",
);
if (
	!spatialChange ||
	JSON.stringify(spatialChange.payload.after.properties.position3) !== "[8,9,10]" ||
	spatialChange.payload.after.properties.visible !== false
)
	throw new Error("Missing 3D root property observation");
const spatialRecords = spatialText.trim().split("\n").map(JSON.parse);
if (!spatialRecords.some((record) => record.trigger === "inspector"))
	throw new Error("Missing 3D Inspector signal evidence");
const spatialMarkers = listGodotSceneCheckpoints(spatialText);
const spatialComparison = compareGodotSceneCheckpoints(
	spatialText,
	spatialMarkers[0].recordSequence,
	spatialMarkers[1].recordSequence,
);
if (
	spatialComparison.counts.changed !== 1 ||
	!["position3", "rotation3", "scale3", "visible"].every((field) =>
		spatialComparison.changed[0].fields.includes(field),
	)
)
	throw new Error("3D checkpoint comparison lost transform fields");
fs.writeFileSync(
	path.join(fixture, "spatial-comparison.json"),
	JSON.stringify(spatialComparison, null, 2),
);
const nonfinite = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "spatial-nonfinite.jsonl"), "utf8"),
);
if (nonfinite.coverage !== "limited" || nonfinite.stopReason !== "limit")
	throw new Error("Nonfinite 3D values did not stop with valid limited footer");
fs.writeFileSync(
	path.join(fixture, "spatial-review.json"),
	JSON.stringify(spatialJournal, null, 2),
);
const kinds = new Set(decoded.observations.map((entry) => entry.type));
for (const kind of [
	"node-appeared",
	"node-changed",
	"node-disappeared",
	"selection-changed",
	"scene-saved",
	"author-checkpoint",
]) {
	if (!kinds.has(kind)) throw new Error(`Missing real editor evidence: ${kind}`);
}
if (
	!decoded.observations.some((entry) => entry.label.includes("parent")) ||
	!JSON.stringify(decoded).includes("res://slime.svg")
)
	throw new Error("Missing reparent/resource evidence");
for (const name of [
	"disable.jsonl",
	"record-limit.jsonl",
	"byte-limit.jsonl",
	"marker-limit.jsonl",
])
	parseGodotSceneJournal(fs.readFileSync(path.join(fixture, name), "utf8"));
let incompleteRejected = false;
try {
	parseGodotSceneJournal(fs.readFileSync(path.join(fixture, "footer-failure.jsonl"), "utf8"));
} catch {
	incompleteRejected = true;
}
if (!incompleteRejected) throw new Error("Incomplete footer-failure journal was accepted");
fs.writeFileSync(path.join(fixture, "offline-review.json"), JSON.stringify(decoded, null, 2));
// v4 editor context from real EditorUndoRedoManager/EditorInterface calls.
const historyJournal = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "history.jsonl"), "utf8"),
);
const historyLabels = historyJournal.observations
	.filter((entry) => entry.type === "editor-history")
	.map((entry) => `${entry.payload.direction}:${entry.payload.after.action}`);
const expectedHistory = [
	"forward:Add Child Node",
	"forward:Set position",
	"back:Add Child Node",
	"forward:Set position",
	"back:Add Child Node",
	"forward:Rename HISTORY_LABEL_CANARY",
	"forward:unsupported-action-name",
];
if (JSON.stringify(historyLabels) !== JSON.stringify(expectedHistory))
	throw new Error(`Unexpected real history observations: ${JSON.stringify(historyLabels)}`);
const runLabels = historyJournal.observations
	.filter((entry) => entry.type === "run-state")
	.map((entry) => entry.label);
if (
	JSON.stringify(runLabels) !==
	JSON.stringify([
		"Editor run observed: res://history.tscn",
		"Editor run stop observed",
		"Editor run observed: another scene (path withheld)",
	])
)
	throw new Error(`Unexpected real run observations: ${JSON.stringify(runLabels)}`);
if (decoded.baseline.history?.available !== false)
	throw new Error("Take without a history manager must report history unavailable");
const prerun = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "history-prerun.jsonl"), "utf8"),
);
if (
	prerun.baseline.run?.scope !== "other-scene" ||
	JSON.stringify(prerun.observations.filter((e) => e.type === "run-state").map((e) => e.label)) !==
		JSON.stringify(["Editor run stop observed"])
)
	throw new Error("Pre-existing run must be baseline context only");
fs.writeFileSync(
	path.join(fixture, "history-review.json"),
	JSON.stringify(historyJournal, null, 2),
);
// v5 saved signal connections from real Object.connect/disconnect calls.
const connectionsJournal = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "connections.jsonl"), "utf8"),
);
const describeIds = (journal, connection) => {
	const name = (id) => journal.baseline.nodes.find((node) => node.id === id)?.name;
	return `${name(connection.from)}.${connection.signal}->${name(connection.to)}.${connection.method}`;
};
if (
	JSON.stringify(
		connectionsJournal.baseline.connections.map((c) => describeIds(connectionsJournal, c)),
	) !== JSON.stringify(["Timer.timeout->Hitbox._on_timeout"]) ||
	connectionsJournal.baseline.excludedConnections !== 0
)
	throw new Error("Saved connection must be baseline context");
const connectionKinds = connectionsJournal.observations
	.filter((entry) => entry.type.startsWith("signal-"))
	.map((entry) => entry.type);
const added = connectionsJournal.observations.find((e) => e.type === "signal-connection-added");
const unrecorded = connectionsJournal.observations.find(
	(e) => e.type === "signal-connections-unrecorded",
);
if (
	JSON.stringify(connectionKinds) !==
		JSON.stringify([
			"signal-connection-added",
			"signal-connections-unrecorded",
			"signal-connection-removed",
		]) ||
	describeIds(connectionsJournal, added.payload.after) !== "Timer.renamed->Hitbox._on_ready" ||
	added.payload.after.boundArgs !== 1 ||
	!added.payload.after.deferred ||
	!added.payload.after.oneShot ||
	unrecorded.payload.after !== 5
)
	throw new Error(
		`Unexpected real connection observations: ${JSON.stringify(connectionsJournal.observations)}`,
	);
const reopenedConnections = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "connections-reopen.jsonl"), "utf8"),
);
if (
	JSON.stringify(
		reopenedConnections.baseline.connections.map((c) => describeIds(reopenedConnections, c)),
	) !== JSON.stringify(["Timer.renamed->Hitbox._on_ready"])
)
	throw new Error("Reopened saved scene must carry the saved connection as baseline");
const limited = parseGodotSceneJournal(
	fs.readFileSync(path.join(fixture, "connections-limit.jsonl"), "utf8"),
);
if (limited.coverage !== "limited" || limited.stopReason !== "limit")
	throw new Error("Connection limit must stop with a valid limited footer");
const enumeration = /CONNECTION_ENUMERATION_US (\d+)/.exec(output);
if (!enumeration) throw new Error("Missing connection enumeration timing");
console.log(
	`CONNECTION_LIMIT_PASSED: limited footer; snapshot at the 256-connection cap ${enumeration[1]} us`,
);
fs.writeFileSync(
	path.join(fixture, "connections-review.json"),
	JSON.stringify({ connectionsJournal, reopenedConnections }, null, 2),
);
console.log(
	`CONNECTIONS_PASSED: baseline/add/remove/reopen; ${unrecorded.payload.after} out-of-scope or unsupported persistent connections counted, not described`,
);
console.log(
	`HISTORY_RUN_PASSED: ${historyLabels.length} history + ${runLabels.length} run observations; global history and other-scene path withheld`,
);
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
	const chosen = reopenedCapture.observations.find(
		(entry) =>
			entry.type === "author-checkpoint" && entry.payload.label === "Texture and scale set",
	);
	if (!chosen) throw new Error("Missing authored checkpoint observation");
	let lesson = appendApplicationDrafts(newLesson("Disposable Godot scene proof"), reopenedCapture, [
		chosen.id,
	]);
	const spatialCapture = godotSceneCapture(spatialJournal);
	lesson = appendApplicationDrafts(lesson, spatialCapture, [spatialChange.id]);
	fs.writeFileSync(
		path.join(fixture, "spatial-normalized-capture.json"),
		JSON.stringify(spatialCapture, null, 2),
	);
	const reopened = await parseLesson(JSON.stringify(lesson));
	if (
		reopened.steps.length !== 2 ||
		reopened.steps[0].evidence[0].application.adapterId !== "godot-scene" ||
		reopened.steps[0].evidence[0].clock !== "unmapped" ||
		reopened.steps[0].evidence[0].application.type !== "author-checkpoint" ||
		JSON.stringify(reopened.steps[1].evidence[0].application.payload.after.properties.position3) !==
			"[8,9,10]"
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
