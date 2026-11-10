# Independent offline-player review — 10 November 2026

**Target:** exact `43b18c7013f2fc2830c6085d8e9b2777b44386ff` against
`4489db2a71198272bf4a5cf1753e964f06682d82`, including `cabaf30e` (L1),
`82f69ca0` (first player), and the documentation commit.

**Verdict: request changes for two new Medium player lifetime defects. L1 CLOSED.**
Both Medium findings reproduce through the real production Electron app, minimal
preload, production IPC and dedicated session protocol. The normal playback flow
also works on the moved verified fixture. No new authoring/project authority
expansion was found. One Low documentation contradiction is noted below.
Coordinator retains the private push/review gate before further player features.

Read AGENTS.md, the current handoff, latest appended Opus handoff, updated player
plan, complete diff, production registration/window/bootstrap and relevant verifier,
file/session/UI code. D3(b) is explicitly approved for project-free read-only
inspection/playback. This review does not approve unbinding create/copy/reseal,
automatic recovery, new media formats/caps or other-platform gates.

## Medium MP1 — awaited descriptor close permits a response after revocation

Locations: `electron/lesson/playerMedia.ts:151`, `:152`, `:153`, `:161–162`.

The final path/descriptor and capability checks run before constructing the
Response, but the surrounding `finally` then awaits `handle.close()`. Thus the
handler can remain pending after its final authorization check. Revocation or
request abortion during that await does not prevent the previously constructed
206 response from subsequently reaching the client.

Independent real-protocol reproduction:

1. Open the moved package through the real player preload and full verifier.
2. Wrap only the actual filesystem handle's `close` for that owned MP4 to delay its
   promise; do not change the production handler, bytes, verification or capability.
3. Start a fresh request through that window's actual `session.fetch`, for
   `bytes=301-310`. Wait until the handler reaches descriptor cleanup. Confirm the
   client promise is still unsettled: it has received no completed response.
4. Call the real preload's `lessonPlayer.close()` to release the capability.
5. Let the descriptor close settle. The pending client receives **206 and 10 bytes**.
   A subsequent fresh request with the same token receives **404 and zero bytes**.

`real-player-final/results.json`, record `BUG-response-after-release`, captures
`unsettledBeforeRelease:true`, `late:{status:206,bytes:10}`, and later 404.
This is new server delivery after release, not Chromium replaying bytes that were
already buffered in the renderer. The documented renderer-buffer limitation does
not cover it.

Two independent filesystem/helper regressions also gate actual descriptor close:
one revokes the capability, the other aborts the Request. Both incorrectly return
206/10 bytes; their required-refusal assertions fail. Their in-flight and byte
reservations do correctly return to zero, so this is an authority timing defect,
not a counter-cleanup assertion failure.

Required correction: finish awaited descriptor cleanup before the last synchronous
path/current-capability/request-signal check and response publication, retaining
bounded buffering and final descriptor checks. Do not leave an await between the
last authorization check and returning bytes. Pin the close-interval revocation,
request-abort and file-change cases in addition to the existing during-read cases.

## Medium MP2 — explicit package close does not end a pending open

Locations: `electron/ipc/lessonPlayer.ts:66–69`, `:110–115`, `:128`, `:269–270`.

The public close route calls `owner.close()`, which only aborts/removes the current
media capability. It does not abort a pending picker/verification, advance its
epoch or invalidate its operation. An open that began before explicit release
therefore remains current and can publish a fresh lesson view and capability
later, without a new post-release open request.

Independent real-app/preload reproduction:

1. On a registered player page, call `lessonPlayer.open()` and hold its real native
   folder picker with a deferred dialog stub.
2. Call and await `lessonPlayer.close()` through that same minimal preload.
3. Resolve the earlier picker with the owned moved package.
4. The earlier request fully verifies and returns `success:true/status:opened`,
   lesson text/images and a new video token. That token serves **206/10 bytes**.

`real-player-final/results.json`, record `BUG-close-pending-open`, records the
actual returned view and successful new-token request. A supporting owner-level
regression also fails: explicit close is followed by an `opened` result and a
verification call. Its inspector is a controlled stub; the full-package proof is
the real-app reproduction above, not that stub.

