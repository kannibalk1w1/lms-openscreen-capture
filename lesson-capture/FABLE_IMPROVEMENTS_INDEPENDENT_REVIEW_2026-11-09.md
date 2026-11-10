# Independent review of the Fable improvement commits (9 November 2026)

**Reviewer:** the parent Claude session, running as **Claude Opus 5.5 (`claude-opus-5-5`)**. I did
**not** author any of the reviewed code.

**Prior exposure:** I relayed this work. I launched and resumed the single Fable writer, relayed
its reports, and verified repository state read-only. I had read Fable's summaries before this
review. I re-derived every finding below from the code and my own runs, not from those
summaries.

**Target and base:** exact `305ab1e35cb58868448f0e070621ce4560dfefcf` against base
`259534fe0c1b64274c4543c7034a035eb3f2231b`, branch `lesson-capture/input-boundaries`. That is
18 local, unpushed commits forming 13 slices.

**Repository state:** main and private main are still `fd2775e2`, and the private feature ref is
still `5d73f835`. The addon is unchanged (`5d16ea98…`), and the external user report is unchanged
(`f87c9eb7…`). The checkout was clean before and after. This file is the only one I added.
Fable's reports and handoff remain verbatim.

## Verdict

**Not yet acceptable as one checkpoint: there is one open Medium finding (M42-1) that should be
fixed first. No High findings.** The other reviewed slices have no material defects.

| Slice | Commit | Depth of review | Result |
| --- | --- | --- | --- |
| Relaxed receipt revision | `cd444252` | Code + mutants | **Accept.** The video is still bound by lesson ID, step ID, the **exact** current v2 pin (source hashes, document fingerprint, range) and the MP4 bytes and hash. Only "receipt not newer than the lesson" replaces the exact revision. An unrelated source or video cannot associate. K1 and K2 are killed. |
| Same-file save, unsaved-work guard | `97ebcaa3` | Code + mutants | **Accept, with two Lows.** Main holds a per-window, main-frame grant created only after an explicit open or save, via the no-follow canonical snapshot. Replacement checks lesson ID and that the revision is not older. The staged file is private, written with `O_EXCL\|O_NOFOLLOW`, fsynced and read back. The final identity and bytes check and `renameSync` share one synchronous turn. A failure revokes the grant. Closing the window asks before losing lesson or package edits, then runs the existing project prompt. K3, K4 and K5 are killed. See L42-1 and L42-2. |
| GUI package creation | `d9aba4c6` | Code + mutant | **Accept.** Requires main frame, editor session and the dirty flag. Media folders and the destination come only from native pickers. Receipts are read through no-follow pinned metadata, must match a selected step, and may not repeat. It uses the shared `packageSelectedLesson` writer. K10 is killed. The packaged lesson is the in-memory one the renderer submits; its pin-to-video association remains an author claim, as documented. |
| Project edits pause package actions | `b8bb657c` | Code | **Accept.** Renderer-only change. Main still refuses while the project is dirty, and on any reselect, through the open-time session. |
| Unfinished-folder disclosure | `ddc38561` | Code | **Accept.** The path is shown only from `LessonPackageError.artifactPath`, which the shared writer sets only while the caller's scope still holds, and only on the two folder-creating routes. |
| Headless authoring | `be758ca7`, `d4d152e9`, `06259913` | Code + mutant | **Accept.** New, add-step, edit-step, remove-step and move-step always write a **new** file (`wx`, 0600) and never change the selected file. Content edits demote a step to draft. MCP tools check edits permission before filesystem access. K7 is killed. |
| Headless illustrate (CLI) | `33acf24d` | Code + mutants + **real CLI** | **Medium M42-1 (below).** The screen-source grant check works (K9 and K12 killed), but other files the renderer reads are not granted. |
| MCP `illustrateLessonStep` | `a42d70a5` | Code + real startup | Inherits M42-1. Its edits-permission check, lifecycle tracking and signal are correct. The new bootstrap dependency is the existing `loudnessService.renderFrames`, so it goes through the shared native compute lease. |
| LMS references and mapping | `4800f5ae` | Code (mapping/schema) | **Accept** for privacy. `lesson-mapping.json` holds authored labels, titles, IDs, relative paths and `hasCode` only, with no instructions, code or source paths. References are bounded and refuse control characters. I did not review backward compatibility with older builds beyond Fable's own disclosure that older builds reject reference fields. |
| Reseal recovery | `26396851` | Light | Covered by Fable's Part-1 work. I re-ran its tests in the focused set; I did not mutate it. |
| Wording and accessibility | `5a2b0f14` | Not inspected | No claim. |

## Findings

### M42-1 Medium — headless illustrate renders files the caller never granted

`illustrateLessonStepFile` (`electron/lesson/fileIllustrate.ts:59-68`) checks only that each
clip's **screen** source (`asset.originalPath`) is in the caller's `sourcePaths` and is
canonical. It then calls `LessonService.captureFrame` (`:70`), which hands the full native clip
list and scene to the renderer. That includes:

- `webcamPath` from `asset.cameraTrack.sourcePath`;
- an image background, because `parseWallpaper` treats any wallpaper that is not a colour or
  gradient as an image **path** (`src/native/sceneDescription.ts:669`);
- annotation `imagePath`s.

None of those are checked against the grant. The tool description and the CLI help say
"sourcePaths must name every source file the project's clips play; nothing is discovered".
Range confirmation and export refuse these dependencies outright (`prepareLessonRangeMedia`).

