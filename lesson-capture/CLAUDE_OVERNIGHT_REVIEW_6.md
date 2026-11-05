# Claude overnight review 6 — slice 6 (startup consent, source association)

- **Reviewed:** `d6fd53023b3564e665d0302af6affaef857007d3` ("fix: preserve consent across startup and bind policy to reopened media") against base `9f59c4d4aadb7e489931becadc9d669202a5ddd1`. That is 62 files, +1694/−417. I read the code from `git show`/`git diff` of those two SHAs, not from the working tree.
- **Reviewer:** Claude (Opus 5.5), dispatched read-only Orca worker. The only file I wrote in the checkout is this report. `CLAUDE_OVERNIGHT_REVIEW_5.md`, `CLAUDE_OVERNIGHT_FOLLOWUP_5.md` and every earlier report are untouched.
- **Where tests ran:** a `git archive` snapshot in the session scratchpad, outside the checkout. Its `node_modules` is a directory of per-entry symlinks to the checkout's entries, without `.vite`/`.vite-temp`, so Vite/Vitest caches were written inside the snapshot. The ffmpeg thirdparty directory is symlinked read-only. Cargo used its own `CARGO_TARGET_DIR` in the scratchpad.
- **Date:** 5 November 2026.
- **This is not a production approval.** No physical, portal or desktop acceptance was done (see Limits).

## Verdict

Every review-5 finding has a real code fix, and the parts I traced are correct:
- the revocation re-check across `mkdir`;
- the post-revocation status/drain gates (native and parent);
- the pre-probe destination reservation;
- the volatile revoke before the save;
- the cursor-only envelope;
- the HUD scope;
- the draft fix.

The new source-association code makes three verified claims:
- it binds a full SHA-256 after the helper exits;
- it recomputes status on every reopen;
- it never treats a serialized `bound` value as proof by itself.

It does not overclaim.

The slice also adds one **High functional regression** and one **Medium robustness regression**. I reproduced both with executable canaries.

- **H1:** if anything changes during the countdown (for example a mic toggle, or the user revoking button evidence), the start now fails. The prepared helper still holds its own destination lock. Base `9f59c4d4` renegotiated in this case and recorded.
- **M1:** a malformed, unknown or future `capturePrivacy` block embedded in a project makes the whole project unopenable. The strict document schema parse rejects it before the tolerant inspector can run.

There are also four Low findings and one Nit. None of them exposes button evidence. The privacy direction is fail-closed throughout.

## New findings (most severe first)

### H1 — High (functional regression, fail-closed): changing settings during the countdown makes the take fail on its own lock

- **Where:**
  - `electron/ipc/linuxCaptureStartup.ts:147-159` (`takePrepared` mismatch → `prepared.session.discard()`), then `:211-216` (new session `start()`).
  - `electron/native-bridge/capture/linuxNativeCaptureSession.ts:194-195`: `reserveCaptureDestination` runs synchronously at the top of `start()`.
  - The lock is released only in the child `exit`/`error` handlers (`:242`, `:270`). `discard()` → `kill()` only sends SIGTERM (`:564-573`), so `exit` arrives later.
- **Scenario** (Wayland, portal-owned source, with an explicit policy present; main always supplies the canonical policy):
  1. The prepare runs. Its deferred helper reserves `recording-<id>.mp4.capture-policy.lock`.
  2. During the 3-2-1 countdown the user changes any setting that `settings()` compares. Examples: the microphone toggle; or Off/Stop in button privacy, which is exactly the review-5 M1 prepared-path scenario.
  3. Start runs. The renderer passes the prepared `recordingId` (`useScreenRecorder.ts:1729-1735`, `:1844`), so it has the same output path.
  4. `takePrepared` discards the old session. A new session immediately calls `reserveCaptureDestination(samePath)`, while the old helper's lock is still on disk.
  5. That raises `CaptureDestinationExistsError`. The handler returns `{success:false}`, and the renderer throws "Native Linux capture failed".
