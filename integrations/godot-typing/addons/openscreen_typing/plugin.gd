@tool
extends EditorPlugin

const Observer = preload("observer.gd")
const ClockClient = preload("clock_client.gd")
const SceneCapture = preload("scene_capture.gd")
var _scene_capture: SceneCapture
var _scene_button: Button
var _scene_status: Label
var _checkpoint_button: Button
var _checkpoint_dialog: AcceptDialog
var _checkpoint_label: LineEdit
var _checkpoint_session := ""
var _scene_picker: FileDialog
var _scene_confirm: ConfirmationDialog
var _pending_scene: Node
var _clock_client: ClockClient
var _clock_button: Button
var _clock_status: Label
var _clock_picker: FileDialog
var _clock_journal_picker: FileDialog
var _clock_save: Button
var _clock_journal_status := ""
var _clock_dialog: AcceptDialog
var _clock_entry: Button
var _clock_controls: VBoxContainer
const MAX_BYTES := 8 * 1024 * 1024
var _observer: Observer
var _file: FileAccess
var _button: Button
var _status: Label
var _picker: FileDialog
var _bar: HBoxContainer
var _session_id := ""
var _sequence := 0
var _started_ms := 0
var _path := ""
var _limited := false

func _enter_tree() -> void:
	name = "OpenScreenTypingCapture"
	_bar = HBoxContainer.new()
	_button = Button.new()
	_button.text = "Capture typing"
	_button.tooltip_text = "Capture the current unsaved script's text changes. Other scripts and applications are not recorded."
	_button.pressed.connect(_toggle)
	_bar.add_child(_button)
	_status = Label.new()
	_status.text = "Typing capture off"
	_bar.add_child(_status)
	add_control_to_container(CONTAINER_TOOLBAR, _bar)
	_clock_client = ClockClient.new()
	add_child(_clock_client)
	_clock_dialog = AcceptDialog.new()
	_clock_dialog.title = "Read-only recording clock"
	_clock_dialog.min_size = Vector2i(600, 300)
	get_editor_interface().get_base_control().add_child(_clock_dialog)
	_clock_controls = VBoxContainer.new()
	_clock_dialog.add_child(_clock_controls)
	_clock_controls.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_clock_controls.offset_left = 16
	_clock_controls.offset_top = 16
	_clock_controls.offset_right = -16
	_clock_controls.offset_bottom = -56
	var explanation := Label.new()
	explanation.text = "Explicit project pairing shares clock metadata only. Pause status is delayed and does not pause typing capture. Disconnect or wait for expiry to stop the link."
	explanation.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_clock_controls.add_child(explanation)
	_clock_entry = Button.new()
	_clock_entry.text = "Recording clock…"
	_clock_entry.tooltip_text = "Read-only clock pairing, pause status and sample export"
	_clock_entry.pressed.connect(func(): _clock_dialog.popup_centered(Vector2i(640, 320)))
	_bar.add_child(_clock_entry)
	_clock_button = Button.new()
	_clock_button.text = "Connect recording clock"
	_clock_button.tooltip_text = "Read-only clock and pause status for an explicitly paired project. Shares no text or editor state."
	_clock_button.pressed.connect(_toggle_clock)
	_clock_controls.add_child(_clock_button)
	_clock_status = Label.new()
	_clock_status.text = "Recording clock off"
	_clock_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_clock_controls.add_child(_clock_status)
	_clock_save = Button.new()
	_clock_save.text = "Save clock samples"
	_clock_save.pressed.connect(func():
		if _clock_client.is_journal_open():
			_clock_client.stop_journal("user-stop")
		elif _clock_client.active:
			_clock_journal_picker.popup_centered_ratio(0.65)
	)
	_clock_controls.add_child(_clock_save)
	_clock_client.status_changed.connect(func(state: String):
		if not is_instance_valid(_clock_status) or not is_instance_valid(_clock_button):
			return
		_clock_status.text = "Recording clock: " + state + " · delayed status, not typing sync" + _clock_journal_status
		_clock_button.text = "Disconnect recording clock" if _clock_client.active else "Connect recording clock"
		if is_instance_valid(_clock_entry):
			_clock_entry.text = "Clock: " + state
	)
	_clock_client.journal_changed.connect(func(state: String):
		if not is_instance_valid(_clock_status) or not is_instance_valid(_clock_save):
			return
		_clock_journal_status = " · sample file: " + state
		_clock_save.text = "Stop saving clock samples" if _clock_client.is_journal_open() else "Save clock samples"
		if is_instance_valid(_clock_entry):
			_clock_entry.text = "Clock: " + _clock_client.clock_state() + (" · saving" if _clock_client.is_journal_open() else "")
		_clock_status.text = "Recording clock: " + _clock_client.clock_state() + " · delayed status, not typing sync" + _clock_journal_status
	)
	_clock_picker = FileDialog.new()
	_clock_picker.access = FileDialog.ACCESS_FILESYSTEM
	_clock_picker.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_clock_picker.add_filter("*.json", "Private OpenScreen clock link")
	_clock_picker.title = "Connect read-only recording clock for this project"
	_clock_picker.file_selected.connect(func(file_path: String): _clock_client.connect_file(file_path))
	get_editor_interface().get_base_control().add_child(_clock_picker)
	_clock_journal_picker = FileDialog.new()
	_clock_journal_picker.access = FileDialog.ACCESS_FILESYSTEM
	_clock_journal_picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_clock_journal_picker.add_filter("*.jsonl", "OpenScreen clock sample evidence")
	_clock_journal_picker.title = "Save clock samples to a new file"
	_clock_journal_picker.file_selected.connect(func(file_path: String):
		if not _clock_client.start_journal(file_path):
			_clock_status.text = "Choose a new clock journal path while connected"
	)
	get_editor_interface().get_base_control().add_child(_clock_journal_picker)
	_picker = FileDialog.new()
	_picker.access = FileDialog.ACCESS_FILESYSTEM
	_picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_picker.add_filter("*.jsonl", "OpenScreen typing journal")
	_picker.title = "Save typing capture journal"
	_picker.file_selected.connect(_begin_capture)
	get_editor_interface().get_base_control().add_child(_picker)
	_scene_capture = SceneCapture.new()
	_scene_button = Button.new()
	_scene_button.text = "Capture scene actions"
	_scene_button.pressed.connect(func():
		if _scene_capture.active():
			_scene_capture.stop()
		else:
			_pending_scene = get_editor_interface().get_edited_scene_root()
			if not is_instance_valid(_pending_scene):
				_scene_status.text = "Open a scene first"
				return
			_scene_confirm.dialog_text = "Capture the current scene: %s\n\nRecords node names/types, hierarchy, selection, Node2D and Node3D position/rotation/scale/visibility, and script/Sprite2D texture resource paths. No resource contents or other scenes. Uses editor signals plus 250 ms polling; rapid changes may be missed. Stops when you switch scenes. Independent clock, no video sync. Also records this scene's own editor undo-history position and action names (labels such as \"Rename Node\" may contain node names; global and other-scene history are excluded), and whether the editor reports a run of this scene (another scene's run is recorded without its path; run results, output and errors are not captured). Records Sprite3D texture and AnimatedSprite2D/3D SpriteFrames references (no animation names, frames, pixels or playback state), and MeshInstance3D mesh, material-override and per-surface override references, by surface index and at most 32 surfaces per node (engine class name, plus the res:// path only when the resource is saved as its own file; built-in resources and sub-resources of other files, such as meshes inside imported .glb scenes, are only marked built-in; no resource names or contents). Records saved signal connections between nodes of this scene (signal, source, target and method names, and how many arguments are bound, never their values). You may also add authored checkpoint labels; labels are your annotations, not automatic milestones or proof of a saved/running project.\n\nContinue to choose a new journal file." % _pending_scene.name
			_scene_confirm.popup_centered(Vector2i(640, 420))
	)
	_bar.add_child(_scene_button)
	_checkpoint_button = Button.new()
	_checkpoint_button.text = "Mark scene checkpoint"
	_checkpoint_button.disabled = true
	_checkpoint_button.tooltip_text = "Add an authored label to the active scene observation take"
	_checkpoint_button.pressed.connect(func():
		_checkpoint_session = _scene_capture.active_session_id()
		if _checkpoint_session.is_empty():
			return
		_checkpoint_label.text = ""
		_checkpoint_dialog.popup_centered(Vector2i(480, 150))
		_checkpoint_label.grab_focus()
	)
	_bar.add_child(_checkpoint_button)
	_checkpoint_dialog = AcceptDialog.new()
	_checkpoint_dialog.title = "Mark authored scene checkpoint"
	_checkpoint_dialog.confirmed.connect(func():
		var marked := _scene_capture.mark_checkpoint(_checkpoint_label.text, _checkpoint_session)
		_scene_status.text = "Authored checkpoint saved" if marked else "Checkpoint not saved · take changed or journal stopped"
		_checkpoint_session = ""
	)
	_checkpoint_dialog.canceled.connect(func(): _checkpoint_session = "")
	get_editor_interface().get_base_control().add_child(_checkpoint_dialog)
	_checkpoint_label = LineEdit.new()
	_checkpoint_label.placeholder_text = "Short checkpoint label"
	_checkpoint_label.max_length = 200
	_checkpoint_dialog.add_child(_checkpoint_label)
	_scene_status = Label.new()
	_scene_status.text = "Scene capture off"
	_scene_status.clip_text = true
	_scene_status.custom_minimum_size.x = 180
	_bar.add_child(_scene_status)
	_scene_capture.status_changed.connect(func(message: String):
		_scene_status.text = message
		_scene_status.tooltip_text = message
		_scene_button.text = "Stop scene capture" if _scene_capture.active() else "Capture scene actions"
		_checkpoint_button.disabled = not _scene_capture.active()
		if not _scene_capture.active():
			_checkpoint_session = ""
			_checkpoint_dialog.hide()
	)
	_scene_confirm = ConfirmationDialog.new()
	_scene_confirm.title = "Allow scene observations for this take"
	# The consent text is long; wrap it inside the fixed popup width.
	_scene_confirm.dialog_autowrap = true
	_scene_confirm.confirmed.connect(func():
		_scene_picker.current_file = "scene-%d.jsonl" % Time.get_unix_time_from_system()
		_scene_picker.popup_centered_ratio(0.65)
	)
	get_editor_interface().get_base_control().add_child(_scene_confirm)
	_scene_picker = FileDialog.new()
	_scene_picker.access = FileDialog.ACCESS_FILESYSTEM
	_scene_picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_scene_picker.add_filter("*.jsonl", "OpenScreen scene observations")
	_scene_picker.title = "Save scene observations to a new journal"
	_scene_picker.file_selected.connect(func(path: String):
		if is_instance_valid(_pending_scene):
			_scene_capture.begin(path, _pending_scene, get_editor_interface(), get_undo_redo())
		else:
			_scene_status.text = "Scene capture off · choose the current scene again"
		_pending_scene = null
	)
	get_editor_interface().get_base_control().add_child(_scene_picker)
	scene_saved.connect(_scene_capture.saved)
	scene_changed.connect(_scene_capture.scene_changed)