**Reproduction 1 — unit probe, `git archive 305ab1e3` snapshot.** A project whose screen file
is granted, with `cameraTrack.sourcePath = …/SECRET_CAMERA.mp4` and
`legacyEditor.wallpaper = …/SECRET_BG.jpg`, both **not** granted.
`illustrateLessonStepFile(…, sourcePaths: [screen])` called the renderer once, and the renderer
arguments contained both `SECRET_CAMERA` and `SECRET_BG`.

**Reproduction 2 — real production CLI and native renderer, production build of `305ab1e3`,
foreign working directory.**

```sh
electron dist-electron/main.js --no-sandbox --user-data-dir=<tmp> lesson illustrate lesson.json \
  --project secret.openscreen --project-id illsecret --step <uuid> --at 1 --alt frame \
  --source <dir>/screen.mp4 --out out-secret.json --json
# secret.openscreen: wallpaper = <dir>/private/SECRET_BG.jpg (solid red), aspect 1:1, NOT granted
```

- **Result:** `{"event":"done","result":{"status":"saved",…}}`. The saved lesson's embedded
  320×320 JPEG has corner pixel **RGB (254, 0, 0)**, the ungranted image's red.
- **Control:** the same project with `wallpaper: "#ffffff"` gives **(255, 255, 255)**.

The same path is reachable through MCP `illustrateLessonStep`: on HTTP with MCP edits enabled,
and on stdio with launch rights.

**Impact:** a selected project file can pull the pixels of any same-user-readable image or video
into a saved lesson, which can then be exported or packaged. That breaks the explicit-grant
contract that every other headless media route keeps. It is bounded by explicit project
selection, edits permission and same-user filesystem access, which is why this is Medium and
not High.

**Fix (choose one):**
1. Refuse unsupported dependencies before rendering, exactly as `prepareLessonRangeMedia` does:
   webcam, image background, image annotations, click sound and webcam effect. Report them with
   a fixed code.
2. Or require every file path the composed scene reads to be in `sourcePaths` and canonical:
   webcam, background image, annotation images and cursor sidecar.

Either way, add a test with a coherent project whose ungranted dependency would otherwise be
rendered.

### L42-1 Low — window grant correctness and the main-side close flag are not test-pinned

- **K6 survives.** In `electron/ipc/lesson.ts:103`, the grant is withheld when the file on disk
  differs from the lesson the window now holds (`JSON.stringify(granted.lesson) !== …`).
  Removing that check leaves all 356 focused tests passing. Without it, a file changed between
  the open-read and the grant snapshot would be granted, and the next save would overwrite the
  newer bytes. The race window is a single operation.
- **K11 survives.** `electron/main.ts:1095` accepts `set-lesson-unsaved-work` only from the
  current editor window. That check is untested, because `main.ts` has no unit harness.

### L42-2 Low — reload or crash still loses lesson-guide work

Disclosed by Fable. `beforeunload` (`NewEditorShell.tsx`) checks only project dirtiness, and
`render-process-gone` cannot prompt. Lesson and package drafts in dialog state are lost on reload
or renderer crash. Keep this visible in the roadmap until a recovery design is decided.

### Nits

- **Same-file save resets file attributes.** `renameSync` of a 0600 stage makes the saved lesson
  file 0600 and breaks hard links or ownership on the original inode. That is acceptable for
  privacy, but worth a sentence in the docs.
- **GUI package request lacks a uniqueness check.** The GUI `lesson:package-create` schema does
  not require unique `stepIds`, unlike the CLI/MCP contract. Duplicates appear harmless, because
  the projection filters lesson steps, but the two contracts should match.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshot:** `git archive 305ab1e3` copy in my scratchpad (`node_modules` symlinked per entry,
  addon directory symlinked read-only).

| Check | Result |
| --- | --- |
| Focused: 16 files (`lessonFile`, `ipc/lesson`, `package`, `package.privacy`, `ipc/lessonPackageOpen`, `fileCommands`, `fileIllustrate`, `cli/lessonCommands`, `mcp/lesson-tools`, `mcp/lesson-illustrate`, `openscreen-mcp-server`, `mapping`, `unsavedWork`, `LessonGuideDialog`, `LessonPackagePanel`, `LessonPackageReseal.integration`) | **356 / 16 pass**, 0 fail, 0 skip |
| Both `tsc` configurations | exit 0 |
| Production `vite build` | pass |
| **Required startup smoke** (committed script, foreign working directory, no decoder or `APP_ROOT` hint) | `success: true`; 69 MCP tools including the 6 new lesson tools; CLI registration and runner reached |
| My mutants (K1–K12) | 10 killed, 2 survived (K6, K11 = L42-1); snapshot restored |
| M42-1 probes | unit renderer-argument probe + real CLI pixel probe (above) |

I did not re-run the full suite. Fable's self-reported 6261 / 459 is its own run, not mine.

**Not covered:** full-app Electron probes of `97ebcaa3` or `d9aba4c6`, a real native picker,
physical input, screen reader, audio, Windows and macOS. No real lesson was used.

## Next

1. A single same-context Fable writer fixes M42-1, ideally also closing L42-1 with two tests.
2. I verify the fix read-only: re-run the real CLI pixel probe and the focused set.
3. The coordinator decides on the push.

The remaining user decisions (recovery-copy privacy, Windows hardware, wider package/project
decoupling, translations) are unchanged.
