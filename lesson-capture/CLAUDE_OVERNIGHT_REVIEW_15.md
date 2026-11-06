# Claude overnight review 15 — slice18 (restore/illustration race follow-up)

- **Reviewed:** `414823d662e13a6efab4cd5dc92319d8ecbc5e27` ("fix: preserve current lesson across delayed illustrations")
- **Against:** `13f7d72377eeb0ad14f17d83e8ef1cfeb4d7037c` (slice17, reviewed in review 14)
- **Main:** `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`, unchanged and not touched
- **Reviewer:** Claude (Opus 5.5), alone, with no sub-workers. I reviewed only the immutable SHAs, not the moving working tree.
- **Diff:** 9 files, +419/−50. The code changes are `LessonGuideDialog.tsx`, `authoring.ts` and `schema.ts`. The test changes are `LessonGuideDialog.test.tsx` and `lesson.test.ts`. The rest is docs (guide, handoff, followup 14, and REVIEW_14, committed byte-identical to my original). No native, Rust, helper, IPC, preload, store or locale files changed.

## Verdict

There are **no High or Medium issues**. The code fixes are correct:

- **L17-1** is closed in code by the lesson-generation fence.
- **B17-1** is closed by the functional current-state attachment.

I confirmed both with my own regression variants. Each one fails on the 13f7d723 dialog and passes on 414823d6.

Two things limit how much "closed" means here:

1. **Test gap (new, Low).** The shipped Restore regression, `ignores a pending illustration after restoring a lesson` (both the `false` and `true` cases), proves nothing. It asserts "no image" before the async image validation has finished. So it passes on the **unfixed baseline dialog** (3/3 runs), and it passes with the generation fence removed (2/2 runs for each of two mutants). The fix is right, but this regression would not catch the fix being lost.
2. **Correction to my own review 14.** In review 14 I rated L17-1 "probe-confirmed". That probe was jsdom-only. In a real Chromium (151), every control involved is inside `<fieldset disabled={busy}>`, and that blocks real mouse and keyboard Restore during a pending illustration. It also blocks typing. So L17-1 and B17-1 were state-level hazards with little or no reachability by real user input. The slice18 fixes are sound defence in depth (for future callers, for a control moved outside the fieldset, or for synthetic events), not a fix for a user-visible defect. Electron 41 itself was not tested.

Neither point blocks the next authorized item (explicit-source-file CLI/MCP query/export). This review does not approve that later implementation.

## What I ran (my own counts only)

Toolchain:
- Node `v22.22.1` and npm `10.9.4`, with the pinned `/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin` first on PATH
- Vitest 4.1.10, Biome 2.4.12
- Playwright Chromium `151.0.7922.34` (`~/.cache/ms-playwright/chromium-1234`)
- Electron in `node_modules` is 41.2.1, but I did not launch it

Setup: I ran everything from a `git archive 414823d6` snapshot in the session scratchpad, outside the checkout. Each `node_modules` entry was symlinked separately, leaving out `.vite` and `.vite-temp`. The snapshot was checked byte-identical to the SHA again after the mutation probes (md5 over `src/components/ai-edition/v4` and `src/lib/lesson`). The checkout stayed clean.

