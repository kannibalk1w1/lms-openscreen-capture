# Godot scene history and run-state observations — 10 November 2026

Built by Claude (Opus 5.5, lead builder) after Codex/root handed source ownership to
Claude. Raw Godot scene journal **v4** adds two kinds of bounded editor context to an
explicitly started scene take. v1/v2/v3 journals still import with their original
semantics; the generic normalized application capture stays **v1**.

## Supported API audit (real Godot 4.7.1, Linux, disposable project)

Checked with `ClassDB` and a disposable editor plugin before any source change:

| Need | Supported public API | Observed behaviour |
| --- | --- | --- |
| Scene-scoped history | `EditorUndoRedoManager.get_object_history_id(root)` → `get_history_undo_redo(id)` (`UndoRedo`) | Scene history id 2; global history is id 0 and is never used. A `ProjectSettings`-context action changed only global history. |
| History position | `UndoRedo.get_version()`, `get_current_action()`, `get_current_action_name()` | Commit +1, undo −1, redo +1. `MERGE_ENDS` actions keep version and name. A new action after an undo can return to an earlier version number with a different name. |
| Change hints | `EditorUndoRedoManager.history_changed`, `UndoRedo.version_changed` | The manager's `version_changed` did **not** fire for scene actions in this probe; direct `UndoRedo.undo()/redo()` emitted no manager signal. Signals are therefore hints only; the 250 ms poll is authoritative. |
| Run state | `EditorInterface.is_playing_scene()`, `get_playing_scene()` | Returns the `res://` path of the scene being run, including another scene (e.g. the main scene). |
| Run/game errors | none suitable | `Logger` (`OS.add_logger`) only sees the editor process; the game's error stream reaches the editor debugger, which exposes no public error feed. **Unavailable.** |

## What a v4 take records

Consent: the start dialog now also says the take records this scene's own undo-history
position and action names (which may contain node names; global and other-scene history
are excluded) and whether the editor reports a run of this scene (another scene's run is
recorded without its path; run results, output and errors are not captured).

- `scene-start` carries starting `history` and `run` context. They are baseline
  context only, never observations: a run already in progress at take start is not
  reported as started during the take.
- `scene-history` — written when the scene history's `{version, actionIndex, action}`
  changes. It is checked once per sampling turn (signal-requested, at least 50 ms apart,
  or the 250 ms fallback), so one transition is written once, and a history-triggered
  scene sample (`trigger: "history"`) follows it. `history: {available: false}` means the
  take had no scene history (e.g. the scene root mapped only to global history); no
  history records are then accepted.
- `scene-run` — written when the polled run state changes: `stopped`, `playing` +
  `current-scene` + its `res://` path, or `playing` + `other-scene` with **no path**.
- Action names are bounded to 200 UTF-16 code units with no control characters and
  non-blank content, otherwise recorded as `unsupported-action-name`. They are the
  editor's own (locale-dependent) labels, e.g. "Rename Node"; plugins may put any text there.

Observers added for a take (manager `history_changed`, scene `UndoRedo.version_changed`)
are disconnected with the existing ones on stop, scene change, plugin disable and write
failure; the probe asserts five connected observers during a take and zero after stop.

## What the decoder reports

Normalized observation types (generic capture v1, no generic schema change):

- `editor-history` — direction from the version change: `forward` ("Editor history:
  <current action>", new action **or** redo), `back` ("Editor history stepped back from:
  <last observed action>"), or `unresolved` (same version, different action). Payload
  keeps before/after, `historyScope: "captured-scene"` and
  `interpretation: "editor-reported-history-position"`.
- `run-state` — "Editor run observed: res://…", "Editor run observed: another scene
  (path withheld)" or "Editor run stop observed"; payload
  `observation: "polled-editor-run-state"`, `result: "unavailable"`.

These are editor-reported positions and polled states. They do **not** prove which
gesture (menu, shortcut, Inspector, plugin) caused a change, whether a forward step was
new or a redo, the full content of a merged action, that a run succeeded, built, produced
output or had no errors, or any recording/encoder timing. Runs or history positions
shorter than the poll can be missed. v4 context records in v1–v3 journals, a v4 header
without both contexts, unchanged context records, a path on an other-scene run, and a
result/exit claim are all rejected; every raw record is validated even after the
normalized observation/byte cap.

Checkpoint markers, listing and within-take comparison are unchanged and work in v4.

## Validation

All on source in this commit (see the commit SHA in the evidence README):

- Unit: new `src/lib/applicationIntegrations/godotScene.history.test.ts` (26 tests:
  normalization, direction, withheld paths, baseline-only pre-existing run, 16 malformed
  shapes, cross-version rejection, raw tail validation after the cap, v4 checkpoints).
- Focused: application integrations, lesson, Godot checkpoint CLI/MCP/file/UI —
  193 tests / 19 files.
- Full suite: **6,558 tests / 482 files** pass. Both `tsc` configs, `vite build`, lint
  (35 existing warnings) pass.
- Real Godot 4.7.1 editor/API probe (`scripts/probe-godot-scene.cjs`), extended with a
  history/run take: real `EditorUndoRedoManager` commit/merge/undo/redo/new-after-undo,
  oversized label, a global-history canary (excluded), `play_current_scene` (path
  recorded), `play_main_scene` (path withheld, `main.tscn` absent from the journal) and a
  take started during a run (baseline only). All earlier probe checks still pass.
  - Linux (CachyOS) host: `HISTORY_RUN_PASSED: 7 history + 3 run observations`.
  - WinBoat Windows 11 NT 26200, PowerShell 5.1, portable official Godot 4.7.1 and Node
    22.22.1 (hashes in the Windows report): same result. No Godot process left running.
- Headless startup smoke not run: no IPC/bootstrap/CLI/MCP registration code changed
  (only the pure decoder they already call).

Evidence: `../openscreen-evaluation/godot-history-run-2026-11-10/`.

These are headless editor/API checks with programmatic undo/redo and run calls. No
physical input (Ctrl+Z, menus, the Run button), rendered game, game-runtime success,
packaged Electron or native capture is claimed.

## Review

Awaiting an independent Claude review of the immutable source commit.
