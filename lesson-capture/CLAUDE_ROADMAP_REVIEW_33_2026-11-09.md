# Claude roadmap review 33 — explicit CLI/MCP range confirmation (9 November 2026)

Reviewed: exact `00bdbc77941a47a57926c5f5c412d2cf1de1b507` ("feat(lesson): confirm explicit CLI
and MCP range sources") against `035c8313d05c41e68612b80717ff036731d3fafb`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`
and the addon is unchanged (`5d16ea98…`). The checkout was clean at the exact HEAD at the start
and at the end. This review added only this file.

Read: `AGENTS.md`, the handoff, `HEADLESS_RANGE_CONFIRMATION_2026-11-09.md`, and the diff
(26 files). Focus: `electron/lesson/fileRange.ts`, `selectedFile.ts`, `fileLifecycle.ts`,
`fileRangeContracts.ts`, `mcp/lesson-tools.ts`, the HTTP and stdio servers, and CLI
`args`/`cliMain`/`lessonCommands`.

## Verdict

**Accepted within the stated scope. There are no new High or Medium findings, and one Low
test gap.**

The document correctly presents this as an explicit-file **source confirmation/refresh**
prerequisite, not headless selected-MP4 parity. Headless MP4 ownership, materializer and
validator transport remain the next slice.

### Pre-existing regression closed here (missed by reviews 31 and 32)

`edb74a00` made `registerIpcHandlers` throw "Editor dirty-state provider is required."
(`handlers.ts:5101`). The headless bootstrap `registerAppHandlersForCli` passed no provider, so
**every headless command that registers app handlers failed at startup** in the
already-pushed `035c8313`: `sources`, `record`, `export`, `captions` and `openscreen mcp`.

I reproduced this on a production build of `035c8313`:
- `openscreen sources --json` exits 1 with `{"event":"error","message":"Error: Editor
  dirty-state provider is required."…}`.
- `openscreen mcp` exits 1 with the same error before answering `initialize`.

On a production build of `00bdbc77`:
- `mcp` answers `initialize`.
- `sources` gets past bootstrap and only fails on Xvfb display enumeration, an environment
  limit.

This commit closes it with a fail-closed `() => true` provider (`cliMain.ts:147`).

I checked every other consumer of the provider. The app recorder (`createAppRecorder`) is only
reachable through the in-app HTTP MCP server, which a headless process never starts. The only
behaviour change is that editor-only lesson authority stays refused, which needs a registered
editor anyway.

Reviews 31 and 32 accepted `edb74a00`/`bde9a618` without a headless-transport smoke test.
**Recommendation:** future slices that touch `registerIpcHandlers` should run one real
`openscreen mcp` initialize and one CLI startup.

### Confirmed behaviour

- **Authority.** Every file is an explicit argument: lesson, project path plus ID, step,
  intent, source grants and output. MCP requires absolute paths. Source grants are exact
  string matches against the declared and canonical paths, so a path declared inside an
  imported file grants nothing. There is no `getProject`, relink, migration or
  `approveDocumentMedia`.
- **Permission ordering.** HTTP checks live MCP-edits permission before the service starts,
  and the service's own first `check()` runs before any filesystem call (killed mutant F1b).
  Stdio keeps the explicit-launch policy, so its "requires MCP edits" description is always
  satisfied.
- **Inputs.** Lesson and project are read with bounded, no-follow, canonical-path reads, and
  their identity and bytes are rechecked around every await and before publication.
- **Publication.** The output is a new copy: private staging (0600), read back and compared,
  then published by hard link that never overwrites. The final check and publication share
  one JS turn.
- **Results.** Fixed error codes; redacted results; a retained partial path is disclosed only
  while authority is current.
- **Cancellation.** CLI handles signals and pipe closure. HTTP gives each request its own
  lifetime. Stdio drains pending work before exiting.

## Findings

### L33-1 Low — output-folder canonical checks and project replacement are not pinned by tests

My single and paired guard mutants against the worker's 16 focused files (282 tests) survive
for:

- **C89 (paired F8+F9):** removing **both** checks that the output folder is not reached
  through a symlink (`fileRange.ts:38` and `:131`). With them gone, a `--out` inside a
  symlinked directory would publish through the link. My real-CLI probe C5 shows the shipped
  code refuses it (`lesson-operation-failed`), but no test pins this.
- **F11:** removing the canonical-path check in `readSelectedFileSnapshot`
  (`selectedFile.ts:21`). Final-component symlinks are still refused by `lstat`/`O_NOFOLLOW`
  (probe C4), but an ancestor-directory symlink for the lesson or project file is untested.
- **F3b:** removing the **project** file identity check (`fileRange.ts:67`). Replacing the
  project with identical bytes is pinned only for the lesson file.

Fix: add a symlinked-output-parent test, an ancestor-symlink input test, and an
identical-bytes project replacement test to `fileRange.test.ts`.

### Nits

- **Redundant or equivalent survivors:**
  - F1, the HTTP pre-check: the service's own check runs first, and the catch maps to the
    same consent message.
  - F4, the byte comparison: the identity check already catches the change.
  - F12, the `lstat` isFile check: `fstat` isFile catches it.
  - F13/F15, HTTP close abort and lifecycle signal: each alone is covered by the SDK's
    `extra.signal`; together they are killed.
  - F20, project ID: `RangeAuthoringService` checks it again.
  - F22, stale attach: the service checks target and intent.
  - F23, MCP post-assert: publication has already happened, so this only changes the reported
    result.
- **Existing destination before reading media:** F18 shows the early "destination already
  exists" refusal (`lstat` before reading any media) is untested. The hard-link publication
  still refuses, so it is an efficiency issue, not a safety one.
- **Whole-file re-reads in the main process:** `currentInputs()` synchronously re-reads both
  inputs in full (up to 16 MiB each) at every check. Under the in-app HTTP MCP server this runs
  on Electron's main thread. That is fine for normal lesson and project sizes, but a 16 MiB
  project would briefly stall the UI on each check.
- **Error specificity:** a symlinked project file or output folder returns the generic
  `lesson-operation-failed` rather than a specific code. That is honest but not specific.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 00bdbc77` and `035c8313` copies in my scratchpad, in directories
  whose names contain spaces. `node_modules` is symlinked per entry, and the addon directory
  is symlinked read-only.

| Check | Result |
| --- | --- |
| Worker's 16 focused files | 282 pass / 16, 0 skip |
| Both `tsc` configurations | exit 0 |
| Biome on the 7 changed sources | clean |
| Production `vite build` | pass at both `035c8313` and `00bdbc77` (scratch only) |
| My mutants | 22 single (9 killed: F1b, F2, F3, F5, F6 rename-overwrite, F7, F10, F14, F17; 13 survived as above) + 2 paired (C1315 killed, C89 survived); snapshot restored clean |
| Worker logs | `full.log` 5941/444 pass; not repeated |

### Real transport probes (production build of 00bdbc77, isolated profiles, `DO_NOT_TRACK=1`)

My own fixtures: a 5 s 320×180 H.264 source, a current-schema project, and a lesson whose step
instructions contain a canary string.

**Real Electron CLI `lesson confirm-range --json`:**

| Probe | Result |
| --- | --- |
| C1 author-current | `confirmed`; new copy at mode 0600, revision 1, step `draft`, v2 `explicit-author-current`, history 1 |
| C2 existing output | `destination-exists` |
| C3 wrong `--source` grant | `range-source-unavailable` |
| C4 symlinked project file | `lesson-operation-failed` |
| C5 symlinked output folder | `lesson-operation-failed` |
| C6 author-current over a pin | `range-target-changed` |
| C7 wrong project ID | `project-changed` |
| C8 explicit refresh after source bytes change | `confirmed`, revision 2, `explicit-refresh-current`, history 2, new range 1–3 |

- No partial files were left behind.
- The canary appears in no output.
- Source, project and original lesson SHA-256 values are unchanged.

**Real SDK-protocol stdio (`openscreen mcp` subprocess, raw JSON-RPC):**
- `confirmLessonRangeFile` is listed with all 9 fields required.
- A real confirmation succeeds.
- A relative path, an extra `destination` field and duplicate sources are refused by schema
  validation without echoing any values.
- `queryLessonFile` of the result contains no canary, source path or hashes.
- The process exits cleanly 0.06 s after stdin closes.

HTTP was not probed live by me; I relied on the worker's actual-SDK HTTP integration tests,
which my paired mutant C1315 confirms are effective. No MP4 render, sample/decode validation,
GUI, picker or physical capture is covered.

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 521 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 68 entries in `preserved-reports.json` re-hashed, 0 mismatches. This includes
  review 32 at `5507babd…`.
- **Stale imported entry checked against git:** `SELECTED_STEP_MP4_2026-11-09.md` is
  `03166257…` at `bde9a618`, equal to the worker's archived "before coordinator" copy, and
  `da4a37f2…` at both `035c8313` and `00bdbc77`. The coordinator edited it; this commit did
  not.
- **Addon:** hash unchanged.
- **Cleanup:**
  - My probe processes exited; none remain.
  - Removed: probe profiles, media and outputs.
  - Kept: scratch builds and snapshots in the session scratchpad.

## Next

- Optionally close L33-1 (three tests).
- Coordinator private push.
- Then the headless selected-MP4 slice: transport caller/channel/operation ownership on the
  shared registry and compute lease; explicit output authority before media reads; native
  cancel and settlement within the transport lifetime; the accepted materializer and actual
  validator; and real stdio/HTTP proof.
- Keep the new recommendation: smoke-test a real headless `mcp` initialize and a CLI startup
  in reviews that touch handler registration.
- Physical, audio, platform, player and packaging limits are unchanged.
