# Claude overnight review 8: slice 8 (recovery follow-up) and slice 9 (optional integration subset)

- **Reviewer:** Claude (Opus 5.5), dispatched read-only Orca worker (task `task_73e6f658707b`). This report is the only file I wrote in the checkout. I made no code or git changes and wrote no settings or auth files. I posted nothing externally and spawned no subagents or workers.
- **Two commits, reviewed separately. Each is reviewed against its own parent:**
  - **A (recovery follow-up):** `5d0ccd3c9e87f07a395ddfc39d219e35c361e0b1` ("fix: retain recovery provenance and reconcile proven late helper exit") against `e2f4a68d7b72bf3276c5aaab208f2f6df2338208`. 15 files, +380/−29.
  - **B (optional integration subset):** `3329f58e96bafcfaf0737689168386433c4fdffb` ("feat: isolate optional Godot file import behind explicit capability controls") against `5d0ccd3c9e87f07a395ddfc39d219e35c361e0b1`. 35 files, +1561/−4.
- **How I read the code:** with `git diff <parent> <commit>` and the files at the commit. The checkout HEAD was `3329f58e` and the tree was clean at the start and at the end.
- **Snapshots:** immutable `git archive` snapshots of `e2f4a68d` (base), `5d0ccd3c` (A) and `3329f58e` (B), plus a fourth copy of B used only for probe tests. All four are outside the checkout, in the session scratchpad (`…/scratchpad/r8/{base,A,B,P}`). Each has a real `node_modules` directory holding one symlink per entry of the checkout's `node_modules`, with `.vite` and `.vite-temp` excluded. All Vite and Vitest caches and build output went into the snapshots.
- **Checkout pollution check:** no new checkout or worktree was created. The checkout's `node_modules/.vite*` were not touched by these runs: their mtimes are 5 Nov 12:19 and 23:57, both before my runs started.
- **Original reports:** all earlier reports are preserved. `CLAUDE_OVERNIGHT_REVIEW_7.md` was added in A and is unchanged in B. `git diff 5d0ccd3c 3329f58e -- 'lesson-capture/CLAUDE_*'` is empty.

## Verdict

- **No High or Medium findings in either commit.**
- **Review-7 dispositions: all accepted.**
  - L7-1 is fixed on the normal path, with one residual gap (L8-1 below).
  - L7-2 is fixed.
  - N7-1, N7-2 and the error-event Info are addressed by real tests.
- **New findings:** one Low in A (L8-1), one Low in B (L9-1), and Info items and nits.
- **What this verdict does not cover:** it is an automated, fixture-level review only. It is not production approval, and there is no physical acceptance of any kind (see Limits).

## Commit A — recovery follow-up (`5d0ccd3c` vs `e2f4a68d`)

### Review-7 dispositions

**L7-1 (media-only pack reopened as `missing`): fixed on the main path.**
- In pack, `runPackCommand` writes `recoveredFrom: capturePrivacy.status` whenever evidence is excluded.
- `inspectCapturePrivacy` returns `embedded.recoveredFrom` as the status, but only in the no-receipt branch. It does not invent a receipt or consent.
- Migration carries `capturePrivacy` both ways: v1/v2 to document (asset) and document back to project.
- The `as`-cast in `projectCommands.ts:135` is correct today. The excluded set is exactly the six non-`bound/legacy/missing` statuses, and that matches the `recoveredFrom` enum. The cast would silently go stale if a status is added (nit N8-1).
- My probe at A/B confirms the fix: an intact recovered pack reopens as `interrupted` / `recoveredFrom: interrupted`. At base `e2f4a68d` the same probe reopens as `missing`.

**L7-2 (cached rejected `retiring` barrier): fixed.**
- `retiring` is now a `Set<T>`. `waitForRetiring()` calls the real `discardAndWait()` on each session and deletes a session only after it resolves.
- After a timeout, a later call finds `process === null`, because the persistent `once("exit")` handler cleared it on the late exit. The call then returns at once. This is how the regression with a late exit and a new recording ID passes.
- Concurrent callers each attach their own bounded 5 s waiter. I found no leak and no stale rejection.
- The cancel IPC now returns `{ success: false, error }` instead of rejecting.

