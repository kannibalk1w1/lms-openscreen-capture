# Claude roadmap review 34 — review-33 follow-up (9 November 2026)

Reviewed: exact `f9dcd8df01531f26322237bb01c449fbefb18f96` ("test(lesson): pin filesystem
guards and real headless startup") against the review-33 base
`00bdbc77941a47a57926c5f5c412d2cf1de1b507`, branch `lesson-capture/input-boundaries`. Main is
still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: the committed review 33 (`046ce6db…`, first committed here and preserved word for word),
`CLAUDE_ROADMAP_FOLLOWUP_33_2026-11-09.md`, the new `AGENTS.md` "Required real headless startup
regression check", `scripts/smoke-headless-startup.cjs`, the new `fileRange.test.ts` cases and
the documentation updates.

**Scope:** `git diff --quiet 00bdbc77 f9dcd8df` over the production `electron`/`src` paths
(tests excluded) shows no change. A `00bdbc77` production build therefore represents this
commit, and no new build or full suite was needed.

## Verdict

**Accepted. L33-1 is closed, the startup smoke is real and effective, and there are no new
findings beyond nits.**

| Item | Status | My independent evidence |
| --- | --- | --- |
| Symlinked output folder | **Closed** | The paired removal of both checks (C89) is killed, and now **each check alone is killed too**: F8 by "refuses an output-folder ancestor symlink before reading inputs/media…" and F9 by "rechecks the output folder after staging when its name becomes a symlink" (a real rename plus symlink swap after staging). The follow-up's "one paired, five single" accounting is accurate; the two output checks are no longer only redundant. |
| Ancestor-symlink lesson/project input | **Closed** | F11 is killed by the lesson and project cases (no `openSync` of the target, no media open). |
| Identical-bytes project replacement | **Closed** | F3b is killed by both the "observation" and the "publication" inode-replacement cases. |
| Existing destination before reads (review-33 nit) | **Closed** | F18 is killed: no `openSync`, `open` or `writeFile`, and the existing output bytes are untouched. |
| Equivalent guards | Unchanged | F4 (lesson byte comparison) and F12 (`lstat` isFile) still survive. They are redundant with the identity and `fstat` checks, and no closure is claimed for them. |

The seven new cases use real disposable files, real symlinks and inode swaps. They assert that
originals are unchanged, that nothing is overwritten, and that a staged path is disclosed only
where authority stays current.

### Real startup smoke (`scripts/smoke-headless-startup.cjs`)

I ran the committed script unchanged, with pinned Node 22.22.1, against my own scratch
production builds:

- **`035c8313` (the pushed regression):** it **fails**: `MCP error -32000: Connection closed`,
  exit 1. The retained `stdio-stderr.log` contains `Error: Error: Editor dirty-state provider is
  required.` The smoke therefore detects the historical regression.
- **`00bdbc77` (the same production code as `f9dcd8df`):**
  - It **succeeds**: real SDK stdio initialize plus `listTools` with 60 tools, including
    `confirmLessonRangeFile`.
  - The CLI `export` exits 1 with `File not found` for the deliberately absent project, after
    "app handlers registered" and "renderer asked for the request" (bootstrap and runner both
    reached).
  - No input or output file is created.
- **Cleanup:** no Electron or Xvfb process remained after either run.

The script and `AGENTS.md` correctly call this startup coverage, not export, capture or
physical acceptance. The history is recorded honestly: `035c8313` was pushed with the
regression, reviews 31/32 missed it, and review 33 found it and confirmed the fix.

### Nits

- **N34-1: failure leaves no summary file.** When MCP initialize fails (as at `035c8313`), the
  script throws before the CLI half runs and writes no `startup-smoke.json`, only
  `stdio-stderr.log` and the exit code. Writing a failure summary would make CI triage easier.
- **N34-2: build fingerprint includes stale files.** `buildHashes` takes every
  `dist-electron/main*.js`, including stale chunks left from earlier builds. The worker's run
  recorded 101 chunks; the entry hash matches my build, but the chunk set does not, so it is
  not an exact build identity.
- **N34-3: raw stack trace in CLI error output.** The CLI error message contains a raw stack
  trace with a local `file:///…` path. That is how the CLI already behaved, not something this
  commit introduced.

## Independent validation

Pinned Node 22.22.1 / npm 10.9.4, on a `git archive f9dcd8df` snapshot in my scratchpad.

| Check | Result |
| --- | --- |
| Worker's 16 focused files | 289 pass / 16, 0 skip |
| `tsc -p tsconfig.test.json --noEmit` | exit 0 |
| Biome on the changed test and smoke script | clean |
| My guard mutants | 8: C89, F8, F9, F11, F3b, F18 killed; F4, F12 survive (equivalent); snapshot restored clean |
| Startup smoke | `035c8313` fails as expected, `00bdbc77` passes (above) |
| Worker logs | `mutations.json` has 6 assertion kills; the worker's `startup-smoke-final/startup-smoke.json` reports `success: true` with the same entry hash as my build |

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 675 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 70 entries in `preserved-reports.json` re-hashed, 0 mismatches. This includes
  the original review 33.
- **Addon:** hash unchanged.
- **Cleanup:** my smoke runs left no processes; I removed their profiles and kept the logs and
  JSON in the session scratchpad.

## Next

Coordinator private push of this fix, then the headless selected-MP4 transport and native
ownership slice. That slice must run the new real startup smoke.
