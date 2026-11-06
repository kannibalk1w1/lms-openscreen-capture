# Claude overnight review 9: slice 10 (review-8 follow-up) and slice 11 (read-only native clock link)

- **Reviewer:** Claude (Opus 5.5), dispatched read-only Orca worker (task `task_82b4f745b843`). I am the single reviewer. I did not launch a nested worker, subagent or helper.
- **What I wrote:** this report is the only file I wrote in the checkout, and I did not stage it. I made no code, git, settings, auth or API changes. I posted nothing externally.
- **Two commits, each reviewed against its own parent:**
  - **Slice 10:** `56e6fc2c5856de51f3ed9e6913aa35dd9e61e46c` ("fix: preserve recovery exclusions and explain disabled integration imports") against `3329f58e96bafcfaf0737689168386433c4fdffb`. 47 files, +579/−62.
  - **Slice 11:** `1e2ddea31c863dcd918c9e4d9e35cc95a70128d8` ("feat: add explicit read-only native recording clock link") against `56e6fc2c`. 48 files, +2751/−28.
- **Checkout state:** HEAD was `1e2ddea3` and the tree was clean at the start and at the end. `main` stayed at `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` throughout.
- **Snapshots:** I made immutable `git archive` snapshots of `56e6fc2c` and `1e2ddea3`. They live outside the checkout, in the session scratchpad (`…/scratchpad/r9/{s10,s11}`).
  - Each snapshot's `node_modules` holds one symlink per entry of the checkout's `node_modules`, with `.vite` and `.vite-temp` excluded.
  - For the Rust build only, `crates/thirdparty` in the s11 snapshot is a symlink to the checkout's untracked staged FFmpeg. The checkout files are read, never written.
  - All builds, caches and probes stayed in the snapshots.
- **Checkout pollution check:** the checkout's `node_modules/.vite` and `.vite-temp` mtimes are 5 Nov 12:19 and 6 Nov 01:04:47 UTC. Both are before my first run at 01:10 UTC.
- **Documents I read:** `CLAUDE_OVERNIGHT_REVIEW_8.md`, `CLAUDE_OVERNIGHT_FOLLOWUP_8.md` and `LESSON_CAPTURE_CLOCK_BRIDGE.md`.
- **Earlier reports are preserved:** `git diff 56e6fc2c 1e2ddea3 -- 'lesson-capture/CLAUDE_*'` is empty. Review 8 was added in slice 10 unchanged.

## Verdict

- **No High or Medium findings in either commit.**
- **Review-8 dispositions:** all accepted (see below).
- **New findings, all in slice 11:**
  - two Low findings: L11-1, and L11-2, which is borderline Info;
  - several Info items and nits.
- **Baseline issues:** where an item is a baseline issue and not new in these commits, it is marked as such.
- **Hardware acceptance stays open.** This review is fixture-level only. It is not production or release approval.

## Slice 10 — review-8 follow-up (`56e6fc2c` vs `3329f58e`)

### Review-8 dispositions

- **L8-1 (recovery provenance dropped by transient inspection paths): fixed.**
  - The exported `inspectCapturePrivacy` is now a wrapper. It parses the embedded record once and runs the existing inspection. It then re-applies `previous.recoveredFrom` to **every** result, including reservation, `invalid`, `unavailable` and fresh-receipt results.
  - Both callers (`DocumentService.getProject` and `runPackCommand`) go through the wrapper. I grepped for others and found none.
  - Pack now uses `captureEvidencePackagingDecision`. If `recoveredFrom` is set, evidence is excluded even when the current status is `bound`, `legacy` or `missing`.
  - The new tests use the real `DocumentService` save/reopen and pack with canaries, covering:
    - a lock, an invalid sidecar, and a real `chmod 0` directory;
    - a restored adjacent `events.ndjson`, which stays excluded and keeps its original bytes.
  - This closes my review-8 repro path. The new tests pass in my s10 and s11 runs. They ran as UID 1000, so the permission test actually executed and did not skip.
- **L9-1 (disabled decoder reported as an invalid file): fixed.**
  - The IPC handler now returns `{success:true, files}` or `{success:false, code}`, where code is only `integration-disabled` or `invalid-typing-source`. No exception text or payload crosses IPC.
  - The dialog maps `integration-disabled` to the enable hint. The project and write-epoch guard now runs after the response, before either branch.
  - A direct real-dialog test exists. It covers N9-2.
