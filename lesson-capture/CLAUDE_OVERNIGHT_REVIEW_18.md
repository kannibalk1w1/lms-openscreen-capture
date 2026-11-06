# Claude overnight review 18 — slice21

- **Reviewed:** `8e0316ab83fbbccb96f5787d47ad9a5b5c67cc43` ("feat: retain explicit saved-project lesson ranges") against `d0949f9f6c17eb8c35886638077056647d7c606a`.
- **Branch:** `lesson-capture/input-boundaries`. `main` = `fd2775e2` (unchanged).
- **Reviewer:** Claude (Opus 5.5), working alone with no subagents. The checkout was read-only. The only checkout write is this file. Earlier reports are untouched; REVIEW_17 is committed in this range unchanged and FOLLOWUP_17 is new.
- **Date:** 6 Nov 2026.

## Verdict

**No High or Medium findings.**

The range planner maps cuts and speed exactly as the existing editor reader does. My own real-DocumentService probe reproduced it independently, including endpoint, adjacent-clip and 128-cap edge cases.

The validation, fingerprint and stale-source fences hold. Main parses the request before it reads any project. The static guide strips the plan. The query exposes only presence. Old sources are unaffected.

Review-17 **N20-1 and N20-2 are closed**: mutations M18 and M17 below kill the new tests. **N20-3 remains disclosed** and is unchanged.

The open items are test-coverage gaps and nits:
- Two Lows: T21-1 and T21-2.
- Two Nits: N21-1 and N21-2.

None of them blocks acceptance. Like review 17, this review does not approve later work: media materialization, revalidation, a timed player, captions, progress, autosave or physical acceptance.

## Scope check

There are 42 files, +1144/−21.

**New code:**
- `electron/lesson/rangePlan.ts` (69 lines).
- `src/lib/lesson/mediaSelection.ts` (schema).
- `LessonRangeControls.tsx`.

**Changed code:**
- `LessonService.planRange`.
- The IPC channel `lesson:plan-range`, plus preload and type declarations.
- `attachLessonMediaSelection`.
- An optional `mediaSelection` field in `lessonStepSchema`.
- The guide projection strip and the N20-2 heading fallback in `export.ts`.
- `hasMediaSelection` in `queryLessonFile`.
- 10 English-fallback keys in each of the 15 locales.

**Tests:** `mediaSelection.test.ts`, plus additions to the service, IPC, fileCommands, MCP-server, dialog and navigation tests. The rest is docs.

**Not added:** no listener, config, auth, MCP tool, discovery, recovery-store API or native/Rust change. `lesson-tools.ts` is untouched, so the HTTP gate is exactly as accepted in review 17. The planner imports only timeline readers and the existing fingerprint. It reads no media, journal or clock, and has no render path. The probe recorded 0 render calls.

## Mapping and bounds (rangePlan.ts)

- **Readers.** `keptRawSpans` and `projectRawTimelineSecToPlayback` are the editor's own readers, and the projection walks `keptRawSpans`, so planner and playback agree by construction. `readSpeedRegions` is the same reader the fingerprint hashes. `currentTimeSec` (the playhead buttons) is the raw/document ruler: `VirtualPreview.tsx:919`, and frame capture uses it as `rulerSec` too. So ruler semantics are consistent end to end.
- **Unprobed clips.** Lines 23-29 refuse any clip anywhere in the project with no `sourceEndSec`, or one with `sourceEndSec <= sourceStartSec`. They also refuse an empty clip list.
- **Overlap.** Line 31 compares only adjacent spans in playback order. That is sufficient: a chain where each start ≥ the previous end is globally disjoint. Touching spans (`start == previous end`) are allowed, which is correct for back-to-back clips.
- **Endpoints.** Lines 34-35: the start must be in `[span.start, span.end)` and the end in `(span.start, span.end]`, so there is no clamping. The intersected spans then always begin at `startSec` and end at `endSec`, which the schema's anchor check requires.
- **Fragmentation.** The cap at line 44 applies to the selected spans. In my probe, exactly 128 spans are accepted and 129 are refused.
- **Programme end exactly at a kept endpoint.** The projection falls through to the next segment's start (same cursor value) or to the trailing branch (`outCursor + 0`). Both give the right value.
- **Fingerprint parity.** Renderer `documentSchema.parse(saveProject(...))` and main `getProject` (fresh `DocumentService`) produce equal fingerprints. I checked this in both of my fixture variants, so there is no M13-1-style always-`project-changed` regression.

## Independent DocumentService probe

The probe was a scratch Vitest file in my snapshot, deleted after it ran. It used the worker's fixture project, copied into a private temp dir under `~/.cache/r18s`. The fixture's bytes were verified unchanged afterwards.

