# Claude roadmap review 28 — review-27 follow-up (9 November 2026)

Reviewed: exact `897ddcebabd16c1c572f0d99c3274afb5ac5677d` ("fix(lesson): prevent range pin
downgrades") against the review-27 base `1dad5a7ccf62032d0e628806524cae77400a8e32`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
The checkout was clean at the exact HEAD at the start and at the end. This review added only
this file.

Read: the preserved review 27, `CLAUDE_ROADMAP_FOLLOWUP_27_2026-11-09.md`, and the full diff (30
files): the new `electron/ipc/editorRangeAuthoring.ts`, the slimmed `handlers.ts`, the model and
handler guards, the 14 locale changes, the new tests and the documentation changes.

## Verdict

**Accepted. Every review-27 item is closed or correctly scoped, and there are no new High,
Medium or Low findings.**

- L27-1 is fixed at three independent layers.
- T27-1's five named guards are now pinned by tests.
- N27-1's registration is now one shared production function, and tests call that same
  function.
- N27-2's wording is fixed in all 15 locales.
- N27-3 stays fail-closed, is now tested, and documents its recovery precisely. No navigation
  grant was broadened.

The documentation does not overclaim. It does not present the mocks as GUI or physical
evidence. It keeps review 27's real-Electron limits and the existing global grant and renderer
trust model. Selected MP4 export and CLI/MCP parity are still marked as deferred.

## Review-27 items

| Item | Status | Evidence |
| --- | --- | --- |
| **L27-1** pin downgrade | **Closed** | Model: `authoring.ts:139-140` returns the lesson unchanged when a v1 would replace a v2. Handler: `LessonGuideDialog.tsx:443-444` throws `range-target-changed` before planning. Button: `disabled` kept. Each layer is killed independently (A1, A2, A3 below). Explicit remove, initial v1 attach, confirmed v2 refresh and stale pre-pin callbacks are all covered by `mediaSelection.test.ts` and the new integration test. |
| **T27-1** unpinned guards | **Closed** for M4, M15, M16, M17, I2 (plus M14, D3 and owner-lifecycle cancel) | All killed in my run. M16 and M14 are tested through an injected backend spy. The follow-up says so openly: these are contract tests, not an observed real-backend path. |
| **N27-1** production wiring untested | **Closed within stated limits** | `registerEditorRangeAuthoring` is the code that runs in production (`handlers.ts` calls it with the real `aiEditionDocuments`, dirty flag and `readableApprovedPath`). The extraction is identical apart from option names. Tests drive its saved reader, dirty and approval callbacks, main-frame selection, listeners and marker ownership (X1–X7 killed). The callback providers and emitters are still simulated, as the document says. |
| **N27-2** busy wording | **Closed** | 15/15 catalogs say "A lesson operation is already running". The 14 non-English values are English placeholders; no translation is claimed. |
| **N27-3** hash navigation | **Kept fail-closed, documented accurately** | A new test covers: hash event → reselect on the changed URL refused → exact URL restored but still refused → explicit reselect succeeds. E4 (the select URL check) is now killed by this test. |

## New observations (Nit, no action needed)

- **N28-1: a stale pre-pin "attach reference" callback is a silent no-op.** The model refuses
  it, but no error appears. The integration test shows this on purpose. A real button always
  re-renders with the current step, so a user should not reach it.
- **N28-2: two surviving mutants are outside this scope.** Both concern the moved
  open-project marker block:
  - X8: deleting the "a null from another window cannot clear the marker" check. This is the
    existing #1138 marker behaviour, not range authority.
  - X9: deleting the project-ID format check. `safeProjectId` in the saved reader catches
    bad IDs anyway.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 897ddceb` copies in my scratchpad, in directories whose names
  contain spaces. `node_modules` is symlinked per entry. A scratch-only `git init` confirmed
  that every mutant was restored.

| Check | Result |
| --- | --- |
| Worker's 12 focused files | 146 pass / 12, 0 skip |
| Both `tsc` configurations | exit 0 |
| `npm run i18n:check` | pass |
| Biome lint on the changed sources | clean |
| Production `npx vite build` (snapshot) | pass |
| Full suite | not repeated (the worker reported 5829/436, 0 skip); I found no gap that needed it |

### My mutants (24, against all 12 focused files)

21 killed, 3 survived.

- **Killed:**
  - A1 model downgrade, A2 handler downgrade, A3 disabled button.
  - X1 select main-frame, X2 navigation listener, X3 crash listener, X4 saved reader replaced
    by `getProject`, X5 dirty callback, X6 approval callback, X7 marker owner.
  - M4, M15, M16, M17, M14.
  - O1 `cancelOwner` owner check, I2 cancel main-frame, D3 pre-queue ID check.
  - E4 select URL check, E1 session generation.
  - U1+U7 combined (both renderer `isCurrent` checks removed together).
- **Survived:**
  - X8 and X9 (N28-2).
  - M3, the post-canonical repeated approval check. It is equivalent, and the follow-up
    correctly does not claim it.

This agrees with the worker's 15 kills, 0 survivors and 0 timeouts in `mutations.json` plus
`owner-lifecycle-cancel.json`.

### Real Electron re-probe (Playwright `_electron`, `xvfb-run`)

- **Setup:**
  - Production `loadFile` build of 897ddceb with an isolated `--user-data-dir`, `--mute-audio`
    and `DO_NOT_TRACK=1`.
  - A real 1 s MP4 plus a 600 MiB sparse source, both outside the recordings directory.
- **Same results as review 27:**
  - HUD window, no selection, unapproved source, dirty project and foreign project → all
    refused.
  - Approval through existing reference planning → confirm v2 succeeds.
  - Refresh after the bytes change → history 2, new hash.
  - `author-current` over an existing pin → refused.
  - Busy / wrong-ID cancel / owner cancel → `render-busy` / `false` / `true`; result
    `range-source-cancelled` 3 ms later.
  - Same-ID reselect mid-read → `project-changed`.
  - Reload mid-read → `range-source-cancelled`, then the editor's auto-opened project is
    re-selected.
  - Hash navigation → `project-changed`.
- **What this covers:** real IPC, a real sender and main frame, and the extracted production
  registration.
- **What this does not cover:** the dialog was driven through the preload API, not by
  clicking it. No native picker, export, physical capture, or Windows or macOS.

## Preservation and cleanup

- **Prior evidence:** 112 distinct prior evidence files re-hashed, 0 mismatches.
- **Authoring evidence:** 33 entries in `preserved-authoring-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** the 57 review-27-era report entries are unchanged.
- **Review 27:** the committed copy is identical to the original
  (`749903c2…`; it is the 58th inventory item).
- **Checkout:** clean; no commit, push, reset, stash or checkout.
- **Probe cleanup:**
  - Probe Electron exited via `app.close()`, and no probe process remains.
  - Removed the probe user-data directory (including the editor's OPFS media copy) and the
    sparse source.
  - Kept scratch snapshots and small JSON in the session scratchpad; none in the repo.

## Next

Coordinator private push of 897ddceb, then the documented next slice: shared native render-job
ownership, an explicit native destination picker with progress/cancel/status, and integration
of `materializeLessonRange` with the actual validator. CLI/MCP parity, the timed player,
portable courses, verified audio, and physical or other-platform acceptance remain open.
