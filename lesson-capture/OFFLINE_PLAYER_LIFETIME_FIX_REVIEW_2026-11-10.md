# Independent player lifetime-fix recheck — 10 November 2026

**Target:** exact `5a304a4be5082ca422ef706542d8353b0524ed9e`, implementation
`715460468211e95a77d9db8fb1b93fecf46e3f6f`, against reviewed
`43b18c7013f2fc2830c6085d8e9b2777b44386ff`.

**Verdict: request changes. MP1 CLOSED; DOC1 CLOSED; MP2 remains OPEN at Medium.**
The original MP2 picker and verification reproductions now refuse correctly, but
the newly added settlement-wait path lets an open survive a subsequent release or
Cancel and publish a fresh capability. This continuation reproduces through actual
production preload/IPC, native-picker boundary, full verification and media protocol.
No other new High/Medium finding was established. L1 and the earlier R1/R2 remain
closed; the remaining issue concerns player requests waiting to begin work.

Read AGENTS.md, current handoff, latest Opus handoff/plan, complete current diff,
production owner/media/window wiring and new tests. D3(b) remains explicitly
approved only for project-free read-only inspection/playback. Authoring/project
checks and the coordinator review/push gate remain unchanged. No next player
feature, progress, caption or standalone implementation is accepted here.

## MP1 closure — no await remains after final response authorization

`electron/lesson/playerMedia.ts:159` now finishes awaited descriptor close before
the last synchronous path check (`:164`), current-capability/request-signal check
(`:165`) and Response creation (`:166`). The outer budget cleanup is synchronous;
there is no awaited cleanup after that last authority check. The post-read
fstat identity check remains at `:155`, and the original bound/no-follow read and
per-capability/global reservations remain.

I reran my original held-close helper regressions. Capability revocation and
Request abortion now return 404/zero bytes; the ancestor-symlink control also
passes. Five additional independent cases hold settlement **after the real
descriptor has already closed**: release, request abort, file mutation, unchanged
positive control and a close error. All pass, with exactly one close invocation.
In every held case, inflight remains 1 and buffered reservation remains 10 until
settlement; afterwards both are zero. The current positive control returns the
exact ten requested bytes with 206. Close failure returns no bytes and clears its
reservation without a second close attempt.

The real production session/protocol reproduction gives these outcomes:

| During a held actual descriptor-close settlement | Client outcome | Close calls |
| --- | --- | --- |
| Real preload `lessonPlayer.close()` | 404, 0 bytes | 1 |
| Real session-fetch caller abortion | Client abort rejection, no body/0 bytes | 1 |
| Owned MP4 changed in place | 404, 0 bytes | 1 |
| Nothing changed | 206, 10 bytes | 1 |

The client was confirmed unsettled before each intervening action. The release
case was 206/10 bytes in my original review and is now 404/zero; this is the
server-side boundary, not an observation of previously buffered renderer video.
The actual caller-abort probe establishes no delivered body; the independent
helper Request-signal regression additionally requires the handler's 404 result.

Removing the new post-close capability check kills my release/abort cases;
removing the post-close path check kills my close-interval mutation case. Existing
read-loop mutation, replacement and budget tests also pass. This closes MP1
within the reviewed Linux/controlled-I/O scope, without extending the claim to
revocation of bytes already delivered to Chromium.

## MP2 direct correction passes, but waiting opens escape later cancellation

The public close and lifecycle end now call `release()` (`lessonPlayer.ts:71`):
advance epoch, abort the current pending open and revoke its media. Internal
new-folder revocation is separate (`:137`), so it does not invalidate its own open.

My original real-preload pending-picker repro now returns
`lesson-package-cancelled`, with no view/token; the previous capability is already
404 before that picker settles. A subsequent explicit fresh open works.

I also gated an **actual WebCrypto digest inside real package verification** in
the production process. After that gate is reached, call the real preload Close,
release the digest, and await the request: it returns `lesson-package-cancelled`,
not a view/token. This is a deterministic verification-stage probe, not the
writer's 30 ms scheduling assumption and not an inspector replacement. Fresh
verification/open afterwards returns a working 206 capability.

**Remaining Medium MP2 continuation:** `electron/ipc/lessonPlayer.ts:107–122`,
together with `release()` at `:71–74` and `cancel()` at `:81–82`.

An open entering while an older aborted request is still unwinding waits at
`await this.settling` (`:111`). That waiting request has not captured an epoch or
created/registered its own abort controller. Another Close or Cancel affects only
the already-aborted older request. When the older request finally settles, the
waiting call captures the **latest** epoch at `:119` and starts a new picker as if
it had been requested after the later release. The page check after the wait does
not detect this lifetime change.

Independent deterministic actual-app/preload reproduction:

1. Start open A and hold its native picker.
2. Call real `lessonPlayer.close()`; A is now aborted but still unsettled.
3. Call open B. It waits for A, and no second picker has opened yet.
4. Call `lessonPlayer.close()` **again**, while B is waiting.
5. Resolve A's picker. A correctly returns `lesson-package-cancelled`.
6. Without another open request after step 4, B opens a new picker, fully verifies
   its selected folder and returns `success:true/status:opened` with a new video
   token. That token serves 206/10 bytes.

