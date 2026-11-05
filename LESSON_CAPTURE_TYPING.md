# Scoped text/edit capture and editable typing sections

Restart OpenScreen. In a project, choose **Typing capture** beside the arrow/step
controls above the preview. This is a bounded first capture slice; complete
system-wide text capture and portable typing-file exports remain roadmap work.
For the in-video GDScript presentation, see [Code presentation](LESSON_CAPTURE_CODE_PRESENTATION.md).

## Use the capture pad

1. Enter the starting document, then **Start capture**. Changes before Start form
   the baseline rather than synthetic typing events. Type, paste, replace a
   selection, correct text or undo/redo normally.
2. **Pause** makes this pad read-only and excludes the paused duration. **Resume**
   continues the session. **Stop capture** finishes the draft. Closing the dialog
   also finishes a running draft; reopening retains it in memory.
3. Nearby edits form typing sections. Gaps over 1.5 seconds, blur and pause
   boundaries begin new sections. Edit their labels or choose a playback speed
   from 0.25× to 4×. Raw evidence remains unchanged.
4. **Preview N** replays a section from its own recorded starting buffer. It only
   changes the read-only preview. It never types into Godot or another app, and
   does not concatenate independent sections into an unvalidated recipe.
5. **Save take to project** embeds source events and section metadata in the
   project. **Saved typing takes** reopens one. Saving a capture together with its labels/pacing is one
   explicit undoable project gesture. **New take**, closing the project or quitting
   can discard an unsaved draft; save it first to retain it.

Only this pad records local keys, selections and composition boundaries. Other
text fields in OpenScreen and other desktop applications are outside its scope.
The existing editor text-undo routing is reused, so field undo remains a text edit
rather than undoing the project behind the dialog.

## Godot's actual unsaved buffer

The optional [Godot adapter](integrations/godot-typing/README.md) observes the open
ScriptEditor CodeEdit, including unsaved text and editor-generated insertion.
Install it explicitly in the desired Godot project, record one script to JSONL,
then use **Import typing journal** in this dialog. It stops automatically when the
active script changes. The addon has not been installed in the user's real lesson
projects. Generic desktop fields, Roblox Studio, Blockbench and external editors
need their own adapters.

## Data model

`src/lib/typing` provides a versioned, engine-independent take with source events,
source identity/producer, UTC start, active session time and editable sections.
The browser captures actual `InputEvent` changes; keys remain separate evidence.
The Godot importer derives replacements from actual buffer observations and does
not pretend key presses reconstruct paste, auto-indent or auto-pairs.

Replacements contain an offset, removed text and inserted text. Replay checks the
removed-text precondition; offsets are Unicode code points, with textarea UTF-16
selection offsets converted at capture time. IDs, event order, times, selections,
stop records and section coverage are validated. Import rejects mixed sessions,
missing records, unfinished journals and edits inconsistent with the starting text.
Portable whole-take JSON can be imported too; no ScriptWriter format compatibility
is claimed.

Project `typingTakes` is additive and optional: old projects load without a
migration. At most 20 takes are stored per project. Text is limited to 200,000
UTF-16 code units; take/import data to 8 MiB; events to 10,000, including a reserved
stop; duration to 24 hours. The pad stops early at its conservative evidence budget
and reports `limited` coverage when a bound is reached. These small-snippet limits
are deliberate for this first slice. Godot JSONL and normalized JSON are validated
against their limits independently.

These typing clocks are independent of video. Code presentations can now be added
manually at the playhead, edited on their Code timeline row and rendered in native
preview/video export. Automatic video/media alignment and key overlays remain open.
The original mouse journal is preserved separately. Desktop/application-wide
capture, OS IME/layout acceptance, multicaret interaction, additional adapters and
the shared video/event clock remain open acceptance work.

## Validation — 5 November 2026

Full Vitest: **5,268 tests / 389 files pass**. Both TypeScript configurations,
Vite build, i18n and Biome pass (35 pre-existing warnings).

- Focused tests cover paste/replacement, tabs, Unicode/surrogate handling, undo/redo,
  composition evidence, pause compaction, source roundtrip, independent section
  replay and pacing, invalid data, capture limits, actual project disk reopen,
  import/save project-switch guards and the undo-write audit.
- Isolated Chromium drives the real React dialog with native browser clipboard
  paste, native undo/redo, selection replacement, Unicode input, pause/read-only,
  label/speed editing, save/replay and Godot journal import/replay. Recording IPC
  is not involved; project persistence there is a schema-validated fixture.
- Actual Godot 4.7.1 headless ScriptEditor probe: unsaved selection replacement,
  multiline/tab/Unicode insertion, undo/redo, native auto-pair/auto-indent handling,
  script-switch stop. The normalized journal has **13 events: 6 text edits and 2
  key records**, and reconstructs the final unsaved buffer exactly. Native input
  was injected into the editor viewport; this does not prove physical OS keys.
- Artifacts and reproducible harnesses: `../openscreen-evaluation/typing-capture/`.
  The fixture runner rewrites only its disposable script. Godot saves that fixture
  on editor exit, so unsaved-buffer equality is measured before exit.
- Skipped: complete Electron desktop interaction and OS file picker, physical
  Godot typing/IME, Windows/macOS runtime, every composition/layout/multicaret case,
  video alignment, typing exports and the rest of the manual capture checklist.
  Orca's provider still reports no screenshots/hotkeys and discovers only a terminal.
  No native capture helper/compositor source changed or needed rebuilding. New
  locale strings use English fallback. This is not release acceptance.

The subsequent [code-presentation slice](LESSON_CAPTURE_CODE_PRESENTATION.md) now
provides the styled in-video result. Next: connect the Godot capture clock to the
recording clock for explicit source-time alignment and reliable automatic placement;
portable section JSON/text/playback-file exports follow. See the current roadmap.
