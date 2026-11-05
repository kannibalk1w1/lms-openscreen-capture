# Claude overnight review 2: stop drain, audio admission and input recovery

Reviewer: Claude (the only reviewer; no helper agents). Date: 5 November 2026, about 21:45 London.
Orca task `task_433fb7624afd`, dispatch `ctx_b61a09562b32`.

## Commits reviewed

| Role | SHA |
|---|---|
| Comparison base (review 1 head) | `ffc34ca434737a985b2cce8f8629e117e307a984` |
| **Reviewed head** (slice 2) | `249a09dad3f8905dc32390f4d9da1fc06be1f40d` ("fix: drain queued input and preserve explicit stop recovery evidence") |

HEAD was `249a09da` throughout. During the review the working tree gained uncommitted changes from the
parallel worker (the N2 cursor-timing slice: `main.rs`, `capture_clock.rs`, `events.rs`, the TS session and
accumulator, `LESSON_CAPTURE_INPUT_STOP.md`, `CLAUDE_OVERNIGHT_FOLLOWUP_1.md`, and an untracked
`LESSON_CAPTURE_CURSOR_TIMING.md`). **I did not review those changes.** Every source line here was read
with `git show 249a09da:<path>`, and every line number below refers to `249a09da`.

I read the full diff `ffc34ca4..249a09da` (18 files), together with `lesson-capture/CLAUDE_OVERNIGHT_REVIEW_1.md`
and `lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_1.md`. Both were committed in this SHA. As far as I can tell from
the committed text, review 1 is my original report and has not been changed. The follow-up correctly says it is
the implementer's disposition, not a Claude approval.

The only file I wrote is this one. I made no code edits, commits, pushes, branches or worktrees, and changed no
configuration or authentication.

## Verdict

The N1 fix is correct. `stop_clock` now closes audio admission the same way Pause does, and keeps the queued and
pending samples. The bounded Stop drain is a sound FIFO fence. The RawDevice switch does what it claims:
SYN_DROPPED no longer produces synthesized resync edges. Per-device continuity invalidation is keyed consistently,
and unplug ordering is correct.

I found **no High or Medium defect** in this slice. There is one new Low finding (R1, a misleading warning code
for kernel overflow and stream loss). The other items are doc-consistency notes, test-strength notes and known
limits. N2 is unchanged in this SHA, as the brief says: `main.rs:844` still gates the click cursor sample on the
dispatch-time `!paused` flag, using UTC `press_ms`.

## Checks that passed

### N1 audio stop (fixed)

- **Clock first, then gates:** `capture.rs:754-763` calls `clock.stop(at)` and then `ring.pause()` on every input.
  This is the same order as `pause()`, and the ordering argument in its comment (`capture.rs:617-628`) applies
  equally at stop.
- **No samples can slip in after the gate closes:** `AudioRing::pause` sets `accepting = false` under the same
  mutex that `push` checks (`shim.rs`, `RingInner`). Once `stop_clock` returns, no callback can append.
- **Nothing pre-stop is lost:** queued samples, `silence_owed` and the `dropped` tally all survive.
  `finish()` → `pump(flush=true)` drains them, along with each input's `pending`.
- **Repeat calls are safe:** `CaptureClock::stop` keeps the first stop (`capture_clock.rs:76-79`), and
  `pause()` on a closed ring does nothing. Calling stop twice is harmless, which the test does.
- **Every exit path is covered:** every loop `break` reaches `main.rs:1573`, so `stop_clock` runs before
  `drop(session)` (`main.rs:1647`) and before the tail encode. Stop while paused and stop before the first
  frame both still work.
- **The test is real:** `stop_closes_audio_admission_preserves_the_queued_tail_and_bounds_video`
  (`capture.rs:1330`) uses the real AAC mix and the software video encoder. It shows that exactly 4,800 queued
  stereo frames are kept and a further 1 s pushed after stop is rejected (via the `scratch` length and value
  checks). It also checks that `wall_clock_ms` = 100 and that the video duration is 133 ms, within the
  `+34` frame allowance.

### Stop drain

- **The fence is sound:** `input_drain.rs:15-43` sends `InputDrainComplete` on the shared channel only after
  the loop has exited. `receiver` is the only consumer and `run` holds a `Sender`, so `try_recv` cannot return
  Empty or Disconnected before it reaches the fence. Messages produced after the fence are left alone, which the
  test confirms.
- **Budgets are reported:** the message and time limits set `completed: false`, and `main.rs:1632-1634` emits
  `click-capture-drain-incomplete`.
- **One path for both cases:** normal dispatch and the drain both call `emit_pointer_evidence`
  (`main.rs:1668-1711`), so projection, exclusion and continuity are identical. Nothing synthetic is appended.
