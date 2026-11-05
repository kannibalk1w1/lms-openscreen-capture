@tool
extends RefCounted

# One explicitly selected CodeEdit only. No desktop/global keyboard listener.
var editor: CodeEdit
var sink: Callable

func begin(target: CodeEdit, receiver: Callable) -> void:
	editor = target
	sink = receiver
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
	sink.call({"event": "typing-snapshot", "text": editor.text, "selections": selections})

func _key(event: InputEvent) -> void:
	if event is InputEventKey:
		sink.call({"event": "typing-key", "key": OS.get_keycode_string(event.keycode), "code": str(event.physical_keycode), "pressed": event.pressed, "ctrl": event.ctrl_pressed, "shift": event.shift_pressed, "alt": event.alt_pressed, "meta": event.meta_pressed, "repeat": event.echo})

func _focus() -> void:
	sink.call({"event": "typing-boundary", "reason": "focus"})
	snapshot()

func _blur() -> void:
	snapshot()
	sink.call({"event": "typing-boundary", "reason": "blur"})
