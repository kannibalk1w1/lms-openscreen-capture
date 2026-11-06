# Claude post-restart review 23: follow-up to review 22

- **Reviewed commit:** `361fde514b1c39e3d32ba45e9b869823d028a69b` ("fix(lesson): clarify timing proof and record decoder provenance")
- **Parent:** `91b59b1d` (accepted in review 22)
- **Branch:** `lesson-capture/input-boundaries`
- **Date:** 6 November 2026
- **Reviewer:** Claude (Orca worker, task `task_7634603771ae`)
- **Checkout state:** `git status` was clean and HEAD was the exact SHA above. This file is the only one I wrote in the checkout.
- **Toolchain:** Node 22.22.1 and npm 10.9.4. The FFmpeg used was the shipped `electron/native/bin/linux-x64/ffmpeg`, SHA256 `393d9fa4…e4c814`.
- **Review 22 is preserved:** the committed `lesson-capture/CLAUDE_POST_RESTART_REVIEW_22.md` has SHA256 `66322a53…2e9de6`, which is identical to my original.

## Verdict

**Accepted. There are no High or Medium findings.**

Status of the review 22 findings:

- **Closed:** L24-1, L24-2, T24-1, N24-1 and N24-3.
- **Retained:** N24-2, the slower-host timeout. It is documented and fails closed.
- **The three named T22-1 limit gaps are closed.**

There are two new Lows:

- **L25-1:** a process deadline only ends when the last process holding the output pipe exits.
- **T25-1:** five new provenance guards are not pinned by tests.

Neither blocks the next roadmap slice, which is historical authored source identity.

## What this review does and does not prove

All evidence is Linux, synthetic and offscreen. Decoder provenance is a same-user tool identity. It is not a signed attestation.

The following were **not** tested and are **not** claimed:

- physical capture
- Windows or macOS
- VAAPI or other hardware encoding
- audio, or audio/video alignment
- a timed player
- historical authored source identity

## Commands run and results

I ran everything from a `git archive` snapshot of `361fde51` in my session scratchpad. It had `node_modules` linked one entry at a time and the untracked `electron/native/bin/linux-x64` linked in. Nothing ran inside the checkout itself.

1. **Focused shipped tests.** Command: `npx vitest run electron/lesson/encodedVideo.test.ts electron/lesson/encodedVideo.integration.test.ts electron/lesson/rangeMedia.test.ts`. Result: **112 passed, 0 failed, 0 skipped (3 files).** The integration file has 10 tests, all run with real FFmpeg. Each name now says whether the parser refuses the case (truncated, shortened, dimensions, zero-timing) or the real decoder does (corrupt-bitstream).
2. **Provenance probes (real child processes).** I pointed `OPENSCREEN_FFMPEG_PATH` at shell-script decoders. I used `vi.resetModules` for each case, because the resolver caches its first answer.
   - **`fake`** reports version `fake-1` and prints a valid listing. Result: **accepted.** The receipt shows `{sha256: <the script's hash>, version: "fake-1", trust: "same-user-local-executable"}`, and no tool path appears in the evidence. This is the documented same-user limit, now visible in the receipt.
   - **`link`**, a symlink to `fake`. Result: accepted. The path is resolved to the real file first, so the recorded hash is the target's.
   - **`selfmod`** appends to itself during the decode. Result: refused.
   - **`selfswap`** replaces itself with a copy via `cp` + `mv`, giving it a new inode. Result: refused.
   - **`bigver`**, version output over 16 KiB. Result: refused.
   - **`errver`**, writes to stderr during the version probe. Result: refused.
   - **`exitver`**, the version probe exits with code 3. Result: refused.
   - **`pathver`**, the version token is `/home/…`. Result: refused, so no path can leak through the version token.
   - **Real FFmpeg:** accepted. The version token is `n8.1.2-34-g9b6c8969e0-20260731` and the hash matches `sha256sum` of the shipped binary. The output carries `timingBasis: stored-mp4-stts-deltas`, `evidence: decoded-frame-existence-order-size` and `timestampBasis: ffmpeg-rounded-output-grid`.
   - **Committed `range-video-zero-last.mp4` with real FFmpeg:** refused.
