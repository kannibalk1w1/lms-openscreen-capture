# Fable session handoff — 9 November 2026

Sole writer: Claude Fable (`claude-fable-5-2`, self-reported). Branch
`lesson-capture/input-boundaries`. Nothing pushed. Main and private main stay `fd2775e2`.
Addon SHA256 unchanged (`5d16ea98…09efca`). Evidence:
`../openscreen-evaluation/fable-review-2026-11-09T2130Z/`. Full detail is in
[the review](FABLE_FULL_REVIEW_2026-11-09.md).

## Commits (on top of `259534fe`)

| SHA | Purpose | Validation |
| --- | --- | --- |
| `52008fac` | Full review report (Parts 1 and 2) | Part 1: 109 focused tests, 14 mutants (10 killed, 4 survived and explained), 13/13 full-app probes |
| `26396851` | Slice 1: reseal recovery dead ends, wrong-token and busy replies, destination error code | 195 focused / 8 files, both `tsc`, lint 35 baseline, i18n, `vite build`, required startup smoke, 5/5 controls |
| `cd444252` | Slice 2: packaging survives lesson text edits after an MP4 export | 152 focused / 5 files, both `tsc`, lint, `vite build`, 3/3 controls |
| `4800f5ae` | Slice 3: LMS lesson/slide references and `lesson-mapping.json` | 1,174 focused / 73 files; full suite 6,181 / 455, 0 skipped; both `tsc`, lint 35 baseline, i18n, `vite build`, startup smoke, real CLI export/package/verify, 2/2 controls |

## Limits encountered

One 5-hour usage limit was hit during slice 1 (reset stated by the coordinator as 21:40
Europe/London); the coordinator authorised one continuation, in which slices 1 to 3 were
finished. No usage information is exposed to me beyond that.

## State

Tree clean after the slice 3 commit. All three slices are my own work and are not
independently reviewed. Documentation-only commits: `ebb2926c` (first handoff, between slices 1 and 2) and the final handoff update after `4800f5ae`.

## Unfinished and next, in priority order

1. M1: Save to the same lesson file, dirty marker, close confirmation
   (`src/components/ai-edition/v4/LessonGuideDialog.tsx`, `electron/lesson/service.ts`,
   `electron/ipc/lesson.ts`).
2. GUI package creation from the guide dialog (`electron/ipc/lessonPackageOpen.ts`,
   `electron/lesson/package.ts`); today creation is CLI/MCP only.
3. M6: headless `lesson new`, `add-step`, `illustrate` (`electron/cli/args.ts`,
   `electron/mcp/lesson-tools.ts`, `electron/lesson/service.ts`).
4. H1: run the suites on Windows and replace the platform gates with capability checks
   (`electron/lesson/package.ts:53`, `rangeMedia.ts`, `rangeAuthoring.ts`,
   `sourceIdentity.ts`, `encodedVideo.ts`). Needs a Windows machine.
5. M2: decouple the package capability from project and dirty state
   (`electron/ipc/lessonWorkflow.ts`, `LessonPackagePanel.tsx`).
6. Small follow-ups from slice 3: show references in `lesson query`; allow editing them in
   the package re-edit panel. From Part 1: test the cancel-plus-session-change path.
7. A manual pilot on real hardware. No real picker, physical input, audio, Windows or macOS
   run has been done by me or, per the reports, by anyone.

## Second continuation (coordinator-directed), appended per slice

The sections above are the state at `5308811b`. Everything below is later work, again my own
and not independently reviewed. Evidence stays in
`../openscreen-evaluation/fable-review-2026-11-09T2130Z/` (`slice4/` onward).

### Slice 4 — save to the same opened lesson file; unsaved-work marker and guards (M1)

**What changed for the author**

- Opening a lesson, or saving a new copy, links the dialog to that file. A new button,
  "Save changes to the opened file", updates it. "Save new editable copy" and guide export are
  unchanged and separate.
- A status line always says whether lesson changes are unsaved and which file was last saved.
- Opening another lesson over unsaved work asks first.
- New project, open project, new recording and closing the editor window ask first when the
  Lesson guide holds unsaved lesson or package edits, including when the video project itself
  is clean.

**How the permission works**

- `electron/lesson/lessonFile.ts` (new): main holds one grant per window: path, file identity
  (device, inode, size, mtime, ctime), SHA-256 of the bytes, lesson ID and revision. The
  renderer receives an opaque token and the path for display. `lesson:save-current` accepts
  only `{ token, lesson }`; a request that names a path is rejected by the strict schema.
