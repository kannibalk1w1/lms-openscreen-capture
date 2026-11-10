# Fable to Opus handover — 10 November 2026

Written by Claude Fable (`claude-fable-5-2`, self-reported) as its last action. No
implementation, analysis or tests were done for this file; it summarises what is already
recorded in [the session handoff](FABLE_SESSION_HANDOFF_2026-11-09.md), which holds the
per-slice commands, counts, proofs and limits.

## Repository state

| Item | Value |
| --- | --- |
| Branch | `lesson-capture/input-boundaries` |
| HEAD before this file | `97b6649c` |
| Base of Fable's work | `259534fe0c1b64274c4543c7034a035eb3f2231b` |
| Private feature ref | `5d73f835257c50144823257caf26ba465331c107` |
| Main and private main | `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` |
| Native addon SHA256 | `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca` (unchanged) |
| Pushed | Nothing. Every commit below is local only |

## Review status

- Slices up to `305ab1e3` were covered by the independent review committed as `672d2c01`
  ([report](FABLE_IMPROVEMENTS_INDEPENDENT_REVIEW_2026-11-09.md)). It accepted them except
  for one Medium finding, M42-1, and stated its own depth per slice: the wording and
  accessibility slice (`5a2b0f14`) was not inspected, and the reseal recovery slice
  (`26396851`) was reviewed lightly.
- The M42-1 fix, `9355933a505c8c57df247174ec8e4b4858c19bec`, is **pending independent
  verification**. It is self-tested only.
- Everything Fable wrote is otherwise self-tested only. Fable's test runs are not review.

## Commits, oldest first

| SHA | Purpose |
| --- | --- |
| `52008fac` | Full review report: verdict on `259534fe`, findings H1–H3, M1–M6, L1–L3 |
| `26396851` | Slice 1: reseal recovery dead ends, wrong-token and busy replies, destination error code |
| `ebb2926c` | First handoff document |
| `cd444252` | Slice 2: packaging survives lesson text edits after an MP4 export |
| `4800f5ae` | Slice 3: LMS `lessonRef` / `slideRef` and `lesson-mapping.json` |
| `5308811b` | Handoff SHAs |
| `97ebcaa3` | Slice 4: save to the opened lesson file through a main-held grant; unsaved-work marker and guards |
| `d9aba4c6` | Slice 5: create a package from the Lesson guide dialog |
| `be758ca7` | Slice 6: headless `lesson new` / `add-step`; references in queries and package re-editing |
| `d4d152e9` | Slice 7: headless `edit-step` / `remove-step` |
| `5a2b0f14` | Slice 8: distinct step button names, heading order, plainer package wording |
| `b8bb657c` | Slice 9: unsaved project edits pause package actions instead of discarding the capability |
| `ddc38561` | Slice 10: report the unfinished package folder to the author |
| `33acf24d` | Slice 11: headless `lesson illustrate` (CLI) |
| `a9163c39` | Roadmap status and handoff summary |
| `06259913` | Slice 12: headless `move-step`; command reference appended to `LESSON_CAPTURE_COMMANDS.md` |
| `a42d70a5` | Slice 13: MCP `illustrateLessonStep` |
| `305ab1e3` | Handoff final state (the reviewed target) |
| `672d2c01` | The independent review report, committed byte-for-byte unchanged |
| `9355933a` | M42-1 fix: refuse unsupported render dependencies before headless illustration; K6 and K11 tests; reload/crash limit documented |
| `97b6649c` | Handoff record of the M42-1 fix |
| this commit | This handover |

## Findings and their status

| ID | Finding | Status |
| --- | --- | --- |
| H1 | Lesson media pipeline (range confirm and export, validation, package, verify, open, reseal, illustrate) is Linux-only; Windows is a primary target | Open. Platform gates untouched, no support claimed. Needs Windows hardware |
| H2 | No lesson/slide mapping manifest | Fixed, `4800f5ae` |
| H3 | A lesson edit after an MP4 export broke packaging | Fixed, `cd444252`; reviewed and accepted |
| M1 | Authored lessons easy to lose | Largely fixed, `97ebcaa3`. Reload or crash still loses unsaved work (L42-2) |
| M2 | Package tools gated on unrelated project state | Renderer side narrowed, `b8bb657c`. Main's checks unchanged; the wider change is an owner/reviewer decision |
| M3 | Verification depth exceeds the stated threat model | Open. Only the user-facing part done, `ddc38561` |
| M4 | Review ritual outweighs product | Open; process matter |
| M5 | Acceptance evidence is all synthetic | Open; needs a person at a real desktop |
| M6 | Agents could not author lessons | Fixed, `be758ca7`, `d4d152e9`, `33acf24d`, `06259913`, `a42d70a5` |
| M42-1 | Headless illustrate rendered ungranted files | Fix `9355933a`, pending verification |
| L42-1 | Window grant content match (K6) and unsaved-work sender check (K11) untested | Tests added in `9355933a`, pending verification |
| L42-2 | Reload or crash loses Lesson guide work | Open by decision. Documented in the roadmap; no autosave added |
| Nit | Same-file save resets the file to mode 0600 and breaks hard links | Not addressed |
| Nit | GUI `lesson:package-create` does not require unique `stepIds`, unlike CLI/MCP | Not addressed |
| L1, L3 (Fable review) | Uneven sender checks on older lesson IPC; stale product-map statuses | Open |

