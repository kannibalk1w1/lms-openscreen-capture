# Independent R1/R2 lifetime-fix review — 10 November 2026

**Target:** exact `3e3785da0dde7ac7e908624b0d0624890e928cf2`, including implementation
`0c73895bbcc7eb90ba0571167c4d0344ef3248db`, against previously reviewed
`51e46e44fc4fea86d63bdce9b7c478f4b908992d`.

**Verdict: accept the scoped R1/R2 correction, with one new nonblocking Low. R1 CLOSED;
R2 CLOSED. No new High/Medium found.** Coordinator owns the private push and next
implementation gate. D3(b) is now explicitly approved for project-independent,
read-only inspection/playback; authoring checks remain. No player implementation
or broader platform/product acceptance is supplied by this review.

Read the repository AGENTS instructions, current handoff, original independent
review, appended Opus fix handoff, full current diff and revised player plan.
The original review is preserved verbatim with SHA-256
`ae4fdef90fa0593585d39a4097a8fb82f3625cd6f2cf53112f881009b86b1300`.
Its historical D3-pending account is not a current decision; the roadmap and plan
correctly record the subsequent explicit approval.

## R1 closure: stale opens no longer grant

At `electron/ipc/lesson.ts:144`, state and lifecycle listeners are established
before a picker/read is awaited. Each explicit file operation captures epoch and
operation generation. The post-picker assertion at `:244` prevents a stale open
from reading the selected path; `remember` checks before the grant read (`:161`)
and after asynchronous parsing/hashing (`:164`). Only the current operation can
install its exact-content grant. These checks use the main-frame identity and
registered exact editor page, independent of project selection.

I reran my original production-app/preload reproduction on a fresh production
build of the exact target:

1. Real app creates its real editor through production window registration.
2. Real preload `lessonOpen()` waits on a stubbed native picker.
3. Actual hash navigation to `#foreign-context` emits `did-start-navigation`.
4. Resolve the old picker with an owned valid lesson file.
5. The open now returns `lesson-operation-failed`, no lesson/file token. Draft
   status is also refused. Save-current with a substitute UUID returns
   `lesson-file-unavailable`, and original file bytes remain identical.
6. Return the same window to its exact editor page and explicitly open again:
   a new token is issued and saving changes succeeds.

The old result at `51e46e44` was an open token followed by an actual overwrite;
that original evidence remains retained. This follow-up is an independently
executed reproduction, not just the writer's probe result.

The actual app also ran overlapping opens: hold older picker A, complete fresh
open B, then resolve A. A is refused; B's grant still saves B; A's original bytes
remain unchanged. Thus an older completion neither replaces nor revokes the newer
grant. All observed native open-picker calls were parented to the editor.

My additional service/registration probe pauses an actual image SHA-256 operation
inside `grantLessonFile`, after the service has parsed the lesson. Navigation
then causes the open to refuse, with original bytes retained. This exercises the
post-hash assertion rather than only holding a wrapper before the helper starts.
A mutation removing that assertion is killed by this probe.

## R2 closure: precommit invalidation prevents replacement and certification

`save-current` now checks the page at entry (`electron/ipc/lesson.ts:202`) and
passes a predicate binding exact grant, page and epoch (`:207`) into the real
replacement helper. The helper checks it at entry, before staging and again at
`electron/lesson/lessonFile.ts:109`, after asynchronous staged parsing and before
the rename. There is no await between that final assertion, target/stage identity
checks and `renameSync` (`:113`). The failure path removes its owned partial file.

My original independent three lifecycle-save cases now all return
`lesson-file-unavailable` and preserve original bytes. The previously incorrect
existing assertions have been changed to require refusal; the new focused suite
no longer treats the old overwrite as acceptance.

I added three stronger cases using actual production registration, service,
file helpers, filesystem and image hashing. They pause the second real digest,
while the staged file already exists and its read-back is being validated.
For each navigation/crash/destroy event, release the hash and require:

- refusal with no `saved` certification or returned file grant;
- byte-identical original target;
- no partial file left behind.

All pass. Removing only the final pre-rename assertion makes all three fail.
These are controlled lifecycle-event probes, not claims of a physical renderer
crash during a real user save.

The 18 committed lifetime cases additionally cover pending picker/read/hash,
eventless page change, overlapping opens, a save overtaken by a newer completed
open, new-copy cancellation/invalidation, and fresh-open restoration. Helper tests
retain changed-source, same-bytes replacement, missing target, symlink, invalid
lesson/revision, private 0600 replacement, inode change and atomic/no-partial checks.
No source-path grants or dirty-state claims were broadened; headless explicit-file
paths and the production dirty-provider bootstrap remain intact.

