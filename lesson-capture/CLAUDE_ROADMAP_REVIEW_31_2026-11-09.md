# Claude roadmap review 31 — selected-step MP4 editor export (9 November 2026)

Reviewed: exact `edb74a00f8445d9889db1ec069fb87ebba1b9925` ("feat(lesson): export a confirmed
selected step as MP4") against `bc906e39f51a7b3c90f381a298fc00bbd8e13677`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
The checkout was clean at the exact HEAD at the start and at the end. This review added only
this file.

Read: `AGENTS.md`, the current handoff, `SELECTED_STEP_MP4_2026-11-09.md` and the full diff
(36 files). Focus: `electron/ipc/lessonRangeExport.ts`, `electron/ipc/lessonWorkflow.ts`,
`electron/lesson/rangeExport.ts`, the `rangeMedia.ts` changes, the `handlers.ts` and
`editorRangeAuthoring.ts` wiring, preload, `LessonGuideDialog.tsx`/`LessonRangeControls.tsx`,
the request/progress schemas and the locales.

## Verdict

**Accepted within the stated scope. There are no High or Medium findings.** One Low test gap
and a few nits remain.

- **Usable editor MP4 route.** It exports only the included step, from an existing v2 pin
  for the session's project. There is no legacy upgrade, refresh or full-project fallback.
- **Authority.** A main-frame, registered editor with a current saved session and a clean
  dirty flag is required, and the bounded lesson snapshot is strictly validated. Source paths
  come only from the saved project. Approval is checked lexically and on the canonical path
  only after the native picker returns. A path change between reads is impossible because the
  render fingerprint covers clip paths, so `prepareLessonRangeMedia` refuses first.
- **Ownership.** The operation is owned by window, `lesson-range` channel and operation UUID
  through `renderOwnerJobs`. Native compute goes through `nativeRenderJobs`, and the lease is
  held until native settlement.
- **Late cancels.** The final check and the receipt write happen in one synchronous turn, so
  an IPC cancel cannot slip between them. A lifecycle invalidation that arrives later refuses
  the result without disclosing the path.
- **Receipt.** It carries the submitted lesson ID, step ID and revision, video validation
  only, and both audio flags false.
- **Normal exports, stills and concurrency** are preserved; a full-app real-Electron run
  confirmed the behaviour (below).

The document is honest about the important limits:
- The tests use stubbed dialogs and jsdom.
- The worker's Electron run was an isolated harness.
- There is no physical, picker-click or other-platform acceptance.
- Non-English strings are English fallback text.
- N29-3 and N27-3 are still open.
- The review-29 anomaly is still recorded as unreproduced.

## Findings

### L31-1 Low — the export's source-grant ordering and native-cancel request are not pinned by tests

My single-guard mutants against the worker's 26 focused files (453 tests) survive for:

- **X9:** removing the lexical grant check *before* `fs.realpath`
  (`electron/lesson/rangeExport.ts:111-113`). An unapproved source path would then be
  resolved on the filesystem before being refused by the canonical check at `:119`. No
  content is read or hashed, but the documented "grants before filesystem resolution"
  ordering is untested on this route.
- **X10:** removing the canonical-equals-resolved check (`:119`). If a symlinked ancestor
  points at an equally approved path, it would no longer be refused. No test puts a symlink
  ancestor on the export path.
- **X12/X13:** removing the native cancel request (`:81` and `:179`). Cancellation would
  still refuse certification, but only after native work completes.

My real-Electron probe P6 shows that the shipped code does request native cancellation:
cancelling mid-render returns promptly with `range-export-cancelled` and an empty directory.

Fix: add a pre-`realpath` spy assertion, a symlink-ancestor case and a native-cancel spy
assertion to `lessonRangeExport.test.ts`.

### Nits

- **N31-1: redundant guards (equivalent mutants).** X7 (pin project vs authority; the reader
  ID check refuses it later), X14/X16 (`check()` after the picker and after validation;
  `emit()`/`readDocument` check immediately after), X17/X28 (the progress authority check
  exists in both the service and IPC), X19 (`settled` in `stop`; no macrotask can reach it),
  and X20 (the open-project invalidation added in `editorRangeAuthoring.ts:34` duplicates
  `nativeBridge.ts:266`; both are registered in production).
- **N31-2: UI-only gaps.** X18 (main can emit `frames > totalFrames`; the renderer schema
  rejects it), X25 (progress operation-ID match in the UI) and X26 (the export button is
  enabled while dirty; the handler and main both refuse) have no test.
- **N31-3: project change is reported as a user cancel.** A project reselect or navigation
  while the picker is open or during render is reported as `range-export-cancelled` ("MP4
  export stopped…") rather than `project-changed` (probes P7 and P10). This is honest but less
  specific.
- **N31-4: cancelling cannot close the picker.** An IPC cancel while the native picker is
  open cannot dismiss it, so the operation stays busy until the user closes the dialog. This
  is consistent with "busy until actual work settles". After a native cancel the disclosed
  "unfinished" directory can be empty (P6).

## Inventory investigation

The imported previous inventory (`preserved-reports-imported.json`) differs from the current
file in one entry, `NATIVE_RENDER_OWNERSHIP_2026-11-09.md`. I checked this against git:

- Its recorded hash `cb9f8b74…` equals the file at `6821c776` and `27136d0f`.
- Coordinator checkpoint `bc906e39` edited that summary, adding the review-29/30 acceptance
  lines; the file is `56e54d5b…` at both `bc906e39` and `edb74a00`.
- The worker's commit does not touch it.

The worker's "pre-existing stale entry" explanation is correct and transparent. The original
bytes survive only in git history, not on disk; that is a coordinator edit, not a slice
regression. The imported inventory equals the review-29 follow-up inventory plus 2 entries
(`CLAUDE_ROADMAP_FOLLOWUP_29` and review 30, both at their post-`bc906e39` hashes). Review 30
in the tree is my report, `47b879db…`.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive edb74a00` copies in my scratchpad, in directories whose names
  contain spaces. `node_modules` is symlinked per entry. The real addon directory is symlinked
  read-only and its SHA-256 is unchanged at `5d16ea98…`.

| Check | Result |
| --- | --- |
| Worker's 26 focused files | 453 pass / 26, 0 skip |
| Both `tsc` configurations | exit 0 |
| Biome on the 5 main changed sources | clean |
| Production `npx vite build` | pass |
| My mutants | 27: 13 killed, 14 survived (above), 0 timeouts or load failures; snapshot restored clean |
| Worker logs | `full.log` 5902/441 pass; `mutations-final.json` 10/10 assertion kills. Not repeated by me. |

**Killed:**
- X1 export main-frame, X2 cancel main-frame, X3 cancel channel.
- X4 artifact-path disclosure gated on authority.
- X5 included target, X8 approval after picking, X11 returned project ID.
- X15 final check before the receipt.
- X21 workflow export dirty provider, X22 the `handlers.ts` live dirty provider (N30-1 now
  pinned).
- X23 UI stale result, X24 UI stale effect, X27 UI unmount cancel.

### Full-app real Electron probe

- **Setup:**
  - The production build launched as the whole app (not an isolated harness) through
    Playwright `_electron` under `xvfb-run`.
  - Isolated `--user-data-dir`, the real addon and validator, and a 6 s 640×360 source.
  - The editor was opened through `switch-to-editor`, plus a genuine second window.
  - `dialog.showOpenDialog` was stubbed in main; there were no picker clicks.
  - The pin was created through the real `lessonPlanRange` → `lessonConfirmRange` flow
    (ruler 0.5–5.5).

| Probe | Result |
| --- | --- |
| P1 export | `materialized`; directory mode 700 holds `range.mp4` (mode 600) + `range-export.json`. Independent `ffprobe -count_frames`: 640×360, 30/1, **150 frames**. Receipt target = submitted lesson/step/revision 0, audio flags false. Progress phases: destination → checking → rendering with frames (132/150) → validating. |
| P2 picker cancelled | `{status:"cancelled"}`, no new directory |
| P3 second window / P4 dirty flag | `project-changed`, refused before the picker |
| P5 not included / unpinned / v1 selection / extra `destination` field | `range-target-changed` / `range-export-unattested` / `range-export-unattested` / `lesson-operation-failed`, all before the picker |
| P6 owner cancel during render | cancel `true`; result `range-export-cancelled` with the (empty) artifact directory disclosed |
| P7 project reselect while picker open | `range-export-cancelled`, no directory created; a later export after reselect succeeds |
| P8 normal MP4 export from the second window during range render | refused "A native render is already running"; the range export succeeds |
| P9 second window cancels the owner's operation ID | `result:false`; the owner's export succeeds |
| P10 reload during render | main returns `range-export-cancelled` with no `artifactPath` |
| Dialog calls | 8, matching only the requests that passed pre-picker authority |

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 189 entries in `preserved-prior-authoring-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 64 entries in `preserved-reports.json` re-hashed, 0 mismatches.
- **Addon:** hash unchanged.
- **Checkout:** clean; no commit, push, reset, stash or checkout.
- **Cleanup:**
  - The probe closed via `app.close()`, and no Electron process remains.
  - Removed: probe user-data (including the editor's OPFS copy), destinations, media and
    outputs.
  - Kept: scratch snapshots and probe JSON in the session scratchpad.

## Next

- Optionally close L31-1 (three test assertions) before the coordinator private push.
- Then bounded CLI/MCP selected-step confirmation/refresh/export parity on these shared
  services, with explicit source and destination authority and transport-owned cancellation.
- Physical editor/picker acceptance, other platforms, audio, the timed player and course
  packaging remain open.
