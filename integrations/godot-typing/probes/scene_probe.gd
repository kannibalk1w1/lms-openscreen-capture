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
	var spatial := Node3D.new()
	spatial.name = "SpatialCanary"
	spatial.position = Vector3(1, 2, 3)
	spatial.rotation = Vector3(0.1, 0.2, 0.3)
	spatial.scale = Vector3(1, 1, 1)
	root.add_child(spatial)
	spatial.owner = root
	editor.get_selection().clear()
	await _wait()
	if not _require(capture.begin("res://scene.jsonl", root, editor), "explicit start"):
		return
	var first_take: String = capture.active_session_id()
	if not _require(not first_take.is_empty(), "active take token exposed"):
		return
	if not _require(capture.mark_checkpoint("3D baseline", first_take), "3D baseline marker"):
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
	spatial.position = Vector3(4, 2, 3)
	spatial.rotation = Vector3(0.1, 0.8, 0.3)
	if not _require(capture.mark_checkpoint("3D transforms later", first_take), "3D change marker"):
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
	spatial.scale = Vector3(2, 3, 4)
	capture._sample("stop")
	if not _require(capture.mark_checkpoint("3D stop boundary", first_take), "3D stop boundary marker"):
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
	# A separate real Node3D root and unsuffixed native Node3D subclass.
	editor.open_scene_from_path("res://spatial.tscn")
	await _wait()
	var spatial_root := editor.get_edited_scene_root() as Node3D
	if not _require(spatial_root != null, "3D root opened"):
		return
	var grid := GridMap.new()
	grid.name = "NativeSpatialType"
	spatial_root.add_child(grid)
	grid.owner = spatial_root
	var spatial_capture = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(spatial_capture.begin("res://spatial.jsonl", spatial_root, editor), "3D root take start"):
		return
	var spatial_token: String = spatial_capture.active_session_id()
	if not _require(spatial_capture.mark_checkpoint("3D root baseline", spatial_token), "3D root baseline"):
		return
	editor.edit_node(spatial_root)
	await _wait()
	var spatial_prior: int = spatial_capture.get("_sequence")
	spatial_root.position = Vector3(8, 9, 10)
	spatial_root.rotation = Vector3(0.125, 0.25, 0.5)
	spatial_root.scale = Vector3(2, 3, 4)
	spatial_root.visible = false
	editor.get_inspector().property_edited.emit("position")
	await get_tree().create_timer(0.09).timeout
	spatial_capture.poll()
	if not _require(spatial_capture.get("_sequence") > spatial_prior, "3D Inspector signal sampled"):
		return
	if not _require(spatial_capture.mark_checkpoint("3D root adjusted", spatial_token), "3D root checkpoint"):
		return
	spatial_capture.stop()
	if not _require(spatial_capture.begin("res://spatial-nonfinite.jsonl", spatial_root, editor), "nonfinite guard take"):
		return
	spatial_root.position = Vector3(INF, 0, 0)
	if not _require(not spatial_capture.mark_checkpoint("Must not claim nonfinite", spatial_capture.active_session_id()), "nonfinite marker refused"):
		return
	if not _require(not spatial_capture.active(), "nonfinite value stopped capture"):
		return
	spatial_root.position = Vector3.ZERO
	if not await _probe_history_and_run(editor):
		return
	if not await _probe_connections(editor):
		return
	if not await _probe_meshes(editor):
		return
	if not await _probe_sprites(editor):
		return
	print("SCENE_PROBE_PASSED")
	get_tree().quit(0)

func _pump(capture, seconds: float = 0.35) -> void:
	var until := Time.get_ticks_msec() + int(seconds * 1000)
	while Time.get_ticks_msec() < until:
		await get_tree().process_frame
		capture.poll()

func _count(text: String, needle: String) -> int:
	return text.split(needle).size() - 1