The GUI hides its Close-package button while opening; this reproduction exercises
the exposed preload/IPC close contract directly, rather than claiming a currently
clickable busy-state GUI close button. Window destruction and the separate Cancel
route do invalidate pending work; neither makes this public release route correct.

Required correction: make explicit release invalidate pending opens and their
operation generation as well as any existing capability. Separate that public
release operation from the internal old-capability revocation used when a new
folder is selected (`:114`), so opening a new folder does not cancel itself.
Test release during both picker and verification, no further verification/view/
capability installation, and a genuinely fresh open as the positive control.

## L1 closure and one documentation Low

**L1 CLOSED at `cabaf30e`.** `electron/ipc/lesson.ts:178` now asserts current
operation before showing the new-copy picker, in addition to the post-picker
assertion. My own real-WebCrypto-gated validation matrix passes navigation,
renderer-crash event, superseding open and current-request positive control:
no picker for the three stale cases, exactly one picker for the current case.
Removing only this added assertion fails all three refusals; the positive control
still passes. These probes refuse before any new-copy write or grant; draft preservation
remains covered by the prior review and unchanged failure path. The previously accepted R1/R2 file-save protections
remain in place; MP1/MP2 concern the new player, not a reopening of those findings.

**Low DOC1, `OFFLINE_LEARNER_PLAYER_PLAN_2026-11-10.md:3–4`:** the header still says
"plan only" and "No code exists for anything below", although its own Delivered
section and this commit contain the first player. Update the header to distinguish
delivered self-tested slices from remaining plans. The detailed handoff/roadmap
correctly say the player is self-tested and awaits independent review; their
worker results are not represented here as independent acceptance.

## What passes within the reviewed scope

- Main creates and registers player owners by webContents object identity and exact
  canonical page. Control IPC checks owner, current page and main frame. Launch is
  editor-main-frame-only through IPC; the trusted native app menu also launches
  without an editor/project. Four-window limit is main-held.
- Production windows use unique ephemeral partitions with sandbox, isolation,
  no Node, webSecurity and webview disabled. The bridge has exactly open/cancel/
  close; the real player has no `electronAPI`. CSP denies network connections,
  frames/objects/forms/base changes, and permits JPEG data images and the media
  scheme. Session permission checks/requests, downloads, new windows, navigation,
  redirects and embedded-frame/webview entry points are denied by the new window
  code. No package HTML is loaded as an application page or script.
- Native directory selection is the only package-path authority. The renderer does
  not submit filesystem paths. Full existing v1 verification/decode and pinned
  file rechecks precede the view/capability installation. Pending opens are busy-
  bounded; cancellation and navigation/crash/destroy epochs work in focused tests.
  Changing to an invalid new folder ends the old capability; picker cancellation
  retains the existing one. Explicit release during pending open is MP2.
- The custom scheme handler is installed only on each player's own partition.
  Media URLs name a token and inventory step UUID, never a path. Unknown tokens/
  steps, query/path extras and foreign windows refuse. GET is bounded to 8 MiB;
  numeric parsing rejects overflow-sized inputs and multipart ranges. HEAD is
  bodyless; malformed/out-of-range requests return 416; other methods return 405;
  unknown capabilities return empty 404. Errors/bodies do not expose paths or
  decoder stderr. Real protocol probes confirm 206/404/416/405 and HEAD behavior.
- The read loop uses a no-follow/nonblocking descriptor bound to the verified
  regular file's identity. Existing in-place mutation, replacement, symlink,
  deletion and during-read invalidation tests pass. My additional ancestor-symlink
  replacement during an actual read refuses, revokes and returns no body.
  Final checks work before cleanup; their later async gap is MP1.
- Pending read reservations enforce two concurrent reads per capability and 32 MiB
  globally, returning 503 rather than queueing unbounded work. Focused tests cover
  release on success/failure; my aborted-close probes also end with zero counters.
  This is reservation coverage, not a total RSS or Chromium-buffer bound.
- Existing project-bound authoring create/copy/reseal routes are unchanged by the
  player diff. The 89 package tests and existing editor authority/file-helper tests
  pass. Actual editor draft-status remains served after the player probes. No
  automatic lesson progress/recent-package/recovery writes are added; ordinary
  isolated app/session/language storage is not learner progress or recovery.

