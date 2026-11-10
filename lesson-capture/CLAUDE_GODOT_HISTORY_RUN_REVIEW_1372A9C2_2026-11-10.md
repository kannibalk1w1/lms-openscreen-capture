# Independent review: 1372a9c2 "feat: observe Godot scene history and run state"

Reviewer: Claude (Opus 5.5), independent; did not write this code. Date: 10 Nov 2026.
Base: ea836a06. Worked only in the immutable snapshot `/tmp/godot-history-review-1372a9c2`
(read-only `git show/diff` against the real checkout). Scratch: `/tmp/godot-history-review-1372a9c2-scratch`.

## Verdict: ACCEPTED WITH LOWS

There are no High or Medium findings. All seven gates hold for the real producer, and the real Godot 4.7.1
probe passes from the snapshot with exit 0. The Lows are decoder hardening (L1), gaps in the
tests (L2) and one UI point (L3).

## Gate dispositions

| # | Gate | Disposition | How verified |
|---|------|-------------|--------------|
| 1 | Consent extended | PASS (see L3 for dialog layout) | `plugin.gd` dialog text adds scene-only history position and action names (may contain node names; global and other-scene history excluded), run of this scene, other scene's path withheld, and no results/output/errors captured. |
| 2 | Labels bounded and sanitized | PASS (Nit N1) | GDScript `_history_label`: non-blank (same whitespace set as JS `trim`), at most 200 UTF-16 units, no C0/DEL/C1, otherwise `unsupported-action-name`. Decoder: `historyLabel` min 1, max 200, `trim`, `\p{Cc}`. The real probe's 201-char action was written as `unsupported-action-name`. Mutation M9 was killed. |
| 3 | Only the chosen scene's history | PASS | `get_object_history_id(root)` with `> 0`, so global (0), remote (-9) and invalid (-99) are refused. Manager `history_changed` is used only as a hint that sets the trigger. The real probe's `GLOBAL_HISTORY_CANARY` (ProjectSettings context) is absent from the journal, and the scene-history count did not change (confirmed in the retained fixture `history.jsonl`). |
| 4 | Observation vs proof; no double counting | PASS (Nit N2) | Signals only set `_pending_trigger`; one `_observe_context()` runs per sampling turn. The real journal shows 7 history records for 7 transitions: 3 MERGE_ENDS commits gave 1 record, plus 1 for the redo (probe asserts `"Set position"` count == 2). Payload `interpretation: "editor-reported-history-position"`; `unresolved` is used for same version with a different action. Mutation M5 (direction) was killed. |
| 5 | Every listener disconnected and polling stopped | PASS | `stop()` calls `_disconnect_observers()` first. The `_write` failure branch also calls `_disconnect_observers()` before nulling `_history`/`_history_manager`. Scene change and plugin disable go through `stop()`. `poll()` returns once inactive. The begin() failure paths (limited snapshot, open failure, header write failure) all clear `_history`/`_history_manager`. The early-return guard runs before any assignment, so a live take is not overwritten. The real probe found 5 connected during the take and 0 after stop. Not probed for the write-failure or scene-change counts; checked by reading the code. |
| 6 | Run state is editor observation only | PASS for producer; decoder hardening in L1 | Payload `observation: "polled-editor-run-state"`, `result: "unavailable"` (M11 killed). Other-scene runs are strict and carry no path (M1 killed). In the real probe, `play_main_scene` was recorded as other-scene and `main.tscn` was absent. A run already going at take start is baseline only: the real prerun take's baseline is `other-scene`, and the only observation is "stop observed". Errors are not captured. |
| 7 | Raw v4 tail validation; v1–v3 and generic v1 preserved | PASS (test gaps in L2) | Checks for unchanged records and unavailable history run before `add()`, so they also apply after the cap. Scratch tests confirmed this: an unchanged history or run record after the 10,000-observation cap is rejected. `applicationIntegrations` passes 106/106, including the existing v1–v3 suites. `godotSceneCapture(...).version === 1`. |

## Findings

### L1 (Low): the decoder does not bind a `current-scene` run path to the captured scene
`runSchema`'s `current-scene` branch accepts any valid `res://` path. A journal with header scene
`res://enemy.tscn` and `{"state":"playing","scope":"current-scene","scene":"res://main.tscn"}` is accepted,
both as a `scene-run` record and as the header's baseline `run`. It is labelled
"Editor run observed: res://main.tscn" (verified with a scratch vitest; results `currentSceneRunOtherPath` and
`baselineCurrentSceneOtherPath` both `accepted`). The real producer never writes this, because
`_run_state` compares against `_root.scene_file_path`. But the decoder is meant to reject a disclosed
other-scene path, and here a crafted or foreign journal can disclose one under the current-scene label.
A strict equality check against the header would wrongly reject a legitimate Save As made during the take.
Suggested fix: allow the header `scene` or any earlier `scene-saved` path, and reject anything else.

### L2 (Low): three guards are not killed by the new tests
Mutation results below:
- **M2b**: weakening the header gate so v1–v3 headers may carry `history`/`run` survives.
  The cross-version test changes every record's version, so the record gate catches it first. No test has a v1–v3 header with
  context and no context records.
- **M6**: skipping the unchanged-history check once `omitted` is set survives. The "malformed tail after
  cap" test uses a record that fails the zod schema (other-scene with a path), which is rejected in the up-front
  `records.map(parse)` before the loop runs. So it does not exercise semantic validation after the cap. The current code
  is correct (scratch test `postCapUnchangedHistory` was rejected).