# v4 editor context: the captured scene's own history and polled run state.
func _probe_history_and_run(editor: EditorInterface) -> bool:
	editor.open_scene_from_path("res://history.tscn")
	await _wait()
	var root := editor.get_edited_scene_root() as Node2D
	if not _require(root != null and root.scene_file_path == "res://history.tscn", "history scene opened"):
		return false
	var ur := get_undo_redo()
	var take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(take.begin("res://history.jsonl", root, editor, ur), "history take start"):
		return false
	if not _require(take.connected_observer_count() == 5, "history observers connected"):
		return false
	var slime := Node2D.new()
	slime.name = "Slime"
	ur.create_action("Add Child Node")
	ur.add_do_method(root, "add_child", slime)
	ur.add_do_property(slime, "owner", root)
	ur.add_do_reference(slime)
	ur.add_undo_method(root, "remove_child", slime)
	ur.commit_action()
	await _pump(take)
	for i in 3:
		ur.create_action("Set position", UndoRedo.MERGE_ENDS)
		ur.add_do_property(slime, "position", Vector2(i + 1, i + 1))
		ur.add_undo_property(slime, "position", Vector2.ZERO)
		ur.commit_action()
		await get_tree().process_frame
	await _pump(take)
	var history := ur.get_history_undo_redo(ur.get_object_history_id(root))
	history.undo()
	await _pump(take)
	history.redo()
	await _pump(take)
	history.undo()
	await _pump(take)
	ur.create_action("Rename HISTORY_LABEL_CANARY")
	ur.add_do_property(slime, "name", "Slime2")
	ur.add_undo_property(slime, "name", "Slime")
	ur.commit_action()
	await _pump(take)
	ur.create_action("x".repeat(201))
	ur.add_do_property(slime, "visible", false)
	ur.add_undo_property(slime, "visible", true)
	ur.commit_action()
	await _pump(take)
	var before_global := FileAccess.get_file_as_string("res://history.jsonl")
	ur.create_action("GLOBAL_HISTORY_CANARY", UndoRedo.MERGE_DISABLE, ProjectSettings)
	ur.add_do_method(self, "set_meta", "probe", 1)
	ur.add_undo_method(self, "remove_meta", "probe")
	ur.commit_action()
	await _pump(take)
	if not _require(_count(FileAccess.get_file_as_string("res://history.jsonl"), "scene-history") == _count(before_global, "scene-history"), "global history excluded"):
		return false
	editor.play_current_scene()
	for i in 40:
		await _pump(take, 0.1)
		if editor.is_playing_scene():
			break
	if not _require(editor.is_playing_scene(), "current scene run started"):
		return false
	await _pump(take)
	editor.stop_playing_scene()
	await _pump(take)
	editor.play_main_scene()
	for i in 40:
		await _pump(take, 0.1)
		if editor.is_playing_scene():
			break
	if not _require(editor.is_playing_scene(), "main scene run started"):
		return false
	await _pump(take)
	take.stop()
	if not _require(take.connected_observer_count() == 0 and not take.active(), "history observers disconnected"):
		return false
	# A run that already exists when a take starts is baseline context only.
	if not _require(take.begin("res://history-prerun.jsonl", root, editor, ur), "pre-existing run take"):
		return false
	await _pump(take)
	editor.stop_playing_scene()
	await _pump(take)
	take.stop()
	for i in 20:
		if not editor.is_playing_scene():
			break
		await get_tree().create_timer(0.1).timeout
	if not _require(not editor.is_playing_scene(), "probe runs stopped"):
		return false
	var text := FileAccess.get_file_as_string("res://history.jsonl")
	for canary in ["GLOBAL_HISTORY_CANARY", "main.tscn"]:
		if not _require(not text.contains(canary), "out-of-scope context withheld: " + canary):
			return false
	for needed in ["HISTORY_LABEL_CANARY", "unsupported-action-name", "\"scope\":\"current-scene\"", "\"scope\":\"other-scene\""]:
		if not _require(text.contains(needed), "history/run evidence: " + needed):
			return false
	if not _require(_count(text, "\"Set position\"") == 2, "merged actions recorded once (plus redo)"):
		return false
	return true

