@tool
extends RefCounted

# Independent, explicitly started journal. Never watches files or enumerates properties.
signal status_changed(message: String)
const MAX_NODES := 512
const MAX_CONNECTIONS := 256
const MAX_SURFACES_PER_NODE := 32
const MAX_SURFACE_ENTRIES := 1024
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
var _pending_trigger := ""
var _scene_tree: SceneTree
var _last_snapshot_sequence := 0
var _last_snapshot_node_count := 0
# v4 editor context: the chosen scene's own undo history and polled run state only.
var _history: UndoRedo
var _history_manager: EditorUndoRedoManager
var _history_key := ""
var _run_key := ""
var _surface_entries := 0
var _identifier_pattern := RegEx.create_from_string("^[A-Za-z_][A-Za-z0-9_]*$")

func active() -> bool:
	return _file != null

func active_session_id() -> String:
	return _session if active() else ""

func mark_checkpoint(label: String, expected_session_id: String) -> bool:
	if not active() or expected_session_id.is_empty() or expected_session_id != _session:
		return false
	if not is_instance_valid(_root) or not is_instance_valid(_editor):
		stop("scene-changed", false)
		return false
	if _editor.get_edited_scene_root() != _root:
		stop("scene-changed", false)
		return false
	if not _has_label_content(label) or label.to_utf16_buffer().size() / 2 > 200 or _has_control(label):
		return false
	# Sample synchronously first. A limit or write error can stop the take, so
	# the authored marker is written only after that sample succeeds.
	_sample("checkpoint")
	if not active() or expected_session_id != _session:
		return false
	if not is_instance_valid(_root) or not is_instance_valid(_editor) or _editor.get_edited_scene_root() != _root:
		stop("scene-changed", false)
		return false
	var snapshot_sequence := _last_snapshot_sequence
	var node_count := _last_snapshot_node_count
	if _limited or node_count < 1:
		return false
	return _write({"event": "scene-checkpoint", "label": label, "labelProvenance": "authored", "nodeCount": node_count, "snapshotSequence": snapshot_sequence})

func begin(path: String, root: Node, editor: EditorInterface, history_manager: EditorUndoRedoManager = null) -> bool:
	if active() or not is_instance_valid(root) or editor.get_edited_scene_root() != root:
		status_changed.emit("Scene capture off · choose the current scene again")
		return false
	if FileAccess.file_exists(path):
		status_changed.emit("Scene capture off · choose a new journal file")
		return false
	_root = root
	_editor = editor
	_limited = false
	_history = null
	_history_manager = history_manager
	if is_instance_valid(history_manager):
		var history_id := history_manager.get_object_history_id(root)
		# Never fall back to the global history (id 0) or another scene's history.
		if history_id > 0:
			_history = history_manager.get_history_undo_redo(history_id)
	var state := _snapshot()
	if _limited:
		_root = null
		_editor = null
		_history = null
		_history_manager = null
		status_changed.emit("Scene capture off · scene exceeds supported bounds")
		return false
	_file = FileAccess.open(path, FileAccess.WRITE)
	if _file == null:
		_root = null
		_editor = null
		_history = null
		_history_manager = null
		status_changed.emit("Scene capture off · could not open journal")
		return false
	_started = Time.get_ticks_msec()
	_last_poll = _started
	_sequence = 0
	_session = "godot-scene-" + Crypto.new().generate_random_bytes(16).hex_encode()
	_previous = JSON.stringify(state)
	_last_snapshot_sequence = 0
	_last_snapshot_node_count = state.nodes.size()
	_pending_trigger = ""
	var history := _history_state()
	var run := _run_state()
	_history_key = JSON.stringify(history)
	_run_key = JSON.stringify(run)
	_write({"event": "scene-start", "producer": "godot-scene", "scene": _resource_path(root.scene_file_path), "state": state, "intervalMs": INTERVAL_MS, "history": history, "run": run})
	if active():
		_connect_observers()
		status_changed.emit("Scene capture on · signals + 250 ms polling · " + path.get_file())
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
	elif (not _pending_trigger.is_empty() and now - _last_poll >= 50) or now - _last_poll >= INTERVAL_MS:
		var trigger := _pending_trigger if not _pending_trigger.is_empty() else "poll"
		_pending_trigger = ""
		_last_poll = now
		# One check per sampling turn: signals only request it, so a single editor
		# transition is never written twice.
		if _observe_context():
			trigger = "history"
		if active():
			_sample(trigger)

func scene_changed(root: Node) -> void:
	if active() and root != _root:
		stop("scene-changed", false)

