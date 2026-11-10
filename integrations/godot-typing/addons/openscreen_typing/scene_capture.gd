@tool
extends RefCounted

# Independent, explicitly started journal. Never watches files or enumerates properties.
signal status_changed(message: String)
const MAX_NODES := 512
const MAX_RECORDS := 4096
const MAX_BYTES := 8 * 1024 * 1024
const INTERVAL_MS := 250
var _file: FileAccess
var _root: Node
var _editor: EditorInterface
var _started := 0
var _last_poll := 0
var _sequence := 0
var _session := ""
var _instance := Crypto.new().generate_random_bytes(16).hex_encode()
var _previous := ""
var _limited := false

func active() -> bool:
	return _file != null

func begin(path: String, root: Node, editor: EditorInterface) -> bool:
	if active() or not is_instance_valid(root) or editor.get_edited_scene_root() != root:
		status_changed.emit("Scene capture off · choose the current scene again")
		return false
	if FileAccess.file_exists(path):
		status_changed.emit("Scene capture off · choose a new journal file")
		return false
	_root = root
	_editor = editor
	_limited = false
	var state := _snapshot()
	if _limited:
		_root = null
		_editor = null
		status_changed.emit("Scene capture off · scene exceeds supported bounds")
		return false
	_file = FileAccess.open(path, FileAccess.WRITE)
	if _file == null:
		_root = null
		_editor = null
		status_changed.emit("Scene capture off · could not open journal")
		return false
	_started = Time.get_ticks_msec()
	_last_poll = _started
	_sequence = 0
	_session = "godot-scene-" + Crypto.new().generate_random_bytes(16).hex_encode()
	_previous = JSON.stringify(state)
	_write({"event": "scene-start", "producer": "godot-scene", "scene": _resource_path(root.scene_file_path), "state": state, "intervalMs": INTERVAL_MS})
	if active():
		status_changed.emit("Scene capture on · sampled every 250 ms · " + path.get_file())
	return active()

func poll() -> void:
	if not active():
		return
	if not is_instance_valid(_root) or _editor.get_edited_scene_root() != _root:
		stop("scene-changed", false)
		return
	var now := Time.get_ticks_msec()
	if now - _started >= 86400000:
		_limited = true
		stop("limit", false)
	elif now - _last_poll >= INTERVAL_MS:
		_last_poll = now
		_sample()

func scene_changed(root: Node) -> void:
	if active() and root != _root:
		stop("scene-changed", false)

func saved(path: String) -> void:
	if active() and is_instance_valid(_root) and _editor.get_edited_scene_root() == _root and _root.scene_file_path == path:
		_sample()
		_write({"event": "scene-saved", "scene": _resource_path(path)})

func stop(reason: String = "user-stop", final_sample: bool = true) -> void:
	if not active():
		return
	if final_sample and is_instance_valid(_root) and _editor.get_edited_scene_root() == _root:
		_sample()
	if active():
		_write({"event": "scene-stop", "reason": reason, "coverage": "limited" if _limited else "sampled"})
		# A footer write error already emits failure; never replace it with Saved.
		if active():
			_file = null
			status_changed.emit("Scene journal limited · stopped" if _limited else "Scene journal saved · sampled observations")
	_root = null
	_editor = null
	_previous = ""

func _sample() -> void:
	var state := _snapshot()
	if _limited:
		stop("limit", false)
		return
	var serialized := JSON.stringify(state)
	if serialized != _previous:
		_previous = serialized
		_write({"event": "scene-state", "state": state})

func _snapshot() -> Dictionary:
	var nodes: Array = []
	_collect(_root, "", 0, nodes)
	var selected: Array[String] = []
	var allowed := {}
	for node in nodes:
		allowed[node.id] = true
	for node in _editor.get_selection().get_selected_nodes():
		var identity := str(node.get_instance_id())
		if allowed.has(identity):
			selected.append(identity)
	selected.sort()
	return {"nodes": nodes, "selected": selected}

func _collect(node: Node, parent: String, depth: int, nodes: Array) -> void:
	if _limited or (node != _root and node.owner != _root):
		return
	if depth > 64 or nodes.size() >= MAX_NODES or str(node.name).to_utf16_buffer().size() > 400:
		_limited = true
		return
	var identity := str(node.get_instance_id())
	var properties := {}
	if node is Node2D:
		var target := node as Node2D
		if not target.position.is_finite() or not target.scale.is_finite() or not is_finite(target.rotation):
			_limited = true
			return
		properties = {"position": [target.position.x, target.position.y], "rotation": target.rotation, "scale": [target.scale.x, target.scale.y], "visible": target.visible}
	if node is Sprite2D:
		properties["texture"] = _resource(node.texture)
	properties["script"] = _resource(node.get_script())
	nodes.append({"id": identity, "parent": parent, "name": str(node.name), "type": node.get_class(), "properties": properties})
	for child in node.get_children():
		_collect(child, identity, depth + 1, nodes)

func _resource(resource: Resource) -> Variant:
	return _resource_path(resource.resource_path) if resource else null

func _resource_path(path: String) -> String:
	if path.is_empty():
		return "built-in-or-unsaved"
	# No absolute/external paths, resource bytes or script text enter this journal.
	if not path.begins_with("res://") or path.to_utf16_buffer().size() > 2000 or ".." in path.trim_prefix("res://").split("/") or "\\" in path or "." in path.trim_prefix("res://").split("/") or _has_control(path):
		return "external-or-unsupported"
	return path

func _has_control(text: String) -> bool:
	for i in range(text.length()):
		var code := text.unicode_at(i)
		if code < 32 or (code >= 127 and code <= 159):
			return true
	return false

func _write(payload: Dictionary) -> void:
	if not active():
		return
	payload["schemaVersion"] = 1
	payload["sessionId"] = _session
	payload["instanceId"] = _instance
	payload["sequence"] = _sequence
	payload["atMs"] = 0 if _sequence == 0 else mini(Time.get_ticks_msec() - _started, 86400000)
	var line := JSON.stringify(payload)
	if payload.event != "scene-stop" and (_sequence >= MAX_RECORDS - 1 or _file.get_position() + line.to_utf8_buffer().size() + 1 > MAX_BYTES - 1024):
		_limited = true
		stop("limit", false)
		return
	_file.store_line(line)
	_file.flush()
	_sequence += 1
	if _file.get_error() != OK:
		_file = null
		_root = null
		_editor = null
		_previous = ""
		status_changed.emit("Scene journal write failed · stopped · incomplete file")