func _noop_lambda_target() -> void:
	pass

# v5: saved signal connections between observed nodes only.
func _probe_connections(editor: EditorInterface) -> bool:
	editor.open_scene_from_path("res://connections.tscn")
	await _wait()
	var root := editor.get_edited_scene_root()
	if not _require(root != null and root.has_node("Timer") and root.has_node("Hitbox"), "connections scene opened"):
		return false
	var timer := root.get_node("Timer")
	var hitbox := root.get_node("Hitbox")
	var take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(take.begin("res://connections.jsonl", root, editor, get_undo_redo()), "connections take start"):
		return false
	# Positive: deferred one-shot with a bound value (value must never be recorded).
	timer.connect("renamed", Callable(hitbox, "_on_ready").bind("BOUND_VALUE_CANARY"), CONNECT_PERSIST | CONNECT_DEFERRED | CONNECT_ONE_SHOT)
	# Canaries that must not be described.
	timer.connect("tree_entered", Callable(hitbox, "nonpersistent_canary"))
	timer.connect("tree_exiting", func(): _noop_lambda_target(), CONNECT_PERSIST)
	var unowned := Timer.new()
	unowned.name = "UNOWNED_SOURCE_CANARY"
	root.add_child(unowned)
	unowned.connect("timeout", Callable(hitbox, "_on_timeout"), CONNECT_PERSIST)
	# A custom (unbind) wrapper around a real method: excluded and counted, never described.
	timer.connect("child_entered_tree", Callable(hitbox, "_on_timeout").unbind(1), CONNECT_PERSIST)
	# A bound lambda created by the target itself, sharing a declared method's name, and a
	# bind+unbind wrapper: custom callables that are not the plain method; counted only.
	timer.connect("replacing_by", hitbox.make_lambda().bind(3), CONNECT_PERSIST)
	timer.connect("editor_description_changed", Callable(hitbox, "_on_ready").bind(4).unbind(1), CONNECT_PERSIST)
	var resource := Gradient.new()
	resource.connect("changed", Callable(hitbox, "resource_canary"), CONNECT_PERSIST)
	hitbox.connect("area_entered", Callable(get_tree().root, "OUTSIDE_TARGET_CANARY"), CONNECT_PERSIST)
	await _pump(take)
	timer.disconnect("timeout", Callable(hitbox, "_on_timeout"))
	await _pump(take)
	take.stop()
	if not _require(take.connected_observer_count() == 0, "connections observers disconnected"):
		return false
	resource.disconnect("changed", Callable(hitbox, "resource_canary"))
	unowned.disconnect("timeout", Callable(hitbox, "_on_timeout"))
	unowned.free()
	hitbox.disconnect("area_entered", Callable(get_tree().root, "OUTSIDE_TARGET_CANARY"))
	timer.disconnect("tree_entered", Callable(hitbox, "nonpersistent_canary"))
	for signal_name in ["child_entered_tree", "replacing_by", "editor_description_changed"]:
		for connection in timer.get_signal_connection_list(signal_name):
			timer.disconnect(signal_name, connection.callable)
	for connection in timer.get_signal_connection_list("tree_exiting"):
		if not connection.callable.is_standard():
			timer.disconnect("tree_exiting", connection.callable)
	editor.save_scene()
	await _wait()
	# Reopen from the saved file: connections are now baseline context of a new take.
	editor.reload_scene_from_path("res://connections.tscn")
	await _wait()
	var reopened := editor.get_edited_scene_root()
	var again = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(again.begin("res://connections-reopen.jsonl", reopened, editor, get_undo_redo()), "reopened take start"):
		return false
	await _pump(again)
	again.stop()
	# Connection limit: going past 256 recorded connections stops with a limited footer.
	var limit_take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(limit_take.begin("res://connections-limit.jsonl", reopened, editor, get_undo_redo()), "connection limit take start"):
		return false
	var limit_hitbox := reopened.get_node("Hitbox")
	var sources: Array[Node] = []
	for i in 256:
		var source := Timer.new()
		source.name = "LimitTimer%d" % i
		reopened.add_child(source)
		source.owner = reopened
		source.connect("timeout", Callable(limit_hitbox, "_on_timeout"), CONNECT_PERSIST)
		sources.append(source)
	var started := Time.get_ticks_usec()
	# Whole snapshot (hierarchy + connection enumeration) at the connection cap.
	limit_take._snapshot()
	print("CONNECTION_ENUMERATION_US ", Time.get_ticks_usec() - started)
	await _pump(limit_take)
	if not _require(not limit_take.active(), "connection limit stopped capture"):
		return false
	for source in sources:
		source.free()
	for name in ["connections.jsonl", "connections-reopen.jsonl"]:
		var text := FileAccess.get_file_as_string("res://" + name)
		for canary in ["BOUND_VALUE_CANARY", "nonpersistent_canary", "UNOWNED_SOURCE_CANARY", "resource_canary", "OUTSIDE_TARGET_CANARY", "PRIVATE_CONNECTION_SCRIPT_CANARY", "Gradient", "child_entered_tree", "_noop_lambda_target", "replacing_by", "editor_description_changed"]:
			if not _require(not text.contains(canary), name + " withholds " + canary):
				return false
	return true