func saved(path: String) -> void:
	if active() and is_instance_valid(_root) and _editor.get_edited_scene_root() == _root and _root.scene_file_path == path:
		_sample("save")
		_write({"event": "scene-saved", "scene": _resource_path(path)})

func stop(reason: String = "user-stop", final_sample: bool = true) -> void:
	if not active():
		return
	_disconnect_observers()
	if final_sample and is_instance_valid(_root) and _editor.get_edited_scene_root() == _root:
		_observe_context()
		if active():
			_sample("stop")
	if active():
		_write({"event": "scene-stop", "reason": reason, "coverage": "limited" if _limited else "sampled"})
		# A footer write error already emits failure; never replace it with Saved.
		if active():
			_file = null
			status_changed.emit("Scene journal limited · stopped" if _limited else "Scene journal saved · sampled observations")
	_root = null
	_editor = null
	_history = null
	_history_manager = null
	_previous = ""

func _sample(trigger: String = "poll") -> void:
	var state := _snapshot()
	if _limited:
		stop("limit", false)
		return
	var serialized := JSON.stringify(state)
	if serialized != _previous:
		_previous = serialized
		var snapshot_sequence := _sequence
		if _write({"event": "scene-state", "state": state, "trigger": trigger}):
			_last_snapshot_sequence = snapshot_sequence
			_last_snapshot_node_count = state.nodes.size()

func _connect_observers() -> void:
	_editor.get_selection().selection_changed.connect(_selection_changed)
	_editor.get_inspector().property_edited.connect(_property_edited)
	_scene_tree = _root.get_tree()
	_scene_tree.tree_changed.connect(_tree_changed)
	if is_instance_valid(_history_manager):
		_history_manager.history_changed.connect(_history_changed)
	if is_instance_valid(_history):
		_history.version_changed.connect(_history_changed)

func _disconnect_observers() -> void:
	if is_instance_valid(_editor):
		var selection := _editor.get_selection()
		if selection.selection_changed.is_connected(_selection_changed):
			selection.selection_changed.disconnect(_selection_changed)
		var inspector := _editor.get_inspector()
		if inspector.property_edited.is_connected(_property_edited):
			inspector.property_edited.disconnect(_property_edited)
	if is_instance_valid(_scene_tree) and _scene_tree.tree_changed.is_connected(_tree_changed):
		_scene_tree.tree_changed.disconnect(_tree_changed)
	if is_instance_valid(_history_manager) and _history_manager.history_changed.is_connected(_history_changed):
		_history_manager.history_changed.disconnect(_history_changed)
	if is_instance_valid(_history) and _history.version_changed.is_connected(_history_changed):
		_history.version_changed.disconnect(_history_changed)
	_scene_tree = null
	_pending_trigger = ""

func _selection_changed() -> void:
	if active():
		_pending_trigger = "selection"

func _history_changed() -> void:
	if active():
		_pending_trigger = "history"

# Number of connected observer callbacks; used only by the disposable probe.
func connected_observer_count() -> int:
	var count := 0
	if is_instance_valid(_editor):
		count += int(_editor.get_selection().selection_changed.is_connected(_selection_changed))
		count += int(_editor.get_inspector().property_edited.is_connected(_property_edited))
	if is_instance_valid(_scene_tree):
		count += int(_scene_tree.tree_changed.is_connected(_tree_changed))
	if is_instance_valid(_history_manager):
		count += int(_history_manager.history_changed.is_connected(_history_changed))
	if is_instance_valid(_history):
		count += int(_history.version_changed.is_connected(_history_changed))
	return count

# Writes changed history/run context. Returns true when a history record was written.
func _observe_context() -> bool:
	var wrote_history := false
	var history := _history_state()
	var key := JSON.stringify(history)
	if key != _history_key:
		_history_key = key
		if not _write({"event": "scene-history", "history": history}):
			return false
		wrote_history = true
	var run := _run_state()
	key = JSON.stringify(run)
	if key != _run_key:
		_run_key = key
		if not _write({"event": "scene-run", "run": run}):
			return false
	return wrote_history

func _history_state() -> Dictionary:
	if not is_instance_valid(_history):
		return {"available": false}
	var action: Variant = null
	if _history.get_current_action() >= 0:
		action = _history_label(_history.get_current_action_name())
	return {"available": true, "version": clampi(_history.get_version(), 0, 2147483647), "actionIndex": clampi(_history.get_current_action(), -1, 1000000), "action": action}

