# Claude roadmap review 32 — review-31 test follow-up (9 November 2026)

Reviewed: exact `bde9a618e1bc04ecd97a866b45037e935b3be6b2` ("test(lesson): pin source grants
and native cancel boundaries") against the review-31 base
`edb74a00f8445d9889db1ec069fb87ebba1b9925`, branch `lesson-capture/input-boundaries`. Main is
still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. The checkout was clean at the exact HEAD at
the start and at the end. This review added only this file.

Read: the committed review 31 (`c39b7c99…`, verbatim; its ending matches my report),
`CLAUDE_ROADMAP_FOLLOWUP_31_2026-11-09.md`, and the diff.

**Scope:** test, test-support and documentation only. I confirmed that no production source
changed (`git diff --quiet` over the production paths), so there was no reason to repeat the
full suite, the build, the native proof or a real-Electron run. Review 31's real-Electron and
native evidence and its limits still apply, and no fresh acceptance is inferred from this
commit.

## Verdict

**Accepted. L31-1 and N31-2 are closed, and there are no new findings.**

| Item | Status | Evidence (my independent mutation run) |
| --- | --- | --- |
| **L31-1 X9** lexical grant before `realpath` | **Closed** | Removing the pre-`realpath` grant (`rangeExport.ts:111-113`) is killed by the new spy test: an unapproved source never reaches `fs.realpath` or `fs.open`, and no native call happens. |
| **L31-1 X10** symlink ancestor | **Closed** | Removing the canonical-equals-resolved check (`:119`) is killed by a real on-disk symlinked directory where the lexical and canonical paths are *both* approved. The export refuses with no `open`, no native call and no `lesson-range-*` directory. |
| **L31-1 X12** native cancel after late handle arrival | **Closed** | Killed by the new "cancel arrives synchronously during handle acquisition" test (native cancel requested once, second request `render-busy`, no receipt, retry succeeds). |
| **L31-1 X13** native cancel on stop | **Closed** | Killed by 10 tests, including the updated native-ownership cancel test. |
| **N31-2 X18** native progress bound | **Closed** | Killed: the production route sends only 0, 12 and 45 out of {0, −1, 1.25, NaN, ∞, 46, 12, 45}. |
| **N31-2 X25** UI progress owner | **Closed** | Killed: foreign-operation progress (21/45) is ignored, and invalid bounds keep the last valid 12/45. |
| **N31-2 X26** dirty button | **Closed** | Killed: the button is disabled while dirty, a click reaches neither the IPC nor native work, and it re-enables after save. |
| X20 open-project invalidation | Now also killed (8 tests) | Was redundant in production; it is now pinned through the updated test support. |

**Still surviving**, as the follow-up says: X7, X14, X16, X17/X28 and X19. These are the
redundant or equivalent guards classified in review 31 (N31-1), and none is claimed as closed.

Unchanged and still documented: N31-3 (a project change is reported as "cancelled"), N31-4
(cancelling cannot close an open picker), N29-3 (private-ID accounting) and N27-3 (hash
navigation). Physical editor/picker acceptance, audio, Windows/macOS and native-picker clicks
are not accepted by this commit.

**Nit:** the worker's labels for X12 and X13 are swapped relative to review 31 (its "X12" is the
stop request and its "X13" is handle acquisition). Both are killed either way, by the worker's
run and by mine.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshot:** `git archive bde9a618` in my scratchpad, in a directory whose name contains
  spaces. `node_modules` is symlinked per entry, and the real addon directory is symlinked
  read-only.

| Check | Result |
| --- | --- |
| Worker's 26 focused files | 458 pass / 26, 0 skip |
| `tsc -p tsconfig.test.json --noEmit` | exit 0 |
| Biome on the 3 changed test files | clean |
| Re-run of all 14 review-31 survivors | 9 killed (X9, X10, X12, X13, X18, X20, X25, X26, plus X13's 10-test kill), 5 equivalent survivors as above; snapshot restored clean (`git status` empty) |
| Worker's evidence (`review31-followup-2026-11-09T1431Z/`) | `mutations.json` has 14 single-guard assertion kills; `focused-final.log` 458/26 |

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 482 entries in `preserved-prior-authoring-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 66 entries in `preserved-reports.json` (including the original review 31 and the
  external user report) re-hashed, 0 mismatches.
- **Addon:** hash unchanged.
- **Cleanup:** no app, Electron or native process was started by this review. Scratch
  snapshots stay in the session scratchpad.

## Next

Coordinator private push of the accepted selected-MP4 checkpoint, then bounded CLI/MCP
selected-step confirmation/refresh/export parity.
