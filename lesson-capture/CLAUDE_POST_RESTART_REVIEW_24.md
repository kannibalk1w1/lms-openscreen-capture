# Claude post-restart review 24: slice25 process settlement and provenance follow-up

- **Reviewed commit:** `fd749b82dba3b72662ec64c1ab4235e02e6e5820` ("fix(lesson): bound decoder failure settlement independently of pipes")
- **Parent:** `f3311e8e` (the accepted review 23 checkpoint)
- **Branch:** `lesson-capture/input-boundaries`
- **Date:** 6 November 2026
- **Reviewer:** Claude (Orca worker, task `task_9a9e4ad4414b`)
- **Checkout state:** `git status` was clean and HEAD was the exact SHA above. This file is the only one I wrote in the checkout.
- **Toolchain:** Node 22.22.1 and npm 10.9.4. The FFmpeg used was the shipped binary, SHA256 `393d9fa4…e4c814`, version `n8.1.2-34-g9b6c8969e0-20260731`.
- **Earlier reports are preserved:** review 22 (`66322a53…`), review 23 (`09608096…`) and follow-up 22 (`e95509a8…`) are byte-identical to the accepted checkpoint `f3311e8e`. The commit leaves review 23 unchanged.

## Verdict

**Accepted. There are no High or Medium findings and nothing material blocks completion.**

- **L25-1 is CLOSED.** Process failures no longer wait for descendant processes holding the output pipes.
- **T25-1 is CLOSED.** The five provenance guards I listed in review 23 now each fail tests when removed.
- **One new nit:** N26-1.
- **Pause-ready:** the slice can be checkpointed and the work paused. Historical authored source identity is deferred correctly. It exists only as a plan, and the commit claims no source edit/revert proof or identity enforcement.

## What this review does and does not prove

All evidence is Linux, synthetic and offscreen.

- The deadlines bound how long process settlement takes, subject to event-loop scheduling. They do not cover the hashing of the executable or kernel filesystem IO beforehand.
- Production code signals only its own direct child. It does not terminate or sandbox wrapper descendants.
- Decoder provenance stays a same-user tool identity.

The following were **not** tested and are **not** claimed: audio, physical capture, Windows, macOS, hardware encoding, a timed player, and historical source identity.

## Commands run and results

I ran everything from a `git archive` snapshot of `fd749b82` in my session scratchpad. It had `node_modules` linked one entry at a time and the untracked `electron/native/bin/linux-x64` linked in. Nothing ran inside the checkout itself.

1. **Focused shipped tests.** Command: `npx vitest run electron/lesson/encodedVideo.test.ts electron/lesson/encodedVideo.process.test.ts electron/lesson/encodedVideo.integration.test.ts electron/lesson/rangeMedia.test.ts --reporter=verbose`. Result: **132 passed, 0 failed, 0 skipped (4 files).**
   - The 8 real-process cases in `encodedVideo.process.test.ts` all pass. Version-orphan settles in 3042 ms and version-slow in 3026 ms, both within the 4500 ms test budget. The version stdout, stderr and exit cases and the decode stdout and exit cases settle in 40–85 ms. The symlinked success wrapper passes in 75 ms.
2. **My own real-process probes.** I pointed `OPENSCREEN_FFMPEG_PATH` at shell-script wrappers, using `vi.resetModules` for each case.
   - **`slowver`**, which sleeps 5 s inside `-version`. Result: **refused in 3025 ms**. Before this fix it took 5008 ms.
   - **`orphanver`**, which prints a valid version, exits 0 and leaves `sleep 21.17 &` holding the pipes. Result: **refused in 3021 ms**. Before this fix it took 20008 ms.
   - **`decorphan`**, which passes the version probe, then during the decode prints a valid listing, exits 0 and leaves `sleep 41.19 &` holding the pipes. Result: **refused in 30111 ms**, the 30 s decode deadline. The success path really does wait for `close`.
   - **`delayed`**, whose direct child exits 0 at once while a child process writes the listing 1.07 s later. Result: **accepted in 1084 ms.** Success consumes the complete output after the direct child exits. This is within the same-user wrapper trust boundary.
   - **`bigok`**, a 980 KB listing (70,000 comment lines and then the rows). Result: **accepted.** The complete buffered output is consumed, and it is under the 1 MiB cap.
   - **`quietdesc`**, which leaves a child process (`sleep 9.23`) with its pipes redirected away and prints a valid listing. Result: **accepted in 12 ms.** That process keeps running. Production code does not hunt down descendants, as documented.
   - **`sigself`**, which kills itself with `kill -9 $$` during the decode. Result: **refused in 9 ms.**
   - **Real FFmpeg:** accepted in 42 ms, with the version token above.
