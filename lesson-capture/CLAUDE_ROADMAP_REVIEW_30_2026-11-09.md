# Claude roadmap review 30 — review-29 follow-up (9 November 2026)

Reviewed: exact `27136d0f0766621c55a0ac497f58570c08ee165d` ("fix(lesson): require production
frame authorization") against the review-29 base `6821c77602731723f2fe1fa3f98c9035f5510440`,
branch `lesson-capture/input-boundaries`. Main is still
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. The checkout was clean at the exact HEAD at the start
and at the end. This review added only this file.

Read: the committed review 29 (`a46e3f0d…`, 194 lines; it matches the report I wrote, including
its unreproduced first-run observation), `CLAUDE_ROADMAP_FOLLOWUP_29_2026-11-09.md`, and the
full diff (13 files).

## Verdict

**Accepted. T29-1 and L29-1 are closed, N29-1 and N29-2 are closed, and there are no new High,
Medium or Low findings.**

- N29-3 (private IDs count against the per-window ID limit) stays documented and is not
  claimed as fixed.
- The earlier first-run Electron anomaly is kept, still labelled unreproduced.
- No export route has regressed. Preview, readFrame, loudness and remux are unchanged.

## Review-29 items

| Item | Status | Evidence |
| --- | --- | --- |
| **T29-1** still authority untested, optional wiring | **Closed** | `registerLessonHandlers` now requires `authorizeFrame` in its type and at runtime (`lesson.ts:12-16`). It refuses before any `ipcMain.handle`. A new shared production function, `registerEditorLessonHandlers` (`lesson.ts:110-117`), always binds `editorRangeSessions.capture` with a required dirty-state provider. `handlers.ts:5075-5081` uses it. The new `lesson.authority.test.ts` calls that exact function. My mutants R1–R4 and L1–L4 are all killed. |
| **L29-1** B5/C6 fallbacks | **Closed** | Through the real bridge registration and the real compositor service, with a native-addon stand-in that has no GIF controls: a caller-ID GIF is refused before any native call (B5 killed), and a legacy GIF holds the lease through invalidation (competing frame batch and MP4 refused; late success → `CANCELLED`; next job only after settlement) (C6 killed). |
| **N29-1** export main-frame | **Closed** | Subframe `exportMulti`/`exportGif` are refused before any service call (B1/B2 killed). |
| **N29-2** re-invalidation and progress | **Closed** | J7 and J9 killed by new `exportJobs.test.ts` cases. |
| **N29-3** private-ID accounting | **Still documented, unchanged** | Listed honestly as a usability limit. |

## New observation (Nit, no action needed)

- **N30-1: the main callsite's dirty provider is not unit-tested.** If the provider passed at
  `handlers.ts:5080` is replaced by `() => false`, all 228 focused tests still pass (H1b
  survives). The follow-up's compile-contract control only covers *omitting* the argument
  (TS2554), not substituting a wrong one. My real-Electron probe confirms production
  behaviour: after `setHasUnsavedChanges(true)`, a still returns `project-changed`, and it
  succeeds again once the flag is cleared.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 27136d0f` copies in my scratchpad, in directories whose names
  contain spaces. `node_modules` is symlinked per entry. The original addon directory is
  symlinked read-only and its SHA-256 is unchanged at `5d16ea98…`.

| Check | Result |
| --- | --- |
| Worker's 18 focused files | 228 pass / 18, 0 skip |
| Both `tsc` configurations | exit 0 |
| Biome on the changed sources | clean |
| Production `npx vite build` | pass |
| My mutants | 18: 17 killed, 1 survived (H1b, N30-1), 0 timeouts or load failures; snapshot restored clean |
| Full suite | not repeated; the worker's `full.log` shows 5858/439 pass |

**Killed:**
- R1 runtime authorizer, R2 runtime dirty provider, R3 dirty provider ignored, R4 session
  bypassed.
- L1–L4.
- B1, B2, B3, B5, C6.
- J7, J9, J10, N1.

The worker's `mutations.json` records 12 assertion kills plus 1 compile-contract kill (H1), as
its brief states.

### Real Electron IPC probe

- **Setup:**
  - Production build of 27136d0f, launched through Playwright `_electron` under `xvfb-run`.
  - Isolated `--user-data-dir`, `--mute-audio`, `DO_NOT_TRACK=1`.
  - The real addon (which has GIF controls) and an 8 s 640×360 project.
  - A genuine second `BrowserWindow` with the app preload.
  - Main-process handler logging.

| Probe | Result |
| --- | --- |
| Editor still (selected, saved project) | 640×360 JPEG |
| Still from the second window | `project-changed` |
| Still for a foreign project | `project-changed` |
| Still with the main dirty flag set / cleared | `project-changed` / JPEG |
| Legacy and ID GIF exports | both succeed, 80 frames |
| During an editor GIF: MP4 from the second window / still in the same window | refused ("A native render is already running") / `render-busy`; the GIF then succeeds |

- **What this does not cover:**
  - An old addon without GIF controls. That stays covered by the worker's masked
    Node/N-API proof and the unit tests.
  - Clicking the GUI, native pickers, physical capture, and Windows or macOS.

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 141 entries in `preserved-prior-authoring-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 62 entries in `preserved-reports.json` re-hashed, 0 mismatches. This includes
  review 29 at `a46e3f0d…`.
- **Addon:** hash unchanged.
- **Checkout:** clean; no commit, push, reset, stash or checkout.
- **Cleanup:**
  - The probe closed via `app.close()`, and no Electron process remains.
  - Removed: the probe user-data directory (including the editor's OPFS copy), test media and
    exports.
  - Kept: scratch snapshots and probe JSON in the session scratchpad.

## Next

- Coordinator private push of 27136d0f.
- Then the documented selected-step MP4 GUI slice:
  - Explicit native picker before any new source observation or render.
  - Source-pin and timing checks.
  - Scoped progress, cancel and status.
  - Stale lesson/step/project refusal.
  - Preserved incomplete artifacts.
  - Actual full-video validation before completion.
- Optionally add a test pinning N30-1.
