# Independent MP2 continuation review — 10 November 2026

**Target:** exact `1dd36bc818a2fc5662958451dda4645e24645b89`, implementation
`e2e31d32a30105a5a728efe3a753834066f31de2`, against reviewed
`5a304a4be5082ca422ef706542d8353b0524ed9e`.

**Verdict: accept the scoped correction. MP2 CLOSED. No new findings.**
MP1, DOC1, L1 and the earlier R1/R2 retain their prior closure. Acceptance is
limited to the reviewed Linux package/player/lifetime behavior and controlled
probes below; it is not platform, physical-input, audio or release acceptance.
Coordinator owns the private push and next-feature gate.

Read AGENTS.md, current handoff, latest appended Opus handoff, revised plan/roadmap,
complete diff and production owner/registration code. D3(b) remains the explicit
read-only, project-free inspection/playback approval; create/copy/reseal retain
their existing authoring/project checks. No further feature or format decision
is inferred from this review.

## MP2 closure: no request waits under a later epoch

`electron/ipc/lessonPlayer.ts:109` now refuses **any** new open while `pending`
exists, including when its AbortController is already aborted. It runs before
creating a new operation, calling a picker, or awaiting anything. The settlement
promise/waiting branch has been removed. There is no retained B/C intent to
resume after a later Close or Cancel.

Release still advances epoch, immediately aborts pending work and revokes media
(`:69–72`). Cancel aborts pending work (`:79–80`). Actual settlement in the
operation's `finally` clears only that operation's pending slot (`:154–155`);
release/cancel do not falsely advertise that outstanding work has settled.
Internal new-folder revocation remains capability-only (`:128`), avoiding a
self-cancellation regression. Exact registered page/main-frame/owner checking
and the final epoch/operation checks remain in place.

This is the explicitly permitted no-wait policy: an open immediately after Close
or Cancel may return `lesson-player-busy` until the old picker/verification has
actually settled. The learner must request a fresh open afterwards. That limit
is honest and intentional, not an unresolved lifetime defect.

## My original actual-preload sequences now refuse

I reused the previous production reproduction and replaced its adverse
expectations with the specified no-wait contract. For each combination of:

- A held native picker or an actual held WebCrypto digest inside full package
  verification; and
- a second Close or Cancel after the first Close and B/C requests,

the actual app/preload/IPC result is:

1. A begins and is held at the stated boundary.
2. Close aborts A and revokes its previous capability.
3. B and C each return `success:false/code:lesson-player-busy` **before A's gate
   is released**. Neither includes a view or token; neither opens another picker.
4. Perform the second Close/Cancel, then release A.
5. A returns `lesson-package-cancelled`. B/C remain their already-settled busy
   results. No automatic later picker, verification, view or capability appears.
6. A genuinely fresh open after settlement fully verifies and serves 206.

All four real combinations pass. Combined B/C IPC round trips measured about
0.8–1.1 ms in this run and completed within the probe's 500 ms guard while A was
still held; this is evidence of refusal without waiting, not a general latency
benchmark. A separate player's live token continues serving 206 throughout all
four sequences. The verification gate is the real image digest in production,
not an inspector replacement or a guessed sleep.

An independent ten-case production-registration matrix covers picker/verification
crossed with second close/cancel/navigation/crash/destroy. It requires two bounded
busy responses, immediate verifier-signal abortion on release, no additional
picker/inspector calls after A settles, and fresh-open controls. Navigation and
destroy make the page unavailable; crash revokes the old work, with fresh opening
allowed only when the fixture again represents an available registered page.
These lifecycle-event cases are controlled tests, not claims of a physical crash.

The same ten cases run with the **pre-fix 5a304a4b owner source** fail all ten
required-refusal assertions: the call is still waiting at the deadline. This
independent negative control distinguishes the defect and the correction.

The original basic MP2 picker-close and deterministic real verification-close
reproductions also still return `lesson-package-cancelled`, with fresh-open
positive controls. Thus closure covers both the original defect and the later
waiting-request continuation.

## MP1 and normal player behavior remain verified