- Before replacing, main re-reads the file and requires the same identity and bytes, the same
  lesson ID and a revision no older than the file's. It writes a private `0600` sibling file,
  fsyncs, reads it back, re-checks the target in the same turn and renames over it. On any
  failure the sibling is removed, the old file is untouched and the grant is dropped.
- A grant is given only when the picked path can be pinned (not through a symlink) and its
  bytes equal the lesson the window holds. Navigation, renderer loss or window destruction
  drops it. Sub-frames and other windows get none.
- `electron/main.ts`: a separate `set-lesson-unsaved-work` flag makes the window-close flow
  ask. It is deliberately not the project dirty flag, which lesson media authority reads.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run electron/lesson electron/ipc/lesson.test.ts electron/ipc/lesson.authority.test.ts electron/ipc/lessonPackageOpen.test.ts src/components/ai-edition src/lib/lesson electron/cli electron/mcp` | 1,786 tests / 152 files pass, 0 skipped |
| `npx tsc --noEmit`; `npx tsc -p tsconfig.test.json --noEmit`; `npm run lint`; `npm run i18n:check` | pass; pass; 35 baseline warnings; pass (15 locales, 1316 keys) |
| `npx vite build`; required startup smoke from a foreign cwd with hints cleared | pass; `success: true` |
| 8 single-guard controls in the snapshot (`slice4/controls/`) | 8 killed by assertions |
| Full production app under Xvfb, stubbed open dialog, DOM-driven (`slice4/full-app-probe/`) | 6 of 6: open links the file; same-file save replaces it atomically (new inode, mode 0600, no stray file); a forged request naming another path is refused and that file is untouched; a file changed elsewhere is kept and the typed edit stays; closing the window asks, cancel keeps the window and the edit, accept closes |

Full suite not run for this slice (run at the next milestone).

**Limits**

- A renderer reload (Ctrl+R), a renderer crash and a project change made by an agent tool do
  not ask; unsaved lesson work is lost there as before. Recovery copies remain manual.
- Closing the dialog itself does not ask about the authored lesson, because the lesson stays
  in memory until the project changes; the marker stays visible when it is reopened.
- The confirmations use the browser `confirm` dialog, like the existing package-draft one.
- Not exercised: a real file picker, Windows or macOS (rename-over-open-file behaviour
  differs on Windows), network filesystems.
- New strings are English in all 14 non-English catalogues.

Slice 4 commit: `97ebcaa3`.

### Slice 5 — create a portable package from the Lesson guide dialog

**What changed for the author.** The Lesson guide has "Create a portable package from
selected steps". It packages the lesson as it stands in the dialog, with the image and code
settings already chosen there. With "Include exported step MP4s" ticked, a folder picker
(multi-select, up to 4) takes the folders made by "Export this step's MP4"; then a second
picker takes the destination. Until now this needed the CLI or MCP.

**How**

- `electron/lesson/package.ts`: `packageSelectedLesson` is the body of the existing
  `createLessonPackage`, taking a validated lesson instead of a file path. CLI and MCP call
  it through `createLessonPackage` exactly as before; the GUI calls it directly. One
  projection, one media check (`selectedPackageMedia`), one writer (`publishLessonPackage`).
- `electron/ipc/lessonPackageOpen.ts`: new `lesson:package-create` in the existing package
  registration. It uses the same main-frame, registered-editor, current-project and
  saved-project checks, the same one-operation-per-window state and the existing cancel
  route. Folders come only from native dialogs; the request carries no path and nothing is
  remembered afterwards. Each chosen folder's receipt must name a selected step, once. A bad
  selection returns `lesson-package-video-selection-invalid` before the destination picker.
  A failed creation does not revoke a separately opened package.
- `LessonGuideDialog.tsx`: the checkbox, the button, a cancel button while it runs, and
  refusals shown as alerts. 15 catalogues: five strings, English in all.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run electron/ipc/lessonPackageOpen.test.ts` (15 new cases) and `LessonGuideDialog.test.tsx` (1 new) | 85 and 22 pass, 0 skipped |
