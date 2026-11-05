# Claude overnight review 5 — Linux button-evidence privacy slice

- **Reviewed:** `9f59c4d4aadb7e489931becadc9d669202a5ddd1` ("feat: gate Linux button evidence with explicit durable privacy policy") against base `a58f56d9ab2e70d92f95b6d88d86f926dd7cd8f7`. That is 50 files, +2078/−71. I read every file from `git show`/`git diff` of those two immutable SHAs. I did not read the working tree.
- **Reviewer:** Claude (Opus 5.5), read-only. The only file I wrote in the checkout is this report. Reports 1–4 and `CLAUDE_OVERNIGHT_FOLLOWUP_4.md` are untouched. All tests ran in a `git archive` copy in the session scratchpad.
- **Date:** 5 November 2026.

## Verdict

The slice does what it sets out to do in its main paths:

- Collection is off by default.
- The policy is versioned, bounded and strict. Anything malformed, missing or from a future version normalises to Off.
- Application mode, and global mode with exclusions, are denied while identity is `null`.
- Main replaces the renderer's policy with the durable snapshot, and the countdown comparison includes the policy.
- The Rust helper opens no evdev reader and no KWin socket without `capturePointerButtons: true`.
- The parent gate is checked on every retention path I traced.

I found **no Critical or High issue**. There are **two Medium findings**:

- **M1:** a narrow revoke race in the unprepared start path.
- **M2:** the docs claim the receipt is validated "on reopen", but no production code reads it.

There are also four Low findings, two Nits and the review-4 follow-up check. Two of the Low findings (L1 and L3) are reproduced with scratch Node canaries. The rest are from reading the code.

## Findings (most severe first)

### M1 — Medium: revoking during the start handler's `mkdir` await is not applied to the new session

- **Where:** `electron/ipc/handlers.ts:2800-2857`, start handler. The prepare handler has the same gap at `:2709-2761`.
- **What happens:** the canonical policy is read synchronously at `:2802`. Then the handler awaits `fs.mkdir(...)` at `:2825`. Only after that does it create the `LinuxNativeCaptureSession` and set `lastLinuxCaptureSession` at `:2857`.
- **Scenario** (no prepared session; for example the CLI/MCP path, or a failed prepare):
  1. The policy is `global`, so the snapshot is read as global.
  2. While `mkdir` is pending, `set-recording-prefs({capturePrivacyPolicy: off})` runs. Its `onChange` at `:2384` calls `suppressLinuxButtonEvidence()`.
  3. That call iterates `linuxNativeCaptureSession`, `preparedLinuxCapture?.session` and `lastLinuxCaptureSession`. None of them is the session about to be created.
  4. The new session is then built with the stale global policy. It spawns with `capturePointerButtons: true` and journals buttons for the whole take, even though the durable setting is Off.
- **Prepared path:** in the prepare handler the same race self-heals. The start handler re-reads the snapshot, the mismatch discards the prepared helper, and nothing is retained. Even so, the prepared helper ran evdev readers during the countdown and picker.
- **Why it matters:** the doc's claim "a policy reduction also suppresses any existing/prepared take" (`LESSON_CAPTURE_PRIVACY.md:29`) does not hold for this window. The window is one `mkdir` of an existing directory, so it is very unlikely, but the failure is silent and lasts the whole take.
- **Fix:** after `lastLinuxCaptureSession = session`, re-read `appSettings.getSnapshot()` and call `session.suppressButtonEvidence()` if the decision is no longer allowed. A policy generation counter would also work. Either fix covers both handlers.
- **Evidence:** code reading only. I did not drive the Electron IPC handler.

### M2 — Medium: receipt "reopen validation" is a library function with no production caller

