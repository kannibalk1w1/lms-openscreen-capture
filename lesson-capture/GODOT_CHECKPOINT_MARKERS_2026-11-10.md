# Authored Godot scene checkpoint markers

10 November 2026. Locally validated slice, independent Claude review pending.

## Author workflow and scope

During an explicitly started **Capture scene actions** take, choose **Mark scene
checkpoint**, enter a short label and confirm. For example, label a sampled state
“Texture and scale set” before continuing to attach the script. The marker button
is disabled while capture is off. A dialog captures the current take token; stop,
scene change, disable or write failure closes it and invalidates that token. An old
token cannot mark a later take.

The producer samples the allowlisted scene synchronously before writing the
marker. Unchanged state reuses the latest snapshot reference. It records the
label, `labelProvenance: authored`, snapshot sequence and node count. Blank labels,
control characters and labels above 200 UTF-16 code units are rejected. Labels
are deliberately captured text: inspect them before sharing. A successful marker
requires a successful bounded write; limits preserve the reserved footer and a
failed marker is not reported as saved.

This is an authored annotation alongside sampled editor state. It does not save,
archive, restore or run a project, verify an outcome or prove a milestone. No
additional properties, files or resource bytes are collected. Intermediate edits
can still be missed. The application clock remains independent and unmapped;
optional manual timing uses the existing explicit calibration workflow.

## Format and offline drafts

New raw Godot scene journals use schema v2. The decoder still accepts legacy v1,
requires one consistent version throughout and rejects v1 markers or checkpoint
sampling triggers. A marker must reference the most recent validated header/state
snapshot and its exact node count. References are validated even after normalized
observation or byte limits have retained only a bounded prefix.

The shared application capture format stays v1. `author-checkpoint` observations
carry a small authored payload, without duplicating the scene snapshot. The review
UI can select them as editable draft steps through the existing generic pipeline.
Only selected evidence is copied; a draft snapshot reference needs its original
journal for further scene-state inspection. Imported producer labels are unverified.

## Validation

- Focused decoder/draft tests: 30 passing tests in two files, including legacy
  compatibility, malformed/mixed versions, UTF-16/control/blank labels, older-state
  references with equal node counts, and invalid marker references after the
  normalized observation limit.
- Real Godot 4.7.1 editor/API probes passed on Linux and WinBoat Windows 11
  (NT 26200, PowerShell 5.1, portable Node 22.22.1). Each take produced 15 raw records
  and 15 normalized observations, including four authored labels. Both platforms
  saved and reopened a selected checkpoint draft without Godot.
- Disposable probes exercise short-lived selection signals, Inspector requests,
  scene edits/save/switch, stale/off/old-take/invalid-label refusal, privacy canaries,
  record/byte budgets, a 4,096-record marker-limit journal and footer failure.
- Full regression: **6,469 tests in 472 files passed**. Both TypeScript configs,
  Vite production build, lint (35 existing warnings, no fixes), i18n (15 catalogs)
  and docs (37 targets) passed. No IPC/bootstrap/native production changes; the
  accepted calibration checkpoint retains its real headless startup coverage.
- Both final real-editor probes also exercise toolbar enabled/off state, dialog
  confirmation, closing/invalidation on scope stop and stale confirmation during
  a new take. These are injected Godot UI signals, not OS input acceptance.

Evidence is retained outside Git in
`../openscreen-evaluation/godot-checkpoint-markers-2026-11-10/`, including original
Windows/Linux journals, offline reviews, selected lesson JSON and probe logs.
The first sandboxed Linux attempt emitted a process/socket permission failure after
its internal success marker; it is retained as an unsuccessful harness run. The
escalated Linux rerun and Windows harness exited successfully. Headless Godot emits
dummy-renderer thumbnail/object warnings; no physical keyboard/mouse, packaged
Windows Electron, native media recording or game-run acceptance is claimed.

## Next roadmap slice

Expose selected-file application capture inspection and selected draft creation
through the existing CLI/MCP authority model, with an inspected source fingerprint,
explicit IDs and a new output file. Then add bounded checkpoint-state comparison;
full project restoration and execution diagnostics remain later work. The learner
player stays parked.