## Decisions waiting for the user

1. Recovery-copy privacy: whether lesson work may be saved automatically. The recovery store
   currently promises to write only on an explicit click.
2. Windows hardware for H1.
3. Wider decoupling of package inspection and re-editing from the selected, saved project
   in main (M2). It would reverse behaviour that reviews 39 to 41 pinned.
4. Translations: every string added in this session is English in all 14 other catalogues.
5. GIF and standalone PNG step outputs and the 1280 px cap, which change accepted render and
   package contracts.

## Commands that were actually used

Toolchain: `export PATH=$HOME/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin:$PATH`.

| Purpose | Command |
| --- | --- |
| Typecheck | `npx tsc --noEmit` and `npx tsc -p tsconfig.test.json --noEmit` |
| Lint, catalogues, docs | `npm run lint` (35 baseline warnings), `npm run i18n:check`, `npm run docs:check` |
| Focused tests | `npx vitest --run <paths>`; an empty path list runs everything |
| Full suite | `npm run test -- --maxWorkers=4` (last: 6,290 tests / 460 files, 0 skipped, at `9355933a`) |
| Build | `npx vite build` |
| Required startup smoke | from another directory: `env -u OPENSCREEN_FFMPEG_PATH -u APP_ROOT <pinned node> <checkout>/scripts/smoke-headless-startup.cjs --evidence-dir <fresh absolute dir>` |
| Real CLI | `xvfb-run -a <checkout>/node_modules/electron/dist/electron <checkout>/dist-electron/main.js --no-sandbox --disable-dev-shm-usage --user-data-dir=<tmp> lesson <command> ... --json` |
| Real stdio MCP | the same binary with `mcp`, through the SDK `StdioClientTransport` |

## Evidence

- `../openscreen-evaluation/fable-review-2026-11-09T2130Z/`: Part 1 mutants and full-app
  probe; `slice1/` to `slice13/`; `slice6-7-controls/`; `final/`.
- `../openscreen-evaluation/fable-m42-fix-2026-11-10T0339Z/`: `controls/` (14 controls),
  `real-proof/` (CLI and stdio results, frame, inotify log), `startup-smoke/`,
  `full-suite.log`, `build-hashes.txt`.

Evidence boundaries: unit and jsdom tests; mutation controls in `git archive` snapshots; the
production CLI and stdio MCP under Xvfb; the full production app under Xvfb driven through
the DOM with native dialogs stubbed. Nothing is real-picker, physical-input, screen-reader,
audio, Windows or macOS evidence, and no real lesson was recorded.

## Known limits

- Headless `illustrate` and `export-range` refuse any image background, **including the
  default bundled wallpaper**. A new editor project needs a colour or gradient background
  first. The refusal names the supported subset, not which dependency was found.
- Frames are capped at 1280 px wide and 1 MiB; step videos at 1280 px, 30 fps, 120 s; a
  package at 4 videos and 32 steps. Audio is never verified.
- A lesson file or package containing `lessonRef` or `slideRef` is rejected by builds older
  than `4800f5ae`.
- Same-file save was not tried on Windows, where renaming over an open file differs.
- Slices 9 and 10 were not driven in the real app. The new GUI inputs for references were
  tested in jsdom only.
- Access-time files in the M42 evidence prove nothing (`/tmp` is `noatime`); use the inotify
  log.
- No headless command can mark a step reviewed, by design.

## Usage-limit history

Three usage limits interrupted the session: during slice 1, during slice 8's test writing,
and at the start of the M42-1 task (reset reported by the coordinator as 03:30
Europe/London). Each time the coordinator reported the reset and authorised continuation.
Fable never saw an error text or a usage figure. This handover was requested because Fable
usage was reported as nearly exhausted.

## Next actions for Opus, in order

1. Verify `9355933a` read-only: rerun the real CLI pixel probe from the review, the focused
   set, and the 14 controls or your own. Decide whether M42-1 and L42-1 are closed.
2. Coordinator decision on a private push of `lesson-capture/input-boundaries`.
3. If more review depth is wanted before a push: `5a2b0f14` (not inspected), `26396851`
   (light), and full-app probes of `97ebcaa3` and `d9aba4c6`.
4. Take the five user decisions above to the user.
5. With hardware: the Windows run (H1), then a manual pilot of the spec's Enemy sequence.
6. The two nits, if wanted.