func _exit_tree() -> void:
	_stop_capture()
	if _scene_capture:
		_scene_capture.stop("plugin-disabled")
	if is_instance_valid(_scene_picker):
		_scene_picker.queue_free()
	if is_instance_valid(_scene_confirm):
		_scene_confirm.queue_free()
	if is_instance_valid(_checkpoint_dialog):
		_checkpoint_dialog.queue_free()
	if is_instance_valid(_clock_client):
		_clock_client.disconnect_clock()
		_clock_client.queue_free()
	if is_instance_valid(_clock_dialog):
		_clock_dialog.queue_free()
	if is_instance_valid(_clock_picker):
		_clock_picker.queue_free()
	if is_instance_valid(_clock_journal_picker):
		_clock_journal_picker.queue_free()
	remove_control_from_container(CONTAINER_TOOLBAR, _bar)
	_bar.queue_free()
	_picker.queue_free()

func _toggle() -> void:
	if _file:
		_stop_capture()
	else:
		_picker.current_file = "typing-%d.jsonl" % Time.get_unix_time_from_system()
		_picker.popup_centered_ratio(0.65)

func _current_editor() -> CodeEdit:
	var current := get_editor_interface().get_script_editor().get_current_editor()
	return current.get_base_editor() as CodeEdit if current else null

