@tool
extends Node

# Clock metadata only: never reads a CodeEdit, keys, scene or resource contents.
signal sample_observed(record: Dictionary)
signal status_changed(state: String)
signal journal_changed(state: String)
const MAX_BYTES := 8 * 1024 * 1024
var active := false
var _http: HTTPRequest
var _config: Dictionary = {}
var _instance_id := ""
var _started_ms := 0
var _next_request_ms := 0
var _request_sequence := 0
var _pending_sequence := -1
var _pending_sent_ms := 0
var _busy := false
var _last_clock_id := ""
var _journal: FileAccess
var _journal_sequence := 0
var _journal_lock := ""
var _state := "disabled"
var _journal_state := "off"

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 1.5
	_http.body_size_limit = 8192
	_http.max_redirects = 0
	_http.request_completed.connect(_completed)
	add_child(_http)

func _exit_tree() -> void:
	disconnect_clock()

func _set_state(value: String) -> void:
	_state = value
	status_changed.emit(value)

func _matches(value: Variant, pattern: String) -> bool:
	if not value is String:
		return false
	var regex := RegEx.new()
	if regex.compile(pattern) != OK:
		return false
	return regex.search(value) != null

func connect_file(file_path: String) -> bool:
	if active or not is_instance_valid(_http):
		return false
	var file := FileAccess.open(file_path, FileAccess.READ)
	if file == null or file.get_length() > 8192:
		_set_state("invalid-link")
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary:
		_set_state("invalid-link")
		return false
	var config: Dictionary = parsed
	if config.size() != 7 or config.get("format") != "openscreen-clock-link" or config.get("version") != 1:
		_set_state("invalid-link")
		return false
	if not _matches(config.get("endpoint"), "^http://127\\.0\\.0\\.1:[0-9]{1,5}/clock$") or not _matches(config.get("token"), "^[a-f0-9]{64}$") or not _matches(config.get("grantId"), "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$") or not _matches(config.get("projectId"), "^[a-f0-9]{64}$") or not config.get("projectPath") is String:
		_set_state("invalid-link")
		return false
	var port := String(config.endpoint).get_slice(":", 2).get_slice("/", 0).to_int()
	if port < 1 or port > 65535:
		_set_state("invalid-link")
		return false
	var current_project := ProjectSettings.globalize_path("res://").replace("\\", "/").simplify_path().trim_suffix("/")
	if String(config.projectPath).replace("\\", "/").simplify_path().trim_suffix("/") != current_project:
		_set_state("wrong-project")
		return false
	_config = config.duplicate(true)
	_instance_id = "godot-clock-" + Crypto.new().generate_random_bytes(16).hex_encode()
	_started_ms = Time.get_ticks_msec()
	_next_request_ms = _started_ms
	_request_sequence = 0
	_pending_sequence = -1
	_busy = false
	_last_clock_id = ""
	active = true
	_set_state("waiting")
	return true

func disconnect_clock() -> void:
	# Close the forwarding gate before cancelling a request that could still complete.
	active = false
	if is_instance_valid(_http):
		_http.cancel_request()
	_busy = false
	stop_journal("disconnect")
	_config.clear()
	_set_state("disabled")

func _process(_delta: float) -> void:
	if not active or _busy or Time.get_ticks_msec() < _next_request_ms:
		return
	if _request_sequence > 50000 or Time.get_ticks_msec() - _started_ms > 86400000:
		_record_gap("limit")
		stop_journal("limit")
		disconnect_clock()
		_set_state("limit")
		return
	_pending_sequence = _request_sequence
	_request_sequence += 1
	_pending_sent_ms = Time.get_ticks_msec() - _started_ms
	var body := {"version": 1, "grantId": _config.grantId, "projectId": _config.projectId, "instanceId": _instance_id, "sequence": _pending_sequence, "clientSendMs": _pending_sent_ms}
	_busy = true
	_next_request_ms = Time.get_ticks_msec() + 250
	var error := _http.request(_config.endpoint, PackedStringArray(["Authorization: Bearer " + String(_config.token), "Content-Type: application/json"]), HTTPClient.METHOD_POST, JSON.stringify(body))
	if error != OK:
		_transport_failed()

func _is_ms(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) >= 0 and float(value) <= 9007199254740991.0 and floor(float(value)) == float(value)

func _valid_point(value: Variant) -> bool:
	if not value is Dictionary:
		return false
	var point: Dictionary = value
	var fields := ["version", "clockId", "observedMonotonicMs", "state", "mediaTimeMs", "intervalId", "intervalStartMonotonicMs", "intervalEndMonotonicMs", "intervalMediaStartMs"]
	if point.size() != fields.size():
		return false
	for field in fields:
		if not point.has(field):
			return false
	if point.version != 1 or not _matches(point.clockId, "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$") or not _is_ms(point.observedMonotonicMs) or not point.state in ["waiting", "recording", "paused", "stopped"]:
		return false
	for field in ["mediaTimeMs", "intervalId", "intervalStartMonotonicMs", "intervalEndMonotonicMs", "intervalMediaStartMs"]:
		if point[field] != null and not _is_ms(point[field]):
			return false
	if point.state == "waiting" or point.intervalId == null:
		return point.state in ["waiting", "stopped"] and point.mediaTimeMs == null and point.intervalId == null and point.intervalStartMonotonicMs == null and point.intervalEndMonotonicMs == null and point.intervalMediaStartMs == null
	if point.mediaTimeMs == null or point.intervalStartMonotonicMs == null or point.intervalMediaStartMs == null or point.intervalStartMonotonicMs > point.observedMonotonicMs or point.mediaTimeMs < point.intervalMediaStartMs:
		return false
	if point.state == "recording":
		return point.intervalEndMonotonicMs == null
	return point.intervalEndMonotonicMs != null and point.intervalEndMonotonicMs >= point.intervalStartMonotonicMs and point.intervalEndMonotonicMs <= point.observedMonotonicMs