3. **Deadline probes (real child processes).** These are the basis for L25-1.
   - **`slowver`**, which sleeps 5 s inside the version probe. Result: refused after **5008 ms**, against the 3 s deadline.
   - **`slow12`**, which runs `(sleep 12)`. Result: refused after **12014 ms**.
   - **`orphanver`**, which prints a valid version, exits 0 and leaves `sleep 20 &` running in the background. Result: refused after **20008 ms**.
4. **Fixture check.** I compared every leaf box of `range-video-zero-last.mp4` (899 bytes, `4adb8944…a16a`) with `range-video.mp4` (891 bytes, `74c200ee…738c`, unchanged).
   - **Only `stts` differs:** it is now 1×512 and 1×0 ticks.
   - `mdat` comes before `moov`, so the `stco` offset (48) is still valid.
5. **Independent mutations of the new provenance code.** I ran 11 mutants against the same 3 files. 6 were killed and 5 survived.
   - **Killed:**
     - the before/after decoder comparison
     - the version-required check
     - the version stdout cap
     - the version stderr cap
     - the trust label
     - the second hash pass
   - **Survived** (see T25-1):
     - the realpath step
     - the inode check while hashing the executable
     - the read-bytes-equal-size check
     - adding `/` to the allowed version-token characters
     - the 256 MiB executable size limit
6. **The worker's 53 mutation controls.** `mutation-results.json` lists 52 killed and 1 survived (the pre-open lstat, recorded as intentionally redundant). Both source files are marked as restored.
   - I checked all 53 logs. **None shows a transform, syntax or load failure.**
   - 50 kills fail on assertions.
   - 2 kills, `version-timeout` and `decode-timeout`, fail through Vitest's 15 s **test timeout**, because the mutated deadline never fires under fake timers. These are real behavioural kills, but they are not "assertion" kills as the follow-up and the document describe them. This is a wording nit only.
   - The 3 T22-1 mutants (kept spans, sources, total bytes) fail on assertions. The span test fails with "promise resolved instead of rejecting", the expected failure.
7. **Evidence checks.**
   - All 111 files in the slice24 `prior-hashes-complete-before.json` re-hash identically.
   - `runtime-results.json` reports `priorFilesUnchanged: 111` and the review 22 SHA above. It shows selected, single, short and fractional accepted, and baseline-zero-last refused.
   - The worker's `vitest-full.log` ends with 5711 tests passed in 427 files.

   I did not repeat the full suite or the TypeScript, lint and docs checks. My focused runs and probes covered every changed runtime path, so those checks would fill no gap.

## Status of the review 22 findings

### L24-1 — CLOSED

The code now labels each source of evidence:

- `samples.timingBasis: "stored-mp4-stts-deltas"`
- `decoded.evidence: "decoded-frame-existence-order-size"`
- `decoded.timestampBasis: "ffmpeg-rounded-output-grid"`

A JSDoc comment on `inspectDecodedFrames` and the validation document both say that exact timing comes only from the stored `stts` deltas. There is a real-FFmpeg test for the zero-last fixture: the decoded listing is accepted, but the parser and the full validator refuse it. This keeps the distinction pinned. My probe agrees.

### L24-2 — CLOSED, with an honest same-user scope

The receipt now records `decoded.decoder.{sha256, version, trust}`, and no path. The executable is resolved to its real path and opened with `O_NOFOLLOW`. It is hashed in bounded passes before the version probe and again after the decode, and both hashes are compared on SHA, dev, inode, size, mtime and ctime. My `fake`, `selfmod` and `selfswap` probes behave as documented.

The document says correctly that this is not a signed attestation, does not cover loaded libraries (the shipped binary loads `libav*.so` through `$ORIGIN`) or any interpreter or delegated tools, and does not stop swaps between observations. One example: renaming a parent directory and restoring it does not change the file's ctime, so the before/after comparison cannot see it. This stays within the stated same-user boundary.

### T24-1 — CLOSED for the guards review 22 named

I spot-checked the worker's logs. Each named guard now has a test that fails on assertion when that guard alone is removed:

- the `ctts` sibling, `mvex`, duplicate video, third track
- elst media_time and rate
- mdhd, tkhd and avc1 dimensions and duration
- zero sample size, stsc first chunk and description, overlapping chunks
- decoded pts and dts, single time-base line
- stdout and stderr caps, post-kill failure
- named inode, ctime, platform gate
- each FFmpeg hardening argument, through an exact argument-array assertion