- **Where:** `electron/recording/capturePolicyReceipt.ts:35` (`readCapturePolicyReceipt`).
- **What I found:** `git grep readCapturePolicyReceipt 9f59c4d4` finds only the definition and tests. No editor, project-load, reopen, export or CLI path reads or validates `<video>.capture-policy.json`. The pack command (`electron/cli/projectCommands.ts:101`) copies the file without validating it.
- **What the docs and brief claim:** `LESSON_CAPTURE_PRIVACY.md:83` says "The reader validates version, size, shape and decision consistency on reopen", and the brief lists "reopen validation". That is true of the function, not of the app.
- **Consequence:** a malformed, oversized or inconsistent receipt is never rejected when a take is reopened. Separately, nothing on reopen uses the receipt's `collectionAllowedAtStart` to decide whether a neighbouring `events.ndjson` should be trusted as consented evidence.
- **Fix:** either wire the reader into the reopen/load path and surface rejection, or change the wording to "a validating reader exists; no reopen path consumes it yet".

### L1 — Low: after suppression, drain counts still go into the journal (reproduced)

- **Where:**
  - `electron/native/pipewire-capture/src/main.rs:1620-1626`: with the gate closed, a queued `PointerButton` returns `Some(false)`, so it is counted in `excluded_edges`. `processed_messages` counts every queued message.
  - `electron/native-bridge/capture/linuxNativeCaptureSession.ts:618-629`: the parent appends `input-drain` to the journal whenever it is capturing, without checking `buttonDecision.allowed`.
- **Scenario:** take with global consent → user presses **Stop button evidence** → user clicks several times before the reader thread sees the gate → Stop. The saved journal gets, after `input-policy-suppressed`, an `input-drain` record whose `excludedEdges` equals the number of post-revocation edges in the queue. This is a small count of button activity after consent was withdrawn.
- **Docs:** "drain metadata limited to declared fields" is true, but the declared fields are themselves derived from post-revocation input.
- **Reproduced:** in a scratch canary, `excludedEdges: 7` emitted after `suppressButtonEvidence()` is present in the journal after the suppression marker.
- **Fix:** journal the drain only while allowed, or write a fixed `{completed, suppressed: true}` record. The helper could also skip counting while the gate is closed.

### L2 — Low: after a suppression, reader threads can overwrite the "disabled" status

- **Where:** `electron/native/pipewire-capture/src/input.rs:175-177` and `:135-144`; `main.rs:913-921`.
- **What happens:**
  1. When a blocked `read_device` wakes on its next event after the gate closes, `release()` calls `report_status`.
  2. That emits `InputStatus` `partial` or `unavailable`, and the main loop forwards it without a gate check.
  3. The parent journals it (`linuxNativeCaptureSession.ts:587-594`).
- **Result:** the journal's last status after a suppression can read `partial` rather than the `disabled` the helper sent. Its timestamp also marks the first device event (button or motion) after revocation.
- **HUD:** health is still reported as `disabled`, because `buttonDecision` takes precedence.
- **Fix:** gate `InputStatus` forwarding on the same atomic, or have the parent pin the status to `disabled` once suppressed.
- **Evidence:** reproduced in the parent half only. A scratch canary shows an `active` `input-capture-status` arriving after suppression is journaled as `active`. The Rust emission is from reading the code.

### L3 — Low: a receipt collision leaves the stale receipt next to the new video (reproduced)

- **Where:** `capturePolicyReceipt.ts:29` (`flag: "wx"`) and `linuxNativeCaptureSession.ts:722-736`.
- **What happens:** on collision the new take fails closed, as intended. But the earlier `<video>.capture-policy.json` stays at the same path as the new video. Reopen and `runPackCommand` then attribute it to the new take.
- **Reproduced:** with a stale receipt where `collectionAllowedAtStart: true`, the new take is `suppressed` and `result.capturePolicyPath` is `undefined`, yet `readCapturePolicyReceipt(video).collectionAllowedAtStart === true`.
- **Same pattern elsewhere:** a stale `events.ndjson` at that path is not attempted on a denied take, so it also sits beside the new video.
- **Likelihood:** low (it needs an identical `recording-<id>.mp4` path).
- **Fix:** fail the new take's receipt into a distinct name, or record the collision in the result so packing/reopen can refuse the stale receipt.