- **I-B1 (provenance claimable through the core path): addressed as intended.** A visible "unverified source claim" line now shows whenever `take.integration` is present. There is still no attestation, which is correct.
- **I-B2 (stale error after re-enable): fixed.** `setEnabled` and the new `enable` clear `errors` only when a provider exists. An incompatible or missing provider stays failed. The IPC test covers enable → `available-offline`.
- **N8-1 (status cast): fixed.** A shared `captureRecoveryReasonSchema` and typed decision replace the `as` union.
- **N9-1 (future settings replaced on save):** unchanged, as documented in follow-up 8. I accept it as fail-closed.

### Slice 10 Info and nits

- **S10-I1 (Info, new by design): a recovery exclusion is now permanent.** Once `recoveredFrom` is set, no later inspection can clear it, even a later fully `bound` receipt. Both the docstring and follow-up 8 say this ("until a separate review decision"), but no such decision path exists yet. This is conservative and fine. Record it as an open product decision.
- **S10-I2 (Info, baseline since slice 8): a strict-schema failure drops recovery provenance.**
  - The embedded record is parsed with a `.strict()` schema. If parsing fails, `recoveredFrom` is lost and the no-receipt branch reads `missing`, which allows evidence.
  - Parsing fails for an additive field from a future build, an unknown status, or a hand-edited project file.
  - This is unchanged from the base. Anyone who can edit the project file can also just delete `recoveredFrom`, so it is not an escalation. It is worth remembering when schema v2 arrives.
- **Nit: pack warning text.** In `projectCommands.ts`, the `packaging.allowed ? … : packaging.recoveredFrom` ternary is inside the `!evidenceAllowed` branch, so its first arm is dead code. The message now prints the recovery reason, not the current status. That is fine, but simplify the ternary.

## Slice 11 — read-only native recording clock link (`1e2ddea3` vs `56e6fc2c`)

### Scope matches the brief and the document

- **Native helper:**
  - It accepts `clock <id>` only in the default branch of the stdin parser. The id is bounded to 64 characters, `[A-Za-z0-9-]` only. Rust tests show that `pause\nstop`, `../`, spaces and over-long ids are rejected.
  - The query is answered from `Capture::clock_snapshot`, which is the same `CaptureClock` used by the encoder and by input projection. Before capture starts it uses a default (waiting) clock.
  - The emitter deliberately skips `timestampMs` for `ClockSnapshot`, so no UTC is sent. Paused media time is frozen, and resume opens a new interval: the Rust test checks 20 → 40 frozen → interval 1 from 40 → stopped at 90.
  - The response has no input, device or button fields, and the query has no control side effect.
- **TypeScript session:**
  - `sampleClock` allows at most 4 pending queries, each with a 1 s timeout.
  - Pending queries are rejected with `NativeClockSourceEndedError` on stop, discard and exit.
  - Responses are validated twice: once by the event schema, then by the strict snapshot schema with interval invariants.
  - `clockId` is the session's own `captureId` and is never taken from the helper.
  - `clock-snapshot` lines are excluded from helper diagnostics (`appendHelperOutput`) and are never journaled.
  - An old helper without `clockSnapshotVersion: 1` makes queries fail with a generic error, which becomes a gap. Capture is unaffected.
- **Pairing:**
  - It is explicit. A capability probe of the helper (`probeOnly`, hidden, no buttons, no portal) runs first. Then come an open dialog for `project.godot` and a save dialog for a **new** link file, which defaults to `userData`.
  - A `pairing` flag serializes the flow. An epoch makes Stop and app `before-quit` cancel a pending probe or dialog. Stop during the helper probe has a direct test, and I confirmed it.
- **Broker (`RecordingClockBridge`):**
  - It binds `127.0.0.1` on port 0 only after pairing.
  - The link is written with `wx` and `0600`, and its mode is re-checked.
  - The bearer token is 32 random bytes. It is length-gated by regex, then compared with `timingSafeEqual`. Authentication is checked before any body bytes are read.
  - Requests carrying any `Origin` header are rejected.
- **Bounds:**
  - body 2 KiB; headers 2 KiB / 16; 2 s header and request timeouts;
  - 8 connections and 64 requests per socket;
  - 4 peers and 4 in flight per grant; 100 ms minimum spacing per peer;
  - strictly increasing sequence and non-decreasing tick, with the sequence capped at 50 000;
  - 10 s idle peer close; a 1 h TTL on `performance.now()`.