3. **Cleanup of my own probe processes.** Before signalling anything, I checked each recorded PID's `/proc/<pid>/cmdline` against its unique sleep duration. All three had already exited, so I sent no signal. No `range-owned-process-*`, `range-decode-*` or `encoded-video-*` temporary folders remain in `/tmp`. I did not kill any user app, search for processes by pattern or purge any cache.
4. **My independent mutations.** I ran 14 mutants against the same 4 files and recorded how each one failed.
   - **13 killed.** Each failed 1–5 of the 132 tests, with **0 test-timeout kills**. None was a load or transform failure, which would have failed every test in a file. The killed mutants:
     - Q1: remove the `exit` failure handler.
     - Q2 and Q2b: remove the destroy of stdout or stderr.
     - Q3: resolve at `exit` instead of `close`.
     - Q4: delay the failure rejection until `close`.
     - Q5: remove the stdout stream-error handler.
     - Q6: remove the `errBytes` check at `close`.
     - Q8: remove the try/catch around the kill.
     - Q9: remove the kill.
     - The four guards that survived in review 23: realpath, read bytes equal to size, the version-token `/` exclusion and the 256 MiB executable limit.
   - **1 survived:** Q7, which removes `|| errBytes` from the `exit` handler. See N26-1.
5. **The worker's evidence, checked.**
   - **`final-controls/mutation-results.json`:** 12 cases, all killed, and `restored: true`.
   - **The 12 logs:** each shows 1–2 failing tests (in `-t`-filtered runs) and **0 test-timeout, transform or load failures**.
   - **`vitest-full.log`:** 5731 tests passed in 428 files.
   - **`focused-final.log`:** 159 tests passed in 6 files.
   - **Prior evidence:** all 111 files in the slice24 `prior-hashes-complete-before.json` re-hash identically.

   I did not rerun the full suite. Only `runDecoder` and the tests changed, and my focused runs, probes and mutations covered them.

## Code inspected

The change is in `runDecoder` in `electron/lesson/encodedVideo.ts`.

**Failure path.** One `stop()` handles every failure, and a `settled` flag makes it run only once. It is called for:

- the deadline
- the stdout or stderr cap
- an `error` on the child or on either pipe
- `exit` with a non-zero code, a null code (killed by a signal) or any stderr
- `close` with a non-zero code or any stderr

`stop()` clears the timer, sends SIGKILL to the direct child (inside a try/catch), destroys only our own two read ends and rejects with the fixed error. Data that arrives after settlement is ignored.

**Success path.** It resolves only at `close`, with code 0 and empty stderr. It is never resolved at `exit`, so buffered output cannot be cut short. The success test with the symlinked wrapper checks the canonical hash, the version token and that no path appears in the result. The existing real-FFmpeg integration file remains the actual decode proof, and the follow-up does not call the wrapper's listing a decode.

The fixture cleanup in `encodedVideo.process.test.ts` stays inside the test's own processes. It signals only the PID it recorded, and only after confirming that `/proc/<pid>/cmdline` contains a fresh `range-owned-<uuid>` marker. The descendant also lives at most 8 s.

## Findings

### L25-1 — CLOSED

Failures now settle by the deadline even when a descendant holds the pipes, as steps 1 and 2 show. Success still requires the complete `close` output. The limits are worded honestly: settlement is subject to scheduling, the preceding hash IO is not covered, and wrapper descendants are not terminated.

### T25-1 — CLOSED

All five guards that survived in review 23 are now killed by both my mutations and the worker's: canonical realpath, the version-token path exclusion, the executable size limit before any read, read bytes equal to size, and the named inode and size change during hashing. The pre-open media lstat is still documented as redundant, which is correct.

### N26-1 — nit, new: stderr arriving with a successful exit is only fast-failed at the deadline in tests

Mutant Q7 removes `|| errBytes` from the `exit` handler, and it survives. Without that check, a wrapper that writes a few bytes to stderr, exits 0 and leaves a descendant holding the pipes would be refused at the deadline (3 s or 30 s) instead of immediately. The result is still a refusal, never an acceptance, so this is about how fast it fails. The fix is one more real-process case: small stderr output, exit 0 and a descendant holding the pipes, settling within 2 s.

## Retained limits and status

- **Historical authored source identity:** deferred, plan only (`lesson-capture/AUTHORED_SOURCE_IDENTITY_PLAN.md`). No schema, enforcement or real source edit/revert proof is claimed. This is the next prerequisite before any user-facing materialization or timed delivery.
- **Still open:** N24-2 (fail-closed timeout on slower hosts), L23-1, L23-W1, audio, physical capture, other platforms, hardware encoding and the timed player.
- **Same-user wrapper descendants:** they may keep running (`quietdesc`) or supply output before `close` (`delayed`). This is inside the documented trust boundary.
- **Pause-ready:** no material finding needs fixing before the coordinator's checkpoint, push and pause.
