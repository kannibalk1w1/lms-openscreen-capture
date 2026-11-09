# Claude roadmap review 29 — shared native render ownership (9 November 2026)

Reviewed: exact `6821c77602731723f2fe1fa3f98c9035f5510440` ("feat(render): share native job
ownership across callers") against `623fa85c119484577d3ad0bfcd9bc0f550cd3c89`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
The checkout was clean at the exact HEAD at the start and at the end. This review added only
this file.

Read: `AGENTS.md`, the current handoff, `NATIVE_RENDER_OWNERSHIP_2026-11-09.md`, the full diff
(21 files), and every production compositor caller: the native bridge, `handlers.ts`
(`loudnessService`, the media-tools `renderFrames`, `LessonService`), `mcp/media-tools.ts`,
`cli/runnerHost.ts`, `recording/webm-seek-index.ts`, and the renderer bridge client.

## Verdict

**Accepted within the stated scope. There are no High or Medium findings.** One Low finding
and one Low test gap should be fixed before the selected-step MP4 slice builds on this code.

- **Ownership model works.** One process-wide native lease, and one shared owner registry
  keyed by `WebContents` object, channel and operation ID.
- **Every timeline compute route goes through the lease:** MP4/GIF with or without an ID,
  frame batches, MCP frames, and lesson stills.
- **Preview, readFrame, loudness, probes and remux** are untouched, as stated.
- **The lease is held until native settlement.** Cancel, invalidation and old handles are
  fenced. Stale certification is refused.
- **Real-Electron behaviour confirmed with the real addon:** cross-window serialization,
  foreign cancel refusal, ID reuse refusal, invalidation by project selection and reload, and
  still authority.

The ownership document is accurate and honest about the remaining native overlap. Separate
processes, such as the headless CLI next to the app, have separate leases; interactive preview
and readFrame are not leased; and a stuck uncancellable native job blocks indefinitely. It
does not claim GUI-click, native-picker or physical acceptance.

## Findings

### T29-1 Low — the new lesson-still authority is not pinned by any test

The still authority was added in this commit (`electron/ipc/lesson.ts:12`, `:45`, `:53`,
`:61`, `:22`; wiring at `handlers.ts:5081-5082`).

I removed each of the following, one at a time; each change passes all 17 focused files
(215/215):

- L1: the main-frame check (`lesson.ts:45`).
- L2: the request-project versus session-project check (`:53`).
- L3: the post-render `authority?.assertCurrent()` (`:61`).
- L4: the `NativeRenderInvalidatedError` → `project-changed` mapping.
- H1: the whole `authorizeFrame` argument in `handlers.ts`, so stills from any window and
  for any project work again.

The parameter is optional (`authorizeFrame?`), so nothing forces production to pass it.

My real-Electron run confirms the current production behaviour:
- A still from a non-editor window → `project-changed`.
- A still from the editor for a selected, saved project → 640×360 JPEG.
- A still while the same window is exporting → `render-busy`.
- A still for another project ID → `project-changed`.

L3 (a project reselect or dirty change *during* the render) and L4 were not observed at
runtime.

Fix: make `authorizeFrame` required, and add registration tests that kill L1–L4 and H1.

### L29-1 Low — capability and lease fallbacks are untested

- **B5:** changing `exportId === undefined` to `true` (`nativeBridge.ts:518`) lets ID-based
  GIF exports on old addons start without cancel capability. That silently drops the
  documented "ID-based GIF keeps its capability requirement". The mutant survives.
- **C6:** removing the lease from the legacy uncancellable GIF fallback
  (`compositorViewService.ts:1012-1016`) would let old-addon GIF exports overlap other native
  jobs. The mutant survives.

Neither affects the shipped addon (`5d16ea98…`, which has GIF controls), so this is a
regression risk, not a current defect. Add one test each.

### Nits

- **N29-1: main-frame checks untested.** The checks on `exportMulti`/`exportGif`
  (`nativeBridge.ts:456`/`:493`) are untested (B1/B2 survive). Subframes have no preload in
  this app, so they are unreachable today. The `cancelExport` check is tested (B3 killed).
- **N29-2: two small `ExportJobs` paths untested.** Re-invalidation of a job invalidated
  during synchronous start (J7, `exportJobs.ts:90`) and progress suppression after
  invalidation (J9, `:82`) have no test.
- **N29-3: private IDs use up the per-window ID allowance.** Main-generated IDs for lesson
  stills (one per still) and legacy no-ID exports count against the 4096 per-window bound.
  These IDs never reach a renderer, so they don't need replay tracking. An editor that is
  never reopened refuses all renders after 4096 operations ("Reopen this window"). This is
  unlikely in practice.
- **Redundant guards (equivalent mutants):** N3 (old-handle cancel), N6 (invalidate),
  N7 (release) and J11 (entry delete). `settled` and the single-lease rule already cover
  them.

### Observations (not regressions)

- The native bridge still accepts any renderer-supplied `outPath` and clip paths for exports.
  That is unchanged; this slice adds no filesystem authority and removes none.
- After a reload, the editor auto-opens its most recent project, which sends open-project. An
  export started in the narrow window before that message is cancelled (observed:
  `Export cancelled.` on a retry 329 ms after reload). This fails closed and matches the
  documented "project selection invalidates".
- **Unreproduced first-run anomaly.** In my very first Electron probe run, two exports from
  the same window both completed while a third export started before them was still in flight.
  That run had a response-parsing bug and no main-process logging.
  - I re-ran the identical sequence five times with main-process logging: twice on a fresh
    profile, once with a genuine second `BrowserWindow`, and twice more in variant scripts.
  - Every concurrent request was refused, in about 1–3 ms, with "A native render is already
    running".
  - The production bundle contains exactly one `NativeRenderJobs` class.
  - The native-bridge handler has no `await` before `exportJobs.run`.
  - I found no code path that explains it. I report it so it is not lost, not as a reproduced
    defect.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 6821c776` copies in my scratchpad, in directories whose names
  contain spaces. `node_modules` is symlinked per entry. The original addon directory is
  symlinked read-only; its SHA-256 is unchanged at `5d16ea98…`.

| Check | Result |
| --- | --- |
| Worker's 17 focused files | 215 pass / 17, 0 skip |
| Both `tsc` configurations | exit 0 |
| Biome lint on the 6 changed sources | clean |
| Production `npx vite build` (snapshot) | pass; the busy-error class appears exactly once in `dist-electron` |
| My mutants | 36: 21 killed, 15 survived (the 15 above), 0 timeouts or load failures; snapshot restored clean (`git status` empty) |
| Worker logs | match its claims: first full run 5844 + 1 failure in the unchanged `LeftPanel.copyMessage.test.tsx`; isolated recheck 4/4; retry 5845/438. Not repeated by me. |

**Killed mutants:**
- Lease: busy (N1), invalidated refusal (N4), sync-throw release (N5), accepted cancel
  invalidates (N8).
- `ExportJobs`: stale refusal (J1), channel (J2), used ID (J3), bound (J4), navigation and
  crash listeners (J5, J6), accepted cancel (J8), owner busy (J10).
- Bridge: cancel main-frame (B3), open-project invalidation (B4), invalidated→CANCELLED (B6).
- Compositor: leases on `renderFrames`, `exportMulti`, `exportGif`, legacy and controlled MP4,
  and controlled GIF (C1–C5, C7).

### Real Electron IPC probe

- **Setup:**
  - Production build of 6821c776 in a directory with spaces, launched through Playwright
    `_electron` under `xvfb-run`.
  - Isolated `--user-data-dir`, `--mute-audio`, `DO_NOT_TRACK=1`.
  - The real addon exporting an 8 s 640×360 H.264 project (240 frames, about 0.9 s per warm
    export).
- **Results (logged runs):**
  - **Concurrency:** while a legacy or ID export is running, a second export from the same
    window or from a genuine second window is refused in 1–3 ms ("A native render is already
    running").
  - **Cancellation:** a second window cancelling the editor's export ID gets
    `{accepted:false}`. The owner's cancel gets `true`, the export ends `CANCELLED` in about
    280 ms, and reusing that ID is refused.
  - **Project selection:** an open-project message mid-export ends it `CANCELLED`, with no
    output certified.
  - **Reload mid-export:** an immediate new export is refused busy until the old native job
    settles; a later retry succeeds.
  - **Lesson stills:** non-editor window → `project-changed`; editor with a saved, selected
    project → 640×360 JPEG; still during the same window's export → `render-busy`; foreign
    project → `project-changed`.
- **What this covers:** real IPC, real senders, main frames and windows, the real addon, and
  real native cancellation.
- **What this does not cover:**
  - Uncancellable or old-addon behaviour. That remains covered only by the worker's masked
    Node/N-API proof and the unit tests.
  - Clicking the GUI dialog, native pickers, physical capture, and Windows or macOS.

## Preservation and cleanup

- **Prior evidence:** 112 distinct files re-hashed, 0 mismatches.
- **Authoring evidence:** 86 entries in `preserved-authoring-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 60 entries in `preserved-reports.json` (reports plus your external report)
  re-hashed, 0 mismatches.
- **Addon:** SHA-256 unchanged.
- **Checkout:** clean; no commit, push, reset, stash or checkout.
- **Cleanup:**
  - Every Electron probe closed via `app.close()`; none remains.
  - Removed: probe user-data directories (including the editor's OPFS media copies), test
    media and export outputs.
  - Kept: scratch snapshots and small probe JSON in the session scratchpad; none in the repo.

## Next

- **Before building on this:** fix T29-1 (required `authorizeFrame`, plus still-authority
  tests) and L29-1 (B5/C6 tests), then do the coordinator private push.
- **Then the documented selected-step MP4 slice:**
  - Explicit native destination picker before any new source observation or render.
  - Source-pin and timing checks.
  - Progress, cancel and status.
  - Ownership through `renderOwnerJobs` with the scoped native handle.
  - Actual full-video validation before completion.
- **Still open:** CLI/MCP parity, the timed player, portable courses, verified audio, and
  physical or other-platform acceptance.