The inode and ctime cases use controlled stat views, and the follow-up describes them honestly. The pre-open lstat stays as a documented redundant survivor. That is correct, because `O_NOFOLLOW` and fstat already enforce the same boundary.

### T22-1 — the three named limits are CLOSED

The tests pin these boundaries: 8 sources accepted, 9 refused; 32 kept spans accepted, 33 refused; exactly 8 GiB accepted, 8 GiB + 1 refused. The worker's mutants 51–53 are killed on assertions. These are accounting tests with test doubles, not large-file IO tests, and the document says so.

### N24-1 — CLOSED

The document now says the audio track's structure and data references are not inspected, that FFmpeg may skip that audio without a message, and that no audio flag is set.

### N24-3 — CLOSED

The integration test names now say whether the parser or the decoder refuses each case.

### N24-2 — RETAINED

The fail-closed timeout on slower hosts is still documented. No limit was relaxed.

## New findings

### L25-1 — Low, new: deadlines only end when the last process holding the pipes exits

**Where:** `runDecoder` in `electron/lesson/encodedVideo.ts`, the `child.once("close")` settlement. The same pattern was already in the slice24 decode, and I missed it in review 22.

**What happens:** At the deadline, `stop()` sends SIGKILL to the direct child only. The promise settles on `close`, and `close` waits until every holder of the stdout and stderr pipes has closed them.

**Reproduction (step 3):**

- A version probe that sleeps 5 s is refused after 5.0 s, against the 3 s deadline.
- A decoder that prints a valid version, exits 0 and leaves `sleep 20 &` running keeps validation pending for 20.0 s.
- With `sleep infinity &`, the validation, and so the whole materialization, would never settle.

The result is still a refusal, never a false acceptance. The shipped FFmpeg does not fork child processes, so this needs a same-user wrapper or a substitute tool.

**Why it matters:** The document's "3s kill deadline" and "30s kill deadline" are therefore deadlines on when the kill is sent. They are not bounds on how long validation takes.

**Fix:**

- Settle on the `exit` event together with the deadline, then destroy both pipes.
- Or spawn with `detached: true` and kill the whole process group with `process.kill(-pid, "SIGKILL")`.
- Or, at minimum, document that the deadline does not cover descendant processes.

### T25-1 — Low, new: five new provenance guards are not pinned by tests

Each of these survives the shipped tests when removed alone (step 5):

- `fs.realpath`. Without it, a symlinked tool path would fail closed under `O_NOFOLLOW`. The behaviour is still safe, but the documented canonical-hash behaviour is untested.
- The inode check inside `hashDecoderExecutable`. A swap during hashing is still caught later by the before/after comparison, because the before and after records include the inode.
- `bytes !== before.size`.
- The 256 MiB executable size limit.
- The version-token character class. If `/` were allowed, `pathver` would put a local path into a portable receipt. The "no absolute paths in receipts" claim depends on this regex, and no test pins it.

The fix is cheap: one test for a version token containing a path (most important), one for a symlinked tool path, one for an oversized executable, and one stat-view case for a changed size or inode while hashing.

### N25-1 — nit: two mutation kills are timeouts, not assertions

The follow-up and the validation document say "52 killed by failed test assertions". `version-timeout` and `decode-timeout` are actually killed by Vitest's 15 s test timeout. Those are valid behavioural kills, but they are not assertion kills. Suggested wording: "50 assertion kills + 2 test-timeout kills".

## What is still open

1. **Historical authored source identity and availability** is the next backend prerequisite, before any user-facing materialization or timed delivery. Source hashes from one run prove the sources were stable during that run only.
2. **Still open from earlier reviews:**
   - L23-1: fail-closed refusal at an exact frame boundary.
   - L23-W1: the macOS and Windows drains still write zero-duration final packets. This cannot cause a false acceptance, because the validator only runs on Linux.
   - N24-2: the slower-host timeout.
   - Audio and audio/video timing.
   - Decoder provenance stays a same-user identity.
3. **New Lows:** L25-1 and T25-1 can go with the next slice. Neither needs to block the coordinator's checkpoint or push.