# Editor action names can embed node names or plugin text. Bound them; never
# record oversized or control-bearing labels.
func _history_label(name: String) -> String:
	if not _has_label_content(name) or name.to_utf16_buffer().size() / 2 > 200 or _has_control(name):
		return "unsupported-action-name"
	return name

func _run_state() -> Dictionary:
	if not is_instance_valid(_editor) or not _editor.is_playing_scene():
		return {"state": "stopped"}
	var playing := _editor.get_playing_scene()
	# The grant covers the chosen scene only: another scene's path is withheld.
	if is_instance_valid(_root) and not _root.scene_file_path.is_empty() and playing == _root.scene_file_path:
		return {"state": "playing", "scope": "current-scene", "scene": _resource_path(playing)}
	return {"state": "playing", "scope": "other-scene"}

func _tree_changed() -> void:
	if active() and _pending_trigger.is_empty():
		_pending_trigger = "tree"

func _property_edited(property: String) -> void:
	if not active() or not is_instance_valid(_root):
		return
	var target := _editor.get_inspector().get_edited_object()
	if not target is Node or (target != _root and (target.owner != _root or not _root.is_ancestor_of(target))):
		return
	if property == "script" or (target is Node2D and property in ["position", "rotation", "scale", "visible"]) or (target is Node3D and property in ["position", "rotation", "scale", "visible"]) or (target is Sprite2D and property == "texture") or (target is MeshInstance3D and (property in ["mesh", "material_override"] or property.begins_with("surface_material_override/"))):
		_pending_trigger = "inspector"

func _snapshot() -> Dictionary:
	_surface_entries = 0
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
	var excluded := [0]
	var connections := _connections(nodes, allowed, excluded)
	return {"nodes": nodes, "selected": selected, "connections": connections, "excludedConnections": mini(excluded[0], 1000000)}

# v5: persistent (scene-saved) signal connections whose source and target are both
# observed nodes and whose target is a plain method on that node. Editor-internal,
# lambda/custom callables and connections from outside the owned set are excluded.
# Bound argument values are never recorded; only their count. Persistent connections
# into an observed node that are not recorded (source outside the observed set, custom
# or lambda callable, unsupported names) are counted in `excluded`, never described.
func _connections(nodes: Array, allowed: Dictionary, excluded: Array) -> Array:
	var connections: Array = []
	for node in nodes:
		if _limited:
			break
		var target := instance_from_id(int(node.id)) as Node
		if not is_instance_valid(target):
			continue
		for connection in target.get_incoming_connections():
			if (connection.flags & CONNECT_PERSIST) == 0:
				continue
			var source := connection.signal.get_object() as Node
			var callable: Callable = connection.callable
			if not is_instance_valid(source) or not allowed.has(str(source.get_instance_id())) or callable.get_object() != target or not _method_callable(callable, target):
				excluded[0] += 1
				continue
			var signal_name := str(connection.signal.get_name())
			var method := str(callable.get_method())
			if not _identifier(signal_name) or not _identifier(method):
				excluded[0] += 1
				continue
			if connections.size() >= MAX_CONNECTIONS:
				_limited = true
				break
			connections.append({
				"signal": signal_name,
				"from": str(source.get_instance_id()),
				"to": node.id,
				"method": method,
				"boundArgs": clampi(callable.get_bound_arguments_count(), 0, 64),
				"deferred": (connection.flags & CONNECT_DEFERRED) != 0,
				"oneShot": (connection.flags & CONNECT_ONE_SHOT) != 0,
			})
	# Sort once by precomputed keys; re-serializing inside the comparator cost ~400 ms at the cap.
	var keyed: Array = []
	for connection in connections:
		keyed.append([JSON.stringify(connection), connection])
	keyed.sort_custom(func(a, b): return a[0] < b[0])
	var sorted: Array = []
	for entry in keyed:
		sorted.append(entry[1])
	return sorted

# A plain method callable, or a bind wrapper around exactly that method. Godot reports
# binds, unbinds and lambdas all as custom callables, so a custom callable is accepted only
# when it equals Callable(target, method) with the same binds and nothing unbound. The
# bound values are held only for that in-memory comparison: never serialized or invoked.
func _method_callable(callable: Callable, target: Node) -> bool:
	if callable.is_standard():
		return true
	if callable.get_bound_arguments_count() < 1 or callable.get_unbound_arguments_count() != 0:
		return false
	return callable == Callable(target, callable.get_method()).bindv(callable.get_bound_arguments())