# v6: MeshInstance3D mesh/material-override identity references (no names or contents).
func _probe_meshes(editor: EditorInterface) -> bool:
	editor.open_scene_from_path("res://mesh.tscn")
	await _wait()
	var root := editor.get_edited_scene_root() as Node3D
	if not _require(root != null and root.scene_file_path == "res://mesh.tscn", "mesh scene opened"):
		return false
	var take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(take.begin("res://mesh.jsonl", root, editor, get_undo_redo()), "mesh take start"):
		return false
	var crate := MeshInstance3D.new()
	crate.name = "Crate"
	root.add_child(crate)
	crate.owner = root
	var built_in := BoxMesh.new()
	built_in.resource_name = "PRIVATE_BUILTIN_NAME_CANARY"
	crate.mesh = built_in
	var built_in_material := StandardMaterial3D.new()
	built_in_material.resource_name = "PRIVATE_MATERIAL_NAME_CANARY"
	crate.material_override = built_in_material
	await _pump(take)
	if not _require(take.mark_checkpoint("Built-in mesh", take.active_session_id()), "built-in checkpoint"):
		return false
	# Saving gives built-in resources a res://scene::id path; the reference must not change.
	editor.save_scene()
	await _wait()
	await _pump(take)
	if not _require(take.mark_checkpoint("Saved scene", take.active_session_id()), "saved checkpoint"):
		return false
	editor.edit_node(crate)
	await _wait()
	crate.mesh = load("res://cube.tres")
	crate.material_override = load("res://mat.tres")
	editor.get_inspector().property_edited.emit("mesh")
	await _pump(take)
	if not _require(take.mark_checkpoint("File resources", take.active_session_id()), "file checkpoint"):
		return false
	# v7: an explicit per-surface override, then a 40-surface mesh, then no mesh at all.
	crate.set_surface_override_material(0, load("res://mat.tres"))
	editor.get_inspector().property_edited.emit("surface_material_override/0")
	await _pump(take)
	if not _require(take.mark_checkpoint("Surface override", take.active_session_id()), "surface checkpoint"):
		return false
	crate.mesh = _surface_mesh(40)
	await _pump(take)
	if not _require(take.mark_checkpoint("Forty surfaces", take.active_session_id()), "wide checkpoint"):
		return false
	crate.mesh = null
	await _pump(take)
	if not _require(take.mark_checkpoint("No mesh", take.active_session_id()), "no-mesh checkpoint"):
		return false
	take.stop()
	# The per-snapshot surface entry cap (1,024) stops a take with a valid limited footer.
	var many := Node3D.new()
	many.name = "ManySurfaces"
	root.add_child(many)
	many.owner = root
	var wide := _surface_mesh(32)
	for index in 33:
		var piece := MeshInstance3D.new()
		piece.name = "Piece%d" % index
		many.add_child(piece)
		piece.owner = root
		piece.mesh = wide
	var capped = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(not capped.begin("res://mesh-cap.jsonl", root, editor, get_undo_redo()), "surface cap refuses an oversized start"):
		return false
	many.free()
	var capped_take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(capped_take.begin("res://mesh-cap.jsonl", root, editor, get_undo_redo()), "surface cap take start"):
		return false
	var later := Node3D.new()
	later.name = "LaterSurfaces"
	root.add_child(later)
	later.owner = root
	for index in 33:
		var piece := MeshInstance3D.new()
		piece.name = "Later%d" % index
		later.add_child(piece)
		piece.owner = root
		piece.mesh = wide
	await _pump(capped_take)
	if not _require(not capped_take.active(), "surface cap stopped capture"):
		return false
	later.free()
	var text := FileAccess.get_file_as_string("res://mesh.jsonl")
	for canary in ["PRIVATE_BUILTIN_NAME_CANARY", "PRIVATE_MATERIAL_NAME_CANARY", "PRIVATE_FILE_NAME_CANARY", "mesh.tscn::", "0.123"]:
		if not _require(not text.contains(canary), "mesh journal withholds " + canary):
			return false
	return true