**Note on the fixture state.** The fixture project on disk is in its **post-stale-change** state: `sourceStartSec 0.25` with a 1-2 source-anchored cut, so the cut sits at ruler 0.75-1.75. Planning 0.5-4 on it gives kept 0.5-0.75 and 1.75-4, programme 0.5-2. That is correct for this geometry. With `sourceStartSec` reset to 0, the worker's headline result reproduces exactly: kept 0.5-1 and 2-4, programme 0.5-2.

**Edge cases (with `sourceStartSec 0`):**

| Request | Result |
|---|---|
| 0.5-1 | kept 0.5-1, programme 0.5-1 (end at the cut start is accepted) |
| 2-4 | programme 1-2 (start at the cut end is accepted) |
| 0-5 | kept 0-1 and 2-5, programme 0-3 |
| 4.99-5 | programme 2.99-3 |
| 0.999-2.0001 | two fragments, programme 0.999-1.00005 |
| 0.5-2, 1-4, 1.5-4 | `range-unavailable` (end or start in removed material) |
| 0.5-1.0000001 | `range-unavailable` |
| 0-5.01 | `range-unavailable` |
| old fingerprint after the change | `project-changed` |
| adjacent clips 0-2 and 2-4, request 2-4 or 1-3 | accepted; 1-3 gives touching spans 1-2 and 2-3 |

There were 0 render calls.

## UI, async and stale handling (LessonGuideDialog.tsx:344-394)

- **Attach flow.** Attach runs inside the existing `run()`, so it is busy-fenced and gated by `current()`. It refuses with `project-changed` in three cases:
  - the store is dirty, or has no project or document (line 353);
  - the document identity changes after IPC (line 365);
  - the plan does not echo the project, fingerprint and endpoints that were sent (lines 368-372).
- **Applying the plan.** It is applied functionally to `latest`. `attachLessonMediaSelection` refuses a changed lesson ID, a removed step or a changed prior selection by returning `latest` unchanged, and it preserves newer text. Attaching demotes the step to draft. Remove goes through `update()`, which also demotes.
- **Nested fieldset.** The range controls sit in a nested `<fieldset>` inside the dialog's `fieldset disabled={busy}`. So in a real browser, edits during an in-flight plan are blocked, and the silent-refusal branch is defensive only. Per the review-15 lesson, this is not a reachable user-visible defect.
- **Remount key.** `key` includes `generation.current`, so Restore and Open remount the controls.
- **Privacy.** Errors are fixed codes via `bounded()`; the IPC test confirms that raw exception text is hidden. The stored plan holds the project ID (`proj_<uuid>`), not a path. The `render-inputs-v1` SHA-256 is the same kind of value already stored with lesson illustrations, so there is no new path exposure.

## Static exclusion, query, compatibility

- **Static exclusion.** `projectLesson` (`export.ts:46`) sets `mediaSelection: undefined` for every selected step, whatever the image/code toggles. Both `exportGuide` and file-CLI/MCP `exportLessonFile` go through `renderLessonGuide`, so the derived manifest omits the key. The static guide format is unchanged, and older readers accept it.
- **Query.** It adds only the boolean `hasMediaSelection` (`fileCommands.ts:27`). The MCP query tool returns text JSON with no strict output schema, so the extra field cannot break structured output. The HTTP gate is unchanged.
- **Compatibility.** The strict step schema means a pre-slice21 reader rejects a source or recovery copy that has a range (disclosed). Sources without the field parse unchanged.

## Findings

### T21-1 — Low (test gap): half-open endpoint acceptance is not pinned

- **Where:** `electron/lesson/rangePlan.ts:34-35`.
- **Mutations:** changing `request.endSec <= span.endSec` to `<` (M2), or `request.startSec >= span.startSec` to `>` (M3), passes all 114 focused tests.
- **What the tests miss:** they cover refusals (inside a cut, outside the clip, malformed) but never accept a range that *ends exactly at a cut start or clip end*, or *starts exactly at a cut end or clip start*.
- **Failure scenario:** with M2 applied, every range ending at a kept boundary is refused, for example 0.5-1 before a 1-2 cut, or 0-5 to the clip end. With M3, a range starting exactly at a cut end (2-4) is refused. These are the slice's headline "half-open, no clamp" semantics. My probe shows the shipped code is correct.
- **Fix:** add accepted cases for start == kept start and end == kept end.

### T21-2 — Low (test gap): several new guards are unexercised

Each of these mutations survives the focused set:
- **M16:** removing the schema anchor `keptSpans[0].startSec !== startSec` (`mediaSelection.ts:39`). An imported claim with a leading unexplained gap, such as `startSec 2` with the first span `3-8`, would then validate. The existing `{startSec: 4}` case is caught by a different clause.
- **M5:** cap `> 128` changed to `> 129` (`rangePlan.ts:44`). The test uses 130 spans, so an off-by-one is invisible. My probe shows 128 accepted and 129 refused.
- **M9:** `hasMediaSelection: true` always (`fileCommands.ts:27`). Only the true case is asserted.
- **M7:** the UI plan-echo check is disabled (`LessonGuideDialog.tsx:368-372`).
- **M13:** the UI `store.dirty` refusal is removed (`LessonGuideDialog.tsx:353`). For render inputs, main's fingerprint compare backstops it, but a dirty non-render edit would pass.

