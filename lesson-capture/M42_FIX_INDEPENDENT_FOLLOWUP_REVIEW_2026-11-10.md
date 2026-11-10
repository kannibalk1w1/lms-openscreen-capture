# Independent follow-up review of the M42-1 fix (10 November 2026)

**Reviewer:** the parent Claude session, running as **Claude Opus 5.5 (`claude-opus-5-5`)**. I did
not author the fix. I wrote the original finding in
`FABLE_IMPROVEMENTS_INDEPENDENT_REVIEW_2026-11-09.md`. That report is committed unchanged in
`672d2c01`; I checked its SHA256 `2aac5a3d…`.

**Fix under review:** `9355933a505c8c57df247174ec8e4b4858c19bec` (by Fable).

**Production state:** at review time HEAD was `4b5d84f1` (Fable's docs-only handover, on top of
`97b6649c`). `9355933a..4b5d84f1` changes docs only, so the production code I built is the fix.

**Writer state:** Fable was stopped and settled during the whole review.

**Repository state:** main is still `fd2775e2`, the private feature ref is still `5d73f835`, and
the addon is still `5d16ea98…`. Nothing was pushed.

## Verdict

**M42-1 is closed. I accept `9355933a`.** I found no new finding of Medium severity or above.

### What the fix does

- **One shared predicate.** The new `electron/lesson/renderDependencies.ts` refuses webcam,
  added audio, click sound, image background, image annotation and webcam effect.
  `prepareLessonRangeMedia` now uses the same predicate, so range export is unchanged.
- **Order in `fileIllustrate.ts`:**
  1. Read the pinned project and lesson bytes.
  2. Build the native clip list and scene from them.
  3. Refuse by kind with the fixed code `illustration-unsupported`.
  4. Then check the screen grants, the canonical source path and the absence of a cursor sidecar.
  5. Render through a wrapper that re-checks the exact native arguments (granted screens only, no
     dependency) immediately before the native call.
- **No widened permissions.** Nothing is implicitly granted, relinked, substituted or stripped.

### Real reproduction re-run

- **Setup:** my own production `vite build` of the fix, run from a foreign working directory with
  no `OPENSCREEN_FFMPEG_PATH` or `APP_ROOT`.
- **Fixtures:** built with the committed `illustrationFixture` helper, plus real canary files:
  a red `SECRET_BG.jpg`, a red `SECRET_ANNOTATION.png`, and a red H.264 `SECRET_CAMERA.mp4`.
  The screen is a real 3 s H.264 clip. Only `screen.mp4` was granted.

| Route | Project | Result |
| --- | --- | --- |
| Real CLI `lesson illustrate` | image background / webcam / image annotation / cursor sidecar / added audio / all six | `illustration-unsupported` with the fixed detail; **no output file** in each case |
| Real CLI | screen-only | `saved`; 320×180 JPEG, corner pixel **(255, 255, 255)** (no red background) |
| Real `openscreen mcp` stdio `illustrateLessonStep` | background / webcam / annotation / cursor / all | `illustration-unsupported`; no output |
| Real `openscreen mcp` stdio | screen-only | `saved` |

- **Inputs unchanged:** `sha256sum -c` over every input file shows no change after all runs.
- **Contrast with the original reproduction on `305ab1e3`:** the same ungranted red background
  was embedded at RGB (254, 0, 0).

### Required startup smoke

The committed `scripts/smoke-headless-startup.cjs`, run on my build from a foreign working
directory with pinned Node: `success: true`.

## Tests and controls

| Check | Result |
| --- | --- |
| Focused: `fileIllustrate`, `cli/lessonCommands`, `mcp/lesson-illustrate`, `mcp/lesson-tools`, `rangeMedia`, `ipc/lessonRangeExport`, `fileExport`, `ipc/lesson`, `unsavedWorkFlag`, `sourceIdentity` | **204 / 10 pass**, 0 fail, 0 skip |
| Both `tsc` configurations | exit 0 |

**My own mutants** (git-archive snapshot of `97b6649c`, exact restore): **11 of 11 killed by
assertion failures.**
- D1 kind refusal in illustrate.
- D2 the boundary's dependency re-check.
- D3 the boundary's screen-grant re-check.
- D4 the cursor-sidecar check.
- D5 both kind checks removed together.
- P1–P6 each predicate kind on its own (webcam, image background, image annotation, added audio,
  webcam effect, click sound).

The new tests are independent production-service, CLI and MCP cases, not mirrors of the guard.

I also inspected the K6 and K11 pins Fable added:
- **K6** (`electron/ipc/lesson.test.ts`): the grant is refused when the file on disk differs from
  the window's lesson.
- **K11:** the sender check was moved into `electron/lesson/unsavedWorkFlag.ts` with a test, and
  `electron/main.ts` uses it.

I did not mutate either again. **L42-1 is addressed.** **L42-2** (reload or crash loses lesson
work) is now stated in the roadmap; no autosave was added, which is correct pending the user's
privacy decision.

## Remaining limits and nits

- **Default wallpaper refused.** Projects with the default image wallpaper are refused by headless
  illustrate, as by range export. A user must pick a colour or gradient background. That is
  honest, but it is a usability cost worth surfacing.
- **Non-specific refusal.** The refusal does not name which dependency kind was found. Naming the
  kind (without a path) would be more actionable and adds no privacy risk.
- **Earlier nits stay open:** the same-file save resets the file mode to 0600, and the GUI package
  request does not require unique `stepIds`.
- **Not covered:** the GUI illustration path (unchanged), platforms other than Linux, a real
  picker or hardware, and real lessons. Fable's full suite (6,290) is its own run, not mine.
