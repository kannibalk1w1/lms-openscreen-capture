# Independent review: authored Godot checkpoint markers — 9e9883dc vs eefec646

- Reviewed HEAD: `9e9883dcbdb420a1058bb604da9718cb6cf8e5c1`. Base: accepted `eefec646`.
- Scope:
  - `scene_capture.gd`: `mark_checkpoint`, the boolean `_write`, the v2 producer
  - `plugin.gd`: the marker button, the take-bound dialog and its teardown
  - `godotScene.ts`: the v2 decoder
  - the updated probes and the `GODOT_CHECKPOINT_MARKERS_2026-11-10.md` scope doc
- Excluded: the parked player, earlier history, and `/tmp/application-capture-parity-prototype`.
- Reviewer: Claude (Opus 5.5), Orca task `task_134e551de220`. Read-only; `git status` was clean before and after. Probes ran from `/tmp/claude-ckpt-9e9883dc/`: an esbuild bundle of HEAD built from stdin, plus a headless Godot 4.7.1 script with the dummy audio driver.

## Verdict: REQUEST_CHANGES (one small fix)

## Finding

### C1 — Low/Medium — A label the addon accepts can make the whole take unimportable
- **Producer**, `scene_capture.gd` (`mark_checkpoint`): it refuses a label only if `label.strip_edges().is_empty()`, it is longer than 200 UTF-16 units, or `_has_control` (C0, DEL, C1).
- **Decoder**, `godotScene.ts` (the `scene-checkpoint` label refine): it requires `label.trim().length > 0`, with no `\p{Cc}`.
- **The mismatch:** Godot's `strip_edges()` only strips code points up to U+0020. JavaScript's `trim()` also strips NBSP, U+3000, U+2028/2029, U+FEFF and other Unicode spaces.

Independent evidence:
1. **Real Godot 4.7.1** (`strip.gd`, headless): `strip_edges().is_empty()` is `false` for U+00A0, U+3000, U+2028 and U+FEFF, and `true` for an ASCII space. None of them counts as control under `_has_control` (U+00A0 is 160, outside 127–159). So `mark_checkpoint` writes these labels and reports "Authored checkpoint saved".
2. **HEAD decoder** (`p.cjs`, on the retained real `linux-final/scene.jsonl`, changing only the first marker's label):

   | Label | Result |
   |---|---|
   | `" "` | whole journal rejected ("Invalid input") |
   | `"　"` | whole journal rejected |
   | `" "` | whole journal rejected |
   | `"﻿"` | whole journal rejected |
   | `" Done"` | accepted |
   | `"​"` | accepted |

A plausible trigger: someone using an IME types a full-width space and confirms. The status says the marker was saved, but the entire take, including all the scene observations, then fails import with the generic "invalid" message. That contradicts this slice's own rule that a failed marker must never be reported as saved.

The fix, either way:
- the producer refuses labels that are empty after a Unicode-whitespace trim; or
- the decoder checks exactly the producer's rule: not empty after removing code points ≤ U+0020, no `\p{Cc}`, at most 200 UTF-16 units.

A regression fixture with a U+3000-only label would cover it.

## Informational (no change required)
- **I1. One refusal message covers every reason:** `plugin.gd` shows "Checkpoint not saved · take changed or journal stopped" for every `false` return, including a blank, over-long or control-character label while the take is still running. Nothing wrong is saved; the reason shown is just inaccurate.
- **I2. Drafts read as observed:** draft steps made from a marker carry `provenance: "observed"` and the generic "Observed in … Review the before/after evidence" instructions. That is accurate for the fact a marker was placed and when. The label itself is clearly authored: the title starts "Author checkpoint: …" and the payload has `labelProvenance: "authored"`. Later wording could say "authored marker" so nobody reads it as proof the step was completed. The scope doc (line 23) already disclaims milestone proof, and the consent dialog says labels are annotations, not proof.

## Verified as sound
- **Version consistency:** the addon writes v2 on every record. A mixed-version journal is rejected. A v1 journal containing a marker, or the `checkpoint` trigger, is rejected ("Checkpoint requires scene journal schema v2"). Legacy v1 journals are still accepted, as the committed tests show.
- **Snapshot reference:** checked on the real journal (later markers `6→5`, `7→5`, `13→11`). An older `snapshotSequence` (0) is rejected, a future one (the marker's own sequence) is rejected, and a `nodeCount` off by one is rejected. These checks run on every record, even after the decoder's prefix truncation, because `previous` and `snapshotSequence` keep updating when observations are omitted.
- **Strict record and small payload:** `labelProvenance` must be `"authored"`, extra keys such as `completed` are rejected, and a marker after the footer is rejected. A 202-unit label is rejected on both sides. The payload holds only `{label, labelProvenance, nodeCount, snapshotSequence}`.
- **Producer write safety:**
  - `_write` returns `true` only after a flushed store with no error;
  - the marker is written only after a successful synchronous sample, and is re-checked against session, root and scope;
  - a limit, a write error, a stop or a scene change returns `false`;
  - the footer reserve is unchanged.
- **Dialog lifecycle:** the dialog is bound to the session ID when it opens, and the status handler disables the button and hides and clears the dialog when the take stops. The probe asserts that an off take, a stale token, a stale token on a new take, a blank/empty/control/UTF-16-over-limit label, and a marker at the record limit (footer kept, "Must not claim" absent) are all refused.
- **No new authority:** no new file, project, run or collection path. Markers reuse the open journal, clocks stay `unmapped`, and the consent text covers labels.
- **Real evidence:**
  - Retained Linux `linux-final` and Windows `windows-final/godot-scene-probe-uUscmU` journals decode with HEAD:

    | Journal | Observations | Markers | Result |
    |---|---:|---:|---|
    | scene | 15 | 4 | — |
    | marker-limit | 4,094 | 1 | `limited`/`limit` |
    | record-limit | — | — | `limited` |
    | byte-limit | — | — | `limited` |
    | disable | — | — | accepted |
    | footer-failure | — | — | rejected |

  - Both retained `lesson.json` files reopen ("Author checkpoint: Texture and scale set").
  - A draft made from a marker reopens with clock `unmapped`.
  - The Windows guest's `scene_capture.gd` and `plugin.gd` are byte-identical to HEAD after CRLF normalisation.
  - `windows-report.json` reports Godot 4.7.1 and Node 22.22.1 on NT 26200 and limits its claim to headless APIs and injected signals.
- **Focused vitest:** 30 passed across 2 files (`godotScene.test.ts`, `sceneDraft.test.ts`).

## Limits
- No full suite, tsc, Vite, lint, i18n or startup rerun; I relied on root's 6469/472 report. No IPC, bootstrap or native change in this diff.
- I did not run the addon's `mark_checkpoint` with a U+3000 label in a live editor. C1 rests on the real Godot `strip_edges()` result and the unchanged `_has_control` code, plus the HEAD decoder rejecting the resulting record.
- No VM access; the Windows result comes from retained artifacts. No physical toolbar or dialog input, native capture, media or game run.
