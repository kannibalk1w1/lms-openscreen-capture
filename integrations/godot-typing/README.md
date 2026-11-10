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
New journals contain compact contiguous text replacements and separate selection
changes (up to 32 carets, in Unicode-code-point offsets). Unchanged observations
are deduplicated. Older full-buffer snapshot journals remain importable.
Local logical/physical key identifiers are separate records; the importer labels
text changes `observed-text-change` rather than inferring paste/undo causes from keys.
The final record closes the journal. Records are flushed to disk as they arrive;
write errors are visible in the toolbar. A truncated journal is rejected by this
first importer rather than silently presented as a complete take.

This is an independent typing session, with no video clock mapping or video
pause synchronisation. It has no pause button. Stop/start another journal when
needed. The pad inside OpenScreen has its own pause control. Capture limits are
50,000 journal records, 8 MiB JSONL and 200,000 UTF-16 code units of text, with a
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

## Explicit recording association in OpenScreen

The addon still records its independent elapsed clock. OpenScreen can now pair a
section's first edit with an explicitly chosen recording flag, persist the source
session/pause interval and place its code presentation on matching footage. This
requires a newly recorded/imported flags sidecar with session metadata. It does
not make Godot aware of recording pauses or map every edit to encoder time. Use
separate sections/takes across recording pauses, and calibrate each onset. See
[association workflow and limits](../../LESSON_CAPTURE_ASSOCIATION.md).

The capture-pad event budget remains 10,000. Normalized takes can hold up to
50,000 events within the same 8 MiB bound. Both press and release key evidence
are preserved; limits still stop capture visibly rather than dropping edits.
The review-driven compact-journal regression and its exact coverage are recorded
in [association validation](../../LESSON_CAPTURE_ASSOCIATION.md).

## Optional read-only recording clock

The addon now includes a separate **Recording clock** dialog. Explicitly create a
private project link in OpenScreen, open it in the same project and optionally
save a new clock-only JSONL journal. Native pause state is sampled and delayed;
this does not pause typing or map edits to video. Stop saving and disconnect are
separate actions. Ordinary typing remains usable without any clock connection.
See [scope, workflow and exact evidence](../../LESSON_CAPTURE_CLOCK_BRIDGE.md).

## Optional scene observations

The same addon now has a separate **Capture scene actions** control. It starts
off and asks for current-scene permission and a new journal file. Review its
bounded hierarchy/selection/2D transform/resource observations in **Lesson guide →
Application capture observations**, then turn explicitly selected observations into draft
steps. Typing and read-only clock capture remain independent. See the
[workflow, privacy, evidence and limits](../../LESSON_CAPTURE_GODOT_SCENES.md).

Scene observations now use editor signals plus 250 ms fallback polling. Only the
allowlisted current-scene state is sampled, with a 50 ms minimum interval between
signal-requested samples. Sampling observers disconnect on stop/disable/scope
change. Godot 4.7.1 real editor/API probes pass on Linux and WinBoat Windows 11;
see [exact Windows coverage](../../lesson-capture/GODOT_CAPTURE_WINDOWS_REUSE_2026-11-10.md).

During an active scene take, **Mark scene checkpoint** adds a short authored label
(up to 200 UTF-16 code units, no controls or blank labels) after sampling the scene.
A marker dialog belongs to that take only. Labels are included in the journal, so
review them before sharing. This does not save, archive, restore or run a project.
Raw scene journals now use v2; OpenScreen still reads legacy v1 journals. See
[checkpoint scope and validation](../../lesson-capture/GODOT_CHECKPOINT_MARKERS_2026-11-10.md).
