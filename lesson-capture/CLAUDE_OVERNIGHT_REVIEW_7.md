# Claude overnight review 7: slice 7 (countdown ownership, optional metadata, recovery)

- **Reviewed:** `e2f4a68d7b72bf3276c5aaab208f2f6df2338208` ("fix: await countdown ownership and recover media with minimal policy metadata") against base `d6fd53023b3564e665d0302af6affaef857007d3`. That is 35 files, +935/−74. I read the code with `git show`/`git diff` of those two SHAs, not from the working tree.
- **Reviewer:** Claude (Opus 5.5), dispatched read-only Orca worker.
  - The only file I wrote in the checkout is this report.
  - `CLAUDE_OVERNIGHT_REVIEW_6.md` is byte-identical to its committed version. `CLAUDE_OVERNIGHT_FOLLOWUP_6.md` and every earlier report are untouched.
  - I made no git mutations and created no worktree or checkout. `git status` was clean and `HEAD` was `e2f4a68d` before I wrote this file.
- **Where tests ran:** a `git archive` snapshot of `e2f4a68d` in the session scratchpad, outside the checkout.
  - Its `node_modules` is a directory of per-entry symlinks to the checkout's 538 entries. `.vite` and `.vite-temp` are excluded, so Vite/Vitest caches were written inside the snapshot.
  - `crates/thirdparty/ffmpeg-linux64-lgpl-shared` is symlinked read-only.
  - Cargo used its own `CARGO_TARGET_DIR` in the scratchpad.
- **Node:** I put `/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin` first in `PATH`. `node --version` printed **v22.22.1**, and every Node command below used it.
- **Date:** 5 November 2026.
- **This is not a production approval.** No physical, portal or desktop acceptance was done (see Limits).

## Verdict

**No High or Medium findings.** Both review-6 regressions are fixed:
- **H1:** a same-ID replacement now waits for the prepared helper's actual exit.
- **M1:** malformed or future embedded metadata now degrades to a per-asset `invalid` instead of making the project unopenable.

I reproduced both fixes with my own executable canaries, in addition to the slice's tests.

The L1 ownership classification, the L2 media-only pack and the L4 minimization behave as documented, including their fail-closed directions. I found:
- **two Low findings:** a recovered package forgets its "interrupted" status on reopen; and a timed-out teardown barrier stays rejected;
- **two test-coverage Nits;**
- **several Info items.**

None of them exposes button evidence or reuses a capture destination.

## Disposition of each review-6 finding (assessed at `e2f4a68d`)