- **M7**: accepting `history` becoming `{available:false}` survives. The test case still throws only
  because a later `scene-history` record falls through to "Unexpected scene lifecycle record".
Suggested fix: add a v3 header-only-context case, a post-cap unchanged-history or unchanged-run case, and a
"becomes unavailable" case as the last history record.

### L3 (Low): the consent dialog text is not wrapped
`ConfirmationDialog.dialog_autowrap` defaults to `false` (verified on Godot 4.7.1 headless:
`AUTOWRAP_DEFAULT=false`), and `plugin.gd` does not set it. The consent paragraph is now about 730 characters
on one line, so the 640x300 popup will likely widen or clip off-screen. This predates the commit (the old text was already one
long line), but the commit makes it worse. Not visually verified (headless only). Fix: `_scene_confirm.dialog_autowrap = true`.

### N1 (Nit): format characters are allowed in action labels
`\p{Cf}` characters (U+202E RTL override, zero-width-only text such as `​​`) are accepted in action
labels (scratch test: both `accepted`). This matches the existing checkpoint-label rule, so it is consistent, but
plugin-supplied action names could visually spoof a label.

### N2 (Nit): `samplingTrigger: "history"` is only a signal hint
The trigger can appear on a scene sample with no preceding `scene-history` record. That happens when the manager's
`history_changed` fires for global or other-scene history, or for MERGE_ENDS. The decoder accepts this (scratch
`historyTriggerWithoutHistoryRecord` was `accepted`), which is correct. However, the doc says such a sample "follows" a history
record, and readers could take it as a scene-history link. The doc wording could say it is a hint.

### Checked with no issue found
- **JSON.stringify equality.** zod 4.4.3 strict objects return keys in schema order, so equal
  records with reordered keys are still rejected as unchanged (scratch: `reorderedUnchangedHistory` and `reorderedUnchangedRun` both
  rejected). Godot writes sorted keys anyway (seen in `history.jsonl`).
- **`available:false` handling.** History records are rejected when the start has none, and an available-to-unavailable
  record is rejected (`!after.available`). Mutation M4 was killed.
- **`actionIndex < 0 ⇔ action === null` refinement.** Matches the producer. Mutation M8 was killed.
- **`stop()` ordering and re-entrancy.** A limit or write failure inside the final `_observe_context`/`_sample`
  re-enters `stop("limit", false)`, which writes the footer and nulls the file. The outer `stop` then skips via `active()`.
  This follows the existing pattern.
- **Baseline type widening.** The generic capture `baseline` is `boundedJson`; the UI only shows it with
  `JSON.stringify`.

## Commands run (snapshot, Node 22.22.1)

- `npx vitest --run src/lib/applicationIntegrations`: 7 files, 106 tests passed.
- `npx tsc --noEmit`: exit 0, no output. `npx tsc -p tsconfig.test.json --noEmit`: exit 0, no output.
- `OPENSCREEN_SCENE_PROBE_TMP=~/.cache/ghr1372 GODOT_BIN=/home/kannibalkiwi/.local/bin/godot node scripts/probe-godot-scene.cjs`
  (XDG_* set to scratch, 500 s timeout): **exit 0**. Output: `SCENE_PROBE_PASSED`,
  `HISTORY_RUN_PASSED: 7 history + 3 run observations; global history and other-scene path withheld`,
  `OFFLINE_DECODER_PASSED`, `PORTABLE_AUTHORING_PASSED`. There was no spawn error and no Godot process was left running.
  The retained fixture is `~/.cache/ghr1372/godot-scene-probe-TpIEda`; I inspected `history.jsonl` by hand.
- Scratch decoder probes: `zz-review.test.ts`, copied into the snapshot temporarily and then removed (results above).
- Godot headless check of the `dialog_autowrap` default (script in `scratch/gd/t.gd`).

## Mutation results (`godotScene.history.test.ts`, 26 tests; snapshot restored, `cmp` confirmed)

| ID | Mutation | Result |
|----|----------|--------|
| M1 | other-scene run may carry `scene` | killed (2 failed) |
| M2a | v4-only record gate removed | killed (3) |
| M2b | header context allowed in v1–v3 | **survived** (L2) |
| M3a | unchanged-history rejection removed | killed (1) |
| M3b | unchanged-run rejection removed | killed (1) |
| M4 | unavailable-start gate removed | killed (1) |
| M5 | direction `>` changed to `>=` | killed (1) |
| M6 | unchanged-history check skipped after cap | **survived** (L2) |
| M7 | history may become unavailable | **survived** (L2) |
| M8 | index/action refine removed | killed (2) |
| M9 | control-character check removed from label | killed (1) |
| M10 | history trigger allowed pre-v4 | killed (3) |
| M11 | `result: "unavailable"` dropped | killed (1) |

GDScript guards (other-scene path withholding in `_run_state`, `history_id > 0`) cannot be mutated through
vitest. They are covered by the real probe's canaries (`main.tscn` absent, `GLOBAL_HISTORY_CANARY` absent). I did not
re-run the probe against mutated GDScript.

## Limits

- The review is headless and API-driven only. There was no physical input, no visual check of the consent dialog, and no Windows run.
- I did not run the full 6,558-test suite, lint or `vite build`. I ran only `applicationIntegrations` and both tsc configs.
- The observer-count assertions for write-failure and scene-change were checked by reading the code, not by probe.
- `UndoRedo.clear_history()` during a take (version bump with a null action, which would be labelled "forward") was not exercised.
