@tool
extends EditorPlugin

const Observer = preload("observer.gd")
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
	_picker = FileDialog.new()
	_picker.access = FileDialog.ACCESS_FILESYSTEM
	_picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_picker.add_filter("*.jsonl", "OpenScreen typing journal")
	_picker.title = "Save typing capture journal"
	_picker.file_selected.connect(_begin_capture)
	get_editor_interface().get_base_control().add_child(_picker)

func _exit_tree() -> void:
	_stop_capture()
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
