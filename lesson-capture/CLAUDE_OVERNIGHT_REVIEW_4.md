# Claude overnight review 4: cursor asset delivery and review 2/3 fixes

- **Reviewed SHA:** `a58f56d9ab2e70d92f95b6d88d86f926dd7cd8f7` ("fix: retain current cursor assets until successful delivery")
- **Compared with:** `43c2f91dbb9712845cc463858fd25f567894940f`
- **Intervening commits:** `0593b2fe` and `14945cdd` are planning documents only. They change no code under `electron/` or `src/`.
- **Working tree at review time:** clean at `a58f56d9`. No later privacy commit or uncommitted privacy change was present, so I had nothing newer to inspect. **This report does not review or approve any privacy implementation.**
- **Method:** I read the code diff and the full `main.rs`, `capture.rs`, `shim.rs`, `input.rs` and `kwin_input.rs` at the exact SHA with `git show`. I also read the Electron consumers at the same SHA: `linuxNativeCaptureSession.ts` and `pipeWireCursorAccumulator.ts`. I ran the Rust tests on a `git archive` copy in the session scratchpad.
- **Reviewer:** Claude (Opus 5.5), read-only. This is the only file I wrote in the repository. Reviews 1 to 3 were not modified.
- **Date:** 5 November 2026

## Verdict

**Review 3's Medium M1 is resolved at `a58f56d9`, as far as code review can show.**

- A bitmap is now marked delivered only after the `CursorSample` that carries it has been written successfully.
- Only the current undelivered bitmap is kept.
- In the excluded A→B→C→B sequence, nothing is emitted until capture resumes. The first emitted B sample then carries B's bitmap.
- An unused excluded C is not delivered in the plain case. There is one narrow exception, described in I1.

Review 3's L1, L2 and L3 and review 2's R1, R2 and R3 are fixed as described.

I found **no Critical, High or Medium issue**. The remaining items are:

- one Low test gap
- one Nit: a misplaced doc comment, the same kind of problem L3 fixed
- two Info notes about existing "latest state" semantics and the timing of the pre-start policy

This is a code and automated-test review only. It is **not** portal, physical-device, pixel or visual acceptance of native cursor playback or export.

## M1 verification (review 3 Medium)

**Code:** `CursorAssets` is at `main.rs:1913-1929`. The delivery logic in `emit_sample` is at `main.rs:1989-2027`.

- **`observe` (`:1921`).** If the ID is already in `delivered`, it clears `pending` and returns `false`. This is the "returning to a delivered shape clears the obsolete pending bitmap" behaviour. Otherwise it replaces `pending` with the new bitmap and returns `true`. Retention is bounded: one pending bitmap, plus a set of IDs for delivered bitmaps only. Excluded shape history does not make it grow.
- **`emit_sample`.** It returns early for `Excluded`, a missing cursor or missing content (`:1970-1975`). That happens before `pending` is read, so an excluded sample consumes nothing.
  - The pending bitmap is attached only when its ID equals `state.asset_id` (`:1991`). A stale pending bitmap can therefore never ride on a sample for a different shape.
  - `delivered.insert` and `pending = None` run only when `emitter.emit(..)` returns `Ok` (`:2022-2027`).
  - `Emitter::emit` (`events.rs:254`) returns `Ok` without writing only for `Debug` events, never for `CursorSample`. So "Ok" really means the line was written and flushed.
- **Retry.** If the write fails, `pending` is kept and the next emitted sample for that shape attaches it again. In practice a failed stdout write means the parent pipe is gone, so this path is mostly theoretical. No test exercises it (see L-T1).
- **Bitmap encode failure (`:1519-1528`).** The cursor keeps its previous `asset_id` and `pending` is untouched, so references stay consistent.
- **Context lifetimes.** `CursorAssets` lives for one helper `run()`. On the Electron side, `PipeWireCursorAccumulator.reset` runs in `start()` before `spawn` (`linuxNativeCaptureSession.ts:154`, `pipeWireCursorRecordingSession.ts:98`). The helper's delivered set and Electron's asset table therefore cover the same process lifetime. Any stream retry inside the helper keeps both in step.
- **Electron side.** `addSample` calls `rememberAsset` before it rejects malformed projected samples (`pipeWireCursorAccumulator.ts:193` against `:209-218`). The sample cap only shifts samples, never assets. So every bitmap the helper marks delivered is in `CursorRecordingData.assets`, including one carried by a sample Electron later drops.
- **Old and new helpers and samples.**
  - An old helper sends no media fields, so the legacy path is used. Its bitmaps are delivered on every emitted sample, as before.
  - A new helper whose samples carry a malformed `mediaTimeObservation`, `mediaTimeMs` or `intervalId` has the sample rejected but the asset kept.
  - None of this changed in this slice.