My five independent post-close filesystem cases still pass: capability release,
Request abort, in-place change, unchanged positive control and close error. They
hold settlement after the real descriptor has closed. Reservations remain held
until settlement (inflight 1, buffered 10), then return to zero; close occurs once.
Adverse cases return 404/no body; the unchanged control returns the exact ten
bytes with 206.

Actual dedicated-session protocol probes also pass:

| Action during held real descriptor-close settlement | Result |
| --- | --- |
| Real player release | 404, 0 new bytes, one close |
| Real session-fetch caller abort | Abort rejection, 0 delivered bytes, one close |
| Owned media changed in place | 404, 0 new bytes, one close |
| Unchanged positive control | 206, 10 bytes, one close |

The client is unsettled before the action. These are server-side pending-response
checks; the separately disclosed ability to replay already renderer-buffered
bytes is not treated as revocation of those delivered bytes. MP1 source is
unchanged from its accepted correction, including final synchronous authority
checks after all awaits.

The asserted real app flow additionally confirms native-menu launch before
explicit editor creation and the enabled editor button without a video project;
separate nonpersistent sandboxed sessions/minimal bridge; ordered text, code,
JPEG data image and opaque media URL; actual 1.5 s / 640×360 playback, seek to 1.0,
Replay, 1.5× speed, Next/Previous with heading focus and no autoplay; owner token
206, cross-player token 404, editor session refusal, HEAD/range/method checks;
mutation revocation and fresh-open recovery; and successful final UI reopening
and playback after the lifetime cases. Editor draft-status remains served.

The real CLI separately verifies the owned moved v1 package with **45 samples /
45 decoded frames / 1.5 seconds**, 640×360, 30 fps and audio flags false. No
source project or authoring originals are present alongside that owned copy.
No decoder mock supplies this result.

## Documentation and scope

The roadmap, plan and latest handoff correctly describe MP2 as pending review at
authorship, identify the no-wait behavior and retain the coordinator gate. They
do not falsely claim independent closure from worker tests. This report supplies
the independent scoped closure; original historical reports remain untouched.

The previous report is verbatim, SHA-256
`0e99f988ae56f61a0bd4d314342ec1665ac84458d34f5b45b5b050714df9831e`.
Registry/session/CSP/preload, file grants, media formats/budgets, authoring project
checks and the minimal UI implementation are unchanged by this correction.
Existing wrong-owner and valid-new-folder tests pass. No automatic progress,
recent-package or recovery writes, Loop/shortcuts, captions or standalone feature
are introduced.

## Independent commands, counts and controls

Host execution used pinned **Node 22.22.1 / npm 10.9.4**, explicitly checked, with
`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`
first on PATH. A temporary `git archive` snapshot of the exact target is at
`/tmp/player-no-wait-review-6pmv7quo/snapshot`. Dependencies and existing native
runtime are linked for read-only execution. No worktree/checkout or helper worker
was created.

Evidence root: `/tmp/player-no-wait-review-6pmv7quo/`, retained temporary evidence
for coordinator inspection. Commands ran in `snapshot/` unless noted.