# Also callable by the disposable editor integration probe, without an OS file picker.
func _begin_capture(file_path: String) -> void:
	if _file:
		return
	var target := _current_editor()
	var script := get_editor_interface().get_script_editor().get_current_script()
	if target == null or script == null or target.text.to_utf16_buffer().size() > 400000:
		_status.text = "Open a script under 200,000 characters first"
		return
	_file = FileAccess.open(file_path, FileAccess.WRITE)
	if _file == null:
		_status.text = "Could not open typing journal"
		return
	_path = file_path
	_sequence = 0
	_started_ms = Time.get_ticks_msec()
	_limited = false
	_session_id = "godot-%d-%d" % [Time.get_unix_time_from_system() * 1000, _started_ms]
	_write({"event": "typing-start", "producer": "godot-codeedit", "initialText": target.text, "documentName": script.resource_path if not script.resource_path.is_empty() else "Unsaved script", "startedAt": Time.get_datetime_string_from_system(true) + "Z", "offsetEncoding": "unicode-code-points"})
	_observer = Observer.new()
	_observer.begin(target, _write)
	_button.text = "Stop typing capture"
	_status.text = "Capturing current script · " + file_path.get_file()

func _process(_delta: float) -> void:
	if _scene_capture:
		_scene_capture.poll()
	if _file and _observer and _current_editor() != _observer.editor:
		_stop_capture()