func _surface_mesh(count: int) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	for index in count:
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(0, 0, index), Vector3(1, 0, index), Vector3(0, 1, index)])
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

# v8: Sprite3D texture and AnimatedSprite2D/3D SpriteFrames identity references.
func _probe_sprites(editor: EditorInterface) -> bool:
	editor.open_scene_from_path("res://sprites.tscn")
	await _wait()
	var root := editor.get_edited_scene_root() as Node3D
	if not _require(root != null, "sprites scene opened"):
		return false
	var take = preload("res://addons/openscreen_typing/scene_capture.gd").new()
	if not _require(take.begin("res://sprites.jsonl", root, editor, get_undo_redo()), "sprites take start"):
		return false
	var billboard := Sprite3D.new()
	billboard.name = "Billboard"
	root.add_child(billboard)
	billboard.owner = root
	var walker2d := AnimatedSprite2D.new()
	walker2d.name = "Walker2D"
	root.add_child(walker2d)
	walker2d.owner = root
	var walker3d := AnimatedSprite3D.new()
	walker3d.name = "Walker3D"
	root.add_child(walker3d)
	walker3d.owner = root
	await _pump(take)
	if not _require(take.mark_checkpoint("Empty sprites", take.active_session_id()), "empty sprites checkpoint"):
		return false
	billboard.texture = load("res://slime.svg")
	var frames := SpriteFrames.new()
	frames.add_animation("PRIVATE_ANIM_CANARY")
	walker2d.sprite_frames = frames
	walker2d.animation = "PRIVATE_ANIM_CANARY"
	walker3d.sprite_frames = load("res://walk.tres")
	editor.edit_node(walker3d)
	await _wait()
	editor.get_inspector().property_edited.emit("sprite_frames")
	await _pump(take)
	if not _require(take.mark_checkpoint("Assigned sprites", take.active_session_id()), "assigned checkpoint"):
		return false
	editor.save_scene()
	await _wait()
	await _pump(take)
	if not _require(take.mark_checkpoint("Saved sprites", take.active_session_id()), "saved sprites checkpoint"):
		return false
	walker3d.sprite_frames = null
	await _pump(take)
	if not _require(take.mark_checkpoint("Cleared frames", take.active_session_id()), "cleared checkpoint"):
		return false
	take.stop()
	var text := FileAccess.get_file_as_string("res://sprites.jsonl")
	for canary in ["PRIVATE_ANIM_CANARY", "PRIVATE_FRAMES_FILE_CANARY", "sprites.tscn::", "autoplay"]:
		if not _require(not text.contains(canary), "sprite journal withholds " + canary):
			return false
	return true
