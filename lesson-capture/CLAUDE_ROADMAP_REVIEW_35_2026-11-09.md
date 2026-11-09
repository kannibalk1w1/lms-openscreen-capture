# Claude roadmap review 35 — selected-step MP4 through CLI and MCP (9 November 2026)

Reviewed: exact `bbe56356a426e5e82350a0ece83027db7350f009` ("feat(lesson): export selected MP4
through CLI and MCP") against `8a5074f0bfdecbb01b707799c90a428cf05301e3`, branch
`lesson-capture/input-boundaries`. I verified the SHA with `git rev-parse HEAD`; the worker's
first expanded SHA was wrong, as the brief says. Main is still
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: `AGENTS.md` (including the required real headless startup smoke), the handoff,
`HEADLESS_SELECTED_MP4_2026-11-09.md` and the full diff (25 files). Focus:
`electron/lesson/fileExport.ts`, `fileExportContracts.ts`, `selectedLessonContext.ts`,
`fileLifecycle.ts`, the `exportJobs.ts` owner type, `mcp/lesson-tools.ts`, the HTTP and stdio
servers, the CLI `args`/`cliMain`/`lessonCommands`, and the `handlers.ts` wiring.

## Verdict

**Accepted within the stated scope, with one Medium finding to fix before relying on
headless exports from unpackaged runs, and one Low test gap.**

### What is right

- **Authority and service.** Strict explicit arguments: lesson, project path plus ID, one step
  (`includedStepIds` must be `[stepId]`), exact source grants and an existing output folder.
  Export goes through the accepted `LessonRangeExportService` → `materializeLessonRange` →
  real sample-and-decode validator. There is no parallel render model, no editor identity is
  invented, and the UI grants are not weakened.
- **Ownership.** The owner registry now takes a transport-lifetime emitter, keyed by object
  identity, on a dedicated `lesson-file-range` channel with generated UUIDs. Native compute
  still goes through the single process-wide lease.
- **Lifetimes.** HTTP gives each request its own lifetime and drains on shutdown. Stdio ties
  together SDK cancel, stdin closure and stdout closure. CLI handles signals and stdout
  disconnect.
- **HTTP cancellation is documented honestly:** a client must abort the active request; a
  standalone `notifications/cancelled` is not a supported HTTP mechanism.

### Required real headless startup smoke (per `AGENTS.md`)

The committed `scripts/smoke-headless-startup.cjs` ran with pinned Node 22.22.1 against my own
production `vite build` of `bbe56356`:

- `success: true`.
- SDK stdio initialize plus `listTools` returns 61 tools, including `exportLessonRangeFile`.
- The CLI reaches app-handler registration and the runner, then fails as intended on the
  absent project.
- No Electron or Xvfb process remained afterwards.

## Findings

### M35-1 Medium — unpackaged headless exports fail as "incomplete" unless launched from the app root

The validator finds its decoder through `resolveFfmpeg()` (`encodedVideo.ts:380`). That calls
`ffmpegCandidates(here = process.cwd())` (`electron/media/audioPeaks.ts:63`), which searches
`app.getAppPath()`, `process.resourcesPath` and **the current working directory**. For an
unpackaged launch (`electron <root>/dist-electron/main.js …`), only the working-directory
candidate contains `electron/native/bin/linux-x64/ffmpeg`. The compositor addon is unaffected,
because it resolves through its own base directories.

**Reproduction** on my production build of `bbe56356`, with a confirmed lesson and a valid
source:

```sh
cd /any/other/dir && xvfb-run -a <root>/node_modules/electron/dist/electron \
  <root>/dist-electron/main.js --no-sandbox --user-data-dir=<tmp> \
  lesson export-range <confirmed.json> --project <p> --project-id <id> --step <uuid> \
  --source <src.mp4> --out <dir> --json
# → {"event":"error","message":"range-export-incomplete","artifactPath":"…"}
```

- **Same command from `<root>`:** `materialized`.
- **From another directory with `OPENSCREEN_FFMPEG_PATH=/usr/bin/ffmpeg`:** `materialized`.
- **Which exports fail:** small ones as well as large ones (a 5 s 640×360 range fails the same
  way from another directory).
- **Stdio is affected too:** `openscreen mcp` started by an MCP client normally inherits the
  client's directory.
- **The failed output itself is valid:** its `range.mp4` passes `validateRangeVideo` when run
  in-process (1200 frames, 4.3 s).
- **The error is misleading:** the user gets the fixed "MP4 could not be verified… check the
  source video" error and an unverified MP4 left behind, when the real cause is a missing
  decoder.

**Scope:**
- **Packaged Linux:** builds ship `electron/native/bin/linux-x64/**` into `resources`
  (`electron-builder.json5`, Linux `extraResources`), so `process.resourcesPath` should
  resolve. I did not run an installer, so that is unverified.
- **Origin:** the resolver is older code (`33e9641b`), shared with the editor export and
  audio peaks. This commit is the first route where the launch directory naturally varies.
- **Why the worker's proofs passed:** they ran with the working directory at the app root
  (`native-final/transport-proof.cjs:2` takes `root = process.cwd()`).

**Fix:**
- Add the app root derived from the module or `APP_ROOT` (as the addon resolver does) to
  `ffmpegCandidates`, ahead of the working directory.
- Map "no usable decoder" to a distinct fixed code, such as `range-export-unsupported`, rather
  than `incomplete`.
- Add a test that launches from a non-root working directory.

### L35-1 Low — three export guards are not pinned by tests

These single-guard mutants survive the 13-file focused set (233 tests):

- **G3:** removing the output-directory canonical-path check (`fileExport.ts:49`). A
  final-component symlink is still refused by `lstat().isDirectory()`, which matches my CLI
  probe X4 (`range-export-unsupported`). An **ancestor** symlink in the output-directory path
  is untested.
- **G9:** removing the input-file re-check in the error path (`fileExport.ts:118`). A partial
  path would then be disclosed after the input files had gone stale. The document says stale
  inputs suppress disclosure, but no test pins it.
- **G17:** removing the production HTTP render wiring (`handlers.ts:4978`). The in-app HTTP
  tool would then return `range-export-unsupported`, and nothing would fail. This is the same
  pattern as N30-1; the worker's HTTP harness provides its own renderer.

**Redundant survivors:**
- G1/G2, the HTTP and outer permission pre-checks: the inner `check()` still runs before any
  filesystem access, and the worker's paired E6 control covers both together.
- G8, late-start cancel: no async gap remains.
- G10, the lifecycle "destroyed" emit: the abort signal still suppresses certification.
- G11, HTTP close abort: the SDK's request signal still aborts.

**Killed:**
- G4, output-directory inode replacement during decode.
- G5, exact source grants.
- G7, abort → owned cancel listener.
- G12, HTTP shutdown drain.
- G13, stdio stdout-closure lifetime.
- G15, the cancel channel.
- G16, owner-destroyed scope.

### Nits

- A missing `--out` directory returns the generic `lesson-operation-failed`, because
  `realpathSync` throws `ENOENT` unmapped. Output-directory inode drift returns
  `project-changed`. Both are honest but not specific.
- An SDK `notifications/cancelled` on stdio produces no response for the cancelled request.
  That is correct MCP behaviour, and clients should not wait for one.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive bbe56356` copies in my scratchpad, in directories whose names
  contain spaces. `node_modules` is symlinked per entry, and the real addon directory is
  symlinked read-only.

| Check | Result |
| --- | --- |
| **Accidental full suite** (an empty focused-file list made vitest run everything; disclosed, not planned) | 5980 / 446 pass, 0 skip |
| Focused: the worker's 12 files + `electron/ipc/lessonRangeExport.test.ts` | 233 / 13 pass |
| Both `tsc` configurations, Biome on the 9 changed sources | pass / clean |
| Production `vite build` + required startup smoke | pass (above) |
| My mutants | 15: 7 killed, 8 survived (above); snapshot restored clean |

### Real transport probes (my production build, my own fixtures)

- **CLI selected export:**
  - Source: 5 s 640×360, with a cut from 1–2 and ruler range 0.5–4.
  - Result: `materialized`, `ffprobe` counts **75 frames**, and the kept spans
    `[0.5–1, 2–4]` give 2.5 s. The folder is mode 0700 and its files 0600.
  - The receipt has the target, `mp4-video-samples-and-full-frame-decode`, and both audio
    flags false.
  - Source, project, original lesson and confirmed lesson are byte-unchanged, and the
    instructions canary never appears in output.
- **CLI refusals:**
  - Wrong grant → `range-export-source-unavailable` (no folder created).
  - Unpinned lesson or other step → `range-export-unattested`.
  - Symlinked output folder → `range-export-unsupported`.
  - Missing output folder → `lesson-operation-failed`.
  - Wrong project ID → `project-changed`.
- **Cancellation (40 s 1280×720 source):**
  - CLI SIGINT mid-render settles in 0.24 s, returns `range-export-cancelled` with the
    artifact path, and leaves an empty partial folder with no receipt.
  - Closing CLI stdout exits in 0.36 s with an empty partial folder.
- **Stdio (`openscreen mcp`, raw JSON-RPC):**
  - 34 SDK progress notifications carrying the operation UUID, phase and real frame counts.
  - A second call on the same connection → `render-busy`.
  - SDK `notifications/cancelled` mid-render → an empty partial folder, no receipt, and no
    response, as the protocol specifies.
  - Retry on the same connection runs.
  - Closing stdin mid-render exits 0 in 0.21 s with an empty partial folder.
- **The M35-1 confusion:** these cancellation sessions ran from a non-root working directory,
  so their *uncancelled* 40 s exports reported `incomplete`. That is M35-1. The same exports
  succeed from the app root (four runs) or with `OPENSCREEN_FFMPEG_PATH` set.
- **HTTP:** not probed live; I relied on the worker's authenticated-SDK HTTP tests and harness.
  G12 is killed and the documented abort semantics match the code.
- **Not covered:** GUI, picker, physical capture, audio, and Windows or macOS.

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 860 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 72 entries in `preserved-reports.json` re-hashed, 0 mismatches. This includes
  review 34 at `02ec965e…`.
- **Stale imported entry checked against git:** `HEADLESS_RANGE_CONFIRMATION_2026-11-09.md` is
  `59275da6…` at `00bdbc77` and `f9dcd8df`, and `a94cd5fb…` at `8a5074f0` and `bbe56356`. The
  coordinator edited it, and the worker recorded the correction transparently.
- **Addon:** hash unchanged.
- **Cleanup:**
  - All my Electron processes and my own Xvfb displays (`:187`, `:188`) have exited.
  - Removed: probe profiles, outputs and media.
  - Kept: scratch builds, snapshots and probe JSON in the session scratchpad.

## Next

- Fix M35-1: decoder resolution independent of the working directory, plus a distinct error
  and a non-root launch test.
- Optionally add tests for L35-1.
- Run the required startup smoke again, then the private push.
- After that, the portable package and player prerequisite.
- Physical, picker, audio and platform acceptance remain open.
