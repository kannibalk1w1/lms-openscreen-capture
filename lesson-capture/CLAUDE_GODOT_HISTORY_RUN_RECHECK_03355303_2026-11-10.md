# Focused recheck: 03355303 (parent 1372a9c2)

Reviewer: Claude (Opus 5.5), independent. Date: 10 Nov 2026. I worked only in the immutable snapshot
`/tmp/godot-history-review-03355303` and used read-only `git diff 1372a9c2 03355303` on the real checkout.

## Verdict: ACCEPTED

L1, L2, L3 and N2 from the 1372a9c2 review are resolved. N1 is retained on purpose, as documented. There are two new Nits and no
Low or higher findings.

## Checks

1. **L1, run path limited to the captured scene: resolved.**
   - Header: a `current-scene` baseline run must equal `first.scene`.
   - Records: a `current-scene` run must be in `capturedScenes`. That set holds the header scene plus every
     `scene-saved` path seen earlier in the take; a save that comes after the run does not count.
   - The set is filled and checked whether or not the observation cap has been reached.
   - A placeholder header such as `built-in-or-unsaved` can only "match" the same placeholder, so no real path is disclosed.
   - The tests cover the record path, the header path, an allowed header path, and Save As rejected before the save but
     accepted after it.

2. **Mutants, re-run on the 03355303 decoder; snapshot restored, confirmed with `cmp`.** The new history test file now has 33 tests.

   | Mutant | Result |
   |---|---|
   | M2b: v1–v3 header context allowed | killed (3) |
   | M6: unchanged history skipped after the cap | killed (1) |
   | M6b: unchanged run skipped after the cap (new) | killed (1) |
   | M7: history may become unavailable | killed (1) |
   | L1a: header run-path check removed | killed (1) |
   | L1b: record run-path check removed | killed (2) |
   | L1c: Save As tracking removed | killed (1) |
   | M3a / M3b: unchanged rejection removed (regression) | killed (2 / 2) |
   | L1d: record run-path check skipped after the cap | **survived** (N3) |

3. **L3, `dialog_autowrap = true` and `popup_centered(Vector2i(640, 420))`: valid.**
   - `dialog_autowrap` is a real ConfirmationDialog property in 4.7.1. A headless script set it and read back `true`.
   - The real probe from this snapshot exited 0. Its output: `SCENE_PROBE_PASSED`, `HISTORY_RUN_PASSED: 7 history + 3 run observations`,
     `OFFLINE_DECODER_PASSED`, `PORTABLE_AUTHORING_PASSED`. There was no spawn error.
   - The fixture project enables `openscreen_typing`. The fixture's Godot `probe.log` has no SCRIPT/Parse error from
     `openscreen_typing/plugin.gd`.
   - The only ERROR lines in that log are `Parameter "t" is null` from the probe add-on's own `_wait`/`_pump`. They are the same
     set as in my 1372a9c2 run, so they are not new.
   - No Godot process was left running. I did not check the dialog's appearance (headless only).

4. **Docs: truthful, with one stale count (N4).**
   - The new N2 wording ("only a hint") and the L1 wording ("header scene or a path this take observed being saved")
     match the code.
   - The Review section matches this recheck.
   - The copied review in `lesson-capture/` is byte-identical to my report.

## New findings

- **N3 (Nit): one guard is still not killed by the tests.** Skipping the record run-path check after the observation cap
  (`&& !omitted`) is not caught. The code is correct today: the check runs before `add()`. Adding a
  `current-scene` run with an out-of-scope path to the post-cap test would kill this mutant.
- **N4 (Nit): the doc's test count is stale.** The Validation section still says the history test file has
  "26 tests" (now 33). Its 193-test focused and 6,558-test full-suite counts are from 1372a9c2 and were not re-stated.
  On this snapshot, `applicationIntegrations` has 113 tests.

## Commands

- `npx vitest --run src/lib/applicationIntegrations`: 7 files, 113 tests passed.
- `npx tsc --noEmit`: exit 0. `npx tsc -p tsconfig.test.json --noEmit`: exit 0.
- Mutation script: `/tmp/godot-history-review-1372a9c2-scratch/mutate2.sh`.
- Real probe (XDG_* set to scratch, `OPENSCREEN_SCENE_PROBE_TMP=~/.cache/ghr0335`): exit 0. Fixture:
  `~/.cache/ghr0335/godot-scene-probe-QeGwlv`.

## Limits

This was a focused recheck only. I did not run the full suite, lint or build, did no Windows run, and did not check the dialog visually.