| Review-6 | Fix in slice 7 | My assessment |
|---|---|---|
| **H1** countdown change fails on its own lock | `takePrepared` now `await`s `discardAndWait()` (`linuxCaptureStartup.ts:159-174`). `start()` first awaits the `retiring` barrier (`:225`), then awaits `cancel()` of any in-flight prepare (`:227`). `discardAndWait` resolves only on the child's `exit`/`error`, and otherwise rejects after 5 s (`linuxNativeCaptureSession.ts:566-593`). | **Fixed.** The slice's actual-class tests pass (mic toggle and revoke, same `recordingId` 7, deferred exit; spawn #2 happens only after `exit`; the revoke case spawns with `capturePointerButtons:false`). My canaries R7-A1–A3 also pass (below). |
| **M1** bad embedded `capturePrivacy` makes the project unopenable | `optionalCapturePrivacyInspectionSchema` (`src/lib/capturePrivacy.ts:130-141`) runs `safeParse`, then either minimizes the receipt or replaces the value with `{status:"invalid", journalPresent:false}`. It is used in `assetSchema` (`schema/index.ts:204`). The core document validation is unchanged. | **Fixed.** The slice's real-`DocumentService` disk-reopen tests pass for: unknown status, an extra field with a canary, and an inconsistent v1 receipt. The file bytes are unchanged after the load. My R7-C1 adds `null`, `[]`, a string and a nested private v9 receipt: all reopen as `invalid` and leave no canary in the returned or saved document. |
| **L1** a crash lock means `pending` forever | Versioned lock: `captureId`, `sha256(hostname)`, owner PID and `/proc` start-time, phase `reserved`/`launching`/`helper`, and helper PID/birth (`capturePolicyReceipt.ts:29-145`). `interrupted` is returned only when the owner is provably dead on the same machine **and** either the phase is `reserved` or the helper is provably dead (`:52-79`). Nothing deletes or reuses a lock. | **Fixed as specified.** My R7-B1 used real exited and alive PIDs with real birth tokens (results below). |
| **L2** pack refuses the whole project | `evidenceAllowed` is `bound`/`legacy`/`missing` only. Otherwise the pack copies screen and webcam only, omits the cursor, journal, flags, receipt and binding, and emits a `warnings[]` entry in both human and JSON output. A non-empty output directory is refused (`projectCommands.ts:69-71, 91-132`). | **Fixed.** My R7-B2 confirms the media-only output, that a non-empty directory is refused and left intact, and that the source lock and every original are byte-identical afterwards. See new **L7-1** for what happens when the recovered package is reopened. |
| **L3** Stop blocks on a full SHA-256 (undocumented) | Documented in `LESSON_CAPTURE_PRIVACY_RECOVERY.md`. The benchmark JSON shows `v22.22.1`, 134,217,728 bytes, `260.880691` ms, with "sparse zero-filled … not encoded media, cold-cache or production performance acceptance". | **Fixed (docs).** The doc states its limits and makes no performance claim. I did not rerun the benchmark. |
| **L4** application lists spread into projects | New receipts are written as v3: scope, `excludedApplicationsConfigured`, start decision and `captureId`, with no application identifiers. `minimizeCapturePrivacyReceipt` applies on write, inspect, schema parse and pack. The suppression journal record now uses a summary. | **Fixed.** The slice's tests pass. My R7-D1 used an embedded-only v2 receipt with `PRIVATE_APP_CANARY`: the packed project and packed receipt contain no canary, the result reopens `bound` with a v3 receipt, and the original sidecars are preserved by the slice's tests. **As documented**, an *old* journal's `input-policy-suppressed` record carrying the full historical policy is copied verbatim when evidence is allowed. R7-D1 confirms this; it is acknowledged retention debt, not a regression. |
| **N1** cursor-only catch hides handler faults | Envelope/parse errors log "malformed helper record omitted"; handler throws log "helper handler failed; record omitted". Neither the line nor the exception text is logged (`pipeWireCursorRecordingSession.ts:172-194`). | **Fixed by reading.** No test was added (**N7-1**). |

## New findings (most severe first)

### L7-1 — Low: a recovered package reopens as `missing` and loses the "interrupted/pending" signal

- **Where:** `projectCommands.ts:129-131` embeds only `{status, journalPresent:false}` for a non-evidence package. Then `inspectCapturePrivacy` (`capturePolicyReceipt.ts:251-252`) maps any embedded status other than `invalid`, with no receipt, to `missing`.
- **Repro:** canary R7-B2. An interrupted take is packed. Its packed JSON says `"status":"interrupted"`, but inspecting the packed media with that embedded value returns **`missing`**.
- **Effect:** the editor then shows "No policy receipt is available. Button evidence is unverified." That is true about evidence, because none was packed. But the fact that the source take was interrupted or incomplete, and so may lack a trailer, survives only in the CLI's warning output, not in the recovered project.
- **Baseline:** at `d6fd5302` this project could not be packed at all, so this is a truthfulness gap in new behavior, not a regression.
- **Suggestion:** keep a recovery marker (for example `recoveredFrom: "interrupted"`) that the inspector preserves, or let `pending`/`interrupted` survive the "no receipt" branch.

### L7-2 — Low: a timed-out teardown leaves the `retiring` barrier rejected, even after the helper later exits

- **Where:** `linuxCaptureStartup.ts:95-100` (the barrier becomes a rejected promise) and `:225` (`start()` awaits it with no `catch`).
- **Repro:** canary R7-A4.
  1. A prepared helper ignores SIGTERM and SIGKILL for more than 5 s, so `cancel-native-linux-prepare` rejects with "did not exit".
  2. The child then exits, and its lock is released.
  3. An unprepared `start` with a *new* `recordingId` (8) still returns `success:false` "Previous Linux capture helper did not exit", and nothing is spawned.
  4. Only a later `prepare` or `cancel` call, which chains `this.retiring.catch(...)`, clears the barrier.
- **Exposure:** small. The portal path always prepares, and the renderer always sends cancel in its `finally`. So this mainly affects a non-portal start after a failed portal teardown. It fails closed.
- **Related nit:** the renderer calls `void window.electronAPI.cancelNativeLinuxPrepare?.()` (`useScreenRecorder.ts:1743, 1805`), so that rejection now surfaces as an unhandled rejection in the renderer.
- **Suggestion:** have `start()` wait on `this.retiring.catch(() => undefined)` and rely on the destination lock as the real ownership gate (it already fails `EEXIST` safely). Or clear the barrier when the late `exit` arrives.

### N7-1 — Nit (test coverage): N1's two diagnostic categories have no test

`pipeWireCursorRecordingSession.ts` changed, but its test file did not. A test that throws from `handleEvent` and asserts the fixed message (and the absence of payload and exception text) would lock this in.

### N7-2 — Nit (test coverage): kill escalation and helper-dead classification are covered only by my canaries

- The slice's `FakeHelper.kill()` never exercises the 500 ms SIGKILL fallback. R7-A1 shows that it now fires while `child.killed` is already `true`, which is the review-6 point that a signal being sent is not an exit.
- The slice's lock test covers the `reserved`, alive-helper, `launching` and old-format cases, but not "`helper` phase with a provably dead or PID-reused helper → `interrupted`". R7-B1 covers that.
- Consider adopting both.

## Info

- **Policy captured before the waits:** `start()` computes `canonical(input)` (`:224`) before up to 5 s of awaiting.
  - A revocation during that wait is still enforced: `requestPolicy` sets `revoked`, and `track()`/`guard()` re-read the current policy with no await (`:117-122`). The receipt is then `suppressedAtStart:true`, which is consistent.
  - A policy *upgrade* during the wait is not applied to that take. This fails closed.
- **The start-failure candidate has no barrier:** `start()`'s catch calls `candidate?.discard()` without registering a barrier. A retry with the *same* `recordingId` while that child is alive gets `CAPTURE_DESTINATION_EXISTS` (safe). The renderer normally re-prepares with a fresh ID. I did not reproduce this; I only read the code.
- **Liveness scope:** the PID/birth check assumes the same PID namespace and boot. The machine field hashes the hostname only; there is no boot ID.
  - Run from a different PID namespace (for example a sandboxed app and a host CLI with the same hostname), a live owner could read as dead, and so as `interrupted`.
  - The result would only be a media-only pack of an in-progress file. The lock is never cleared and the path is never reused.
  - `sha256(hostname)` is unsalted and therefore pseudonymous, not anonymous. The lock is local only: it is never embedded or packed, which R7-B2 verified.
- **Birth token:** `/proc/<pid>/stat` field 22 (`starttime`) is parsed correctly. When the birth token is missing, an alive PID counts as alive (`pending`), which is the safe direction.
- **`error` event:** Node also emits `error` when `kill()` fails (not ESRCH). The session's `error` handler then releases the lock and `discardAndWait` resolves, even if the process were somehow still alive. This needs EPERM on its own child, which is implausible. It is the same handler as in slice 6.
- **Saving after M1 degradation:** after a save, a future or unknown embedded value is permanently replaced by `{status:"invalid"}`. The doc states this. Status is always recomputed from the sidecars when they exist.
- **v3 without `captureId`** (a minimized v1) is classified `legacy`, as v1 was before. `bindCapturePolicyToMedia` refuses it. Both are correct.

## Evidence I reproduced (this review, at `e2f4a68d`, Node v22.22.1)

| Command (from the snapshot) | Result |
|---|---|
| `node --version` | `v22.22.1` |
| `node node_modules/vitest/vitest.mjs --run --maxWorkers=4` (full) | **403 files passed; 5,394 passed, 1 skipped (5,395); 113.12 s; exit 0** |
| The skip, identified with `--reporter=verbose` | `electron/media/audioPeaks.test.ts > decoding a real file > produces peaks in range` — environment-conditional: there is no staged ffmpeg under `electron/native/bin` in a `git archive` |
| `LD_LIBRARY_PATH=$PWD/crates/thirdparty/ffmpeg-linux64-lgpl-shared/lib cargo test --offline --manifest-path electron/native/pipewire-capture/Cargo.toml` (scratch target) | **131 passed, 0 failed, 1 ignored** (live PipeWire), 1.71 s |
| `tsc --noEmit -p tsconfig.json` / `-p tsconfig.test.json` | Both exit 0 |
| `biome check .` | Exit 0, **35 warnings** |
| `vite build` (snapshot `dist`/`dist-electron`) | Exit 0; three bundles built (renderer, main, preload) |
| `sha256sum` of the staged helpers (checkout, read-only) | `electron/native/bin/linux-x64/` and `pipewire-capture/build/` are both `2bbb4efb71d532a729da016d67898b69d12e64ef3458255742de7f0b45568081`, the same as review 6 |
| Review canaries (snapshot only; removed before the TS, Biome and Vite runs) | **8/8 pass** (listed below) |

The canaries:

- **R7-A1:** after cancel, the still-owned child gets `["SIGTERM","SIGKILL"]`. The lock is held until `exit`, then released.
- **R7-A2:** a never-exiting prepared child plus a mic toggle: `start` returns `success:false` "did not exit" after ≥4.9 s. Only one spawn happens, and the lock bytes are unchanged.
- **R7-A3:** cancel during a held probe releases its own lock and never spawns. The same ID immediately prepares again.
- **R7-A4:** confirms L7-2.
- **R7-B1:** real lock-classification checks:
  - dead owner, `reserved` → `interrupted`;
  - dead owner and dead helper → `interrupted`;
  - dead owner, live helper → `pending`;
  - dead owner, PID-reused helper (wrong birth) → `interrupted`;
  - dead owner, helper with no PID → `pending`;
  - `launching` → `pending`;
  - foreign machine → `pending`;
  - lock version 2 → `pending`;
  - live owner → `pending`;
  - a re-reserve of the path throws, with the lock bytes unchanged;
  - the lock contains no raw hostname.
- **R7-B2:** confirms L2 and L7-1.
- **R7-C1:** the M1 edge values listed in the disposition table.
- **R7-D1:** the L4 checks listed in the disposition table: embedded-only, `bound`, v3, no canary, historical journal verbatim.

**Count comparison** (not combined):
- The worker's `slice-7-vitest-full.log` reports 5,395 passed with none skipped (135.82 s).
- My 5,394 + 1 skip is the same total. The skip is the snapshot ffmpeg difference above, not a failure.
- I read the worker's `slice-7-*` logs and the benchmark JSON only. None of my counts rely on them.
- I did not rerun the docs, i18n or diff scripts, the native release build or the benchmark.
- The Rust source is unchanged in this slice, so the Rust pass says nothing about the new TypeScript lifecycle.
- A matching helper hash does not prove the binary was built from this SHA.

## Not reproduced / limits

- No portal or desktop recording, real countdown gestures, physical buttons or devices, device loss, KWin, focus or application identity, pixel/audio/export alignment, or sustained capture. Windows and macOS are out of scope. The provider lacks screenshot, hotkey and focus control, and I did not substitute CDP or Xvfb for physical acceptance.
- **H1 evidence:** it uses the real startup and session classes with fake child processes (deferred `exit`). I did not observe the real SIGTERM-to-exit timing against a live portal.
- **Recovery:** it proves non-destructive packaging only. It does not repair or validate an unfinished MP4 trailer, and I did not play any recovered media.
- **Association:** it remains association, not authenticity. Someone who can edit a project can still forge an embedded v2/v3 receipt and a binding that matches the file's real hash.
