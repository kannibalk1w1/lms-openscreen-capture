# Lesson Capture roadmap

Updated 5 November 2026. Scoped Godot/pad capture, code presentation, explicit
source association, portable exports/bundles and typing-section review are
implemented. Clock/input fidelity, the full event-review workflow and production
acceptance remain open.

## Build reports and current next step

After every build, report what changed, exact validation coverage and the next
concrete item on this roadmap. Commit each completed, validated slice locally;
push or merge when requested. These are the user's standing preferences.

Recording/editor flags are now implemented as a dedicated timeline row, with a
configurable recording hotkey and source-time persistence; see
[LESSON_CAPTURE_FLAGS.md](LESSON_CAPTURE_FLAGS.md). The annotation/cursor slices
are described in LESSON_CAPTURE_ANNOTATIONS.md, LESSON_CAPTURE_SVG_ARROWS.md and
LESSON_CAPTURE_CURSORS.md.

**Current implementation:** the in-video code layer is delivered, followed by
[explicit Godot section/recording association](LESSON_CAPTURE_ASSOCIATION.md).
Sections can be paired to recorded flag cues and placed on matching source footage,
with persisted recording UUIDs and pause intervals. This is human-calibrated onset
placement; continuous Godot/encoder clock synchronization remains open.

**Current export slice:** single-section portable JSON, resulting code/text and
captured-edit playback recipes with standalone re-import and text precondition
validation; see [typing exports](LESSON_CAPTURE_EXPORTS.md).

**Current bundle slice:** [multi-section bundles and clean teaching playback](LESSON_CAPTURE_BUNDLES.md)
retain independent baselines and original edit evidence, with import/edit/re-export.

**Current timeline slice:** [source-linked typing-section review](LESSON_CAPTURE_TYPING_TIMELINE.md)
provides onset markers, per-occurrence seeking, a searchable independent-section
catalog, direct editing links and exports.

**Native boundary stage started:** explicit journal boundaries, interval IDs and
dispatch-time continuity markers are local; see [coverage/limits](LESSON_CAPTURE_INPUT_BOUNDARIES.md).

**Next implementation:** observation-time media projection across pause history
and counted capture-boundary input tests.
Broader application/IME/Windows acceptance and physical tap/recovery checks remain
open before promoting capture drivers.

## Current outstanding work, in priority order

1. **Native input timing and continuity.** Map observation timestamps to media
   time across pause history; handle queued late events, stop-time draining and
   device loss. Run counted start/pause/resume/stop/held-button tests on the rebuilt
   helper. Current interval/boundary metadata is dispatch-time evidence only.
2. **Live Godot/video synchronization.** Replace manual onset calibration where
   possible with an explicit live clock bridge and automatic recording-pause
   awareness. Measure timing bounds; do not infer encoder alignment from UTC.
3. **Complete input/editor coverage.** Physical mouse and touchpad-tap acceptance,
   scroll, application/dialog scoping and source geometry/context; Windows input
   support; physical Godot/IME/layout/multicaret tests and other editor adapters.
   The opt-in KWin driver and visible capability reporting already exist.
4. **Richer lesson review and outputs.** Click/shortcut/narration evidence lanes,
   reliable typing ranges once clocks support them, section split/reorder/exclude,
   and still/clip/MP4/GIF excerpts from selections. Application playback/format
   adapters remain separate from the implemented controlled-buffer recipes.
5. **Presentation and review-debt fixes.** Native CJK/font fallback and clipping,
   excerpt caret bounds, cold compilation/IPC/raster/hash costs, project-sourced
   SVG validation, the Godot-conflicting flag default and non-native input HUD
   state. Low-priority export style/bundle filenames and raw bridge errors remain.
6. **Agent workflow and production acceptance.** CLI/MCP event queries, section
   export and controlled playback; the real RPG Enemy human/agent handoff proof;
   full Linux/Windows/macOS capture/edit/export, sustained/audio/webcam/device and
   cut/speed/undo testing, portable project transfer and recovery acceptance.

