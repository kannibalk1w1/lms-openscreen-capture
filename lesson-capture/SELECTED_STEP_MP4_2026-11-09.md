# Selected-step MP4 editor export — 9 November 2026

Resumption base: accepted/pushed `bc906e39f51a7b3c90f381a298fc00bbd8e13677`,
following actual [review30](CLAUDE_ROADMAP_REVIEW_30_2026-11-09.md), which accepts
`27136d0f` with no new High/Medium/Low findings. One implementation writer;
main/private-main remain `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. Original
review reports, source/evidence and the external LMS workflow report are preserved.
The implementation stops for coordinator exact-SHA Claude review/fixes/private push.

## Delivered workflow

In **Lesson guide**, open/create an editable lesson, include the desired step,
select an explicit range in the saved video project and explicitly confirm the
current source (or explicitly refresh an existing same-project selection after
reviewing it). **Export this step’s MP4** exports only that included step’s v2
confirmed range. Choose a destination directory in the native picker. Cancelling
that picker performs no new source media read, native render or output creation.
There is no automatic source capture/refresh, legacy upgrade or full-project fallback.
Original lesson/source/project bytes and prior refresh history remain unchanged.

The scope text and fixed errors explain confirmation, stale/missing/unapproved
source, unsupported dependencies, busy work and incomplete exports. Progress uses
actual destination/source/render/validation phases and native frame counts when
known; it invents no percent. Cancellation requests belong to the initiating window,
channel and operation UUID. The button remains busy until the actual work settles,
including old-addon work that cannot immediately stop. Unfinished output remains in
its newly created directory, disclosed only while the caller's original authority
is current. A verified output directory is reported after validation, not attached
to or substituted into the editable lesson. Its receipt identifies the submitted
lesson ID, step ID and revision.

## Production boundaries

- [The production workflow registration](../electron/ipc/lessonWorkflow.ts) is used
  directly by `handlers.ts` and the integrated tests. It binds the existing saved
  document reader, still service, current editor session, live dirty provider,
  process-approved source paths and compositor. Nit N30-1 is pinned by an AST test
  of the actual `handlers.ts` callback binding plus independent live-provider tests
  through this production registration. This is not execution of the entire giant
  `registerIpcHandlers` function in unit tests.
- [IPC](../electron/ipc/lessonRangeExport.ts) requires the main frame of the
  registered current editor, strict UUID/request fields, a valid bounded lesson
  snapshot, an existing included step and an existing v2 pin for the same project.
  No request field grants a source path or destination. Imported lesson paths do
  not select files: source paths come from the actual current saved project.
- [The shared service](../electron/lesson/rangeExport.ts) checks requested and
  returned project IDs, current session/dirty state across awaits, absolute source
  paths, lexical grants and canonical same-path grants. It delays source filesystem
  resolution/reads until after destination choice. Pins are compared with content;
  they are never refreshed during export. The main process has the submitted bounded
  lesson snapshot, not an authoritative live renderer lesson model. The UI guards
  target/project/snapshot/generation and sends cancellation on replacement,
  exclusion, dirty state, unmount and project changes; main session/navigation/crash
  invalidation independently prevents stale certification.
- Existing `renderOwnerJobs` owns the logical window/channel/operation. Existing
  `nativeRenderJobs` owns actual MP4/frame/GIF compute across compositor instances.
  Same-window conflicting operations refuse before the picker; another window's
  native work can refuse at the compute boundary after destination/source checks,
  retaining an honest unfinished directory. Native callbacks carry the owned job
  handle and await its actual result. Cancellation aborts observation/certification,
  requests native cancellation where supported and waits for settlement; AbortSignal
  is not claimed to interrupt an unsupported native helper or validator immediately.
- [The accepted materializer](../electron/lesson/rangeMedia.ts) keeps exact cuts and
  speed and validates source/project/pin equality before/after native work. The
  actual Linux validator checks stored video sample timing, full decode and hashes.
  Additional authority/cancellation checks cover picker, native, decode and final
  receipt publication. Small bounded receipt metadata is synchronously published
  after the final check in one JS turn, eliminating a cancellation await between
  check and publication. A later cancel can lose to already-completed publication;
  UI reports that completion honestly. No hard filesystem deadline is claimed.

## Supported subset and parity limits

Linux only; 30 fps H.264, at most 1280 px longest output edge, selected programme
range from 1/30 second to 120 seconds, up to 32 kept spans, 8 source files and
8 GiB observed source content. No webcam, imported audio tracks, background or
annotation images, click sound or other unsupported scene dependencies. The backend
fails closed on Windows/macOS. Native source audio or synthesized silence may be
present; both audio verification flags remain false. Video validation is not audio
alignment, physical capture acceptance or a playback guarantee.

There are no selected-range confirm/refresh/export commands for CLI/MCP/HTTP yet;
they retain their existing normal-export/query/static behavior and redaction.
No portable course package, timed player, caption package, loop/replay/speed player,
local learner progress or authenticated/immutable source history is delivered.
Private generated operation IDs still count against the 4096-per-window allowance
(N29-3). Hash-navigation invalidates the editor session and requires a correctly
recreated/reselected editor; no broader navigation grants were added (N27-3).
The old review29 first-run observation remains unreproduced and unchanged.

All 15 locale catalogs contain the added keys. New non-English text is explicitly
English fallback copy awaiting human translation; key parity is not translation
or linguistic/accessibility acceptance.

## Validation and evidence

Unique retained evidence directory:
`../openscreen-evaluation/selected-step-mp4-2026-11-09T1400Z/`.
Pinned Node **22.22.1**, npm **10.9.4** for commands, with the Electron runtime
version recorded separately. Exact argv/exits/durations are in `run-check.py` and
individual JSON/log files. No native source was changed or rebuilt.

- Focused production registration/service/UI, original exporter, source identity,
  timing/decoder and ownership regressions: **453 tests / 26 files**, zero skips.
  The two new files contain **44 tests**. Native/decoder doubles in authority/UI
  tests isolate control flow and are not media acceptance. Lifecycle fixtures wait
  for actual native latch readiness, not just mock invocation.
- Both TypeScript configurations, Biome, documentation, i18n and production Vite
  are checked; final exact results and full-suite counts are recorded below.
- Ten single-guard controls cover main frame, cancellation channel, included target,
  returned saved-project ID, canonical grant before hashing, logical cancellation
  with unavailable native control, final receipt authority, actual main live-provider
  wiring, stale UI success and progress validation. The first pass killed eight;
  two survived because later redundant checks/available native cancellation hid the
  missing guard. Independent pre-hash and uncancellable-receipt assertions were
  added, both strengthened controls killed, then all ten were repeated together.
  Every mutated source was restored byte-for-byte; no timeout/load failure is a kill.
- Actual **Linux Node/N-API** proof calls production registered workflow handlers,
  confirms source explicitly and exports a copied five-second source with ruler
  range 0.5–4 seconds, cut 1–2 and speed 2× from 2–4. Real addon/validator produce
  **45 decoded frames / 1.5 seconds**, with stored sample/decode/hash receipt,
  target IDs, audio flags false and source/project/lesson unchanged.
- Actual **Electron 41.2.1** BrowserWindow + production preload + registered workflow
  + real addon/validator repeats that export, refuses dirty and foreign-window
  requests and cancels destination choice. This is an isolated IPC harness; editor
  registration/selection is set up as a fixture. The native directory dialog is
  stubbed, and this is not the full application's GUI or actual picker clicks.
- Initial Node harness used two independent stub registries and failed before
  rendering; the corrected shared registry succeeds. Initial Electron attempts
  failed Chromium shared-memory access (`ESRCH`); explicit launch sandbox/shared-
  memory flags enabled the disposable harness. A subsequent probe mistakenly
  returned a subscription function over executeJavaScript, producing a clone error;
  returning void fixes that harness error. All first logs remain preserved. These
  are distinguished from the older unreproduced review29 observation and are not
  labelled production defects. Own probe processes were closed; no user app killed.
- Computer-use capability snapshot reports no screenshots, window focus, hotkeys
  or native dialog surface support. Physical Linux GUI/picker, capture, Windows,
  macOS, audio alignment and release-candidate manual acceptance are **skipped**
  for that tooling/platform/scope reason. No physical pass is inferred from jsdom,
  Xvfb, IPC or native proof.

Final checks: **5902 tests /441 files**, zero skips, one full run (54.17s Vitest;
55.42s command). Both root/test TS pass; production Vite passes (29.62s), Biome
passes with35existing warnings/0errors, docs37files and i18n15catalogs/1265literal
keys pass. The final full5902/441 run follows all ten restored mutations; focused
mutant selection intentionally skips unrelated tests, unlike the zero-skip final
focused/full runs. Early fixture/type/synchronization failures are retained and
corrected; the full suite passed on its first run.

Preservation: **112** original native evidence files, **189** prior authoring/
ownership/follow-up evidence files and **64** report/user-report entries match.
The imported previous inventory's ownership-summary hash was stale because
coordinator checkpointbc906e39 had already updated that mutable summary; its base
bytes were verified with git show, the imported inventory retained and the current
base hash recorded explicitly. This task changes no original report. Addon SHA256
stays `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

## Review gate and next item

Coordinator independently reviews the exact local SHA, requests fixes if needed and
pushes only the accepted private checkpoint. After acceptance, next is bounded
CLI/MCP selected-step confirmation/refresh/export parity using these same services,
with explicit source and destination authority and transport-owned cancellation;
physical editor/picker acceptance remains outstanding. Course packaging and timed
player are later slices. No further phase starts in this implementation dispatch.