- **Revocation:**
  - Stop, expiry and app quit run `closeGrant`. It nulls the grant, clears the token, disables the host capability (which closes peers) and destroys all connections.
  - Any in-flight query that resolves later sees `this.grant !== grant` and returns `revoked` without updating `lastPoint`.
- **Source binding:**
  - The first successful sample sets `sourceClockId`. Later queries pass it as `expectedClockId`.
  - `handlers.ts` rejects with source-ended if the current session's identity differs. The broker re-checks `point.clockId` as well.
  - On mismatch it emits a `source-ended` gap and closes the grant after the response. It cannot follow a new take.
- **Permissions are independent:**
  - `integrationSettingsSchema` allows only `godot-codeedit`, so a clock grant can never be persisted or enabled from settings.
  - `setSettings` and `snapshot` now touch only `godot-codeedit`.
  - `host.open` requires `pairedProjectGrantId === scope.grantId` for paired scopes, and `selectedFileAuthorized === true` for selected-file scopes. The descriptor's mode must also match the scope kind. A host test shows that a selected-file grant cannot open the clock capability.
  - The IPC test shows that turning the file decoder off leaves the clock link paired.
- **Plain core capture with all adapters disabled:**
  - No listener exists by default. `queryNative` is reached only through an authorized broker request.
  - The only session-side changes are the clock-query plumbing, plus `stopping`/`rejectClockQueries` in `stop`, `discard` and exit. Neither alters pause, stop, drain or evidence behaviour.
  - The full suite (below) is green.
- **Godot client:**
  - It is clock-only: no `CodeEdit`, keys or scene access.
  - It validates the link shape strictly (7 keys, regexes, port range). It compares the link's `projectPath` with `globalize_path("res://")`.
  - It uses a random 128-bit instance id and `max_redirects = 0`, an 8 KiB body limit and a 1.5 s timeout.
  - It validates responses: grant, instance, sequence and `clientSendMs` echo; a strict 9-field point; interval invariants that mirror the TypeScript schema.
  - The journal is optional. It requires a new file (existence check, `mkdir` lock directory, `0600`). It holds at most 50 000 records and is bounded below 8 MiB. A footer is written on stop, disconnect or limit.
  - The token is held only in `_config` and is never written to the journal or emitted on signals.
- **Inspector:** the portable inspector needs no adapter. It is bounded to 8 MiB / 50 000 lines. It enforces header-first order, record order and no records after the footer. It never treats a footer as complete coverage, and the UI strings say so.
- **Documentation:** it matches the code, and it correctly disclaims typing auto-pause, continuous edit mapping, physical timing and hardware acceptance. Two wording points are below (I11-2, I11-4).

### L11-1 (Low, new): a link that has not yet bound a take is ended by the *previous* take's teardown

**What happens:**
- While a grant is unbound (`sourceClockId === null`), the broker passes no expected id. `handlers.ts` then calls `linuxNativeCaptureSession?.sampleClock()`.
- `sampleClock` rejects with `NativeClockSourceEndedError` whenever `!process || stopping || stopped || discarded`.
- `linuxNativeCaptureSession` is cleared only in the `finally` of the `stop-native-linux-recording` IPC. It stays assigned in two cases:
  - throughout `await session.stop()` (drain and finalize, which takes seconds);
  - after an unexpected helper exit, until the renderer issues Stop.
- In either window, the first query on a **fresh, never-bound** link is answered `410 source-ended`, and the grant closes with state `ended`.

**Repro (probe P2, scratch only):** a bridge whose native query rejects `NativeClockSourceEndedError` with no expected id. The first request returns `410 {"code":"source-ended"…}`, then `snapshot() → {"state":"ended","peers":0}`.

**Impact:**
- If a user creates a link while the previous recording is stopping, or just after a helper crash, the link dies before the next take starts. They then have to create another link.
- This contradicts the document's "A grant binds to its first native capture identity and ends when that source ends". This grant never had a source.
- Fail-closed. No data from the wrong take is exposed.

**Baseline compared with new:** new in slice 11.