Repeat step 4 with `lessonPlayer.cancel()` instead: the same stale B result and
working token occur. The final production evidence records, for each variant:

```
first: success false, lesson-package-cancelled
waitingSuccess: true
waitingStatus: opened
hasVideoToken: true
pickersAfterSecondEnd: 1
served: status 206, bytes 10
```

`real-followup/results.json` records these as
`BUG-MP2-waiter-survives-release-again` and
`BUG-MP2-waiter-survives-cancel-waiter`. Independent owner-level required-refusal
assertions fail for both variants; the no-second-cancellation positive control
passes, showing that the intended wait-for-old-settlement behavior itself works.
The supporting owner test uses a controlled inspector; the real-app result above
uses the real strict verifier and actual media server.

As in the original MP2 finding, the GUI hides Close while busy; these are exposed
preload/IPC lifetime-contract reproductions, not claims that the busy GUI currently
shows a clickable Close button. The code's stated release invariant still fails:
a request begun before release can install a new view/capability afterwards.
This waiting path is introduced by the fix; the old implementation would have
busy-refused B. The direct picker/verification correction is valid but insufficient
for an unqualified MP2 closure.

Required correction: track cancellation/lifetime for requests **before** they
await old settlement. Later release and Cancel must invalidate waiting requests,
which must recheck their captured request context before starting a picker or
verification. Tracking only the currently executing older AbortController is not
enough, and capturing the current epoch after waiting treats a stale request as
fresh. Preserve the valid wait/fresh-open positive control, internal capability-
only revocation, wrong-owner refusal and actual settlement/resource discipline.

## DOC1 and preserved behavior

The plan header now distinguishes delivered self-tested player slices from
remaining plans and explicitly awaits independent acceptance. **DOC1 CLOSED.**
The prior report remains byte-identical, SHA-256
`ddd71b66fa4d93880c5469e72b8e89e19f61a27c2ab6b3764c9327e05224a4a6`.
Its original findings and raw evidence are not rewritten by this follow-up.

Existing focused tests confirm foreign windows/subframes cannot close or cancel
another owner, choosing a new valid folder does not cancel itself, lifecycle ends
revoke capabilities, and fresh opens work after normal release. The owner/window
registry, unique ephemeral sessions, CSP/minimal bridge, native-folder-only root
selection, package-v1/full-decode policy and authoring project checks are unchanged
except for the reviewed lifetime methods. No new writes/features were added.

My real production probe also independently retains the normal flow: native menu
launch before explicit editor creation; enabled editor button without a selected
video project; distinct sandboxed/nonpersistent sessions and no editor bridge in
the player; ordered text, code, JPEG data image and capability video; actual
1.5 s 640×360 playback, seek to 1.0, Replay, 1.5× speed, Next/Previous with focus
and no autoplay; cross-player/editor token refusal and range/method matrix;
changed bytes revoke, old tokens do not revive on byte restoration, and a fresh
open works. Final UI reopening plays successfully after the lifetime probes.
Editor draft-status still works afterwards. Earlier R1/R2/L1 authority and
same-file protections are unaffected; their relevant focused tests pass.

## Independent commands, counts and evidence

All host commands used pinned **Node 22.22.1 / npm 10.9.4**, verified explicitly,
with `/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`
first on PATH. Execution used an owned `git archive` snapshot of the exact target,
with dependencies and the existing native runtime linked for read-only execution.
No checkout/worktree or other worker was created.

Scratch/evidence root: `/tmp/player-lifetime-recheck-44msyuu3/`, retained as temporary
evidence for coordinator inspection. Commands ran in its `snapshot/` unless noted.

