# Claude roadmap review 40 — review-39 follow-up (9 November 2026)

Reviewed: exact `93a84456f0bce70bcde666e45049cf66a176c369` ("test(lesson): pin package
capability session invalidation") against the review-39 base
`8ae837666e0d7df64446985e366acf6a5c40eae3`, branch `lesson-capture/input-boundaries`. Main is
still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: the committed review 39 (`03eca1cd…`, preserved word for word, including my corrected
line references `:126`/`:134`), `CLAUDE_ROADMAP_FOLLOWUP_39_2026-11-09.md`, and the new
`electron/ipc/lessonPackageOpen.test.ts` cases.

**Scope:** `git diff --quiet 8ae83766 93a84456` over the production `electron`/`src` paths shows
no change. The commit adds tests and documents only, so no full suite, build, Electron,
startup-smoke or native repeat was warranted.

## Verdict

**Accepted. L39-1 is closed, and there are no new findings.**

### What the new tests do

The five new cases run through the actual production `registerLessonWorkflow` registration and
the real package service. Project selection is driven through the **real production
`AI_EDITION_OPEN_PROJECT_CHANNEL` listener**, not a direct `select()` substitute. Each opens a
real package capability, then applies one change before copying:

- same-project reselect;
- switching to a different project;
- switching to a different project and back;
- closing then reopening the same project;
- setting the live dirty flag, then clearing it and reselecting.

In every case the old token's copy is refused with `lesson-package-invalid`, and:

- the save picker is **never called**;
- no new files appear;
- the package bytes are unchanged;
- a separate authored-work file is unchanged;
- returning to the original project ID cannot revive the old capability;
- a **fresh open** then saves successfully (positive control).

### The mutation checks are decisive

I ran these against the 9 focused files (170 tests):

| Mutant | Result |
| --- | --- |
| R10 alone: remove the open-time session check inside the copy's `assertCurrent` (`lessonPackageOpen.ts:134`) | **survives** (redundant: R16 still refuses) |
| R16 alone: remove the open-time session check at copy start (`:126`) | **survives** (redundant: R10 refuses after the picker but before any write) |
| R10 + R16 paired | **killed by all 5 new cases** |

How the paired mutant is killed:
- **The four reselect, switch and reopen cases** fail at the first old-token copy, where the
  save picker would otherwise be reached.
- **The dirty case** fails on the later reselect-and-revive copy. Its first refusal happens in
  copy-time `authorize`, before `state` is set, so it does not clear the capability. Only the
  open-time session then refuses the revive.

So the pair is the deciding guard and each single check is honestly redundant, matching the
follow-up's accounting (3 independent single controls, 1 paired kill, 2 redundant single
survivors).

### Unchanged

The N39 nits are still documented, not fixed:
- a `destination-exists` refusal leaves a private partial file;
- any failed copy drops the capability;
- a reselect during the picker reports a non-specific code.

Review 39's real-Electron proof and its limits stand: stubbed dialogs, no GUI clicks or native
picker, no physical capture, audio or other platforms, and no human translation.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshot:** `git archive 93a84456` in my scratchpad.

| Check | Result |
| --- | --- |
| Focused: `ipc/lessonPackageOpen`, `LessonPackagePanel`, `LessonGuideDialog`, `package`, `package.privacy`, `cli/lessonPackage`, `mcp/package.integration`, `src/lib/lesson/lesson`, `output` | 170 / 9 pass, 0 skip |
| `tsc -p tsconfig.test.json`, Biome on the changed test | pass / clean |
| My mutants | 3 (R10, R16, R10+R16) as above; snapshot restored clean |

## Preservation and cleanup

Re-hashed:

| Inventory | Entries | Mismatches |
| --- | --- | --- |
| Imported | 1485 / 76 | 0 |
| Extended | 1873 / 78 | 0 |
| Follow-up files | 125 | 0 |
| Parent-slice files (`prior-slice-files.json`) | 267 | 0 |
| Extra preserved files | 2 | 0 |
| Original native evidence | 112 | 0 |

- **Addon:** hash unchanged.
- **Cleanup:** no processes were started apart from vitest; the scratch snapshot stays in the
  session scratchpad.

## Next

Coordinator private push, then the media-preserving reseal dependency.