- **At base:** this path renegotiated and recorded. The comment the slice removed said explicitly that "the user really can change them in between".
- **Reproduced:** canary R6-A drives the actual `LinuxCaptureStartup` registered callbacks with the actual `LinuxNativeCaptureSession`. Only `spawn`/`execFile` are mocked, and SIGTERM exit is deferred as in a real process. Both the "mic toggle" and "policy revoke" cases return `success:false` with "Capture destination already contains media or evidence", and a second helper is never spawned.
- **Why the slice tests miss it:** `linuxCaptureStartup.test.ts` uses a `FakeSession` that never reserves. Its reauthorization test also starts with a different `recordingId` (7 → 8).
- **Privacy:** no evidence escapes. This fails closed. But revoking consent during the countdown now loses the take instead of recording it without buttons, and so does an ordinary mic toggle.
- **Fix options:**
  - Release the reservation synchronously in `discard()` when the helper is deferred and not yet armed. It has not opened the mp4 at that point.
  - Or transfer the reservation from the discarded session to its replacement.
  - Or await the discarded helper's `exit` before creating the replacement.
  - Then add a regression that uses the real session class with the same `recordingId`.

### M1 — Medium (robustness regression): unknown or malformed embedded `capturePrivacy` makes the entire project unopenable

- **Where:**
  - `src/lib/ai-edition/schema/index.ts:204` adds `capturePrivacy: capturePrivacyInspectionSchema.optional()`. That schema is strict, with a closed status enum and a receipt consistency `refine` (`src/lib/capturePrivacy.ts:67-106`).
  - `electron/ai-edition/document-service.ts:457-465`: `documentSchema.parse(...)` runs before `inspectCapturePrivacy`. The inspector deliberately `safeParse`s embedded metadata (`capturePolicyReceipt.ts:153-154`), but it is never reached.
- **Scenario:** any of the following causes every open of the project to throw, including the project picker, the auto-load-last-project path and MCP reads:
  - a project saved by a newer build with a new status value;
  - a hand-edited or corrupted asset `capturePrivacy`;
  - an extra key;
  - an embedded v1 receipt whose decision is inconsistent.
- **Expected instead:** degrade to `invalid`/`missing` for that one asset.
- **Reproduced:** canary R6-B uses the real `DocumentService`. It creates a project, imports a video and confirms the project reopens. It then injects each of three bad `capturePrivacy` values (an unknown status `"revoked"`, an extra field, and an inconsistent legacy receipt), and `getProject` rejects for all three.
- **Fix:** preprocess `asset.capturePrivacy` with `safeParse` before the document parse (drop it, or set `{status:"invalid"}`), or make the asset field lenient (`z.unknown()` re-validated by the inspector). Then add a reopen regression with unknown metadata.

### L1 — Low (new): a lock left by a crash marks the take `pending` permanently and blocks pack

- **Where:** `capturePolicyReceipt.ts:28-65` (the lock file is persistent) and `:158-163` (any lock means `pending`). `projectCommands.ts:85-89` refuses packing when the status is `pending`.
- **Scenario:** the app, or main, is SIGKILLed or crashes during a take. The `.capture-policy.lock` is never removed. From then on, every import or reopen of that recording shows "Capture or policy binding is incomplete", and `openscreen pack` refuses the project. This happens even with policy Off and no journal. Nothing ever clears the lock: there is no owner-PID or liveness check, and no stale-lock recovery.
- **Reproduced:** canary R6-C (an unreleased reservation, then `inspect` gives `pending`, then pack throws "privacy is pending").

### L2 — Low (new): legacy pack refuses the whole project (including the video) for association states unrelated to evidence

- **Where:** `electron/cli/projectCommands.ts:85-89`.
- **Scenario:** a take was recorded with policy **Off** and has no journal. The helper crashed after `capture-started`, so the receipt exists but the binding was never written (`pending`). Or the user later trimmed or re-encoded the source in place (`mismatch`). In both cases pack refuses the entire project, not just the evidence sidecars, although there is no button evidence to misattribute. The docs say binding failure "preserves the video". That is true on disk, but this export path will not carry it.
- **Reproduced:** canary R6-D (Off receipt, no binding, no journal → `pending` → pack throws).
- **Suggestion:** refuse or skip only the evidence sidecars, plus the receipt and binding, and still pack the media with a warning. Or refuse only when `journalPresent`.

### L3 — Low (doc gap): Stop now blocks on a full-file SHA-256