## Committed outcome and the actual UI

The helper reports an already committed save honestly when its final consultation
finds authority gone. Main returns `saved` and the committed path without a reusable
`file` grant (`electron/ipc/lesson.ts:211`). It only clears the matching old grant,
so a different newer grant is not revoked. Controlled helper/registration tests
verify this postcommit branch; it is not a claim of a physical app timing race.

`LessonGuideDialog.tsx:363` clears the file handle when a saved result lacks one.
The committed-result component test confirms a subsequent edit is unsaved and
cannot reuse the old same-file action. The existing current-generation check and
captured saved lesson keep a newer draft from being marked clean by an older
result. The response path remains the file actually saved.

I also drove the actual Lesson guide DOM in the production app: open a disposable
lesson, type `Independent unsaved draft`, navigate the hash, then click Save
changes. Main refuses; the file remains byte-identical; the typed draft remains;
status says unsaved; the same-file button becomes disabled; and the plain
"no longer linked" alert appears. There is no false saved/clean status in this
flow. No automatic recovery writes or crash-draft preservation is inferred:
L42-2 remains an explicitly separate limit.

## New Low L1 — validation can finish by opening a stale new-copy picker

Locations: `electron/ipc/lesson.ts:175–182` and
`electron/lesson/service.ts:108` (validation before invoking the picker).

New-copy saving starts an operation before asynchronous image validation, but its
picker callback calls `saveDialog` before checking that operation. If navigation
or a newer operation occurs during validation, the stale request still opens a
native save picker; only after it returns does `operation.assertCurrent()` refuse.

Independent reproduction uses a valid lesson with an image, gates its real
WebCrypto validation digest, navigates the owner, then releases validation.
The route refuses as expected, but the assertion that no save dialog was called
fails: the dialog was invoked once. No write or grant occurred in this probe.
This is a narrow stale-dialog defect, not a reopening of R1 or R2 and not a
High/Medium blocker. Add `operation.assertCurrent()` at the start of the picker
callback, before `saveDialog`, while retaining the existing post-picker check.
The same guard also avoids showing an obsolete picker for a superseded request.

## Player plan and D3

The present roadmap records the owner's explicit D3(b) answer and keeps
create/copy/reseal bound to existing authoring authority. Slice 0 is the authorized
read-only capability prerequisite; slice 1 follows it after the coordinator gate.
The previous report remains an accurate historical document.

The plan addresses my P1/P2 concerns: unique ephemeral partition per owner;
exclusive window/frame/session ownership and denied navigation/window opening;
second-player isolation tests; bounded buffered range reads with final identity
and current-capability checks; descriptor cleanup/revocation; at most two requests
per capability and 32 MiB globally; bounded waiting/refusal; and mutation-during-read
coverage. These are adequate planning dispositions of P1/P2, not implemented or
validated playback. No additional material design blocker found in this scoped
recheck. Verification, Linux gates, existing package contracts/media caps and
explicit-write authoring policy remain. No player code was added.

## Independent commands, counts and evidence

All commands used pinned **Node 22.22.1 / npm 10.9.4**, verified explicitly, with
`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`
first on PATH. An owned `git archive` snapshot of the exact target was used at
`/tmp/opus-lifetime-review-uf7w8et8/snapshot`, with only `node_modules` linked.
No checkout/worktree, helper agent, implementation edit or push was performed.

Retained scratch evidence: `/tmp/opus-lifetime-review-uf7w8et8/` (temporary storage;
coordinator may retain it durably). Commands ran in `snapshot/` unless noted.