| Actual command | Result / evidence |
| --- | --- |
| `npx vitest --run electron/lesson/playerMedia.test.ts electron/ipc/lessonPlayer.test.ts src/lessonPlayer/LessonPlayer.test.tsx electron/ipc/lesson.lifetime.test.ts electron/ipc/lessonPackageOpen.test.ts electron/ipc/lesson.authority.test.ts electron/lesson/lessonFile.test.ts` | 188 passed / 7 files, 0 skipped; `focused.log` |
| `npx vitest --run electron/ipc/independentNoWait.test.ts electron/lesson/independentPostClose.test.ts` | 15 passed / 2 files, 0 skipped: ten owner-sequence cases and five post-close resource cases; `independent.log` |
| `npx vite build` | Pass, fresh production renderer/main/preloads; `vite.log` |
| `npx tsc --noEmit`; `npx tsc -p tsconfig.test.json --noEmit` | Both pass on restored exact committed source/test tree; `tsc-app.log`, `tsc-test.log` |
| `npm run lint` | Pass, 1374 files, 35 existing warnings, no fixes; `lint.log` |
| From scratch root: `node snapshot/scripts/smoke-headless-startup.cjs --evidence-dir /tmp/player-no-wait-review-6pmv7quo/startup` | Pass: real foreign-cwd SDK stdio initialize/listTools and normal CLI registration/renderer startup; fresh build hashes in `startup/startup-smoke.json` |
| From scratch root: `xvfb-run -a /tmp/player-no-wait-review-6pmv7quo/snapshot/node_modules/electron/dist/electron /tmp/player-no-wait-review-6pmv7quo/snapshot/dist-electron/main.js --user-data-dir=/tmp/player-no-wait-review-6pmv7quo/cli-verify-profile lesson verify-package /tmp/player-no-wait-review-6pmv7quo/moved-package --json` | Verified, real full decode; `cli-verify.log` and stderr log |
| From scratch root: `xvfb-run -a node real-no-wait.cjs /tmp/player-no-wait-review-6pmv7quo/snapshot /tmp/player-no-wait-review-6pmv7quo/real-no-wait /tmp/player-no-wait-review-6pmv7quo/moved-package` | Pass, 22 asserted structured production records; `real-no-wait.log`, `real-no-wait/results.json` |
| From scratch root: `python mutations.py` | Six assertion-killed mutants, plus the separate pre-fix owner control with ten assertion failures; `mutations.json`, individual logs |

Own mutants remove the busy guard, restrict it to non-aborted work, clear pending
prematurely on release, remove Cancel abortion, remove release abortion, and
substitute public release for internal new-folder revocation. All six are killed
by assertions, not compile/import/tooling errors or test timeouts. Only passing
baseline tests are used for mutant kills. The pre-fix control's deadline assertion
is an expected failure, not a Vitest timeout.

Two targeted committed-test mutant runs intentionally filter out **60 cases** in
total. Normal focused/independent runs and the full ten-case pre-fix control have
zero skipped cases. All mutations are scratch-only and restored byte-for-byte.
Own supplemental tests are retained under `probes/`, outside the snapshot before
final TypeScript/lint checks. The actual production probe completed in one run.

Inspected worker full log: **6383 passed / 464 files, 0 skipped at e2e31d32**.
That, its ten pre-fix regression failures and its five mutation controls are
attributed worker evidence, not my independent full-suite or control counts.
No full-suite repetition was necessary.

The startup smoke deliberately reaches an absent disposable project's expected
failure only after registration and renderer startup; it creates no input/output.
It proves startup, not successful recording/export. Real package decode and
Chromium playback are separate proofs above. Folder dialogs and owned hash/I/O
scheduling are controlled; physical picker/input/keyboard, screen-reader, audio,
Windows/macOS, real-lesson and release acceptance remain unclaimed.

## Preservation and cleanup

Before/after SHA-256 checks find **2505 original tracked files unchanged**,
**1323 additional files unchanged** across original/retained reports, manifests,
worker evidence, external user report and addon, and **7 original package files
unchanged**. The owned moved package also returns to byte-identical content after
its deliberate tamper/restore. `preservation-result.json` records the comparisons.
Every original report/raw media/evidence/user workflow file is preserved.

HEAD remains exact `1dd36bc818a2fc5662958451dda4645e24645b89`; main remains
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
Addon SHA-256 remains
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`;
external LMS report remains
`f87c9eb7bffbd5e4bd55375f20541b3f0822420d6c74e1bce317ab7dbb5196a7`.

Scratch production source/test/config/docs are fully restored. Three documentation
images are absent from the archive through existing export-ignore attributes;
originals remain unchanged. Owned filesystem test directories are removed in
cleanup. The real app restores its own digest/filesystem wrappers, releases gates
and closes in `finally`; CLI/stdio/test processes settle. Final scoped process
inspection finds no owned scratch app/Xvfb/probe/test process left. Scratch logs,
scripts and disposable fixtures are retained as evidence. No user app was killed,
shared cache purged, provider/auth/paid API action performed, original file removed,
commit/push/reset/stash or new checkout made. Only this unique report is added.

Coordinator may now decide the private checkpoint and next authorized feature
gate with MP2 closed, retaining the stated busy-until-settlement and acceptance
limits.
