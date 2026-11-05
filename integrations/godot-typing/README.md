# Godot unsaved-script typing adapter

An optional Godot 4 editor addon. It observes one explicitly chosen **CodeEdit
buffer**, including unsaved changes and text Godot inserts itself. It does not
listen to global keys or read other applications/fields.

1. Copy `addons/openscreen_typing` into your Godot project's `addons` directory.
2. Enable **OpenScreen Typing Capture** in Project Settings → Plugins.
3. Open the script to demonstrate. Click **Capture typing** in the editor toolbar
   and choose a `.jsonl` output file. The current buffer is the starting document.
4. Edit the script, including paste, corrections and undo/redo. Click **Stop typing
   capture** to finish. Switching to another script automatically finishes this take.
5. In OpenScreen, open a project and choose **Typing capture** above the preview.
   **Import typing journal**, review the sections, and **Save take to project**.

No addon was installed in a real lesson project by this implementation; the live
probe uses a disposable project under `openscreen-evaluation/typing-capture/`.
The addon is original code under the repository's MIT license.

## Evidence and limits

Uses the public [ScriptEditor](https://docs.godotengine.org/en/stable/classes/class_scripteditor.html)
/ [ScriptEditorBase](https://docs.godotengine.org/en/stable/classes/class_scripteditorbase.html)
API to reach the current CodeEdit; observes TextEdit's `text_changed`,
`caret_changed`, focus and local `gui_input` signals. Full buffer observations
capture editor-generated insertion instead of guessing characters from keys.
The importer converts successive observations into validated contiguous replacements.
Godot may coalesce changes before delivering a signal; these are observed buffer
changes, not a claim about every internal editor operation or physical key edge.

Each JSONL record has `schemaVersion`, session ID, sequence and elapsed milliseconds.
The header carries the original unsaved text, script identity and UTC start time.
Snapshots contain text and up to 32 carets/selections in Unicode-code-point offsets.
Local logical/physical key identifiers are separate records; the importer labels
text changes `observed-text-change` rather than inferring paste/undo causes from keys.
The final record closes the journal. Records are flushed to disk as they arrive;
write errors are visible in the toolbar. A truncated journal is rejected by this
first importer rather than silently presented as a complete take.

This is an independent typing session, with no video clock mapping or video
pause synchronisation. It has no pause button. Stop/start another journal when
needed. The pad inside OpenScreen has its own pause control. Capture limits are
10,000 journal records, 8 MiB JSONL and 200,000 UTF-16 code units of text, with a
24-hour clock bound. Hitting a limit marks the finished journal `limited` and the
OpenScreen review shows that warning. Normalized takes also have an 8 MiB limit.
Other editor plugins can alter signal delivery; external script editors and
non-script Godot fields are not captured.

Tested with **Godot 4.7.1** on CachyOS. An actual headless ScriptEditor CodeEdit was
exercised with selection replacement, multiline/tab/Unicode insertion, undo/redo,
automatic bracket completion and indentation, then a script switch. Its unsaved
buffer was reconstructed exactly from the imported journal. Keys for auto-pair
and Enter were injected through the editor viewport; this is not OS keyboard or
IME acceptance. Windows/macOS and older Godot versions remain unverified.