## Independent production playback and package proof

The fixture is an owned copy of the preserved `fresh moved package` evidence,
placed under this review's scratch directory with no authoring source/project
files alongside it. Original source package/evidence never becomes a write target.

The real production CLI `lesson verify-package` reports strict v1 verification,
**45 samples / 45 decoded frames / 1.5 seconds**, 640×360, 30 fps; audio flags remain
false. The actual player reads it without selecting or creating a video project.

My asserted full-app probe records:

- Native File-menu launch before explicit editor creation, then the actual editor's enabled
  Lesson-player button without a project; distinct nonpersistent sessions and
  sandbox/isolation/no-Node/webSecurity preferences.
- Ordered two-step text, embedded JPEG data URL/alt and code; capability-only video
  URL; no autoplay. Actual Chromium video reports 1.5 s / 640×360, plays past zero,
  seeks to 1.0 s, replays, changes to 1.5×, moves focus to the next heading, and
  returns to a fresh paused video at zero with speed retained.
- Owner token 206; other player with that token 404; its own token 206; editor
  session `ERR_UNKNOWN_URL_SCHEME`; HEAD/unknown-ID/POST/multipart/overflow matrix.
- Changed MP4 bytes revoke the capability. Restoring bytes does not revive the old
  token; explicit fresh full verification issues a working new token.
- The two Medium reproductions above; a later explicit Cancel refuses its pending
  open while retaining a still-valid older capability; real hash navigation ends
  that capability and makes control IPC unavailable on the changed page.
- Pickers parented to the player and editor authority still functional afterwards.

Thirteen structured records are in `real-player-final/results.json`. The command
exits 0 because its assertions deliberately verify both normal operation and the
two adverse reproductions. That exit is not an acceptance of the two bugs.

## Commands, counts, mutations and limits

All execution used pinned **Node 22.22.1 / npm 10.9.4**, checked explicitly, by
prepending `/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`.
A temporary `git archive` snapshot of the exact target lives at
`/tmp/offline-player-review-u2ui8k09/snapshot`; `node_modules` and the existing
native runtime directory are linked from the original for read-only execution. No worktree or
checkout was created. Source/test mutations occurred only in owned scratch.

Evidence root: `/tmp/offline-player-review-u2ui8k09/` (retained temporary evidence,
not a durable publication). Commands ran in `snapshot/` unless otherwise stated.

| Actual command/check | Result |
| --- | --- |
| `npx vitest --run electron/lesson/playerMedia.test.ts electron/ipc/lessonPlayer.test.ts src/lessonPlayer/LessonPlayer.test.tsx electron/ipc/lesson.lifetime.test.ts electron/ipc/lessonPackageOpen.test.ts electron/ipc/lesson.authority.test.ts electron/lesson/lessonFile.test.ts` | 165 passed / 7 files, 0 skipped; `focused.log` |
| `npx vitest --run electron/ipc/independentL1.test.ts` | 4 passed / 1 file, 0 skipped; `independent-L1-final.log` |
| `npx vitest --run electron/lesson/independentPlayerMedia.test.ts electron/ipc/independentPlayerClose.test.ts` | 1 passed, 3 assertion failures / 2 files, 0 skipped; ancestor control passes, MP1's two variants and MP2 fail required refusals; `independent-lifetime.log` |
| `npx vite build` | Pass, fresh two-page/two-preload production build; `vite.log` |
| `npx tsc --noEmit`; `npx tsc -p tsconfig.test.json --noEmit` | Both pass on the restored exact committed tree; `tsc-app.log`, `tsc-test.log` |
| `npm run lint` | Pass, 1374 files checked, 35 existing warnings, no fixes; `lint.log` |
| From scratch root: `node snapshot/scripts/smoke-headless-startup.cjs --evidence-dir /tmp/offline-player-review-u2ui8k09/startup` | Pass, real foreign-cwd SDK stdio initialize/listTools and normal CLI registration/renderer startup; `startup/startup-smoke.json` fingerprints the fresh build |
| From scratch root: `xvfb-run -a snapshot/node_modules/electron/dist/electron snapshot/dist-electron/main.js --user-data-dir=/tmp/offline-player-review-u2ui8k09/cli-verify-staged-profile lesson verify-package /tmp/offline-player-review-u2ui8k09/moved-package --json` (absolute executable/entry paths used) | Verified, including real full decode; `cli-verify-staged.log`, stderr log |
| From scratch root: `xvfb-run -a node real-player.cjs /tmp/offline-player-review-u2ui8k09/snapshot /tmp/offline-player-review-u2ui8k09/real-player-final /tmp/offline-player-review-u2ui8k09/moved-package` | 13 asserted real-app records including both bugs; final exit 0; `real-player-final.log` and results |
| From scratch root: `python mutations.py`, then the isolated final L1 control rerun | 6/6 distinct controls killed by assertion failures, no tooling kills; `mutations.json`, `mutant-*.log` |