- **The `unwrap` is safe:** the one at `main.rs:1624` cannot panic. `input_evidence.begin()` (`main.rs:1156`)
  runs only after `capture` is `Some` and started. `capture` is never set back to `None`, and after
  `stop_clock` the `transition()` is `Some(stop)`.
- **The journal accepts it:** `input-drain` and `input-discontinuity` are emitted before the Stop boundary and
  `capture-stopped`, so the TS gate (`linuxNativeCaptureSession.ts:518-522`, `capturing && !stopped`) appends
  them.
- **The fixture adds up:** in `queued_native_edges_project_through_pause_stop_and_loss_without_synthetic_edges`
  (`main.rs:2414+`), the 19 accepted edges are 16 pairs in interval 0, plus a pre-pause press, plus the
  interval-1 press and its unmatched release. The 3 excluded edges are pre-start, at-pause and at-stop. The two
  cleared buttons are 0x110 in interval 0 and 0x111 in interval 1. All of this matches the doc text.

### RawDevice, SYN_DROPPED and continuity

- **No synthesized edges:** `evdev::raw_stream` performs no state sync, so no synthesized edges can appear.
  `RecoveryFilter` (`input.rs:203-219`) drops events from SYN_DROPPED up to and including the next SYN_REPORT,
  as the kernel and libevdev protocol requires. Its state lives outside the batch loop (`input.rs:150`), so a
  gap that spans `fetch_events` batches is handled.
- **Device keys match:** both `PointerButton.device` and `PointerDiscontinuity.device` use the same
  `path.display()` string (`input.rs:162-176, 186`). KWin uses `DRIVER` for both (`kwin_input.rs:57, 81`).
  So `interrupt_device` (`input_evidence.rs:84-100`) matches the right records.
- **Cleanup is complete:** `interrupt_device` clears the device from every historical and current interval
  and from `last_observed`, and leaves other devices alone. Because each device has a single FIFO reader, every
  earlier edge from that device has already been dispatched when the discontinuity arrives. Clearing history
  therefore cannot orphan an older in-flight edge.
- **Unplug and replug ordering:** the discontinuity is sent before `release()` (`input.rs:162-166`), so a
  replacement reader on the same path cannot be adopted before the reset is queued. A replug on a different
  `/dev/input/eventN` gets a different key, so it has no ordering dependency.

### Pause before the first frame (B1)

The unreachable start-while-paused branch is removed. `a_pause_before_the_first_frame_does_not_start_or_shorten_the_recording`
covers Pause → Frozen → Resume → first frame → interval 0 → 100 ms. The corrected sentence in
`LESSON_CAPTURE_INPUT_BOUNDARIES.md` is accurate.

### Review-1 doc items

The N3, N4, N5 and N6 notes in `LESSON_CAPTURE_INPUT_TIMING.md` and `LESSON_CAPTURE_INPUT_STOP.md` are accurate.

## Findings introduced by `249a09da`

### R1 — Low (evidence and health labelling): kernel overflow and KWin stream loss are reported as `click-capture-device-lost`

- `main.rs:1731-1734`: `emit_input_discontinuity` always emits `Warning { code: "click-capture-device-lost" }`,
  whatever the `reason`. The Electron side (`linuxNativeCaptureSession.ts:669-676`) turns any `click-capture-*`
  warning into the live `inputWarning` and a journal `input-warning` record.
- **Scenario:** a 1000 Hz mouse plus a briefly descheduled reader causes a SYN_DROPPED. The device keeps
  delivering. But the journal gets `input-warning {code: "click-capture-device-lost"}`, and the live health
  shows a loss. The message text does say `(kernel-overflow)`, and the `input-discontinuity` record has the
  correct `reason`. A consumer or UI keyed on the warning code would still treat a recoverable gap as an unplug.
- **A related side effect:** the warning is emitted even before `capture-started` (only the discontinuity record
  is gated, `main.rs:1722`). A reader overflow during the portal picker therefore sets the live input warning
  for a recording that has not started. The journal does not exist yet, so the journal is not affected.
- **Suggested fix:** use a code for each reason (`click-capture-kernel-overflow`, `click-capture-stream-lost`),
  or say in the docs that the code is a generic "continuity interrupted" signal.

### R2 — Info (doc consistency): `late` has a third meaning that the timing contract does not list

`main.rs:1706` sets `late: closing || paused || interval != current`. Every drained edge is therefore
`late: true`, even one from the current interval. `LESSON_CAPTURE_INPUT_STOP.md` states this, but the evidence
contract in `LESSON_CAPTURE_INPUT_TIMING.md` (around line 25) still describes `late` without the Stop-drain case.
A consumer that reads only the timing contract could take `late` to mean "projected into a closed interval". It
should be added there.

### R3 — Info (test strength)

- In the audio test, `assert_eq!(ring.dropped_samples(), 0)` (`capture.rs:1370`) cannot fail as written. The
  1 s pushed after stop would not overflow a 2 s ring even if it were admitted. The rejection is proven by the
  `scratch` assertions instead, so the claim stands, but this assertion is not evidence of it.