func _write(payload: Dictionary) -> void:
	if _file == null:
		return
	if _limited and payload.event != "typing-stop":
		return
	if payload.has("text") and payload.text.to_utf16_buffer().size() > 400000:
		_limited = true
		call_deferred("_stop_capture")
		return
	var elapsed := Time.get_ticks_msec() - _started_ms
	if elapsed > 86400000 and payload.event != "typing-stop":
		_limited = true
		call_deferred("_stop_capture")
		return
	payload["schemaVersion"] = 1
	payload["sessionId"] = _session_id
	payload["sequence"] = _sequence
	payload["atMs"] = 0 if _sequence == 0 else mini(elapsed, 86400000)
	var line := JSON.stringify(payload)
	if payload.event != "typing-stop" and (_sequence >= 49999 or _file.get_position() + line.to_utf8_buffer().size() > MAX_BYTES - 1024):
		_limited = true
		call_deferred("_stop_capture")
		return
	_file.store_line(line)
	_file.flush()
	_sequence += 1
	if _file.get_error() != OK:
		_status.text = "Typing journal write failed"
		_file = null
		call_deferred("_stop_capture")

func _stop_capture() -> void:
	if _observer:
		# Capture the final unsaved text before detaching the signals.
		_observer.end()
		_observer = null
	if _file:
		_write({"event": "typing-stop", "coverage": "limited" if _limited else "complete"})
		_file = null
		_status.text = ("Capture limit reached · " if _limited else "Saved · ") + _path.get_file()
	if is_instance_valid(_button):
		_button.text = "Capture typing"

func _toggle_clock() -> void:
	if _clock_client.active:
		_clock_client.disconnect_clock()
	else:
		_clock_picker.popup_centered_ratio(0.65)