**N7-1 and N7-2: addressed.**
- The diagnostics test separates "handler failed" from "malformed record". It puts canaries in the private payload, the malformed line and the exception text, and none of them reach `console.error`.
- The SIGKILL is asserted at 500 ms while `child.killed` is true.
- The ownership tests cover a provably-dead helper and a helper whose birth record does not match. On Linux the mismatched helper is classified `interrupted`; other hosts conservatively keep `pending`.

**Error-event Info: addressed.**
- `child.on("error")` releases the reservation only when `!child.pid`, which means a spawn failure.
- In `discardAndWait`, a signal error on a spawned child no longer counts as exit.
- A direct test with the real session class proves the lock stays in place until a real `exit`.
- My reading of Node's spawn failure (ENOENT): only `error` is emitted, with no PID. The no-PID branch therefore still covers it.

### L8-1 (Low): recovery provenance is dropped by inspection's reservation and catch branches, and can be lost permanently

**Where:** `electron/recording/capturePolicyReceipt.ts`.
- The reservation-present branch (`return { status: reservation, … }`, around lines 241–246) does not copy `embedded.recoveredFrom`.
- The `catch` branch (`unavailable` / `invalid`) does not copy it either.
- `DocumentService.getProject` (`document-service.ts:462–463`) replaces `asset.capturePrivacy` with the inspection result. The renderer then saves the document it was given.

**Repro:** `electron/review8/probeA.test.ts`, which exists only in the scratch snapshot.
1. A recovered pack is saved through the real `DocumentService`. The first reopen gives `{"status":"interrupted","recoveredFrom":"interrupted"}`.
2. The media directory is made temporarily unreachable (`chmod 000`, the same situation as an unmounted share or a permissions blip). Reopen gives `{"status":"unavailable"}` with no `recoveredFrom`.
3. That document is saved.
4. Access is restored. Reopen gives `{"status":"missing"}`.
5. A later pack now treats the media as `missing`, which counts as evidence-allowed. It copies a `clip.mp4.events.ndjson` sidecar sitting next to the media into the package: the output is `clip.mp4, clip.mp4.events.ndjson, p.openscreen`.
6. Control: the same pack from intact provenance excludes the journal (`clip.mp4, p2.openscreen`).
7. A lock appearing at the media path behaves the same way: `pending` without `recoveredFrom`, then `missing` once the lock is removed.

**Baseline compared with new:** at `e2f4a68d` both the probe and its control admit the journal, because provenance did not exist then. So this is a gap left by the L7-1 fix, not a regression.

**Severity:** Low. It needs a transient access failure (or a lock appearing) and then a save. It only re-admits sidecars that someone placed next to recovered media. It never invents consent.

**Suggested fix:** keep `embedded.recoveredFrom` in the reservation and catch returns. Optionally, make a no-receipt inspection prefer the stronger of `recoveredFrom` and the current status.

### Other notes on A (Info)

**I-A1 (Info): a failed start can remove an empty file at a path whose helper is still alive.**
- In `start()`, `waitForRetiring()` can time out during a same-path renegotiation. The `catch` then calls `removeEmptyOutput(outputPath)` for the path that the unexited helper still has reserved.
- That function deletes only zero-byte files, and the lock is a separate file that it leaves alone. A deferred, unarmed helper has written nothing, so no data is lost.
- This behaviour is the same as at base, where `await this.retiring` was at the same place.

**I-A2 (Info): repeated waits on a stuck helper do not re-signal it.**
- After a timeout, each later `discardAndWait()` on a helper that never exits adds a fresh 5 s waiter.
- `kill()` does nothing once `child.killed` is set, so it does not re-signal. SIGKILL was already sent at 500 ms, so this is acceptable.

## Commit B — optional integration subset (`3329f58e` vs `5d0ccd3c`)