| Full suite, `npm run test -- --maxWorkers=4` (covers slices 4 and 5) | 6,206 tests / 457 files pass, 0 skipped |
| Both `tsc`; `npm run lint`; `npm run i18n:check` | pass; 35 baseline; pass (1322 keys) |
| `npx vite build`; required startup smoke, foreign cwd, hints cleared | pass; `success: true` |
| Controls (`slice5/controls/`): unselected-step video; duplicate-step video; folder limit; failed create revokes opened package; session re-check after lesson validation | 4 killed; the last survived and is a redundant layer (the wrapper checks just before, and each picker checks after) |
| Full production app under Xvfb with stubbed dialogs (`slice5/full-app-probe/`), using the real authored lesson, MP4 and receipt preserved in the reseal evidence (copied to scratch) | 4 of 4: a wrong video folder is refused and nothing is created; after **editing step text in the app** (revision past the receipt's) the package is created with the video, which is slice 2 working end to end; inputs byte-unchanged; fresh CLI `verify-package` returns `verified`, 45 samples / 45 decoded frames / 1.5 s |

**Limits**

- Linux only, like all packaging. Needs a selected, saved video project (existing authority).
- Videos are found by choosing folders; the dialog does not remember where a step's MP4 was
  exported. At most 4 videos and 32 steps (existing format limits).
- Dialogs were stubbed in the app probe; no real picker was clicked. No audio is verified.
- Harness note: my probe's Electron did not exit on `app.close()` because the new
  close guard asked about the unsaved lesson and the harness had no dialog handler by then. I
  stopped that one process by its recorded PID. Future probes must accept the dialog.

Slice 5 commit: `d9aba4c6`.

### Slice 6 — headless lesson authoring, references in queries and in package re-editing

**What changed**

- CLI: `openscreen lesson new <new-lesson.json> --title <text> [--lesson-ref <label>]` and
  `openscreen lesson add-step <lesson.json> --title <text> [--instructions <text>]
  [--slide-ref <label>] [--code-language <name> --code-text <text>] --out <new-lesson.json>`.
- MCP: `createLessonFile` and `addLessonSteps` (1 to 50 steps per call). Both need MCP edits
  on either transport. They are registered after the existing lesson tools, so earlier tool
  positions do not move.
- Both follow the existing headless rule: explicit absolute paths, new files only (`wx`,
  mode `0600`), the selected lesson file is never changed, fixed error text. Added steps are
  always `draft`; a request cannot claim `reviewed`. The tool description says the tool
  records text and does not demonstrate or verify anything on screen.
- `lesson query` / `queryLessonFile` now return `lessonRef` and each step's `slideRef` when
  set. Instructions, code, images and paths are still not returned.
- Package re-editing: the draft panel has the two LMS reference inputs and
  `validatePackageEdit` accepts changes to them. The new package's `lesson-mapping.json`
  reflects them.
- `technical-documentation/architecture/mcp-server.md`: the tool list names the two tools.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run electron/lesson electron/cli electron/mcp src/lib/lesson src/components/ai-edition/v4 electron/ipc/lessonPackageOpen.test.ts electron/ipc/lesson.test.ts` | 1,212 tests / 75 files pass, 0 skipped |
| Both `tsc`; `npm run lint`; `npm run i18n:check`; `npm run docs:check` | pass; 35 baseline; pass; OK (37 files) |
| `npx vite build`; required startup smoke (its `listTools` output includes `addLessonSteps`) | pass; `success: true` |
| Real production CLI under Xvfb (`slice6/cli-authoring.jsonl`): `new`, `add-step` twice, a second `new` onto the existing file, `query` | created; saved at revisions 1 and 2; the overwrite attempt returns `lesson-file-operation-failed`; the query shows `lessonRef` and `slideRef` |

No mutation controls were run for this slice and the full suite was not rerun (last full run:
slice 5). The MCP tools were exercised through the SDK in-memory transport in tests, and
through the real stdio transport only as far as `listTools`.

**Limits**

- There is still no headless way to attach an illustration (a project frame) or to edit or
  remove an existing step; an agent must still edit the JSON for those.
- `add-step` writes a new file per call, so a long CLI session leaves a trail of files. The
  MCP tool takes up to 50 steps in one call for that reason.
- These commands write text an agent supplies. They are not the spec's "demonstrate the real
  learner-facing interface"; nothing here drives or observes an application.

Slice 6 commit: `be758ca7`.

### Slice 7 — headless step editing and removal

**What changed.** CLI `openscreen lesson edit-step` and `openscreen lesson remove-step`; MCP
`updateLessonStep` and `removeLessonStep` (registered last, needing MCP edits). An agent can
now change a step's title, instructions, slide reference or code, clear the optional ones,
and remove a step, without hand-editing JSON. Same rules as slice 6: explicit paths, a new
file every time, the selected file unchanged, fixed error text. Changed teaching text returns
the step to `draft`; a slide-reference change alone keeps its status, as in the editor.
Removing a step drops an illustration no other step uses. A request cannot set `reviewed`.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run electron/lesson/fileCommands.test.ts electron/cli electron/mcp` | 308 tests pass, 0 skipped |
| Both `tsc`; `npm run lint`; `npm run docs:check` | pass; 35 baseline; OK |
| `npx vite build`; required startup smoke | pass; `success: true` |
| Real production CLI under Xvfb (`slice7/cli-edit-remove.jsonl`): `edit-step`, `remove-step`, `query` on the slice 6 lesson | saved at revisions 3 and 4; the query shows one remaining step |

No mutation controls and no full-suite run for this slice.

**Limits.** No headless illustration, reordering or review-status change. One new file per
call.

Slice 7 commit: `d4d152e9`.

### Follow-up validation for slices 6 and 7 (third continuation)

On resuming, I confirmed that the slice 6 and 7 tests and records were already inside
`be758ca7` and `d4d152e9`. Two gaps those records admitted are now closed:

- 7 single-guard controls on the slice 6 and 7 code, in a fresh `git archive` snapshot
  (`slice6-7-controls/`): reseal ignoring a slide or lesson reference edit; edited text
  keeping `reviewed`; a slide-reference change demoting; overwrite allowed; MCP write without
  consent; a removed step keeping its image. **7 killed by assertions.**
- Full suite: see slice 8 below.

### Slice 8 — distinguishable step buttons, heading order and plainer package wording (review L2)

**What changed**

- Lesson guide dialog and package draft panel: each step's Move up, Move down, Remove and
  Illustrate buttons now have an accessible name that ends with the step number and title
  ("Move up: step 2, Attach the script"). The visible words are unchanged and remain at the
  start of the name.
- Package panel: step titles are `h5` under the lesson's `h4`.
- Four package messages are reworded for authors, without "verification authority" or
  "rebased". The package panel's remaining text is unchanged.
- 15 catalogues: one new key and four reworded strings, English in all.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run src/components/ai-edition/v4` (2 new cases; 6 existing selectors updated to the new names) | 396 tests pass, 0 skipped |
| Full suite, `npm run test -- --maxWorkers=4` (covers slices 6, 7 and 8) | 6,232 tests / 457 files pass, 0 skipped |
| Both `tsc`; `npm run lint`; `npm run i18n:check`; `npx vite build` | pass; 35 baseline; pass; pass |

No IPC, handler or bootstrap change, so no startup smoke for this slice. **Not tested with a
screen reader or by keyboard-only use**; the evidence is accessible-name assertions in jsdom.

Slice 8 commit: `5a2b0f14`.

### Slice 9 — unsaved project edits pause package work instead of discarding its capability (review M2, narrow form)

**Authority design, stated explicitly.** Main's checks are **unchanged**: a package capability
still needs the registered editor window, its main frame, the token, the open-time project
session, a saved project at the moment of each request, and the pinned package files. No
main-side code changed in this slice.

What changed is only the renderer's own behaviour. `LessonPackagePanel` used to cancel and
release its capability the moment the project became unsaved or its document object changed,
which forced the author to find the same package folder again in a file picker even after
saving the project. It now releases only when the project itself changes (or the panel
unmounts). While the project is unsaved, the panel disables its actions and says to save the
project; the draft and the token stay. When a request is made, main decides as before: a
request while unsaved is refused and revokes the capability, a different project is refused,
and a capability that was simply left unused during the unsaved period works again.

I did **not** take the wider step proposed in review finding M2 (dropping the project and
saved-state binding in main). That would reverse behaviour that reviews 39 to 41 pinned with
a dozen tests, and it should be decided by an independent reviewer, not by me alone.

**Commands and results**

| Check | Result |
| --- | --- |
| `npx vitest --run src/components/ai-edition/v4 electron/ipc/lessonPackageOpen.test.ts` (2 new panel cases, 1 new production-registration case) | 485 tests pass, 0 skipped |
| Both `tsc`; `npm run lint`; `npm run i18n:check`; `npx vite build` | pass; 35 baseline; pass; pass |
| 2 controls (`slice9/`): release again on unsaved project; skip the explicit release on project change | 1 killed; 1 survived, because the effect's cleanup already releases on a project change, so that explicit call matters only on mount |

No IPC change, so no startup smoke. Not driven in the real app: I had no reliable way to make
a project unsaved through the DOM. Full suite not rerun (last: slice 8).
