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