**Scope matches the brief.** It adds:
- a selected-file decoder only, with no watcher, plugin install, live text or executable plugin loader;
- the existing raw-JSONL importer as the only real provider;
- an internal host in `src/lib/applicationIntegrations`, with a service in main, real IPC registered from `handlers.ts`, preload APIs, and a real checkbox and status in `TypingCaptureDialog`;
- 15 new English strings in all 15 locale resources.

The roadmap and design documents say that the live clock bridge, CLI/MCP controls and application/project attestation remain open. The code makes no claim beyond that.

### Checked and found sound

**Host (`host.ts`):**
- Descriptors and providers are validated. A duplicate or mismatched provider is isolated as `incompatible` without failing the host. An empty registry works.
- `open()` requires the adapter to be enabled, selected-file authorization, a provider and the capability.
- Limits: 16 sessions, unique instance IDs, and a 5 s startup timeout. A late `stop` is torn down when the connection is no longer active.
- `accept()` checks liveness and enablement before parsing the payload. It rejects a wrong adapter, instance, session, capability, scope, sequence, backwards tick, or clock-ID change. On error or capacity it clears the queue and closes the connection.
- The 64-record / 8 MiB + 64 KiB limit is enforced per connection.
- Observations are deep-copied, so later mutation by the producer does not leak in. `statuses()` returns copied descriptors.
- I also probed a provider that rejects *after* the timeout (B-probe1). Because `Promise.race` attaches a handler to `started`, there is no unhandled rejection. The status becomes `error` / `timeout`. That is not a finding.

**Service (`applicationIntegrationService.ts`):**
- It is off by default. Future or malformed settings read as off (the `version: 9` test).
- Disable takes effect in this process before the save, and still applies if the save fails. Enable applies only after a successful save.
- `snapshot()` rechecks the settings on disk at each raw import and only ever narrows them.
- The source is capped at 8 MiB. Whole-JSON input takes the core path. A raw journal needs at least 2 lines in `importTypingTake`, so a single-line JSON file cannot bypass the gate.
- The durable take ID is `integration-<uuid>` for each import. The original clock ID and producer-local session ID are kept in additive provenance, and `clockRelation` is always `unmapped`.
- Event IDs stay scoped to their take. I found no lookup of event IDs across takes in the review or store code.
- Unknown provenance becomes `{version:1,status:"unsupported"}` through `.catch`, and the UI warns.

**IPC, preload and UI:**
- The IPC handlers broadcast `changed` to every live window after a set or import. An invalid journal returns a canary-free error and sets status `error`.
- The renderer rechecks project ID and write epoch after the IPC response (the new late-response regression).
- In a browser without the main API, raw JSONL fails `JSON.parse` and portable JSON still imports.
- The documents (`LESSON_CAPTURE_INTEGRATIONS.md`, roadmap, `APPLICATION_INTEGRATIONS.md`) match the code's limits, timeouts and non-claims.

### L9-1 (Low, UX): with the integration disabled, a raw-journal import shows the generic "invalid file" error, not "enable the integration"

**What happens:**
- Main throws `Enable Godot journal import before reading this raw journal` (B-probe4).
- `TypingCaptureDialog.loadFile` catches every error and shows `typing.importError`: "Could not import this typing journal. It must be a complete, valid capture under 8 MiB."

**Repro:**
1. Start from default settings, open Typing capture and choose a valid finished Godot `.jsonl`.
2. The user is told the file is invalid, although the file is fine and the cause is the default-off switch.

**Baseline compared with new:** before B, the same file imported directly. After B, a valid file is reported as invalid.

**Severity:** Low. The data is safe, but this will be the first thing every Godot user hits.

**Suggested fix:** map the disabled-gate error to a specific string. If an error code is used, it must not carry any payload.

### Info and nits for B

- **I-B1 (Info): integration provenance can be claimed through the core path.**
  - A normalized take JSON with a well-formed `integration` object (`adapterId: godot-codeedit`, UUIDs, `capability`) imports through the core whole-JSON path with every integration disabled. It keeps that provenance as if an adapter had produced it (B-probe2: `enabled: false`, integration retained).
  - This is needed for export/import round-trips, and the documents already say there is no attestation. Readers and exports must treat `integration` as an unverified claim, not as proof that the adapter ran.