| Actual command | Result / evidence |
| --- | --- |
| `npx vitest --run electron/lesson/playerMedia.test.ts electron/ipc/lessonPlayer.test.ts src/lessonPlayer/LessonPlayer.test.tsx electron/ipc/lesson.lifetime.test.ts electron/ipc/lessonPackageOpen.test.ts electron/ipc/lesson.authority.test.ts electron/lesson/lessonFile.test.ts` | 177 passed / 7 files, 0 skipped; `focused.log` |
| `npx vitest --run electron/lesson/independentPlayerMedia.test.ts electron/ipc/independentPlayerClose.test.ts electron/ipc/independentQueuedOpen.test.ts` | 5 passed, 2 assertion failures / 3 files, 0 skipped; original repro corrections pass, waiting-request refusals fail; `independent.log` |
| `npx vitest --run electron/lesson/independentPostClose.test.ts` | 5 passed / 1 file, 0 skipped; counters, exactly-once close, release/abort/mutation/control/error; `independent-post-close.log` |
| `npx vite build` | Pass, fresh production renderer/main/preload artifacts; `vite.log` |
| `npx tsc --noEmit`; `npx tsc -p tsconfig.test.json --noEmit` | Both pass on restored exact committed source/test tree; `tsc-app.log`, `tsc-test.log` |
| `npm run lint` | Pass; 1374 files, 35 existing warnings, no fixes; `lint.log` |
| From scratch root: `node snapshot/scripts/smoke-headless-startup.cjs --evidence-dir /tmp/player-lifetime-recheck-44msyuu3/startup` | Pass: real foreign-cwd SDK stdio initialize/listTools and normal CLI registration/renderer startup; fresh build fingerprints in `startup/startup-smoke.json` |
| From scratch root: `xvfb-run -a /tmp/player-lifetime-recheck-44msyuu3/snapshot/node_modules/electron/dist/electron /tmp/player-lifetime-recheck-44msyuu3/snapshot/dist-electron/main.js --user-data-dir=/tmp/player-lifetime-recheck-44msyuu3/cli-verify-profile lesson verify-package /tmp/player-lifetime-recheck-44msyuu3/moved-package --json` | Verified: 45 samples / 45 decoded frames / 1.5 s, 640×360, 30 fps, audio flags false; `cli-verify.log` and stderr log |
| From scratch root: `xvfb-run -a node real-followup.cjs /tmp/player-lifetime-recheck-44msyuu3/snapshot /tmp/player-lifetime-recheck-44msyuu3/real-followup /tmp/player-lifetime-recheck-44msyuu3/moved-package` | 20 asserted structured records, final exit 0; normal flow, MP1 correction, direct MP2 correction, deterministic real verifier gate and two adverse waiting-request reproductions; `real-followup.log`, `real-followup/results.json` |
| From scratch root: `python mutations.py` | 6/6 controls killed by assertions, including one paired removal; `mutations.json`, individual `mutant-*.log` |

Own controls remove post-close capability/signal checking; post-close path checking;
pending abort; epoch plus abort together; internal-only revocation (substitute
public release); and the settlement wait. All use tests that pass at baseline;
the already-failing queued-request tests are not used to claim mutant kills.
Three filtered IPC runs intentionally skip **57 filtered-out cases** in total;
all normal focused and own regression runs have zero skips. No compile/import/
tooling kill is counted. Every mutation is scratch-only and restored byte-for-byte.
Reviewer supplemental tests are retained under `probes/` outside the snapshot
before the final TypeScript/lint checks. No preliminary failed harness run is
counted as acceptance; this production probe completed in one run.

The production probe's exit 0 deliberately confirms the two adverse results; it
does not turn them into acceptable behavior. Similarly, the green committed test
suite does not cover the waiting-request continuation. The required startup CLI
intentionally fails only for an absent disposable project after registration and
runner startup; no input/output is created. It is startup coverage, not successful
capture/export. Actual package verification separately uses the real native FFmpeg
runtime; no decoder/source mock supplies its 45-frame result.

Inspected worker full log: **6372 passed / 464 files, 0 skipped at 71546046**.
That, its seven pre-fix regression failures and its nine mutation controls are
attributed worker evidence, not independent full-suite or mutation counts. No full
suite was repeated. The meaningful uncovered gap is pinned by focused failing
probes and the actual production reproduction above.

No physical picker/input/keyboard, screen-reader, Windows/macOS, audio or real-lesson
acceptance is claimed. Folder dialogs and owned I/O/hash scheduling are controlled
in the actual-app probes. Already renderer-buffered media remains a disclosed
separate limit. No progress, captions, Loop/shortcut or standalone feature is added.

## Preservation, cleanup and gate

Before/after SHA-256 comparison finds **2504 original tracked files unchanged**,
**1069 additional files unchanged** across retained prior reviews/manifests, all
relevant worker evidence, external user report and native addon, and **7 original
package files unchanged**. The owned moved package is restored to identical bytes
after deliberate mutation probes. `preservation-result.json` records these checks.
All original reports, raw media/evidence and external LMS workflow files are kept.

Main remains `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`; HEAD remains exact
`5a304a4be5082ca422ef706542d8353b0524ed9e`.
Addon SHA-256 stays
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`;
external LMS report stays
`f87c9eb7bffbd5e4bd55375f20541b3f0822420d6c74e1bce317ab7dbb5196a7`.
Scratch production source/test/config/docs are fully restored. Three existing
export-ignored documentation images are absent from the archive; originals remain
unchanged.

Owned test directories are removed in cleanup. The actual app restores its own
filesystem/digest wrappers, releases all scheduling gates and closes in `finally`;
CLI/stdio/test processes settle. Final scoped process inspection finds no owned
scratch app/Xvfb/probe/test process remaining. Scratch scripts/logs/fixtures are
intentionally retained as review evidence. No user app was killed, shared cache
purged, paid/provider/auth action performed, commit/push/reset/stash/new checkout
made, or original file removed. Only this unique review report is added.

Coordinator should retain MP1/DOC1 closure, obtain a correction and independent
follow-up for MP2's waiting requests, then decide the private checkpoint before
continuing player features.