- The drain fixture builds `InputEvidence` by hand (`begin()`/`resume()`) and its own closure. The closure that
  actually runs at stop in `run()` (`main.rs:1577-1621`) is not executed by any test: its `InputStatus` arm, the
  `InputDrain` emission, and the warning for an incomplete drain. Only `InputDrain` serialization is covered,
  through the TS pass-through fixture. The claim that both paths share the emitted-edge function is true. The
  main-loop ordering (`stop_clock` before drain, before `drop(session)`) is inspected, not tested. The docs say
  "inspected" only for the buffered-pause path.

### R4 — Info (conservative behaviour, documented)

A kernel overflow clears **all** observed-down buttons for that device, including a button whose press packet
arrived complete before the gap. Its real release after the gap then becomes `unmatched-release`. This is the
conservative choice, and the docs say so ("A subsequent release with no observed post-gap press remains
unmatched").

## Known limits (not counted as findings; I agree they are stated)

- **The drain covers only the queue up to the fence:** an edge read before Stop but not yet sent, a kernel
  backlog, or a reader descheduled at Stop can still be missing, with no marker. Reader threads are not joined.
  A completed drain is not a physical-stop guarantee.
- **The 100 ms budget is checked between messages:** a blocking stdout write can outlast it. Non-input messages
  queued before Stop (frames, cursor) count towards the 65,536 limit and are discarded, as they were before.
- **Audio tail truncation:** the audio tail now ends at the callback-admission instant. Audio captured before
  Stop that is still inside a PipeWire quantum delivered after `stop_clock` is rejected. The track can therefore
  end up to about one quantum early (around 10-21 ms at common quanta, more at large ones), plus AAC frame
  padding. This is the same trade-off Pause already makes, it is in the opposite direction from the overrun
  review 1 found, and it is consistent with "callback admission boundary, not physical-sample synchronization".
  The video duration includes the last frame's display time (133 ms for a 100 ms take at 30 fps).
- **Discontinuity records have no media projection:** they carry `monotonicMs` (the reader instant for
  `device-lost` and `kernel-overflow`) and dispatch-time `clearedButtons`, but no `intervalId` or `mediaTimeMs`.
  Consumers must project them themselves. This is documented through `buttonStateObservation: "dispatch"`.
- **No hardware proof:** there is no physical or virtual device, portal, kernel overflow, unplug or replug, or
  A/V timing acceptance, as the docs record. Reader time is still not kernel time, as stated in review 1.

## Baseline items still open

- **N2 (from review 1):** still open in `249a09da`, and it is the declared next slice. The click sample still
  uses dispatch-time `paused` and UTC `press_ms` (`main.rs:844-855`), and Electron's `Date.now()` pause ranges.
- **Pre-existing `unwrap`:** the `unwrap` at `main.rs:1139` predates this slice and is not changed by it.

## What I ran (read-only)

| Check | How | Result |
|---|---|---|
| Rust helper | `git archive 249a09da electron/native/pipewire-capture` into my scratchpad, with the checkout's untracked `crates/thirdparty` symlinked in read-only, `CARGO_TARGET_DIR` in the scratchpad, `cargo test --offline --locked` | **124 passed, 0 failed, 1 ignored**. This matches the claim. |
| Focused Vitest | full `git archive 249a09da` snapshot, `node_modules` entries symlinked one at a time (excluding `.vite`), pinned Node v22.22.1 (`~/.local/share/lesson-capture-tools`) | My selection was `linuxNativeCaptureSession.test.ts`, the changed `.test.ts` files and `electron/native-bridge/cursor`: **7 files, 80 tests pass**. This is a different and larger selection than the implementer's "53 tests / 3 files", so it is not a like-for-like reproduction of that number, but it includes the new fixture. |
| TypeScript | the same snapshot: `tsc --noEmit` and `tsc -p tsconfig.test.json --noEmit` | both pass |
| Not rerun | Vite build, Biome (35 warnings), i18n/docs/diff checks, the native release build, the staged-helper hash `627338b6…bd4aae`, the startup probe, full Vitest (5,331, which is explicitly the previous milestone) | I relied on the implementer's record |

All build output and caches stayed in my scratchpad. I did not touch the checkout's build output or
`node_modules`.

## Recommended next actions

1. R1: use a warning code for each reason, or document the generic code. Consider not raising the live input
   warning before `capture-started`.
2. R2: add the Stop-drain case to the `late` definition in `LESSON_CAPTURE_INPUT_TIMING.md`.
3. R3: either drop the vacuous `dropped_samples` assertion or make it meaningful (push past capacity after stop).
   Consider extracting the `run()` stop closure into a function so the real stop path can be tested.
4. Continue with N2 as planned.