### L4 — Low: a revocation that fails to save does not suppress

- **Where:** `electron/ipc/recordingPrefs.ts:34-35`.
- **What happens:** if `setRecordingPreferences` throws (disk full, or `recording-settings.json` read-only), `onChange` is never called. A prepared countdown session keeps its global policy. The UI does honestly say "The last saved policy still applies", and the live-take **Stop button evidence** IPC is unaffected.
- **Fix:** if the requested reduction would deny collection, suppressing active/prepared sessions before (or regardless of) the persistence result would honour the user's intent.

### N1 — Nit: the cursor-only session still logs a raw helper line on parse or handler errors

- **Where:** `pipeWireCursorRecordingSession.ts:177`.
- **What happens:** `console.error(..., error, line)` prints the full line. In addition, `payload.code.startsWith` at `:207` throws on a `warning` without a string `code`, which hits the same catch and logs the line too.
- **Context:** the full-capture session was hardened against this (fixed marker plus envelope checks). Cursor-only requests `false`, so button content is not expected here. Apply the same envelope check and fixed marker for consistency with the "malformed stdout omitted" claim.

### N2 — Nit: a disabled take still shows the "physical buttons across the desktop" scope line

- **Where:** `InputCaptureNotice.tsx:35-39`.
- **What happens:** with Off now the default, every Linux take shows "Input evidence: disabled" followed by "Physical mouse buttons across the desktop…", which can read as if buttons are being captured.
- **Fix:** show the scope line only when `health.privacy?.allowed`.

### Info (truthful limits, already documented and correct)

- A reader blocked in `fetch_events()`, or the KWin socket, stays open until the next event or process exit (`input.rs:180-207`, `kwin_input.rs:80-87`). The doc states this correctly.
- Consented `pointer-button` and `input-discontinuity` payloads are journaled verbatim, so extension fields are kept. That is within consent. Only status, drain and boundary records are projected to declared fields.
- The probe is a 5 s `execFile`, and it gates video too. A stale or slow helper blocks recording entirely. This fails closed, as intended.
- The UI turns on global consent with a single select change and no confirmation step. The wording says "explicit opt-in" and the risk text is visible. Whether one select change is explicit enough is a product decision.
- Unsaved textarea edits are overwritten by any `recording-prefs-changed` broadcast, such as a mic toggle (`ButtonEvidenceSettings.tsx:24-34`). This is a UX issue, not a privacy issue: nothing applies until it is saved.

## Brief checklist (at 9f59c4d4)

| Claim | Result |
|---|---|
| Defaults off; v1 bounded strict policy; malformed/future → off | Confirmed (`capturePrivacy.ts`, `app-settings.ts` parse + patch validation) |
| Application/exclusion mode denies when identity is unknown | Confirmed (`decideButtonCollection`, callers always pass `null`) |
| Main reads the canonical policy; renderer cannot broaden it | Confirmed (`handlers.ts:2709-2713`, `:2800-2804`; `AppSettingsStore.getSnapshot` re-reads disk) |
| Countdown snapshot comparison | Confirmed (`captureSettingsOf` includes the policy) |
| Reduction revokes active/prepared/pending-probe/last | Confirmed except the M1 window and L4 |
| Rust `capturePointerButtons` defaults false; no evdev/KWin on denied consent | Confirmed (serde `default`, `main.rs` gate, `input.rs`/`kwin_input.rs`); Rust tests pass |
| stdin closes the atomic before queuing; main/drain/reader/hotplug gates | Confirmed; status not gated (L2) |
| Parent suppresses edges, click samples/bitmaps, private diagnostics, gap/warning lines | Confirmed; drain counts leak (L1) |
| Boundaries `buttonStateObservation: "suppressed"`, `buttonsDown: []` | Confirmed (`linuxNativeCaptureSession.ts:600-614`) |
| Malformed stdout / unknown events omitted | Confirmed for full capture; cursor-only gap (N1) |
| 0600 per-take receipt; collision fails closed, video continues | Confirmed; stale-receipt attribution (L3) |
| Reopen validation | **Not wired** (M2); legacy pack copy confirmed |
| One-way live suppression and HUD settings/status/save/load | Confirmed in code and jsdom tests |
| New English keys in all locales | Confirmed: all 15 locale files have the same 16 `buttonPrivacy` keys, all in English |
| Probe-only capability check before spawn; Ready v1 re-check | Confirmed. At `a58f56d9`, `probe_only` already exits (`main.rs:336`) before `spawn_stdin_reader`/`spawn_readers` (`:341-350`), so a stale helper never opens readers during the probe |
| Cursor-only explicitly false; rejects unexpected clicks | Confirmed |
| Review-4 follow-up: delivered-A→pending-B→A clear and fail-once writer tests; doc qualifications | Present and passing (`main.rs` `cursor_sample_tests`); doc wording in `LESSON_CAPTURE_CURSOR_RECOVERY.md` and `FOLLOWUP_4` is accurate. I did not mutation-test the new tests |
| Windows/macOS, full redaction/retention/pre-export not claimed | Confirmed; the doc's "Not covered" section is explicit |
| No optional application adapter required/enabled | Confirmed; no adapter code in the diff |