- **Test:** `excluded_sprite_changes_only_deliver_the_current_asset_when_capture_resumes` (`main.rs:2122`) runs this sequence:
  - A is delivered through a Legacy sample.
  - B, C and B are each observed and then emitted as `Excluded`. Each observation returns `true`, and none is recorded as delivered.
  - Then come a Projected B sample and a Legacy B sample.

  It asserts exactly 3 records, that every `assetId` resolves to an asset already delivered, and that the delivered set is exactly {A, B}. So C is not leaked.
- **Mutation check (scratch copy only, restored and compared byte-for-byte against the SHA).** I put back the old behaviour, marking a bitmap delivered as soon as it is observed. The new test then **fails** at `main.rs:2156`, so the test does catch the M1 regression.

**Conclusion: M1 resolved.**

## Other review 2/3 items

- **L1 (fixture strength): resolved.** The drain fixture now includes:
  - a left press in the middle of the Pause (`pause + (resume-pause)/2`, `main.rs:2704-2706`), which is excluded: 21 edges accepted, 4 excluded
  - a left press and release at `resume+10ms/11ms`
  - an `InputStatus` message

  It checks 3 drained clicks against their journal media times and intervals. The last click is in interval 1 at a media time of at least 10 ms, and an `input-capture-status` record is present. A separate normal-dispatch pair through the same handler (`closing=false`, `resume+20ms/21ms`) asserts `late == false` for a click in interval 1 at at least 20 ms, and that the click sample's media time equals the edge's.
- **L2 (duplicated closure): resolved.** `emit_input_message` (`main.rs:1630`) is now called by:
  - normal recording dispatch (`:843-860`)
  - the Stop drain (`:1584-1594`)
  - the fixture

  The cursor-only path keeps its separate legacy guard (`:861-874`). Before this change, cursor-only mode called `emit_pointer_evidence` with `capture == None`, which returned `Some(false)` without emitting. Dropping that call changes nothing. In normal dispatch, `InputStatus` and `PointerDiscontinuity` still have their own arms (`:877-899`). Those arms are equivalent to the shared handler's.
- **L3 (rustdoc): resolved.** The `/// Emits one cursor sample…` block is back above `emit_sample` (`main.rs:1948`). A new misplacement appeared nearby (see N1).
- **R1 (warning labels and pre-start policy): resolved.**
  - `kernel-overflow` now maps to `click-capture-kernel-overflow` and `stream-lost` to `click-capture-stream-lost`. Anything else maps to `click-capture-device-lost` (`main.rs:1777-1781`).
  - The reason strings match their producers: `input.rs:164`, `input.rs:176` and `kwin_input.rs:59`.
  - Electron matches on the `startsWith("click-capture-")` prefix (`linuxNativeCaptureSession.ts:664`), so the new codes still set `inputWarning` and reach the journal.
  - Before Start, a gap emits only a Debug `input-gap-before-start`. Held-button state is still cleared, and there is no `InputDiscontinuity` or latched warning.
  - Current availability still comes from `InputStatus`. A lost device calls `release()`, then `report_status`, and a lost KWin stream sends `unavailable`.
  - Tested by `recording_gaps_have_reason_specific_codes_and_picker_gaps_do_not_latch_health`.
- **R2 (meaning of a late Stop edge): resolved.** `LESSON_CAPTURE_INPUT_TIMING.md` now says `late` is true for every admitted Stop-drain edge. That matches `late: closing || …` (`main.rs:1730`).
- **R3 (audio Stop test): resolved.** After Stop the test pushes 3 s of audio into a 2 s `AudioRing` (`capture.rs:1331-1335`, `:1362`). `AudioRing::push` (`shim.rs:543ff`) would trim the excess and count it as dropped if admission were still open. So `dropped_samples() == 0` now really tests that admission closed. The checks on the queued pre-Stop tail and on AAC/video duration are still there.

## Findings

### L-T1 (Low, test gap): no test covers "returning to a delivered shape clears pending" or the retry after a failed emit

- **Where:** `main.rs:1922-1924` (`self.pending = None` in `observe`) and `main.rs:2022` (`if emitted.is_ok()`).
- **Mutation evidence:** in a scratch copy I deleted `self.pending = None;` from `observe`. All 126 tests still pass.
- **Impact:** small. The ID filter in `emit_sample` (`:1991`) already stops a stale pending bitmap from being attached to the wrong shape, so removing the clear would only keep one extra bitmap in memory. Even so, the documented guarantee has no test.
- **Concrete scenario that would go unnoticed:**
  1. A is delivered.
  2. Excluded B is observed, so B is pending.
  3. A is observed again. The pending B should be dropped.
  4. A later B observation then re-sends B.

  If a refactor removed the clear and also loosened the filter, a sample for A could carry B's bitmap. Nothing would catch it.
