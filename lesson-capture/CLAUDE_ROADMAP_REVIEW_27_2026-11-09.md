# Claude roadmap review 27 — explicit editor source confirmation (9 November 2026)

Reviewed: exact `1dad5a7ccf62032d0e628806524cae77400a8e32` ("feat(lesson): confirm saved range
sources in editor") against parent `7b6f4a73f6e3c700d968114ba3f891f8c1ed2a07`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
The checkout was clean at the exact HEAD when the review started and when it ended. This review
added only this file.

Read: `AGENTS.md`, `lesson-capture/CURRENT_IMPLEMENTATION_HANDOFF.md`,
`lesson-capture/RANGE_AUTHORING_2026-11-09.md`, the roadmap/product-map/authored-identity doc
diffs, the whole code diff (41 files) and the code it relies on (`sourceIdentity.ts`,
`sourceFiles.ts`, `rangeMedia.ts`, the `handlers.ts` approval functions, `main.ts` dirty flag,
`mcpDocumentHost.ts`, `attachLessonMediaSelection`).

## Verdict

**Accepted within the stated scope. There are no High or Medium findings.** The slice does what
it says: explicit source confirmation and same-project refresh from the editor; a saved-project
reader with no side effects; registered-editor, main-frame and project-session authority; the
existing approval gate runs before any filesystem resolution; and cancellation, a single busy
slot and stale-target handling. A real production Electron build confirms the authority wiring.
No native rendering, export, CLI/MCP or permission surface changed.

The documents describe the split accurately. Selected MP4 export (GUI and CLI/MCP) stays
backend-only, deferred until shared native render-job ownership exists. The original full goal
is not claimed as complete.

## Findings

### L27-1 Low — "no pin downgrade" depends only on an untested `disabled` attribute

- `LessonRangeControls.tsx:79` disables "Attach range from saved project" when
  `selection?.version === 2`.
- Neither the `onAttach` handler (`LessonGuideDialog.tsx:441`–) nor
  `attachLessonMediaSelection` (`src/lib/lesson/authoring.ts:124-152`) refuses to replace a v2
  pin with a v1 reference. The helper only compares `previous` (line 139), so it would accept a
  v1-over-v2 swap.
- Mutation C1 (remove `|| selection?.version === 2`) **survives** all 10 focused files
  (128/128 pass).
- Real Chromium does not fire a click on a disabled button, so I found no way to trigger it
  today. Any future caller of `onAttach` would silently downgrade a confirmed pin, though.
- Fix: refuse a v1 selection over a v2 `previous` in `onAttach` (or in the helper, with a
  dedicated reference-only flag), and add a test that kills C1.

### T27-1 Low — new guards that no test pins (mutation survivors)

My 48 mutants, each run against the worker's 10 focused files: 31 killed, 14 survived, 3
replaced too broadly at first. I re-ran those 3 one at a time: U2 was killed; U4 and U5
survived. Final: 32 killed, 16 survived.

- **Real gaps:**
  - M4 `!path.isAbsolute(source.path)` (`rangeAuthoring.ts:83`).
  - M15 `document.project.id !== id` (`:78`).
  - M16 `id !== authority.projectId` inside the gated reader (`:75`).
  - M17 the service-level initial `authority.assertCurrent()` (`:45`). At the IPC layer it is
    redundant, because `capture()` already asserts. But it is the only check for the future
    CLI/MCP callers that the documents say may reuse the service.
  - I2 the main-frame check on cancel (`ipc/rangeAuthoring.ts:45`).
- **Renderer defence in depth:** U4/U5 (result echo `startSec`/`projectId`), U6 (unmount sets
  `cancelled`), U8 (`isCurrent` dirty). Each has a main-side or second renderer check behind
  it.
- **Equivalent or redundant:**
  - M3 (the post-canonical `canReadSource` repeats the pre-check once canonical equals the
    resolved path).
  - M14 (the final `check()` repeats the gated reader's last check).
  - E4 (the URL test in `select` repeats the URL test in `capture`).
  - U1/U7 (two `isCurrent` checks guarding each other).
  - D3 (assumed redundant: `readProjectFile` should also call `safeProjectId`; not checked).
- **Killed, matching the worker's claims:**
  - M1, M2, M5–M13, M18–M20.
  - E1–E3, E5–E7.
  - I1, I3–I5.
  - D1 (saved reader replaced by `getProject` → the approval/relink test fails).
  - D2 (queue removed → the serialization test fails).
  - U2, U3, U9, U10, W1, W2.

### N27-1 Nit — proof wording overstates "production IPC callbacks"

`LessonRangeAuthoring.integration.test.tsx` uses the production
`registerRangeAuthoringHandlers`/`RangeAuthoringService`/`DocumentService`. But it rebuilds
the authority itself (`canReadSource: p === source`, dirty taken from the store). It does not
use the `registerIpcHandlers` wiring at `handlers.ts:5119-5140`: `readableApprovedPath`, the
global `editorHasUnsavedChanges`, and the open-project `select`/`invalidate` listeners.

No repo test exercises that wiring. My real-Electron probe below does, and it passes.

### N27-2 Nit — stale `render-busy` wording in 14 locales

Only `en` was changed to "A lesson operation is already running". The other 14 catalogs still
say "A lesson still is already rendering", which is the message a busy confirmation shows. The
UI fieldset makes this reachable only through programmatic IPC. Non-English strings are English
placeholders anyway, as the documents state.

### N27-3 Nit — same-document navigation invalidates with no reselect

`did-start-navigation` also fires for in-page navigation. Probe P8: setting `location.hash` →
`project-changed`. `mcpDocumentHost.ts:72` only re-sends the open project when its ID changes,
so after such an event confirmation stays refused until the user switches project or reloads.
`src/` has no hash routing, `history.*State` or iframes, so this is theoretical and fails
closed.

## Observations (existing behaviour, not regressions)

- **O1: the gate inherits the existing grant model.** The saved reader grants nothing. In probe
  P3 a selected, saved project with an unapproved outside source returns
  `range-source-unavailable`.
  - Ordinary reference planning (`lesson:plan-range` → `getProject` → `approveDocumentMedia`
    with no `trustedDirs`, `handlers.ts:4949/5080`) approves every media-extension path the
    project declares. So does normal editor open. Confirmation then succeeds (P4).
  - Approvals are process-global and survive project switches.
  - So "no arbitrary imported source path can create a grant through this operation" is
    accurate, but the gate is only as strong as the earlier grant. The result is a hash, not
    file bytes.
- **O2: the renderer is trusted for which project it holds.** A compromised editor main-frame
  renderer can select any saved project ID, because `setAiEditionOpenProject` is not
  authenticated. It can only obtain hashes of approved media. The design documents this.
- **O3: renderer crash quits the app.** `forcefullyCrashRenderer` on the editor makes the app
  exit (`main.ts:1205` handler), so crash invalidation is covered only by the
  emitter-simulated unit test.
- **O4: probe side effect, existing behaviour.** On startup and reload the editor auto-opens
  the most recent project, and it copied the 3 GiB probe source into Chromium's `File System`
  storage in the isolated user-data directory. Probe cleanup removed it.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** two `git archive 1dad5a7c` snapshots in my scratchpad, both in directories
  whose names contain spaces (like the real checkout path). `node_modules` is symlinked per
  entry. A scratch-only `git init` let me verify that every mutant was restored (`git status`
  clean afterwards).

| Check | Result |
| --- | --- |
| Worker's 10 focused files | 128 pass / 10 files, 0 skip (7.8 s) |
| `npx tsc --noEmit`, `npx tsc -p tsconfig.test.json --noEmit` | both exit 0 |
| `npm run i18n:check` | pass (15 locales, 7 namespaces, 1257 keys) |
| Biome lint on the 5 changed source files | clean |
| `npx vite build` (production renderer/main/preload, snapshot only) | pass |
| Mutations | 48: 32 killed, 16 survived (3 too-broad matches rerun one at a time: 1 killed, 2 survived); see T27-1 |
| Full suite | not repeated (the worker reported 5814/435, 0 skip); I found no gap that needed it |

### Real Electron probe (production `loadFile` build, Playwright `_electron`, `xvfb-run`)

- **Setup:**
  - The app ran with an isolated `--user-data-dir`, `--mute-audio` and `DO_NOT_TRACK=1`.
  - The fixture was a real 1 s 64×32 H.264 MP4 plus a 3 GiB sparse `.mp4`, both outside the
    recordings directory.
  - The two saved projects were written with the repo schema.
  - The editor was opened through the real `switch-to-editor` handler.
  - The `lesson:confirm-range` handler was wrapped only to log results.
  - The editor URL was `file:///…/r27%20build%20dir/dist/index.html?windowType=editor`. The
    registered-URL canonicalisation matched Electron's real `getURL()`, spaces included.
- **What this covers:**
  - Real Electron IPC, a real sender and main frame, and real `webContents` events.
  - The production `handlers.ts` wiring and real files.
- **What this does not cover:**
  - The React dialog: it was driven through the preload API, not by clicking the UI.
  - Native pickers, export, physical capture, and Windows or macOS.

| Probe | Result |
| --- | --- |
| P1 HUD window selects + confirms | `project-changed` |
| P2 editor before selection | `project-changed` |
| P3 selected, source not yet approved | `range-source-unavailable` (saved reader grants nothing) |
| P4 after reference planning (existing approval) | success v2 `explicit-author-current` |
| P5 explicit refresh after source bytes change | success, `explicit-refresh-current`, history 2, new hash |
| P5b `author-current` over existing | `range-target-changed` |
| P6 dirty flag set / cleared | `project-changed` / success |
| P6c foreign `range.projectId` | `project-changed` |
| P7 3 GiB baseline | success in 12.3 s |
| P7a second confirm / wrong-ID cancel / owner cancel | `render-busy` / `false` / `true`; result `range-source-cancelled` 3 ms later; next confirm succeeds |
| P7b same-ID reselect mid-read | `project-changed`; next confirm succeeds |
| P7c reload mid-read | `range-source-cancelled`. After reload the editor auto-opens its most recent project and re-selects it (logged `open-project` events), so confirming that project is correctly allowed. Confirming the previously selected project after reload → `project-changed` |
| P8 hash navigation | `project-changed` (N27-3) |

- **Code checks:**
  - Confirmation never calls render, materialize or a picker.
  - No Rust/native, CLI/MCP or export-permission files changed.
  - Planning and open are untouched (no hash capture on planning).
  - The only renderer caller of `lessonConfirmRange` is the explicit button.
  - Cancel lives outside the disabled fieldset and is reachable.
  - Status uses `role=status`/`aria-live`, and errors use fixed codes with no paths.

## Preservation and cleanup

- **Prior evidence:** re-hashed independently from the two retained inventories. 112 distinct
  prior evidence files, 0 mismatches.
- **Reports:** 57 preserved-report entries (56 tracked reports plus the external user workflow
  report), 0 mismatches.
- **Checkout:** `git status` clean at the exact HEAD; no commit, push, reset, stash or checkout.
- **Cleanup:**
  - My probe Electron processes exited via `app.close()`, or on their own in the crash probe.
  - No user application was touched.
  - Removed: the 3 GiB sparse source and the probe user-data directory (including the
    3 GiB OPFS copy).
  - Kept: scratch snapshots and small probe JSON in the session scratchpad; none in the repo.

## Next prerequisites

1. Optional before the push: fix L27-1, and pin M4, M15, M16, M17 and I2 (T27-1). Fix N27-2
   wording if convenient.
2. The next slice, as documented: shared native render-job ownership, an explicit native
   destination picker, progress/cancel/status, and integration of `materializeLessonRange` with
   the actual validator. Keep source pins un-bypassed and capture no hashes during export.
3. CLI/MCP confirmation and export parity, the timed player, portable courses, verified audio,
   and physical or other-platform acceptance all remain open.
