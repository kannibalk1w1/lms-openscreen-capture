@tool
extends EditorPlugin

class FooterFailure:
	extends "res://addons/openscreen_typing/scene_capture.gd"
	func _write(payload: Dictionary) -> void:
		if payload.event == "scene-stop":
			_file = null
			status_changed.emit("Simulated footer write failure")
		else:
			super._write(payload)

# Enabled only by scripts/probe-godot-scene.cjs in a disposable project.
func _enter_tree() -> void:
	call_deferred("_probe")

func _wait() -> void:
	await get_tree().create_timer(0.4).timeout

func _find_plugin(node: Node) -> Node:
	if node.name == "OpenScreenTypingCapture":
		return node
	for child in node.get_children():
		var found := _find_plugin(child)
		if found:
			return found
	return null

func _require(condition: bool, message: String) -> bool:
	if not condition:
		push_error("SCENE_PROBE_FAILED: " + message)
		get_tree().quit(1)
	return condition

func _probe() -> void:
	await _wait()
	var editor := get_editor_interface()
	editor.open_scene_from_path("res://enemy.tscn")
	await _wait()
	var plugin := _find_plugin(get_tree().root)
	if not _require(plugin != null, "addon loaded"):
		return
	var capture = plugin.get("_scene_capture")
	if not _require(not capture.active(), "default off"):
		return
	var root := editor.get_edited_scene_root()
	root.set_meta("private", "PRIVATE_METADATA_CANARY")
	if not _require(capture.begin("res://scene.jsonl", root, editor), "explicit start"):
		return
	var sprite := Sprite2D.new()
	sprite.name = "Sprite2D"
	root.add_child(sprite)
	sprite.owner = root
	await _wait()
	sprite.name = "Slime"
	sprite.scale = Vector2(2, 2)
	sprite.position = Vector2(12, 24)
	sprite.texture = load("res://slime.svg")
	sprite.set_script(load("res://enemy.gd"))
	editor.get_selection().clear()
	editor.get_selection().add_node(sprite)
	await _wait()
	var holder := Node2D.new()
	holder.name = "Container"
	root.add_child(holder)
	holder.owner = root
	sprite.reparent(holder)
	sprite.owner = root
	await _wait()
	sprite.queue_free()
	await _wait()
	editor.save_scene()
	await _wait()
	editor.open_scene_from_path("res://other.tscn")
	await _wait()
	if not _require(not capture.active(), "scene switch stopped capture"):
		return
	var original := FileAccess.get_file_as_string("res://scene.jsonl")
	if not _require(not capture.begin("res://scene.jsonl", editor.get_edited_scene_root(), editor), "existing file refused"):
		return
	if not _require(FileAccess.get_file_as_string("res://scene.jsonl") == original, "existing file unchanged"):
		return
	editor.get_edited_scene_root().name = "AFTER_STOP_CANARY"
	await _wait()
	if not _require(FileAccess.get_file_as_string("res://scene.jsonl") == original, "no post-stop writes"):
		return
	if not _require(capture.begin("res://disable.jsonl", editor.get_edited_scene_root(), editor), "second explicit start"):
		return
	editor.set_plugin_enabled("openscreen_typing", false)
	await _wait()
	if not _require(not capture.active(), "plugin disable stopped capture"):
		return
	var oversized := editor.get_edited_scene_root()
	for i in range(513):
		var child := Node.new()
		oversized.add_child(child)
		child.owner = oversized
	if not _require(not capture.begin("res://oversized.jsonl", oversized, editor), "oversized scene refused"):
		return
	if not _require(not FileAccess.file_exists("res://oversized.jsonl"), "no oversized output"):
		return
	# A separate bounded fixture exercises the actual writer's reserved footer.
	for child in oversized.get_children():
		child.free()
	var bounded = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(bounded.begin("res://record-limit.jsonl", oversized, editor), "record limit start"):
		return
	for i in range(4100):
		if not bounded.active():
			break
		oversized.position.x = i + 1
		bounded._sample()
	if not _require(not bounded.active(), "record budget stopped capture"):
		return
	var failing := FooterFailure.new()
	var statuses: Array[String] = []
	failing.status_changed.connect(func(message: String): statuses.append(message))
	if not _require(failing.begin("res://footer-failure.jsonl", oversized, editor), "footer failure start"):
		return
	failing.stop()
	if not _require(statuses.back() == "Simulated footer write failure", "footer failure not masked as saved"):
		return
	# Maximum-sized permitted node names make the byte budget bind first.
	for i in range(500):
		var child := Node.new()
		child.name = "N".repeat(190) + str(i)
		oversized.add_child(child)
		child.owner = oversized
	if not _require(bounded.begin("res://byte-limit.jsonl", oversized, editor), "byte limit start"):
		return
	for i in range(100):
		if not bounded.active():
			break
		oversized.position.x = i + 5000
		bounded._sample()
	if not _require(not bounded.active(), "byte budget stopped capture"):
		return
	print("SCENE_PROBE_PASSED")
	get_tree().quit(0)