- **Where:** `linuxNativeCaptureSession.ts:500-548`. `stop()` awaits `finalizePolicyBinding()`, which streams the whole mp4 before the stop IPC returns.
- **Gap:** the follow-up doc mentions import/reopen latency only. On a long or high-bitrate take, this adds seconds to the Stop → editor transition on every explicit-policy take (that is, every Linux take, Off included).
- **Status:** not measured. As the brief says, there is no performance acceptance. The gap is that this latency is undocumented.

### L4 — Low/Info (new): declared application lists now spread into project documents

- **What changed:** the `bound`/`legacy`/`invalid` inspection embeds the receipt's full `policy` into the asset, including the user's `allowedApplications` and `excludedApplications`. It is also embedded into the packed project JSON (`projectCommands.ts:122`).
- **Before:** at base this lived only in the per-take sidecar.
- **Why it matters:** an exclusion list can reveal which applications the user considers private, and it now travels with every project that imports the take. The doc's "Imported journal contents are not loaded" is accurate. This concerns policy metadata, not evidence.

### N1 — Nit: the cursor-only catch now also swallows handler exceptions behind the fixed marker

`pipeWireCursorRecordingSession.ts:174-187`: a bug thrown inside `handleEvent` is logged only as "malformed helper record omitted". That is privacy-correct, but genuine handler faults lose their diagnostics. Consider logging the error's `name`/`message` without the line.

### Info

- **Native drain:** when the gate is closed, `drain_queued` is now skipped entirely (`main.rs:1616`). Edges that were authorized and queued before the revocation are therefore dropped rather than journaled. This fails closed and is consistent with the doc's "earlier authorized evidence … remain" (evidence already delivered stays).
- **Volatile revoke is process-local:** if the durable Off save failed and the app restarts, the old durable global policy applies again. The doc says "process-local". The UI error text says suppression applies to "current and pending" evidence, which is accurate.
- **`last` session:** a revocation after a take ends still calls `suppressButtonEvidence()` on the finished session (unchanged from base). The binding covers media only, so this does not cause a mismatch.
- **Embedded metadata trust:** someone who can edit the project JSON can forge an embedded v2 receipt plus a binding that matches the file's real hash, and get `bound`. This is within the stated limit ("association, not authenticity"), and the UI `limit` string says so.

## Disposition of each review-5 finding (assessed at `d6fd5302`)

| Review-5 | Fix in slice 6 | My assessment |
|---|---|---|
| **M1** revoke during start `mkdir` | Callbacks extracted to `LinuxCaptureStartup`. The policy is re-read after `mkdir`; `track()` registers and calls `guard()` with no intervening await (`:105-110`). The volatile `revoked` flag covers candidates that do not exist yet. The pre-spawn `suppressButtonEvidence()` makes the spawn use `capturePointerButtons:false` (`linuxNativeCaptureSession.ts:215`). | **Fixed** for the `mkdir` window, in both prepare and start. I verified this by reading the code and by passing the slice's own actual-callback tests. **New regression:** the prepared-path remedy now fails the take instead of renegotiating (H1). |
| **M2** receipt reader unwired | `inspectCapturePrivacy` runs on import (`document-service.ts:609-612`), on every project read (`:460-465`) and on legacy pack before any copy (`projectCommands.ts:85`). The media details UI shows the status, the start scope and the limits. | **Fixed.** The status is recomputed from the current bytes. New issues M1, L1, L2. |
| **L1** post-revoke drain counts | Native: drain and emit only while `input_gate.allows()`. Parent: `input-drain` dropped unless `buttonDecision.allowed`. | **Fixed.** The parent test asserts that nothing after the suppression marker contains `excludedEdges`. |
| **L2** post-revoke status overwrite | Native: `InputCaptureStatus` forwarding is gated. Parent: `input-capture-status` is ignored once suppressed. | **Fixed.** The parent asserts no `"state":"partial"` after the marker. I did not drive the Rust reader thread live. |
| **L3** stale receipt at a reused path | `reserveCaptureDestination` (an exclusive `wx` lock, owner-checked release) runs before the probe and spawn. It rejects existing media, receipt, binding, journal, cursor and flags files, and preserves them. The start catch skips `removeEmptyOutput` for `CAPTURE_DESTINATION_EXISTS`. | **Fixed** for the reported scenario. New issue: a stale lock after a crash (L1). The lock also causes H1. |
| **L4** failed-save revoke | `privacy.requested()` runs before `setRecordingPreferences`; `saved()` runs only after a successful save. Only `ButtonEvidenceSettings` sends `capturePrivacyPolicy` (verified with `git grep`), so unrelated preference saves cannot clear the volatile revoke. | **Fixed** (process-local; see Info). |
| **N1** cursor-only raw line logging | Envelope check, fixed marker, warning field type guard. | **Fixed.** New Nit N1 (handler errors are also swallowed). |
| **N2** disabled HUD scope line | `health.privacy?.allowed === false` → `buttonPrivacy.disabledScope`. | **Fixed.** |
| **Unsaved draft observation** | `appliedPolicy` ref skips re-applying an identical policy. | **Fixed** for unchanged-policy broadcasts. A genuinely changed policy (for example from another window) still resets drafts, which is reasonable. |
| **Review-5 Node statement** | — | The original review-5 sentence "The pinned Node 22.22.1 is not installed on this machine" stays as written in that report, and **it was incorrect**. `/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin/node` exists. I exported its directory first in `PATH`, and `node --version` printed **v22.22.1**. Every Node command in this review used it. Review-5's 97 focused tests remain Node 26.13.0 evidence only. |

