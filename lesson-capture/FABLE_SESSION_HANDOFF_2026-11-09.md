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
| this commit | Slice 3: LMS lesson/slide references and `lesson-mapping.json` | 1,174 focused / 73 files; full suite 6,181 / 455, 0 skipped; both `tsc`, lint 35 baseline, i18n, `vite build`, startup smoke, real CLI export/package/verify, 2/2 controls |

## Limits encountered

One 5-hour usage limit was hit during slice 1 (reset stated by the coordinator as 21:40
Europe/London); the coordinator authorised one continuation, in which slices 1 to 3 were
finished. No usage information is exposed to me beyond that.

## State

Tree clean after the slice 3 commit. All three slices are my own work and are not
independently reviewed. The handoff commit `ebb2926c` sits between slices 1 and 2.

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
