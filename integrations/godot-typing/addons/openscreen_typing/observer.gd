@tool
extends RefCounted

# One explicitly selected CodeEdit only. No desktop/global keyboard listener.
var editor: CodeEdit
var sink: Callable
var _previous_text := ""
var _previous_selections: Array = []

func begin(target: CodeEdit, receiver: Callable) -> void:
	editor = target
	sink = receiver
	_previous_text = editor.text
	_previous_selections = []
	editor.text_changed.connect(snapshot)
	editor.caret_changed.connect(snapshot)
	editor.gui_input.connect(_key)
	editor.focus_entered.connect(_focus)
	editor.focus_exited.connect(_blur)
	snapshot()

func end() -> void:
	if not is_instance_valid(editor):
		return
	snapshot()
	editor.text_changed.disconnect(snapshot)
	editor.caret_changed.disconnect(snapshot)
	editor.gui_input.disconnect(_key)
	editor.focus_entered.disconnect(_focus)
	editor.focus_exited.disconnect(_blur)
	editor = null

func _offset(line: int, column: int) -> int:
	var result := column
	for index in range(line):
		result += editor.get_line(index).length() + 1
	return result

func snapshot() -> void:
	if not is_instance_valid(editor):
		return
	var selections: Array = []
	for index in range(mini(editor.get_caret_count(), 32)):
		var focus := _offset(editor.get_caret_line(index), editor.get_caret_column(index))
		var anchor := focus
		if editor.has_selection(index):
			anchor = _offset(editor.get_selection_origin_line(index), editor.get_selection_origin_column(index))
		selections.append({"anchor": anchor, "focus": focus})
	var current_text := editor.text
	if current_text.to_utf16_buffer().size() > 400000:
		# Let the journal writer mark the same text limit without persisting a partial edit.
		sink.call({"event": "typing-snapshot", "text": current_text})
		return
	if current_text != _previous_text:
		# Godot String indices are Unicode code points, as in the journal contract.
		var start := 0
		var end_before := _previous_text.length()
		var end_after := current_text.length()
		while start < end_before and start < end_after and _previous_text[start] == current_text[start]:
			start += 1
		while end_before > start and end_after > start and _previous_text[end_before - 1] == current_text[end_after - 1]:
			end_before -= 1
			end_after -= 1
		sink.call({"event": "typing-edit", "start": start, "removed": _previous_text.substr(start, end_before - start), "inserted": current_text.substr(start, end_after - start), "selections": selections})
	elif selections != _previous_selections:
		sink.call({"event": "typing-selection", "selections": selections})
	_previous_text = current_text
	_previous_selections = selections

func _key(event: InputEvent) -> void:
	if event is InputEventKey:
		sink.call({"event": "typing-key", "key": OS.get_keycode_string(event.keycode), "code": str(event.physical_keycode), "pressed": event.pressed, "ctrl": event.ctrl_pressed, "shift": event.shift_pressed, "alt": event.alt_pressed, "meta": event.meta_pressed, "repeat": event.echo})

func _focus() -> void:
	sink.call({"event": "typing-boundary", "reason": "focus"})
	snapshot()

func _blur() -> void:
	snapshot()
	sink.call({"event": "typing-boundary", "reason": "blur"})
