@tool
extends EditorPlugin

class FooterFailure:
	extends "res://addons/openscreen_typing/scene_capture.gd"
	func _write(payload: Dictionary) -> bool:
		if payload.event == "scene-stop":
			_file = null
			status_changed.emit("Simulated footer write failure")
			return false
		else:
			return super._write(payload)

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
	if not _require(plugin.get("_checkpoint_button").disabled, "marker UI disabled off"):
		return
	var root := editor.get_edited_scene_root()
	root.set_meta("private", "PRIVATE_METADATA_CANARY")
	editor.get_selection().clear()
	await _wait()
	if not _require(capture.begin("res://scene.jsonl", root, editor), "explicit start"):
		return
	var first_take: String = capture.active_session_id()
	if not _require(not first_take.is_empty(), "active take token exposed"):
		return
	var before_invalid := FileAccess.get_file_as_string("res://scene.jsonl")
	for blank in ["\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff", " \u3000\u00a0"]:
		if not _require(not capture.mark_checkpoint(blank, first_take), "Unicode blank label refused"):
			return
	if not _require(FileAccess.get_file_as_string("res://scene.jsonl") == before_invalid, "Unicode blank refusal leaves take unchanged"):
		return
	if not _require(not capture.mark_checkpoint(" ", first_take), "blank label refused"):
		return
	if not _require(not capture.mark_checkpoint("😀".repeat(101), first_take), "UTF-16 label bound"):
		return
	if not _require(not capture.mark_checkpoint("", first_take), "empty label refused"):
		return
	if not _require(not capture.mark_checkpoint("bad\u0001label", first_take), "control label refused"):
		return
	if not _require(not plugin.get("_checkpoint_button").disabled, "marker UI enabled active"):
		return
	plugin.get("_checkpoint_button").pressed.emit()
	plugin.get("_checkpoint_label").text = "Scene opened"
	plugin.get("_checkpoint_dialog").confirmed.emit()
	plugin.get("_checkpoint_dialog").hide()
	if not _require(plugin.get("_scene_status").text == "Authored checkpoint saved", "dialog marked initial checkpoint"):
		return
	# A short-lived selection must reach the signal path before the 250 ms fallback.
	editor.get_selection().clear()
	editor.get_selection().add_node(root)
	await get_tree().create_timer(0.09).timeout
	await get_tree().process_frame
	if not _require(capture.get("_sequence") >= 2, "rapid selection signal sampled"):
		return
	editor.get_selection().clear()
	await get_tree().create_timer(0.09).timeout
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
	if not _require(capture.mark_checkpoint("Texture and scale set", first_take), "texture/scale milestone"):
		return
	if not _require(capture.mark_checkpoint("\u3000Script attached\u00a0", first_take), "script milestone"):
		return
	editor.get_selection().clear()
	editor.get_selection().add_node(sprite)
	await _wait()
	editor.edit_node(sprite)
	await _wait()
	var prior_sequence: int = capture.get("_sequence")
	sprite.rotation = 0.125
	editor.get_inspector().property_edited.emit("rotation")
	await get_tree().create_timer(0.09).timeout
	await get_tree().process_frame
	if not _require(capture.get("_sequence") > prior_sequence, "Inspector signal sampled"):
		return
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
	if not _require(capture.mark_checkpoint("Scene saved", first_take), "save milestone"):
		return
	plugin.get("_checkpoint_button").pressed.emit()
	plugin.get("_checkpoint_label").text = "Stale dialog must not write"
	editor.open_scene_from_path("res://other.tscn")
	await _wait()
	if not _require(not capture.active(), "scene switch stopped capture"):
		return
	if not _require(plugin.get("_checkpoint_button").disabled and not plugin.get("_checkpoint_dialog").visible and plugin.get("_checkpoint_session").is_empty(), "stopped take closes and invalidates marker dialog"):
		return
	if not _require(not capture.mark_checkpoint("Stale dialog", first_take), "stale take token refused"):
		return
	if not _require(not capture.mark_checkpoint("off", first_take), "marker refused while off"):
		return
	var journal_text := FileAccess.get_file_as_string("res://scene.jsonl")
	if not _require(journal_text.contains("Texture and scale set"), "marker label recorded"):
		return
	if not _require(not journal_text.contains("PRIVATE_METADATA_CANARY"), "no private metadata in marker journal"):
		return
	if not _require(not editor.get_selection().selection_changed.is_connected(capture._selection_changed), "selection observer disconnected"):
		return
	if not _require(not editor.get_inspector().property_edited.is_connected(capture._property_edited), "Inspector observer disconnected"):
		return
	if not _require(not get_tree().tree_changed.is_connected(capture._tree_changed), "tree observer disconnected"):
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
	var new_take_before := FileAccess.get_file_as_string("res://disable.jsonl")
	plugin.get("_checkpoint_dialog").confirmed.emit()
	if not _require(FileAccess.get_file_as_string("res://disable.jsonl") == new_take_before, "stale dialog cannot mark new take"):
		return
	if not _require(not capture.mark_checkpoint("Stale take on new journal", first_take), "old token refused on new active take"):
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
	# Exercise the actual reserved footer behavior without making thousands of slow scene edits.
	var marker_limit = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(marker_limit.begin("res://marker-limit.jsonl", oversized, editor), "marker budget start"):
		return
	marker_limit._sample()
	while marker_limit.get("_sequence") < 4094:
		marker_limit._write({"event": "scene-saved", "scene": "res://enemy.tscn"})
	if not _require(marker_limit.mark_checkpoint("Last available record", marker_limit.active_session_id()), "marker fits before reserved footer"):
		return
	if not _require(not marker_limit.mark_checkpoint("Must not claim", marker_limit.active_session_id()), "marker record limit refusal"):
		return
	var marker_limited_text := FileAccess.get_file_as_string("res://marker-limit.jsonl")
	if not _require(marker_limited_text.contains("scene-stop"), "marker limit preserves footer"):
		return
	if not _require(not marker_limited_text.contains("Must not claim"), "failed marker not claimed"):
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