## Evidence I reproduced

- **Rust helper tests.**
  - **Setup:** `git archive 9f59c4d4` copy, its own `CARGO_TARGET_DIR`, `--offline`. `FFMPEG_DIR` pointed read-only at the checkout's `crates/thirdparty/ffmpeg-linux64-lgpl-shared`.
  - **Result:** **131 passed, 0 failed, 1 ignored** (1.77 s). This matches the claim.
- **Focused Vitest.**
  - **Setup:** same archive copy, with `node_modules` symlinked read-only and the Vite `cacheDir` redirected to the scratchpad. The checkout's `node_modules/.vite` mtime is unchanged.
  - **Result:** 9 files / **97 tests pass**: capturePrivacy, capturePolicyReceipt, linuxNativeCaptureSession, pipeWireCursorRecordingSession, app-settings, recordingPrefs, projectCommands, ButtonEvidenceSettings, InputCaptureNotice.
  - **Limit:** this ran on Node **v26.13.0**. The pinned Node 22.22.1 is not installed on this machine.
- **Review canaries** (scratch test file only, copied from the session test harness): 2/2 pass, confirming L1 and L3 as described. The L2 parent-half check (an `active` status journaled after suppression) is in the L1 canary.
- **Staged helper.**
  - **Hashes:** both `electron/native/bin/linux-x64/openscreen-pipewire-helper` and `electron/native/pipewire-capture/build/openscreen-pipewire-helper` have SHA-256 `97d5f349445d9c0d61d96ebc1d458cd0dbef58fa88dad250623f6bce09146a6b`, matching the claim.
  - **Probe:** run with the exact app-side probe arguments (`{"probeOnly":true,"capturePointerButtons":false,"cursorMode":"hidden"}`, stdin `/dev/null`), it emitted one `ready` with `buttonPrivacyVersion: 1`, `pipewireVersion: "1.6.10"`, and exited 0.
  - **Limit:** I did not rebuild it, so I cannot independently prove it was built from `9f59c4d4`.
- **Checkout state:** `git status` was clean before I wrote this file.

## Not reproduced / limits

- The full 5,355-test / 401-file Vitest run, both TypeScript configs, the Vite and native release builds, lint, and the docs/i18n/diff scripts. I read the logs in `../openscreen-evaluation/overnight-2026-11-06/slice-5-*`; I did not rerun them.
- Any portal or desktop recording, physical devices, KWin, focus/app identity, or HUD gestures in a real window. M1 is from code reading, not a driven IPC race.
- Source, class and React fixture tests are not OS or physical acceptance. That also applies to my canaries.
- Work after `9f59c4d4` (the broader capability/bridge work) is outside this review.
