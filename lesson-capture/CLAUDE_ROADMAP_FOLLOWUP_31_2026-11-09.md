# Review31 source-grant/cancel test follow-up — 9 November 2026

Base: `edb74a00f8445d9889db1ec069fb87ebba1b9925`, accepted within scope by actual
[review31](CLAUDE_ROADMAP_REVIEW_31_2026-11-09.md), with no High/Medium findings.
This narrow follow-up addresses L31-1 and N31-2 through production route/service/UI
regressions and independent mutation controls. No production behavior changes,
new transport, native source changes, preview/global refactor or picker control.
One implementation writer; main/private-main stay
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. No push or additional worker.

## L31-1 regressions

[Production registered workflow tests](../electron/ipc/lessonRangeExport.test.ts)
invoke the actual `registerLessonWorkflow` bindings, `LessonRangeExportService`,
compositor ownership and saved document reader, with real disposable project/source
files. Electron transport/dialog and native addon/decoder are test doubles here;
authority, filesystem and cancellation policy are the production implementations.

- **X9, lexical source approval before realpath:** an absolute but unapproved
  saved source fails with `range-export-source-unavailable` after destination
  choice. Spies independently require zero `fs.realpath`, source opens or native
  calls. The later canonical approval refusal cannot conceal an early resolution.
- **X10, canonical equality with equally approved paths:** a real directory symlink
  is an ancestor of the selected source path. The saved project and an imported
  content pin match that lexical path and current bytes, and both the lexical and
  resolved paths are explicitly allowed. The route still refuses before source
  opens, native rendering or output creation. Removing equality alone permits a
  synthetic validated export, so the test does not depend on a missing grant,
  changed render fingerprint or final-component symlink refusal.
- **X12, stop after native handle acquisition:** existing cancel/navigation/project
  lifecycle cases now assert the actual addon's scoped cancellation function was
  requested exactly once while the controlled native result remains pending.
  The existing lease, incomplete receipt and retry checks remain.
- **X13, cancel during native start:** the addon stand-in synchronously invokes the
  real registered owner-cancel route before `startExportMulti` returns its handle.
  Cancellation is accepted while the addon cancel spy is still untouched; once
  the production service acquires that handle, exactly one native cancel is
  required. The competing same-window operation stays busy until actual native
  settlement; the receipt is absent and the next operation succeeds without a
  stale cancellation. No artificial replacement of the service's start/stop guards.

## N31-2 regressions

- A native callback emits valid 0/12/45, negative, fractional, nonfinite and
  over-total frame counts through the real compositor/service route. Only valid
  counts reach the sender; this independently pins main-process filtering before
  the renderer schema can reject invalid progress.
- [Actual Lesson guide integration tests](../src/components/ai-edition/v4/LessonRangeExport.integration.test.tsx)
  send a different operation's otherwise-valid progress and require the current
  count to remain unchanged. Renderer schema rejection independently covers
  negative/fractional frames, zero total, excessive total and frames above total.
- The real export button must be disabled while dirty and reenable once clean,
  independently of the handler/main refusal. Clicking it while disabled starts
  no export; there is no product behavior change.

## Remaining limits

**N31-3 remains:** project reselect/navigation invalidation can report the existing
`range-export-cancelled` status rather than the more specific `project-changed`.
It refuses certification and paths according to the existing lifecycle boundary.
**N31-4 remains:** the cancellation IPC cannot programmatically dismiss the native
picker. Busy ownership stays held until that dialog actually settles; the user
must close it. Native cancellation can leave an empty unfinished artifact directory.
No unsupported native dialog-control capability is invented.

N31-1's redundant/equivalent guard cases are intentionally unchanged. N29-3's
4096 private-operation accounting and N27-3's fail-closed hash-navigation/reselect
limit remain. The old review29 observation remains recorded as unreproduced.
No new physical/picker-click/audio/other-platform/player/package acceptance.
CLI/MCP selected confirmation/refresh/export parity remains next only after the
coordinator's exact-SHA follow-up review/fixes/private push.

## Validation and retained evidence

Unique directory: `../openscreen-evaluation/review31-followup-2026-11-09T1431Z/`.
Pinned Node **22.22.1**, npm **10.9.4**; exact argv/exits/durations in `run-check.py`
and individual JSON/log files.

- **458 tests /26 focused files**, zero skips; the two export integration files
  contain 49 tests, including 5 new cases and stronger assertions in existing cases.
- **14 single-guard controls all produce assertion kills**, zero survivors,
  timeouts or compiler/load failures. X9/X10/X12/X13 and N31-2 native/UI boundaries
  are isolated, rather than relying on equivalent later guards. Original source bytes are
  restored after every control, with hashes verified again after final checks.
- Both TypeScript configurations pass; Biome passes with35existing warnings and
  0errors, docs37files and i18n15catalogs/1265literal keys pass;126local links
  resolve. No new Vite/full
  suite/native rebuild is warranted: production and native code remain byte-for-
  byte identical to edb74a00. Prior worker5902/441 full and Vite are historical,
  not fresh follow-up runs; actual reviewer31 independently confirms the build.
- The original report31 remains verbatim. Its **full-app** real Electron proof
  is the reviewer's own run, not this worker's isolated earlier harness: it uses
  the production app, preload/native/validator and confirms150frames with current
  source, owner cancellation, wrong-owner/dirty/concurrency/navigation refusals.
  Its destination dialog is still stubbed; no GUI picker clicks or physical/
  other-platform/audio acceptance is inferred. This follow-up does not rerun it.
- All old proofs, initial Chromium/stub/clone errors, manifests and reviewer
  reports remain. The imported stale ownership-summary inventory entry is still
  explained by the pre-existing coordinatorbc906e39 edit; neither that summary
  nor the imported inventory is changed here. Original bytes remain in git history.

Preservation verified: **66** original report/user-report entries, **482** prior
selected-export/authoring/ownership evidence files (including all initial logs)
and **112** original native evidence files match. Original report31 SHA256 is
`c39b7c99e691818df0b64da2f489401d6b8d697150202a20251f504e4175c260`;
addon remains `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
`preservation.json` retains the stale imported entry explanation. Final focused
458/26 runs after all14mutations and byte-for-byte source restoration; these are
new follow-up results, not a fresh full suite/native/Electron run.

## Review gate

Commit this validated test/documentation follow-up locally, then stop. Coordinator
gets actual Claude exact-SHA follow-up, fixes if necessary, then private push;
only after that checkpoint does autonomous CLI/MCP parity proceed.