Own controls remove token matching, final file/path check, final capability check,
player-main-frame check, L1's new before-picker check, and new-folder revocation.
All are scratch-only and restored byte-for-byte. L1's final mutant has three
refusal failures and one passing fresh control. The other five use targeted `-t`
filters; **58 filtered-out cases** across those runs are explicitly skipped,
separate from the zero skips in normal focused/probe runs. Supplemental reviewer
probes are retained under `probes/`, removed from the snapshot before final TS/lint.

Preliminary attempts remain labelled/excluded: the plain archive initially lacked
its gitignored native FFmpeg runtime, so its CLI verifier reported tool unavailable
and the GUI probe timed out. I linked the existing runtime read-only and reran;
there was no product code fix. A subsequent probe completed both bug reproductions
but then incorrectly expected player 2's pre-tamper token to remain valid after the
shared fixture's tamper/restore. It correctly refused; the final harness explicitly
reopens player 2 before its cancellation control. Initial L1 mutation logging also
accumulated mock-call counts; the final control resets them and proves the three
refusals separately. Initial logs/results remain retained; only final runs count.

I inspected the writer's full log: **6360 passed / 464 files, 0 skipped at 82f69ca0**.
That and the writer's 11 mutation controls are attributed evidence, not my full run
or my controls. No full-suite repetition was needed. Startup smoke's CLI deliberately
fails only for the absent disposable project after registration/runner startup;
it is startup coverage, not successful media export/capture.

No real folder picker, screen reader, physical keyboard/input, audio acceptance,
Windows/macOS or real-lesson acceptance is claimed. Normal playback uses real
Chromium and full verification; the native folder picker is stubbed. MP1 additionally
controls filesystem close timing; MP2 additionally defers the picker. Already
renderer-buffered video remains the separately disclosed limitation, not MP1's
server-side pending response.

## Preservation and owned cleanup

Before/after SHA-256 checks show **2503 tracked files unchanged**, **711 additional
files unchanged** across original/retained reviews, worker evidence, user report
and addon, and **7 original package files unchanged**. The owned moved package
also returns to byte-identical content after its deliberate tamper/restore.
`preservation-result.json` records these comparisons. All previous reports,
manifest inventories, raw evidence/media and user workflow files are preserved.

Main remains `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`; HEAD remains the exact
review target. Original addon SHA-256 is unchanged:
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
Original external LMS workflow report remains
`f87c9eb7bffbd5e4bd55375f20541b3f0822420d6c74e1bce317ab7dbb5196a7`.
Both previous review files retain their recorded hashes.

Scratch production source/tests/config/docs are fully restored. Three documentation
images are absent from `git archive` because of existing export-ignore attributes;
originals remain unchanged. Owned test directories are cleaned in `afterEach`,
including restoration of the temporary ancestor symlink. Every real-app attempt
closes its own process in `finally`, restores the temporary fs-open wrapper and
releases its close gate; CLI/stdio processes settle. Final process inspection found
no owned scratch app/Xvfb/probe/test process remaining. Scratch logs/scripts/
fixtures are intentionally retained as evidence. No user app was killed, shared
cache purged, paid/provider/auth operation performed, commit/push/reset/stash/new
checkout made, or original file removed. Only this unique report is added.

Coordinator should obtain corrections and independent follow-up for MP1/MP2, keep
L1 closed, disposition the header Low, then decide the private checkpoint before
continuing player loop/progress/captions/standalone work.