**Immediate next slice:** observation-time media projection across pause history,
followed by counted input-boundary tests. Foundational delivery is not full
production acceptance; detailed tests and exclusions are linked below.

## Completed first slice

Recorded/imported narration can opt into editable Whisper captions. Source,
run instructions and validation limits are in [LESSON_CAPTURE.md](LESSON_CAPTURE.md).

## 1. Event journal and complete mouse capture

Build a versioned, append-only session event journal separate from cursor samples.
Give each event an ID, monotonic capture time, media-time mapping, producer,
application/window context and source coordinates with scale/geometry metadata.
Humans and agents write the same event contract. Record raw events independently
of visual click effects or automatic zoom.

Capture all button down/up edges, left/right/middle and supported extra buttons,
double-clicks and drag boundaries. Include trackpad tap-to-click and relevant
dialogs/menus belonging to the demonstrated application. Scrolling is a separate
event type. Pauses and source transitions must not detach events from footage.

Reuse platform integration where practical. The upstream v2.2.2 Linux helper
only forwarded physical left-button presses from evdev. Our first slice adds
physical mouse button edges; keyboard events and touchpad taps are still absent. Evaluate
Panoptix's KWin integration at the compositor event level before expanding this
raw-device path; a compositor event can reflect a tap that raw BTN_LEFT cannot.
Use an appropriate Windows driver behind the same event contract.

Progress: [first input-event slice](LESSON_CAPTURE_INPUT_EVENTS.md) now saves
versioned journals and eight physical button down/up types, independently of
cursor effects. The counted KDE smoke test passed, including pause/resume and
device loss. Physical tap acceptance, application scoping, complete geometry/context and
Windows remain pending. Capability UI and the opt-in KWin driver are implemented. Panoptix's KWin effect was inspected;
its current left-only, in-flight-dropping sender needs a different delivery path.

Acceptance: run a counted sequence of button clicks, taps, double-clicks and
drags; each physical down/up is represented exactly once with the correct button
and position. Double-click classification must not create duplicate raw clicks.
Repeat through capture pause/resume, dialogs, display scaling, and device changes.
Expose unavailable or interrupted event capture visibly; do not silently claim
that every click was captured.

## 2. Typing capture

Scoped pad and Godot unsaved-buffer capture are delivered. Remaining work is live
recording alignment, physical/IME/layout/multicaret acceptance and additional
editor/platform adapters. The following remains the full milestone contract.

Record both physical key/shortcut events and the text/edit operations they cause.
They answer different questions: a shortcut is not a character, a paste is not
individual keypresses, and a code editor can insert indentation or brackets itself.

Typing sessions group nearby edits to the same field/document into editable
sections. Preserve text commits, pauses, backspace/delete, selections and
replacement, cursor movement, paste, undo/redo, Unicode and input-method
composition. Keep unsaved code where the application exposes it. Retain relevant
document state/diffs to reconcile editor-generated changes without pretending
that saved-file diffs alone record all typing.

The default scope is an explicitly started capture session and its selected
application/workspace. Capturing and typing-export playback remain separate
operations; an exported sequence does not type into another app until invoked.

Acceptance: reconstruct the final text and edit sequence from a scripted test
exercise in ordinary text fields and Godot. Cover tabs, indentation, auto-pairs,
selection replacement, multi-line paste, undo/redo, Unicode, keyboard layouts and
focus changes. Establish Windows/KDE coverage and identify which cases need
application adapters. A raw keystroke log alone does not satisfy this milestone.

## 3. ScriptWriter-style typing exports

Portable section JSON, resulting code/text, clean/captured recipes and independent
bundles with import/edit/re-export are delivered. Selection-based video/GIF excerpts
and target-application adapters remain open. The following is the full contract.

Allow selection of one or more captured typing sections and export:

- A portable, editable sequence of text/edit operations and timing, with source
  lesson/step links and schema version.