**Suggested fix:** when `sourceClockId` is null, treat `NativeClockSourceEndedError` as a `native-unavailable` gap and keep waiting. Alternatively, in `queryClock`, return an "unavailable" error rather than source-ended when no expected id was given.

### L11-2 (Low, borderline Info, new): an old grant's source-ended close cancels a concurrent new pairing

**What happens:**
- The source-ended branch's deferred `close()` calls `this.operation++` before `closeGrant(false, true)`.
- Suppose `createPair` for a new link is in its early awaits (`realpath`, `stat`, `lstat`) while `this.grant` is still the old grant. The bump then makes the new pairing throw "Clock pairing was cancelled". The IPC turns that into `pairing-failed`, and the UI shows the generic "could not create" error.

**Repro (probe P3, scratch only):**
1. A pending query is released as source-ended while `createPair` has just started.
2. Old request: `410`. New pairing: `failed: Clock pairing was cancelled`. Final state: `ended`.

**Impact:** a narrow window (the user's click has to land within milliseconds of the take ending while a client is polling). It fails closed, and a retry works.

**Suggested fix:** don't bump `operation` in the source-ended close. `createPair` already closes the old grant itself, and the `this.grant !== grant` guard is enough.

### Slice 11 Info and nits

- **I11-1 (Info): the `Host` header is not validated.**
  - P1: a request with `Host: evil.example` and the valid token gets `200`.
  - DNS rebinding is already blocked twice over:
    - browsers send `Origin` on every POST, and the broker rejects it;
    - the bearer secret is unknown to web content.
  - Requiring `Host` to be `127.0.0.1:<port>` would be cheap extra protection.
- **I11-2 (Info, docs wording): project binding is advisory, not authorization.**
  - `projectId` is just a hash that is written into the link. Any same-user process that can read the `0600` link file is authorized, whatever the project.
  - The only real project check is the Godot client's own `projectPath == res://` comparison.
  - The document's "wrong-project requests cannot reach the native source" is true only in the sense of a mismatched `projectId` field. Suggest saying that possession of the private link is the authorization, and that project scope is checked by the client.
  - Separately, the client's comparison is not symlink-resolved. A project opened through a symlinked path reports `wrong-project`, because OpenScreen stores the `realpath`.
- **I11-3 (Info): the TTL is "one monotonic hour" on `performance.now()`.** On Linux this does not advance during suspend, so a link created before a laptop sleeps can still be valid after waking. The document's wording is accurate. Mention suspend if users are expected to rely on the hour.
- **I11-4 (Info, docs nit): `waiting` native samples are mostly unreachable in the real wiring.**
  - `linuxNativeCaptureSession` is assigned in `onStarted`. Before that, queries produce `native-unavailable` gaps, not `waiting` samples.
  - The Rust and broker `waiting` paths are real, but in practice they are reachable only while a started session's clock has not yet begun.
  - The document's "including waiting … state" slightly overstates what users will see.
- **I11-5 (Info): the inspector does not check per-clock monotonicity.**
  - P4: two samples with the same `clockId`, where `mediaTimeMs` goes 5000 → 10 and `observedMonotonicMs` goes 9000 → 100, are accepted as valid.
  - The metadata is explicitly unverified, so this is consistent with the document. A cheap check would catch corrupt or merged files.
- **Nits (Godot client):**
  - **Rejections show as invalid responses.** A `403`/`410` without the echo fields (such as `revoked` or `expired` before the 1 s timer) is recorded as `clock-invalid` with state `invalid-response`, not `revoked`/`expired`. After a normal Stop the client correctly sees `transport-error` → `unavailable` (live probe below).
  - **Wrong footer reason at the limit.** The 50 000 / 24 h limit path in `_process` writes the footer reason `disconnect`, not `limit`, because `disconnect_clock()` runs first.
  - **Brief readable window for the journal.** The journal is created by `FileAccess.WRITE` with the default umask and then changed to `0600`. For an instant it is readable by others. It holds no token, only grant id, project hash and clock data.
  - **Broker nit:** `snapshot().pairFilePath` exposes the absolute link path to the renderer. That is by design (the UI tells the user which file to open), and the path is not the secret.

## Validation I ran

**Toolchain:** `PATH=/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin:$PATH`, and `node --version` printed `v22.22.1`. Every run used binaries from each snapshot's `node_modules/.bin`.

**Full Vitest on s11 (`1e2ddea3`), excluding my probe directory:**
- 411/411 files. **5465 passed, 1 skipped, 5466 total.** 60.72 s.
- The one skip is the conditional ffmpeg test in `electron/media/audioPeaks.test.ts` ("decoding a real file produces peaks …"). The archive lacks the untracked staged ffmpeg when Vitest starts.
- This agrees with the documented counts. Their milestone was 5465 passed / 411, with the ffmpeg test passing in the checkout. The later Stop/probe regression adds one more test, giving 5466 in the committed tree.

**Focused runs:**
- **s11:** 10 files, **139/139** pass: bridge, IPC, clockBridge lib, clock probe, native session, controls UI, applicationIntegrations, projectCommands, TypingCaptureDialog, integrations.
- **s10:** 36 files, **700/700** pass: projectCommands, IPC, TypingCaptureDialog, applicationIntegrations, `electron/recording`, `electron/ai-edition`.

**Static checks on s11:**
- `tsc --noEmit` exits 0 for `tsconfig.json`, `tsconfig.node.json` and `tsconfig.test.json`.
- `vite build` passes, with three bundles (19.24 s, 8.95 s, 29 ms).
- `biome check .`: 1244 files, **35 warnings** (the baseline) and no errors.
- `node scripts/i18n-check.mjs` passes: 14 locales match `en` across 7 namespaces, **1167 literal keys**, 15 supported locales.

**Rust on s11:** `cargo test --offline` with `CARGO_TARGET_DIR` in the scratchpad gave **134 passed, 0 failed, 1 ignored** (the existing live-PipeWire test). The first attempt failed because the archive lacks the untracked staged FFmpeg headers. I then symlinked them read-only, as described in the header.

**Staged helper:**
- My `sha256sum` of `electron/native/bin/linux-x64/openscreen-pipewire-helper` and `electron/native/pipewire-capture/build/openscreen-pipewire-helper` is `f7c5055fb322ebc201a01ef0122d0222b56d354dfee5ce2b9b2bbfe1a37b4d3c` for both. That matches `slice-11-helper-sha256.txt`.
- I executed the staged helper once in `probeOnly` mode (hidden cursor, no buttons, 5 s timeout). It printed `ready` with `buttonPrivacyVersion: 1`, `clockSnapshotVersion: 1`, PipeWire 1.6.10, and then exited 0.
- No portal or recording was started. These binaries are untracked, so "built from 1e2ddea3" rests on the documented build log, not on my rebuild.

**Probes (scratch copy of s11 only, never in the checkout):**
- **P1–P4** are in `electron/review9/probe.test.ts`; all 4 run as observation harnesses. Their results are quoted above.
  - P1 also confirms that `Origin` is rejected before any native read, and that neither replies nor `snapshot()` contain the token.
- **Live probe:** the real Godot 4.7.1 client against the real broker, with a synthetic native clock. Godot ran headless with `--audio-driver Dummy`, using a disposable project containing a copy of the addon and a small driver script.
  - The broker's native query returned recording for 1.2 s, then paused. I called `bridge.stop()` at 2.5 s.
  - Godot states: `waiting, recording×4, paused×5, disabled, unavailable`.
  - Journal: **9 samples, 5 paused, 1 `transport-error` gap**, closed with `disconnect`, 56 ms maximum round trip. The inspector accepted the GDScript float encoding (`1200.0`).
  - Journal mode `600`, and the token is not present in the journal.
  - After the run, `pactl list short sink-inputs` was empty. The temporary link files were deleted, and their tokens had already been revoked by `stop()`.
- I moved the probe directory out of the snapshot before Biome so it would not change the warning count.

## Limits

- **Not tested:** physical, portal or desktop capture; counted OS input; live pause, Stop or device loss against a real encoder; and encoder → Godot timing under load.
- **Not checked:** visible addon or renderer keyboard and accessibility, Windows/macOS, sustained capture, and the rest of the desktop checklist. The Orca computer provider has no screenshot, hotkey or focus control.
- **Fixtures, not hardware:** the native source in the live probe was synthetic. The snapshot tests and probes are fixtures and do not substitute for hardware acceptance.
- **Helper provenance:** I did not rebuild the helper. Rust tests ran on snapshot source, and the staged binaries were only hashed and capability-probed.
- **No approval:** this review approves nothing for production, release, upstream or `main`.