- **Also untested:** an emit that fails and is retried (the pending bitmap must survive a failed write).
- **Suggestion:** add an A→(excluded B)→A test asserting `pending.is_none()`, and a test using a writer that fails once.

### N1 (Nit): a test doc comment now attaches to the wrong test

- **Where:** `main.rs:2119-2122`.
- **What happened:** the new test was inserted between `/// A full-screen capture crops nothing, so the pointer keeps the numbers the portal gave…` and the test it describes, `a_full_screen_capture_reports_stream_coordinates`. The comment now documents `excluded_sprite_changes_only_deliver_the_current_asset_when_capture_resumes`.
- **Fix:** move the two comment lines down to the full-screen test.

### I1 (Info, existing semantics): a late historical click can deliver and reference a shape first seen while excluded

- **Where:** normal dispatch through `emit_input_message` (`main.rs:1650-1657`), with `cursor_timing` projecting the reader `observed_at`.
- **Scenario:**
  1. A left press is observed just before Pause.
  2. Its dispatch is delayed into the paused period. Meanwhile the cursor has changed to C, which is excluded and pending.
  3. The press still projects into its historical interval, so its click sample is emitted with `assetId: C` and carries C's bitmap.
- **Result:** the reference resolves, so this is not an M1-type defect. But in this case "unused excluded C is not exported" does not hold, and the click effect at a pre-Pause time uses a sprite seen during the pause.
- **Status:** this is the existing documented limit that a click's position and sprite are the latest state, not a synchronous read at the edge. It needs a dispatch delay that spans a sprite change. No action is needed for this slice. If it matters, record the sprite per edge.

### I2 (Info): the pre-start gap policy is keyed to dispatch-time `started`, not to the gap's `observed_at`

- **Where:** `main.rs:1769`.
- **What happens:** a gap observed shortly before the first staged frame, but dispatched after `begin()`, is treated as an in-take gap and does emit the discontinuity and warning.
- **Why it does not matter much:** the error is conservative (it warns too much, never too little), so I list it as information only. A gap observed after Start always warns.

## Evidence reproduced by me

- **Rust helper tests.**
  - **Setup:** a `git archive` copy of exactly `a58f56d9` (the `electron/native/pipewire-capture` tree only) in the session scratchpad, with its own `CARGO_TARGET_DIR` and `--offline`. `FFMPEG_DIR` pointed read-only at the checkout's untracked `crates/thirdparty/ffmpeg-linux64-lgpl-shared`.
  - **Result:** **126 passed, 0 failed, 1 ignored** (1.65 s). This matches the claim.
- **Mutation checks** (scratch copy only, restored and confirmed byte-identical to the SHA):
  - With the old observe-equals-delivered behaviour, the new M1 test fails.
  - With the clear of pending removed, all tests still pass (L-T1).
- **Staged helper hashes.** `build/openscreen-pipewire-helper`, `target/release/openscreen-pipewire-helper` and `electron/native/bin/linux-x64/openscreen-pipewire-helper` all have SHA-256 `245453509678c6c07c81fc84d7877abe818a16e25da0151c1f677c5364218f8a`, matching the claim. I did not rebuild the release binary, so I cannot independently confirm it was built from `a58f56d9`. The working tree was clean at that SHA when I looked.

## Claims not reproduced

- The 88 focused Vitest tests across 8 files
- Both TypeScript configurations
- The native release build and startup probe
- Biome (35 warnings)
- The docs, i18n and diff checks

I did not run these, because they would need `node_modules` and caches, and this review was read-only with no installs. No TypeScript production code changed between `43c2f91d` and `a58f56d9`: the only code changes are in `main.rs` and `capture.rs`. That is consistent with the statement that the renderer is unchanged from the `43c2f91d` build and was not rebuilt. The full 5,336-test milestone belongs to the earlier slice, and the implementer correctly does not claim to have rerun it.

## Documentation notes

- `LESSON_CAPTURE_CURSOR_RECOVERY.md` describes the fix accurately, apart from the narrow I1 exception to "an excluded unused C is not exported".
- Reviews 2 and 3 were committed in this SHA. I did not modify them and did not compare them against any earlier uncommitted copy.

## Scope statement

- This rereview approves the code at `a58f56d9` for the M1 cursor-asset delivery fix and the review 2/3 follow-ups listed above. The only open items are the Low test gap and the Nit.
- It gives no approval of any privacy implementation.
- It is not portal, physical-device, pixel or visual acceptance of native cursor sprites in preview or export.
- It is not frame or audio timing acceptance, and not Windows/macOS or production acceptance.