None of these is a shipped defect; all the guards are present and correct. They just are not pinned.

### N21-1 — Nit: range-attach `project-changed` text talks about the still

- **Where:** `en/timeline.json:322`. The new dialog test asserts this message.
- **What:** a refused range attach shows "…then capture the still again". The user was attaching a range, not capturing a still.
- **Fix:** a neutral wording or a range-specific code.

### N21-2 — Nit: the evidence fixture is left in its post-mutation state

- **Where:** `openscreen-evaluation/overnight-2026-11-06/lesson-range-fixture/projects/proj_5a5c….openscreen`. It has `sourceStartSec 0.25`, from the stale-fingerprint step.
- **What:** re-planning 0.5-4 on the artifact as stored gives 0.5-0.75 and 1.75-4, not the documented 0.5-1 and 2-4. `probe-result.json` matches the pre-change state. Only the `.cjs` bundle is kept, not the driver source.
- **Fix:** document the final state, or keep the driver.

### Not findings

- **Removing `if (!current()) return;` after IPC (M14) survives.** It is redundant with the `current()` check inside `setLesson`. The only effect would be a stale error message after a generation change.
- **Programme seconds are continuous floats.** A near-zero-length plan at a large ruler offset could fail the schema's `end > start` check and surface as `lesson-operation-failed` instead of `range-unavailable`. This is cosmetic.

## Mutation results

All mutations were run against my snapshot's focused set (8 files, 114 tests). The source was restored after each one.

| # | Mutation | Result |
|---|---|---|
| M1 | export keeps `mediaSelection` | killed |
| M2 | end endpoint exclusive | **survived** (T21-1) |
| M3 | start endpoint exclusive | **survived** (T21-1) |
| M4 | no overlap refusal | killed |
| M5 | cap 129 | **survived** (T21-2) |
| M6 | UI no late-document check | killed |
| M7 | UI no echo check | **survived** (T21-2) |
| M8 | no pre-read parse | killed |
| M9 | query presence always true | **survived** (T21-2) |
| M10 | attach ignores previous | killed |
| M11 | no unprobed refusal | killed |
| M12 | no fingerprint compare | killed |
| M13 | UI no dirty check | **survived** (T21-2) |
| M14 | no `current()` check after IPC | survived (redundant guard) |
| M15 | attach does not demote to draft | killed (2 tests) |
| M16 | schema no first-span anchor | **survived** (T21-2) |
| M17 | N20-2 heading fallback reverted | killed (N20-2 closed) |
| M18 | lesson transport hardcoded `"http"` | killed (N20-1 closed) |

## My own checks

**Setup:** pinned Node v22.22.1. The tests ran from a `git archive 8e0316ab` snapshot at `~/.cache/r18s/src`, outside the checkout. `node_modules` was linked per entry, excluding `.vite` and `.vite-temp`. TMPDIR was `~/.cache/r18s/tmp`.

**Results:**
- **Full Vitest:** 424 files passed; **5,591 passed, 1 skipped** (5,592), 53.2 s. The skip is an environment skip: the FFmpeg-on-PATH integration tests (`audioPeaks` / `extractAudio`) cannot see FFmpeg from this snapshot. It is not related to this slice. The worker's 0-skip figure was not reproduced in this environment.
- **Focused:** 8 files and 114 tests pass. They are mediaSelection, service, IPC lesson, fileCommands, MCP server, LessonGuideDialog, navigation and programme-time.
- **Broader lesson set:** 10 files and 102 tests pass. They are draftStore, fileCommands, service, lesson-tools, LessonGuideDialog, frameSource, lesson, mediaSelection, navigation and output.
- **Root and test `tsc --noEmit`:** exit 0.
- **Biome, whole repo:** 0 errors and 35 warnings, matching the baseline. The 35 touched TS/TSX/JSON files are clean.
- **i18n check:** passed, with 1253 keys and 15 locales. The new keys are English fallback, not translations.
- **Checkout:** clean before and after. HEAD is `8e0316ab`, and `main` is `fd2775e2`.

**Not run:** Electron, browser, PDF, native, Rust or desktop acceptance; screen-reader checks; any media decode or encode. I did not re-run the worker's `.cjs` fixture probe; my probe replaced it.

## Limits and next

These range references are bounded editor-ruler claims. They are not verified media.

Before any timed-player, frame, audio or caption claim, the next slice needs three things:
1. Materialization.
2. Revalidation against an explicitly selected, unchanged source.
3. Proof from the actual encoded output.

Stored references also become stale silently after a project edit. The UI and query do not indicate staleness (disclosed). Nothing here approves those later stages.