- A clean text/code file showing the resulting content.
- A playback recipe that can re-demonstrate text entry at a teaching pace, keeping
  original timing or using adjustable speed, pauses and corrections.
- MP4/GIF excerpts, with editable key/text overlays retained in the project.

Offer original demonstration and cleaned teaching versions without discarding
the original. Playback should support an engine-agnostic controlled text target
first and application adapters when editor behaviour requires them. Direct
compatibility with the Godot ScriptWriter plugin needs a separately tested
format adapter; it is not assumed from the phrase “ScriptWriter-style”.

Acceptance: record a short code edit, adjust its pacing, replay it into a known
starting document, and obtain the expected final text. Account for target focus,
auto-indentation and bracket completion. Reopen and edit the exported sequence
without relying on the original video.

## 4. Event timeline and lesson selection

Flags, Code regions and typing onset/catalog review are delivered. Other evidence
lanes, clock-supported ranges and broader lesson section operations remain open.

Show click, typing, shortcut, teaching-marker and narration tracks against the
footage. An event seeks to its source moment; a typing section selects a range.
Let the reviewer split, label, reorder or exclude sections and create a still,
clip, GIF or typing export. Edits retain the mapping between source events and
edited playback. Never make per-click dialogs part of capture.

## 5. Agent and cross-platform production pass

Expose recording, event queries, typing-section export and controlled playback
through CLI/MCP. Use the real RPG Enemy lesson to prove human capture, an agent
first pass, replacement of one failed step, and handoff in both directions.
Complete edited-project packaging, Windows/Linux transfer, audio/device testing
and the sustained recording acceptance checks before claiming launch readiness.

## Immediate next implementation

Delivered locally: the in-video [GDScript code-presentation layer](LESSON_CAPTURE_CODE_PRESENTATION.md).
A captured section becomes a source-anchored Code region with clean type-out or
captured edits, syntax colour, independent pause-picture and blur controls,
drag/resize geometry, light/dark theme, font size, excerpt and line numbers. Native
preview and MP4 export share rendering. Original source/edit evidence is retained.
Pause picture holds screen/camera frames while timeline and original audio continue.

Delivered local association slice: select a saved recording flag for a Godot
section's first edit, preserve recording-session and pause-interval identity, and
place it on the matching source clip. Split/trim/repeated-footage cases are guarded;
independent takes retain manual placement. See [coverage and limits](LESSON_CAPTURE_ASSOCIATION.md).
This is explicit human calibration, not a live shared Godot/encoder clock.

The first [portable export slice](LESSON_CAPTURE_EXPORTS.md) now provides one
section per JSON/text/captured-edit playback file, with standalone re-import.
[Bundles and clean playback](LESSON_CAPTURE_BUNDLES.md) now add independent
member review, editing and re-export. [Typing-section timeline review](LESSON_CAPTURE_TYPING_TIMELINE.md) now provides
source-onset markers, catalog/seek/edit/export actions. Next useful slice: **native
pause/resume journal boundaries and button-edge reconciliation**. Live edit-level encoder alignment, automatic
Godot recording-pause awareness and physical desktop timing acceptance remain open.

The opt-in KWin driver has passed its nested-compositor counted test. Physical
libinput taps, OS/global hotkey delivery, visual HUD and recovery/device checks,
Windows runtime and full typing/IME acceptance remain open. No raw-key-only or
saved-file-diff-only result satisfies those capture checks.

## Native boundary stage started

The completed typing stack is now merged/pushed to private main at fd2775e2.
A local [native boundary slice](LESSON_CAPTURE_INPUT_BOUNDARIES.md) adds explicit
start/pause/resume/stop journal records, active interval IDs, observed held-button
snapshots and unmatched-release/repeated-press flags without synthetic edges.

Next concrete item: observation-time media projection across pause history and
counted boundary input tests. Dispatch-time scheduling, queued late events,
physical/device acceptance and the shared Godot/encoder clock remain open.