| Check | Result |
|---|---|
| Focused Vitest: `electron/ipc/lesson.test.ts`, `electron/lesson/`, `src/lib/lesson/`, `LessonGuideDialog.test.tsx`, `LocalLessonDraftControls.test.tsx` | **85 passed / 8 files, 0 skipped**, 5.82 s. This is the same file set as the worker's 85/8, so the counts overlap and should not be added. |
| `tsc --noEmit` with `tsconfig.json`, `tsconfig.node.json` and `tsconfig.test.json` | all three pass |
| `biome check` on the 5 touched source/test files | clean |
| `biome check .` (whole snapshot) | 1270 files, 0 errors, **35 warnings** (matches the worker's "35 existing") |
| `node scripts/i18n-check.mjs` | PASSED, 14 locales × 7 namespaces, 1243 literal keys |
| Mutation probes on the dialog (`LessonGuideDialog.test.tsx`, 11 tests) | see T18-1 / N18-3 |
| Shipped dialog tests against the **13f7d723 dialog** source (3 runs) | 1 failed / 10 passed each run. Only the text-edit test fails; both Restore cases pass. |
| My waited variant (adds "wait for busy to clear" before the Restore assertions) | 11/11 on 414823d6. Both Restore cases **fail** on the 13f7d723 dialog and with the fence removed (M1, M5). |
| Real Chromium probe of `<fieldset disabled>` (plain DOM, document-level capture listeners like React's root delegation) | see the reachability section |

Not run:
- the full suite (the worker's 5553 count belongs to 13f7d723)
- the Vite or electron-builder build (the worker reports a final Vite renderer/main/preload build; I did not reproduce it)
- Electron, native or Rust code, screen readers, Windows/macOS, physical desktop input

I judged a full rerun unnecessary: the code diff is three renderer/shared-lib files, all three TS projects pass, and every lesson test passes. Nothing here lets anyone claim more than this.

## L17-1 — closed in code (generation fence)

`LessonGuideDialog.tsx:52-58`: `replaceLesson()` bumps `generation.current` before `setLesson`/`setSelected`/`setQuery`. Open (`:181`) and Restore (`:209`) both call it. `run()` (`:93-110`) captures `projectEpoch` and `lessonGeneration`, and `current()` (`:97`) requires both to be unchanged.

**Check sites.** Every async continuation checks `current()`:
- Open: after the IPC and after validation
- Save: after the IPC
- Export: before and after the IPC
- Illustration: after the fingerprint, after `lessonFrame`, after `validateLessonImage`, and again inside the functional updater (`:428`)

**Ordering.** If Restore lands after the updater is queued, React applies the updater and then the replacement value, so the replacement wins. If Restore lands before, the pre-`setLesson` `current()` check returns early.

**Same lesson UUID, same step id, higher restored revision.** `attachLessonIllustration` alone would accept this case: the id matches, the step exists, `imageId` matches, and `revision >=` request. So the generation fence is the only guard, and it holds. I instrumented this case: with the fence removed, the updater runs with `lessonId` equal, `latest.revision 11 ≥ 1`, step present. My waited variant then shows the image attached to "Restored one", which is the failure.

**Busy drain.** `finally` clears `busyRef` and calls `setBusy(false)` whenever the *project* epoch is unchanged, even after a replacement fenced the result. So a replacement no longer leaves the dialog busy.

**Project change and unmount.** The dialog is keyed by project id (`NewEditorShell.tsx:2021`), so a project change remounts it with fresh state. The epoch effect cleanup also replaces `epoch.current` on unmount or `projectId` change, so late results are dropped and `setBusy` is skipped on the old instance. Neither case can leave a stuck busy dialog.

**Retained guards.** These are unchanged:
- the `!snapshot || !store.projectId || store.dirty` start check
- the render fingerprint passed to main
- the `document !== snapshot` check after `lessonFrame` (`:414`)

The diff adds a second `document !== snapshot` check after image validation (`:419`). `LocalLessonDraftControls` keeps its own `key={lesson.id}` (`:206`) and its own epoch.

## B17-1 — closed in code (functional attachment)

The illustration now validates the frame with `validateLessonImage`, builds a request from the click-time step `{lessonId, stepId, revision, imageId}`, and calls `setLesson(latest => attachLessonIllustration(latest, request, image))` (`:422-437`).

`attachLessonIllustration` (`authoring.ts:93-120`):
- returns `current` unchanged when the lesson id differs, the revision is lower, the step is gone, or the step's `imageId` changed
- throws if the new image id already exists
- otherwise sets only that step's `imageId` and `status: "draft"`
- removes the old asset only when no step still references it, so unrelated or shared assets stay
- runs `reviseLesson`, a full `lessonManifestSchema.parse` that enforces unique ids, the 40-asset and 200-step caps and the 8,388,608-pixel area limit
- re-checks the 16 MiB serialized cap

Title, instruction and status edits made in the meantime are preserved.

The shipped text-edit dialog test is a real regression. It fails on the 13f7d723 dialog in 3/3 runs and fails under mutant M2 (attach to the stale `lesson`). The `lesson.test.ts` unit covers the preserve path and all four stale-identity refusals.

The updater is pure apart from `queueMicrotask` on the error path. Under a StrictMode double invoke that path could queue `setError` twice, which is harmless. On that error path the specific cause is collapsed into `lesson-operation-failed`, which is acceptable.

## Shared JPEG validator — reused with unchanged limits

`schema.ts:130-142` `validateLessonImage` keeps the old per-asset checks:
- `lessonImageSchema` (base64 ≤ 2 MiB, width/height 1–4096)
- decoded bytes ≤ 1 MiB
- JPEG SOF dimensions equal to the declared ones
- SHA-256 match

`validateLesson` now loops over it (`:148`). It is the single implementation used by:
- `parseLesson` → `readLessonFile` (Open and recovery read)
- `draftStore`, `service.ts` and `export.ts`
- the dialog's Open/Restore paths
- the new frame path

The per-manifest area check (`:84`) is not in `validateLessonImage`. The frame path still gets it through `reviseLesson`. A future caller that uses `validateLessonImage` on its own (for example CLI/MCP) must not assume it covers the area cap.

## Reachability in real Chromium (correction to review 14)

Every control in this race is inside `<fieldset disabled={busy}>` (`LessonGuideDialog.tsx:132-469`): `LocalLessonDraftControls` (Show/Preview/Restore), the title input, the instruction/alt fields, Open/Save/Export and Remove.

Probe (Playwright, Chromium 151, real `page.mouse.click` at coordinates and real `keyboard`):
- A click on a button inside the fieldset after it became disabled dispatched **no click** at document-capture level. Tab + Enter/Space produced keydowns only, with no activation.
- A focused textarea that became disabled while typing **lost focus with a `focusout`**. Later keystrokes went to `body`, and the value stayed at the pre-disable text.

React's `onBlur` is `focusout`. So `LessonTitleInput` commits its local draft when it is disabled or clicked away from. That commit always happens before `run()`, because reaching Illustrate needs a click or Tab that blurs first.

So with real input, Restore cannot fire during a pending illustration, and text cannot be typed during one. My review-14 probe A used `fireEvent` in jsdom, which ignores fieldset disabling. Its "confirmed" label was an over-statement on my part. The fix is still worth keeping. The slice18 docs say the tests "deliberately inject callbacks" and are "React state race tests, not OS input proof", and that is accurate. The guide's sentence "A pending illustration cannot replace a restored lesson" is true. It would be more precise to add that real input was already blocked by the busy fieldset. I did not test Electron 41's Chromium itself, but fieldset-disabled activation blocking is long-standing platform behaviour.

## Findings

### T18-1 (Low, new, test-only, confirmed): the shipped Restore regression passes without the fix

`LessonGuideDialog.test.tsx:249-253`: `await act(async () => finish())` and then `expect(...).toEqual(["Restored one","Restored two"])` and `expect(img).toBeNull()`.

`finish()` resolves `lessonFrame`, but the illustration then awaits `validateLessonImage`. That uses `crypto.subtle.digest`, which does not settle within `act`'s microtask flush. So the assertions run while the illustration is still pending.

Results:
- Shipped tests against the **13f7d723 dialog**: both Restore cases pass in 3/3 runs.
- **M1** (drop `generation.current++`) and **M5** (drop the generation term in `current()`): 11/11 pass, 2 runs each.
- Adding `console.log` instrumentation slowed things enough that M5 failed. That is what showed the race.

Fix (verified): before the assertions, add
`await waitFor(() => expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false));`
(or wait for the busy status to clear).

With that line:
- 414823d6: 11/11 pass
- 13f7d723 dialog: both Restore cases fail
- M1 and M5: the same-identity case fails

This is the regression the follow-up describes. I suggest landing it with the next slice. The older project-canary test at `:91-92` uses the same `act(finish)`-then-`toBeNull` shape. I did not mutation-test it, so I make no claim about it.

### N18-1 (note): two of the new guards are untested

- **M3:** dropping the second `document !== snapshot` check (`:419`) leaves 11/11 passing. The document-change test mutates the document before `finish()`, so the earlier check (`:414`) catches it first.
- **M4:** dropping the in-updater `current()` check (`:428`) also leaves 11/11 passing.

Both are correct by reading, and both are narrow windows. Testing them would need a document change, or a replacement, injected while image validation is pending. This is optional.

### N18-2 (note): attachment can be refused silently

When `attachLessonIllustration` returns `current` unchanged (step removed, image swapped, stale identity), busy clears with no notice. This is unreachable through the UI because of the fieldset. A future non-UI caller of the same helper should surface "not attached" instead of treating an unchanged return as success.

### N18-3 (note): result notices are dropped after a replacement

A Save or Export that completes after a replacement has already written its file, but its success notice (or its error) is dropped by `current()`. With the fieldset, plus the native save dialog, this is unreachable through the UI. It is recorded so that a later non-modal path does not hide a write that really happened.

### Baseline / carried

- **B17-1:** closed (above).
- **N17-4:** still a boundary for the CLI/MCP slice. The slice18 docs keep recovery-store discovery out of CLI/MCP, and nothing in this diff exposes it.
- **N17-2/N17-3/N17-5:** remain open, as documented (scan and performance bounds; Windows ACL, hard links, removable/network filesystems, physical desktop).

## Limits of this review

- Targeted and static only. I did not rerun the full suite, Vite/electron-builder, Electron, native or Rust code, screen readers, Windows/macOS or physical input.
- The Chromium reachability probe used a plain DOM page, not the real dialog in Electron.
- All mutation and variant probes were made in the scratch snapshot only, and the snapshot was restored and verified afterwards. The only file written in the checkout is this report. Earlier reports are unchanged.
- I made no git, config, auth or API changes, did no publishing and did not touch upstream or main.