## Evidence I reproduced (this review, at `d6fd5302`, Node v22.22.1)

| Command (from the snapshot) | Result |
|---|---|
| `node --version` (pinned dir first in `PATH`) | `v22.22.1` (`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin/node`) |
| `node node_modules/vitest/vitest.mjs --run --maxWorkers=4` (full) | **403 files passed; 5,383 passed, 1 skipped (5,384); 120.91 s; exit 0** |
| `LD_LIBRARY_PATH=$PWD/crates/thirdparty/ffmpeg-linux64-lgpl-shared/lib cargo test --offline --manifest-path electron/native/pipewire-capture/Cargo.toml` (scratch `CARGO_TARGET_DIR`) | **131 passed, 0 failed, 1 ignored** (1.83 s) |
| `tsc --noEmit -p tsconfig.json` / `-p tsconfig.test.json` | Both exit 0 |
| `biome check .` | Exit 0, **35 warnings** (matches the claim) |
| `sha256sum` of both staged helpers in the checkout (read-only) | Both `2bbb4efb71d532a729da016d67898b69d12e64ef3458255742de7f0b45568081` (mtime 2026-11-05 23:00) |
| Staged helper, hidden probe `{"probeOnly":true,"capturePointerButtons":false,"cursorMode":"hidden"}`, stdin `/dev/null` | One `ready` line: `buttonPrivacyVersion:1`, `pipewireVersion:"1.6.10"`, exit 0. This exits before portal Start; it is not a device or capture test. |
| Review canaries R6-A (×2), R6-B (×3), R6-C, R6-D (scratch files, snapshot only, removed before the TS/Biome runs) | **8/8 pass**, confirming H1, M1, L1, L2 as described |

- **Count comparison:** the worker's `slice-6-vitest-full-final.log` shows 5,384 passed with none skipped. My 1 skip is an environment-conditional test: `audioPeaks.test.ts:304` `describe.runIf(staged)` needs a staged ffmpeg binary in `electron/native/bin`, which `git archive` does not include. That is a snapshot difference, not a failure.
- **Not mixed with the worker's evidence:**
  - I read the worker's `slice-6-*` artifacts but did not rely on them for any count above.
  - I did not rerun the worker's native release build, the Vite build, or the docs/i18n/diff scripts.
  - I did not rebuild the helper. A matching hash does not prove the binary was built from `d6fd5302`.
- **Checkout state:** `git status` was clean before I wrote this file. I made no git mutations.

## Not reproduced / limits

- No portal or desktop recording, physical devices, device loss, KWin, focus/application identity, HUD gestures in a real window, or pixel/audio alignment. The desktop provider lacks screenshot/hotkey/focus control, and I did not substitute CDP or Xvfb as physical acceptance.
- **H1 evidence:** it uses the real startup and session classes but a fake child process. The real-process timing (SIGTERM, then a later `exit`) makes the lock still present when the replacement reserves; I did not observe that against a live portal.
- **Binding scope:** it proves association of the bytes with the receipt only. It does not prove consent authenticity, redaction or completeness, and the slice does not claim to. I did not measure large-file hashing latency.
- Windows and macOS are out of scope.