func _identifier(text: String) -> bool:
	if text.is_empty() or text.length() > 100:
		return false
	return _identifier_pattern.search(text) != null

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
	elif node is Node3D:
		var target := node as Node3D
		if not target.position.is_finite() or not target.rotation.is_finite() or not target.scale.is_finite():
			_limited = true
			return
		properties = {
			"position3": [target.position.x, target.position.y, target.position.z],
			"rotation3": [target.rotation.x, target.rotation.y, target.rotation.z],
			"scale3": [target.scale.x, target.scale.y, target.scale.z],
			"visible": target.visible,
		}
	if node is Sprite2D:
		properties["texture"] = _resource(node.texture)
	if node is MeshInstance3D:
		# v6: identity references only — engine class name plus a res:// path for resources
		# saved as their own files. Built-in resources (embedded, unsaved, or sub-resources of
		# another file such as an imported .glb) get a fixed marker,
		# because their path changes from "" to "res://scene::id" merely by saving the scene.
		properties["mesh"] = _identity_ref(node.mesh)
		properties["materialOverride"] = _identity_ref(node.material_override)
		properties["surfaceOverrides"] = _surface_overrides(node)
	properties["script"] = _resource(node.get_script())
	nodes.append({"id": identity, "parent": parent, "name": str(node.name), "type": node.get_class(), "properties": properties})
	for child in node.get_children():
		_collect(child, identity, depth + 1, nodes)

# v7: explicit per-surface material overrides by surface index, identity references only.
# Without a mesh there is no surface to describe: Godot keeps the last override array then,
# but it is not applied, so it is reported as null (not applicable) rather than as data.
func _surface_overrides(node: MeshInstance3D) -> Variant:
	if node.mesh == null:
		return null
	var count := clampi(node.mesh.get_surface_count(), 0, 256)
	if node.get_surface_override_material_count() != count:
		return "unavailable"
	var shown := mini(count, MAX_SURFACES_PER_NODE)
	_surface_entries += shown
	if _surface_entries > MAX_SURFACE_ENTRIES:
		_limited = true
		return "unavailable"
	var overrides: Array = []
	for index in shown:
		overrides.append(_identity_ref(node.get_surface_override_material(index)))
	return {"count": count, "overrides": overrides, "truncated": count > shown}

func _identity_ref(resource: Resource) -> Variant:
	if resource == null:
		return null
	var type := resource.get_class()
	if not _identifier(type):
		type = "unsupported-type"
	if resource.is_built_in() or resource.resource_path.is_empty():
		return {"type": type, "path": "built-in-or-unsaved"}
	return {"type": type, "path": _resource_path(resource.resource_path)}

func _resource(resource: Resource) -> Variant:
	return _resource_path(resource.resource_path) if resource else null

func _resource_path(path: String) -> String:
	if path.is_empty():
		return "built-in-or-unsaved"
	# No absolute/external paths, resource bytes or script text enter this journal.
	if not path.begins_with("res://") or path.to_utf16_buffer().size() > 2000 or ".." in path.trim_prefix("res://").split("/") or "\\" in path or "." in path.trim_prefix("res://").split("/") or _has_control(path):
		return "external-or-unsupported"
	return path

# Match ECMAScript String.trim(), used by the offline decoder. Godot strip_edges()
# only trims ASCII whitespace and would accept Unicode-only blank labels.
func _has_label_content(text: String) -> bool:
	for i in range(text.length()):
		var code := text.unicode_at(i)
		if code in [9, 10, 11, 12, 13, 32, 160, 5760, 8232, 8233, 8239, 8287, 12288, 65279] or (code >= 8192 and code <= 8202):
			continue
		return true
	return false

func _has_control(text: String) -> bool:
	for i in range(text.length()):
		var code := text.unicode_at(i)
		if code < 32 or (code >= 127 and code <= 159):
			return true
	return false

func _write(payload: Dictionary) -> bool:
	if not active():
		return false
	payload["schemaVersion"] = 7
	payload["sessionId"] = _session
	payload["instanceId"] = _instance
	payload["sequence"] = _sequence
	payload["atMs"] = 0 if _sequence == 0 else mini(Time.get_ticks_msec() - _started, 86400000)
	var line := JSON.stringify(payload)
	if payload.event != "scene-stop" and (_sequence >= MAX_RECORDS - 1 or _file.get_position() + line.to_utf8_buffer().size() + 1 > MAX_BYTES - 1024):
		_limited = true
		stop("limit", false)
		return false
	_file.store_line(line)
	_file.flush()
	_sequence += 1
	if _file.get_error() != OK:
		_disconnect_observers()
		_file = null
		_root = null
		_editor = null
		_history = null
		_history_manager = null
		_previous = ""
		status_changed.emit("Scene journal write failed · stopped · incomplete file")
		return false
	return true