func _completed(result: int, response_code: int, _headers: PackedStringArray, bytes: PackedByteArray) -> void:
	_busy = false
	if not active:
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_transport_failed()
		return
	var parsed: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	if not parsed is Dictionary:
		_invalid_response()
		return
	var response: Dictionary = parsed
	if response_code in [403, 410] and response.get("success") == false and response.get("code") in ["unauthorized", "scope-mismatch", "revoked", "expired"]:
		_record_gap("revoked")
		disconnect_clock()
		_set_state("expired" if response.get("code") == "expired" else "revoked")
		return
	if response_code == 429:
		_record_gap("request-limit")
		_set_state("stale")
		return
	if response.get("version") != 1 or response.get("grantId") != _config.grantId or response.get("instanceId") != _instance_id or response.get("sequence") != _pending_sequence or response.get("clientSendMs") != _pending_sent_ms:
		_invalid_response()
		return
	if response_code == 410 and response.get("code") == "source-ended":
		_record_gap("source-ended")
		disconnect_clock()
		_set_state("ended")
		return
	if response_code == 503 and response.get("code") == "native-unavailable":
		_record_gap("native-unavailable")
		_set_state("waiting")
		return
	if response_code != 200 or response.get("success") != true or not _valid_point(response.get("nativeClock")):
		_invalid_response()
		return
	var received_ms := Time.get_ticks_msec() - _started_ms
	if received_ms < _pending_sent_ms:
		_invalid_response()
		return
	var point: Dictionary = response.nativeClock
	if not _last_clock_id.is_empty() and point.clockId != _last_clock_id:
		_record_gap("source-changed")
	_last_clock_id = point.clockId
	var record := {"event": "clock-sample", "relation": "round-trip-bracket", "atMs": received_ms, "requestSequence": _pending_sequence, "clientSendMs": _pending_sent_ms, "clientReceiveMs": received_ms, "nativeClock": point}
	_write(record)
	sample_observed.emit(record.duplicate(true))
	_set_state(point.state)

func _record_gap(reason: String) -> void:
	var record := {"event": "clock-gap", "atMs": maxi(0, Time.get_ticks_msec() - _started_ms), "requestSequence": maxi(0, _pending_sequence), "reason": reason}
	_write(record)
	sample_observed.emit(record.duplicate(true))

func _transport_failed() -> void:
	_record_gap("transport-error")
	disconnect_clock()
	_set_state("unavailable")

func _invalid_response() -> void:
	_record_gap("clock-invalid")
	disconnect_clock()
	_set_state("invalid-response")

func start_journal(file_path: String) -> bool:
	if not active or _journal != null or FileAccess.file_exists(file_path):
		return false
	var lock := file_path + ".clock-write-lock"
	if DirAccess.make_dir_absolute(lock) != OK:
		return false
	_journal_lock = lock
	if FileAccess.file_exists(file_path):
		_release_lock()
		return false
	_journal = FileAccess.open(file_path, FileAccess.WRITE)
	if _journal == null:
		_release_lock()
		return false
	var permissions := FileAccess.set_unix_permissions(file_path, FileAccess.UNIX_READ_OWNER | FileAccess.UNIX_WRITE_OWNER)
	if permissions != OK and not OS.has_feature("windows"):
		_journal = null
		_release_lock()
		return false
	_journal_state = "recording"
	_journal_sequence = 0
	_write({"event": "clock-start", "format": "openscreen-clock-samples", "version": 1, "atMs": Time.get_ticks_msec() - _started_ms, "instanceId": _instance_id, "grantId": _config.grantId, "projectId": _config.projectId, "clock": "session-elapsed-ms"})
	if _journal != null:
		journal_changed.emit("recording")
	return _journal != null

func stop_journal(reason := "user-stop") -> void:
	if _journal == null and _journal_state != "recording":
		return
	if _journal != null:
		_write({"event": "clock-stop", "atMs": maxi(0, Time.get_ticks_msec() - _started_ms), "reason": reason})
	_journal = null
	_release_lock()
	if _journal_state != "error":
		_journal_state = "limit" if reason == "limit" else "off"
		journal_changed.emit(_journal_state)

func is_journal_open() -> bool:
	return _journal != null

func clock_state() -> String:
	return _state

func _release_lock() -> void:
	if not _journal_lock.is_empty():
		DirAccess.remove_absolute(_journal_lock)
		_journal_lock = ""

func _write(record: Dictionary) -> void:
	if _journal == null:
		return
	record["schemaVersion"] = 1
	record["sequence"] = _journal_sequence
	var text := JSON.stringify(record)
	if record.event != "clock-stop" and (_journal_sequence >= 49999 or _journal.get_position() + text.to_utf8_buffer().size() > MAX_BYTES - 1024):
		stop_journal("limit")
		return
	_journal.store_line(text)
	_journal.flush()
	_journal_sequence += 1
	if _journal.get_error() != OK:
		_journal = null
		_release_lock()
		_journal_state = "error"
		journal_changed.emit("error")
