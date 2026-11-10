export function sceneNode(id = "1", name = "Enemy", parent = "") {
	return { id, name, parent, type: "Node2D", properties: { script: null } };
}
export function sceneRecords(): Record<string, unknown>[] {
	const baseline = sceneNode();
	const sprite = { ...sceneNode("2", "Sprite2D", "1"), type: "Sprite2D" };
	const changed = {
		...sprite,
		name: "Slime",
		properties: {
			script: "res://enemy.gd",
			texture: "res://slime.svg",
			position: [12, 24],
			scale: [2, 2],
			rotation: 0,
			visible: true,
		},
	};
	return [
		{
			event: "scene-start",
			producer: "godot-scene",
			scene: "res://enemy.tscn",
			intervalMs: 250,
			state: { nodes: [baseline], selected: [] },
		},
		{ event: "scene-state", state: { nodes: [baseline, sprite], selected: [] } },
		{ event: "scene-state", state: { nodes: [baseline, changed], selected: ["2"] } },
		{ event: "scene-state", state: { nodes: [baseline], selected: [] } },
		{ event: "scene-saved", scene: "res://enemy.tscn" },
		{ event: "scene-stop", reason: "user-stop", coverage: "sampled" },
	].map((record, sequence) => ({
		...record,
		schemaVersion: 1,
		sessionId: `godot-scene-${"a".repeat(32)}`,
		instanceId: "b".repeat(32),
		sequence,
		atMs: sequence * 250,
	}));
}
export function sceneSource(records = sceneRecords()): string {
	return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
