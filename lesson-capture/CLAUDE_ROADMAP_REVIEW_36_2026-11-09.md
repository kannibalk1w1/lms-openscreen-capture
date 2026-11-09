# Claude roadmap review 36 — review-35 follow-up (9 November 2026)

Reviewed: exact `e45e4b34e649e800a54074690b78178a41e23769` ("fix(lesson): resolve verification
tools outside app cwd") against the review-35 base `bbe56356a426e5e82350a0ece83027db7350f009`,
branch `lesson-capture/input-boundaries`. Main is still
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: the committed review 35 (`b1e04d94…`, first committed here and preserved word for word),
`CLAUDE_ROADMAP_FOLLOWUP_35_2026-11-09.md`, and the diff (37 files). Production changes are in
`electron/media/audioPeaks.ts`, `electron/lesson/encodedVideo.ts`, `rangeErrors.ts`,
`rangeMedia.ts`, `rangeExport.ts`, `fileRange.ts`, the MCP and CLI error output,
`src/lib/lesson/api.ts`, and 15 locale catalogs.

## Verdict

**Accepted. M35-1 and L35-1 are closed, and there are no new findings beyond nits.**

### M35-1 — closed

- **Lookup order.** `ffmpegCandidates()` (`audioPeaks.ts:64-91`) now searches, in order:
  `OPENSCREEN_FFMPEG_PATH`, then `app.getAppPath()`, then `process.resourcesPath`, then the
  absolute `APP_ROOT`, then the module root (the parent of `dist-electron` when bundled,
  `../..` from source), and only then the working directory. Duplicate roots are dropped.
- **Executable check kept.** The existing `isExecutableFile` filter and the version-token check
  are unchanged.
- **`APP_ROOT` is not attacker-supplied.** `main.ts:166` overwrites it from the app's own
  location at startup, so a user-set value cannot redirect it. Trusting
  `OPENSCREEN_FFMPEG_PATH` is unchanged from before.
- **No packaged regression.** In a packaged build the module root equals `app.getAppPath()`
  (deduplicated), and the order before the working directory is unchanged. Packaged behaviour
  is therefore the same as before, though I did not run an installer.
- **Shared consumers benefit too.** Audio peaks, STT `extractAudio` and `extensionClip` use the
  same resolver; their focused tests pass.
- **Distinct error.** Resolution, realpath, hash and version failures, including the 3 s
  version timeout, now raise `RangeVideoToolUnavailableError`. That maps to
  `range-media-tool-unavailable` and then to the fixed `range-export-tool-unavailable`.
- **Wording.** CLI and MCP add one fixed actionable message (`rangeExportToolUnavailableMessage`).
  The editor uses its catalog key; the 14 non-English catalogs hold English fallback text, and
  no translation is claimed.
- **Decode failures are unchanged.** Decode failures inside a working tool still report
  `incomplete`.
- **Artifacts.** Partial media is kept, there is no receipt, and the artifact path is disclosed
  only under current authority.

**Real-process reproduction and closure.** Every command below ran from a foreign directory
whose name contains spaces, with `OPENSCREEN_FFMPEG_PATH` and `APP_ROOT` unset (`env -u`):

| Build | Transport | Result |
| --- | --- | --- |
| `bbe56356` (old, my review-35 build) | CLI `export-range` | `range-export-incomplete`; partial `range.mp4` |
| `e45e4b34` (my production `vite build`) | CLI `export-range` | `materialized`; `ffprobe` 75 frames; receipt `mp4-video-samples-and-full-frame-decode`, decoded 75, bundled decoder `n8.1.2-34-g9b6c8969e0-20260731` |
| `e45e4b34` | raw JSON-RPC stdio `exportLessonRangeFile` | `materialized` |
| `e45e4b34` | CLI with `OPENSCREEN_FFMPEG_PATH=/bin/false` | exit 1, `range-export-tool-unavailable`, fixed detail plus "Unfinished copy" path; partial `range.mp4`, no receipt |
| `e45e4b34` | CLI with a fake version-printing tool / a tool that hangs | `range-export-tool-unavailable` (the hanging tool is refused after the 3 s version timeout; total 8.2 s); partials kept, no receipts |
| `e45e4b34` | stdio with `OPENSCREEN_FFMPEG_PATH=/bin/false` | `isError`, `{"code":"range-export-tool-unavailable","message":"The video verification tool is unavailable…"}` |

**Fixture:** 5 s source, cut 1–2, ruler range 0.5–4, giving 75 frames / 2.5 s.

**Required startup smoke (per `AGENTS.md`).** The committed script, run on my `e45e4b34` build
from a foreign working directory with pinned Node: `success: true` (stdio initialize plus
`listTools`, and CLI registration plus runner with the expected absent-project failure). No
Electron process remained.

### L35-1 — closed

My mutants confirm the new tests now catch each gap:
- **G3** (output-directory canonical check): killed by the ancestor-symlink output test.
- **G9** (re-checking input files before disclosing a path): killed by "suppresses a partial
  path when selected inputs become stale…".
- **G17** (the production `handlers.ts` HTTP render wiring): killed by the
  `handlers.ts`-dependency test.

## Nits

- **N36-1: the bundled-root branch is untested.** The `dist-electron` branch of the module-root
  logic (`audioPeaks.ts:84`) has no test; H3 survives because tests run from source modules.
  Only built-app runs cover it, and my real probes from a foreign working directory show it
  works.
- **N36-2: an unreachable error mapping.** Mapping a `realpath` failure of an
  already-executable candidate to tool-unavailable (`encodedVideo.ts:384-386`) is untested
  (H6 survives). It is practically unreachable after the executable check.
- **N36-3: a missing configured tool falls back silently.** A nonexistent
  `OPENSCREEN_FFMPEG_PATH` makes the resolver fall back to the bundled decoder and succeed,
  rather than reporting the configured tool as unavailable. That is the existing executable
  filter's behaviour; documenting it would help administrators.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive e45e4b34` copies in my scratchpad. `node_modules` is symlinked per
  entry, and the real addon directory is symlinked read-only.

| Check | Result |
| --- | --- |
| Focused: 16 files covering the resolver, audio/STT/extension consumers, encodedVideo unit, process and integration tests, rangeMedia, fileExport, fileRange, IPC export, MCP export, lesson-tools, CLI and UI | 305 pass / 16, 0 skip |
| Both `tsc`, i18n, Biome on the 6 changed sources | pass / pass / clean |
| Production `vite build` | pass |
| My mutants | 14: 12 killed (H1 module root, H2 `APP_ROOT`, H4/H5 tool-error rethrow, H7 version-probe mapping, H8 materializer mapping, H9 service mapping, H10 MCP message, H11 CLI detail, G3, G9, G17), 2 survived (H3, H6 above); snapshot restored clean |
| Worker logs | `validation-summary.json`: first full run had 5 failures (version-probe tests still expecting the old generic error), corrected; final full run 5991/447, 0 skip; 6 assertion controls. Not repeated by me. |

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 1254 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 74 entries in `preserved-reports.json` re-hashed, 0 mismatches.
- **Imported inventory:** 72 entries, 0 mismatches.
- **Addon:** hash unchanged.
- **Cleanup:** all my probe Electron processes have exited. I removed profiles, outputs and
  media, and kept scratch builds and probe logs in the session scratchpad.

## Next

- Coordinator private push.
- Then the portable package and player phase.
- Still unclaimed: human translations, an installer run, GUI and picker, physical capture,
  audio, and Windows or macOS.