- **I-B2 (Info): a re-enabled integration shows an old error.**
  - `errors` is cleared only in `open()`. After an import fails, then the user disables and re-enables, status shows `failed` until the next import, even though nothing is running. This is cosmetic.
- **N9-1 (nit): a future settings record is replaced on the first save.**
  - A future `applicationIntegrations` record (`version: 2`, extra IDs) is read as off, which is correct. It is then replaced by the first v1 save, giving `{"version":1,"enabledAdapterIds":[]}` (B-probe3). That is acceptable as fail-closed, but forward settings are lost if a newer build is later run again.
- **N9-2 (nit): no direct test for the disabled-gate message.**
  - The `TypingCaptureDialog` tests cover the late-response race but not that a raw journal is rejected with a specific message while disabled. That test would have caught L9-1.
- **N8-1 (nit): the `projectCommands.ts` status cast.**
  - Prefer deriving the excluded set from one shared constant, or adding a type-level exhaustiveness check, over the inline `as` union.

## Validation I ran

**Toolchain:** `export PATH=/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin:$PATH`, and `node --version` printed `v22.22.1`. Every run used binaries from the snapshot's `node_modules/.bin`. The npm fallback was not needed.

**Full Vitest on the B snapshot (`3329f58e`):** `vitest --run --reporter=default --reporter=json`.
- 407/407 files passed. 5428 tests passed and 1 was skipped, out of 5429 tests.
- Duration 50.66 s.
- The only skip is the conditional one: `electron/media/audioPeaks.test.ts` › "decoding a real file produces peaks in range, with real signal in them". The staged ffmpeg under `crates/thirdparty` is untracked, so it is not in the archive.
- This matches the expected 5428 passed + 1 conditional ffmpeg skip, so 5429 tests in the current tree, including the new project-switch-during-IPC regression.

**Other checks on the B snapshot:**
- `tsc --noEmit` passes for `tsconfig.json`, `tsconfig.node.json` and `tsconfig.test.json` (exit 0 each).
- `vite build` passes, with three bundles built (renderer 18.63 s, main 8.76 s, preload 35 ms).
- `biome check .` reports 1235 files and 35 warnings with no errors, which is the existing baseline.
- `node scripts/i18n-check.mjs` passes: 14 locales match `en` across 7 namespaces, 1153 literal keys, and 15 supported locales.

**A snapshot (`5d0ccd3c`), focused run:**
- Files: `projectCommands`, `linuxNativeCaptureSession`, `pipeWireCursorRecordingSession`, `capturePolicyReceipt`, `linuxCaptureStartup`, `document-service`, and `src/lib/ai-edition/document`.
- Result: 19 files, 526/526 passed.
- `tsc` passes for `tsconfig.json` and `tsconfig.node.json`.

**Base snapshot (`e2f4a68d`):** `linuxCaptureStartup` and `projectCommands` passed 19/19, for comparison.

**Probes (scratch copy only, never in the checkout):**
- `electron/review8/probeA.test.ts` (2 tests), run on B and on base.
- `electron/review8/probeB.test.ts` (4 tests), run on B.
- All 6 pass, as observation harnesses that log their results. Their outputs are quoted above.

**Rust and native:** no Rust source or native helper changed in A or B. I did not rebuild them and claim no new Rust result. The staged helper hash `2bbb4efb…568081` and the earlier 131 passed / 1 ignored Rust result are evidence from slice 7 for unchanged source. They are not proof of the new TypeScript.

## Limits

- I did no physical, portal, live-Godot, desktop-gesture, accessibility, clock, pixel, audio, Windows or macOS acceptance testing. The computer provider has no screenshot, hotkey or focus control. I did not play back recovered media and did not check trailer validity.
- The ffmpeg-dependent test was skipped in the archive, as described above.
- The probes are fixtures. The L8-1 trigger used `chmod 000` on a temporary directory, as a stand-in for a real unmount or permissions blip.
- This review does not approve anything for production or release.