| Actual command | Result / evidence |
| --- | --- |
| `npx vitest --run electron/ipc/lesson.test.ts electron/ipc/lesson.authority.test.ts electron/ipc/lesson.lifetime.test.ts electron/lesson/lessonFile.test.ts electron/ipc/lessonPackageOpen.test.ts electron/ipc/nativeBridge.renderOwnership.test.ts src/components/ai-edition/v4/LessonGuideDialog.test.tsx src/components/ai-edition/v4/LessonRangeAuthoring.integration.test.tsx` | 178 passed / 8 files, 0 skipped; `focused.log` |
| `npx vitest --run electron/ipc/independent-lifetime.test.ts` | My original regressions, adjusted only to allow the refused open's missing token: 4 passed / 1 file, 0 skipped; `original-regressions.log` |
| `npx vitest --run electron/ipc/independent-hash-gates.test.ts` | 4 passed, 1 assertion failure / 1 file, 0 skipped; passing post-hash/pre-rename cases close R1/R2, failure reproduces Low L1; `independent-hash-gates.log` |
| `npx vite build` | Pass, fresh renderer/main/preload production build; `vite.log` |
| `npx tsc --noEmit` | Pass; `tsc-app.log` |
| `npx tsc -p tsconfig.test.json --noEmit` | Final pinned-tree run passes; `tsc-test.log` |
| From scratch root: `node snapshot/scripts/smoke-headless-startup.cjs --evidence-dir /tmp/opus-lifetime-review-uf7w8et8/startup` | Pass: real SDK stdio initialize/listTools and normal CLI registration/renderer startup from foreign cwd; `startup/startup-smoke.json` |
| From scratch root: `xvfb-run -a node real-followup.cjs /tmp/opus-lifetime-review-uf7w8et8/snapshot /tmp/opus-lifetime-review-uf7w8et8/real-followup-final` | Four real-app cases pass with assertions: original R1, fresh open/save, overlapping opens, DOM draft retention; `real-followup-final/results.json` and log |
| From scratch root: `python mutations.py`, plus the separately recorded committed-authority mutant | Six assertion-killed controls and one semantic DOM-observation failure; `mutations.json`, `mutant-*.log` |

Controls independently remove: post-grant hashing assertion; final pre-rename
assertion; exact saving-grant identity; epoch bump; operation-generation check;
postcommit authority reporting; and UI spent-handle clearing. The last is killed
by missing expected unsaved-without-file DOM text, a Testing Library observation
failure, not counted as an assertion kill. No compile/import/tooling kill is
counted. Mutant runs intentionally used `-t` filters: 95 filtered-out test cases
across the seven runs are recorded as skipped, separate from the zero skips in
all normal focused/probe runs. All mutations were scratch-only and restored
byte-for-byte. Own supplemental probes are retained under `probes/`, outside the
snapshot after execution; final TypeScript checks cover the exact committed tree.

Two preliminary harness attempts are excluded from acceptance: the first real-app
attempt stopped on my wrong Playwright `expect` import after its first three cases,
and an initial test-TypeScript attempt overlapped removing scratch supplemental
probes and exited 2. I corrected the harness import and reran the real app with a
fresh isolated profile, then reran test TypeScript on the exact tree. The failed
real-app log/results remain under `real-followup/`; only final runs count above.

The startup smoke fingerprints the fresh production entry and main chunks. SDK
initialize/listTools succeeds; CLI deliberately exits 1 for an absent disposable
project only after real registration and renderer bootstrap, with no input/output
created. This is startup coverage, not successful media export or capture.

Inspected worker evidence separately confirms **6321 passed / 461 files, 0 skipped
at 0c73895b**. Its 15 assertion controls and broader lint/i18n/docs claims belong
to that worker, not this independent run. No full-suite repetition was necessary.
No new native export/capture, physical picker/input, screen-reader, audio,
Windows/macOS or real-crash timing acceptance is claimed.

## Preservation and owned cleanup

Before/after SHA-256 comparison: **2490 tracked files unchanged**, plus **409
additional files unchanged** across original Opus evidence, retained original
review evidence, fix-worker evidence, the external LMS workflow report and native
addon. `preservation-result.json` records the comparison. Historical snapshots,
original review and every existing report remain untouched. Raw source/media and
user files were never selected as probe destinations or opened for writing.

HEAD remains exact `3e3785da`; main remains
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. The addon retains SHA-256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`, and the external
LMS report retains
`f87c9eb7bffbd5e4bd55375f20541b3f0822420d6c74e1bce317ab7dbb5196a7`.

Scratch source/test/doc/config restoration is exact. Three documentation images
are absent from the archive by existing `export-ignore` attributes; originals
remain unchanged. Per-test disposable lesson directories were removed by owned
cleanup. Both real-app attempts close their own apps in `finally`; stdio and CLI
processes settle. Final owned-process inspection found no remaining scratch
Electron/Xvfb/probe/test process. Scratch scripts/logs/disposable real-app fixtures
remain intentionally as review evidence. No user app was killed, shared cache
purged, provider/auth/paid API used, or original file removed.

Only this unique report is added to the original checkout. Coordinator can now
disposition Low L1, make the private checkpoint decision, and proceed through the
authorized read-only player capability/media dependencies under the review gate.
