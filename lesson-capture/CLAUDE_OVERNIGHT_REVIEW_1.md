# Claude overnight review 1: native input boundaries and reader projection

Reviewer: Claude (the only reviewer; no helper agents). Date: 5 November 2026, about 21:30 London.
Orca task `task_299584387700`, dispatch `ctx_2ee440de5f78`.

## Commits reviewed

| Role | SHA |
|---|---|
| Comparison base (private main) | `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` |
| Baseline native slice | `17dd44a8` ("journal native capture boundaries and button continuity") |
| Plan docs only | `5efc9742` |
| **Reviewed head** (reader projection) | `ffc34ca434737a985b2cce8f8629e117e307a984` |

During the review the checkout HEAD was `ffc34ca4` and the working tree was clean. I read all source with
`git show <sha>:<path>`. Line numbers below refer to `ffc34ca4` unless a line says otherwise.

Read: `AGENTS.md`, `lesson-capture/OVERNIGHT_PLAN.md`, `LESSON_CAPTURE_INPUT_BOUNDARIES.md`,
`LESSON_CAPTURE_INPUT_TIMING.md`, and the full diffs `fd2775e2..17dd44a8` and `17dd44a8..ffc34ca4`. In those diffs:
`capture_clock.rs`, `capture.rs`, `main.rs`, `input_evidence.rs`, `events.rs`, `input.rs`, `kwin_input.rs`,
`linuxNativeCaptureSession.ts`, `pipeWireCursorAccumulator.ts`, `src/native/captureEvents.ts` and the matching tests.

The only file I wrote is this one. I made no code edits, commits, pushes, branches or worktrees, and changed no config.

## Verdict

The reader-projection slice does what it says for the **video** clock. `CaptureClock` gives the same
compacted-time arithmetic as the old `epoch/paused_total/paused_at` code. Intervals are correctly
half-open (`[start, end)`), and stop is excluded. Historical projection, interval ownership and
continuity tracking for each interval are consistent with the encoder's own transitions. Interval
numbering stays in step between `CaptureClock` and `InputEvidence` on every path I traced: pause
before the portal or encoder opens, pause before the first frame, idempotent repeats, and stop while paused.

I found **no High or Medium correctness defect**. There is one new Low regression: at stop, the
audio is not frozen when the video clock is (N1). The rest are consistency or evidence-precision
issues, an unreachable code path that the baseline docs describe as real behaviour, and acceptance
limits that the current docs understate. The known open items (stop drain, device-loss/reset
continuity, evdev `Device` sync recovery edges) remain open and I have not counted them as new findings.

## Findings introduced by `ffc34ca4`

### N1 — Low (A/V tail regression): stop freezes the video clock but not the audio

- `main.rs:1580-1582` calls `capture.stop_clock(Instant::now())`. Then `main.rs:1594` runs `drop(session)`,
  which joins the PipeWire video thread, and only after that does `finish_capture` run.
- `capture.rs:754-756` `stop_clock` freezes `CaptureClock` only. Unlike `pause()` (`capture.rs:612-633`,
  `input.ring.pause()`), it does not close the audio rings.
- `_audio_sessions` (`main.rs:759`) stays alive until `run` returns. The audio threads therefore keep
  filling the rings through the session join and the tail encode. `finish()` then drains everything with
  `mix.pump(&mut muxer, true)` (`capture.rs:708`).
- **Scenario:** a recording with a microphone, stopped while active. Say the session join plus the tail
  frame encode takes 30 ms. The video now ends at the stop instant, but the AAC track has 30 ms more
  samples, all captured after the user pressed Stop. Before this slice the video tail write
  (`current_index()` at finish time) stretched by the same amount, so the two tracks ended together.
  Now the audio overruns the video, and that overrun is post-stop speech.
- **Why the tests miss it:** the `timeline-divergence` check (`main.rs` `finish_capture`) compares
  `duration_ms` with `wall_clock_ms`, and both are now frozen at stop. The new encoder test
  (`capture.rs` `reader_projection_uses_the_actual_encoder_epoch_and_pause_transitions`) has no
  audio sources.
- **Size:** usually a few ms to tens of ms, which is under the 100 ms skew warning. It is larger if
  the PipeWire join stalls. Stop while paused is not affected, because the rings are already paused.
- **Suggested fix:** in `stop_clock`, close the rings the same way pause does (or record a sample
  cutoff), and keep what they already hold.
- **Doc claim affected:** "finalization latency does not extend the encoded take"
  (`LESSON_CAPTURE_INPUT_TIMING.md`) is true for video only.

### N2 — Low (consistency): click-effect samples still use the dispatch-time pause state

- `main.rs:834-848`: the cursor `"click"` sample is still gated on `!paused` at dispatch and stamped with
  `press_ms` (UTC at the reader). The journal record in the same handler uses reader projection
  (`main.rs:849-880`).
- **Scenario A:** a left press is observed 5 ms before Pause but dequeued after the Pause message.
  The journal keeps it (`intervalId 0`, `late: true`), but no `click` cursor sample is emitted, so the
  rendered click bounce is missing for a click that is in the take.
- **Scenario B:** a press is observed during Pause and dequeued after Resume because the loop was busy.
  The journal correctly excludes it, but a `click` cursor sample is emitted with a press time inside
  the pause gap.
- **A third clock:** cursor pause ranges are built from Electron `Date.now()` when the command is
  written (`linuxNativeCaptureSession.ts:331-356`), not from the helper's encoder transition.
  The same click can therefore be inside or outside the take depending on which subsystem you ask.
- The gating itself is pre-existing, and the docs say cursor effects are unchanged. What this slice
  adds is the disagreement with the journal. Raise it before any consumer joins journal clicks with
  cursor effects.

### N3 — Low (evidence claim): the `out-of-order` path is effectively unreachable in production

- `input_evidence.rs:38-52` keys reordering by `(interval, device)`.
- Each evdev device has a single reader thread (`input.rs:140-182`) feeding one FIFO `mpsc` channel.
  KWin is a single source and never runs alongside evdev (`kwin_input.rs` header).
- So for the same device, `observed_at` cannot go backwards in delivery order. The only exception would
  be a reconnect on the same path while an old thread still has queued sends, which is still FIFO through
  the one channel. The unit test (`reordered_delivery_is_explicit...`) proves the state machine, not
  a production path.
- When the branch does fire, it returns early. `"out-of-order"` then hides whether the edge would
  have been `unmatched-release` or `repeated-press`.
- This is not harmful. But the docs ("An observation delivered out of order ... is marked") should
  say it is a defensive guard with no current production producer. Device-reset/sync work should not
  assume it covers evdev SYN_DROPPED recovery.

### N4 — Info (protocol precision): millisecond floors blur the half-open boundary

- Membership is decided on full `Instant` precision (`capture_clock.rs:96-113`). The protocol carries
  `as_millis()` floors (`main.rs:862`, boundary `main.rs:1619`).
- **Scenario:** an edge at 199.6 ms (included, interval 0) and Pause at 199.9 ms are both emitted with
  `monotonicMs`/`mediaTimeMs` = 199. An edge at Resume carries the same `mediaTimeMs` as the Pause
  boundary. A consumer that re-applies the documented half-open rule on the millisecond fields
  would wrongly drop the included edge. A consumer that sorts by `mediaTimeMs` alone cannot order
  the two intervals' edges.
- **Recommendation:** consumers must key on `intervalId` and break ties with (`mediaTimeMs`, `intervalId`,
  `sequence`). State this in `LESSON_CAPTURE_INPUT_TIMING.md`, which currently says only that the
  internal comparison keeps full precision.

### N5 — Info: one boundary record mixes two observation times

`CaptureBoundary.monotonicMs` now comes from the transition instant (`main.rs:1618`). `timestampMs`
(UTC) is still sampled at emit time (`main.rs:1617`). The gap is microseconds to milliseconds, but the
record does not say which field means what.

### N6 — Info (evidence): the Electron fixture is pass-through only

`linuxNativeCaptureSession.test.ts` ("retains late historical reader projections...") proves that the
journal preserves helper fields and arrival order and adds no edge. It does not exercise projection.
Its numbers are not self-consistent: the edge has `monotonicMs` 400 and `mediaTimeMs` 350, while the Pause
boundary has `monotonicMs` 1000 and `mediaTimeMs` 500, after `emitCaptureStarted(1050)`. That is fine for
a pass-through test. It should not be cited as projection evidence; only the Rust tests are.

## Baseline `17dd44a8` findings (still present at `ffc34ca4` unless marked)

### B1 — Low (doc and dead code): "Start while already paused emits the start and paused state" cannot happen

- `capture.rs:462-464`: `stage()` returns `Frozen` while paused, before `mark_started`, so
  `capture.started()` cannot become true while `paused`.
- The branch at `main.rs:1162-1170` (in 17dd44a8, the matching `if paused` after the start boundary)
  is therefore dead code.
- The actual behaviour is correct and better than the doc implies. A pause before the first frame
  leaves the recording unstarted. Resume then emits nothing, because the evidence has not started.
  The first frame after resume emits only `start`.
- But `LESSON_CAPTURE_INPUT_BOUNDARIES.md` ("Start while already paused emits the start and paused
  state") describes behaviour that cannot occur, and no test covers the real sequence:
  pause → encoder open → resume → first frame.

### B2 — fixed by `ffc34ca4`: dispatch-time media and cleared interval state

17dd44a8 stamped `mediaTimeMs` from `elapsed_active()` at dispatch and gated edges on the
current `paused` flag. A delayed pre-pause edge was therefore dropped, and an edge from during the
pause could become active. `close_interval` also cleared the set, so a delayed release could not
match its press. `ffc34ca4` fixes both, and I checked the fix in code and in the Rust tests.

### B3 — fixed incidentally: upstream pre-start pause shortened the timeline

Before `ffc34ca4`, `Capture::resume` added `paused_at.elapsed()` to `paused_total` even when no
epoch existed. A pause that arrived while the portal or encoder was opening (`main.rs:1041-1047`
applies it), followed by resume before the first frame, was then subtracted from all later elapsed
time. That is the code in `capture.rs` at `17dd44a8`/`fd2775e2`. The video PTS would lag real time by the
pre-start pause length, and could saturate at 0 at first. `CaptureClock::resume` ignores a pause
with no interval (`capture_clock.rs:60-74`). The clock-level test
`idempotent_controls_and_stop_while_paused_keep_the_encoder_clock_frozen` covers this. It is worth
recording as a behaviour change, because it alters encoded durations in that edge case.

### Known open (I agree they remain open)

- **Stop drain:** `Ok(Message::Stop) => break` (`main.rs:822`). Edges observed before the stop instant but still queued are lost with no marker.
- **Device-loss/reset continuity:** `PointerDeviceLost` is only a warning (`main.rs:896-901`). Held buttons on a lost device stay in `down[interval]`, and the next boundary's `buttonsDown` reports them as observed-down.
- **evdev sync:** `Device::fetch_events` (`input.rs:151`) can return the crate's synthesized SYN_DROPPED resync events. These get a fresh `observed_at` and are journaled as ordinary edges, with no recovery marker.

## Correctness checks that passed

- **Clock equivalence:** `elapsed_at(now)` = `media_start + (end or now) - start` over the last interval. This equals the old formula for every started path. `current_index`, the tail write and `wall_clock_ms` all share it.
- **Half-open boundaries:** the observation at Pause or Stop is excluded and the one at Resume is included. Pre-start and paused observations are excluded. Observations after stop are excluded even if they come from the last interval (`capture_clock.rs:97`). Precision below a millisecond is kept.
- **Interval ID alignment:** the clock pushes an interval only when it has started. `InputEvidence::resume` increments only when it has started. The two are created and advanced on the same main-loop arms (`main.rs:903-935`, `1154`).
- **Late historical continuity:** a press from interval 0 delivered after resume updates `down[0]`, not the resumed interval. A matching late release pairs in interval 0. A release observed after resume is `unmatched-release` in the new interval. Boundary snapshots are not rewritten.
- **`late` flag:** `late` = paused at dispatch, or the projected interval is not the current one (`main.rs:869`). This matches the documented meaning. A long-delayed edge in the same interval is `late: false`, but `dispatchDelayMs` shows the delay.
- **Journal:** `capture-boundary` and `pointer-button` are appended only between `capture-started` and `capture-stopped` (`linuxNativeCaptureSession.ts:518-525`). The helper emits `capture-started` before the start boundary and the stop boundary before `capture-stopped`, so no boundary is dropped by the TypeScript gate. There is no consumer yet that assumes media-monotonic order (I searched `src/` and `electron/`).
- **Schema compatibility:** the new TypeScript fields are optional, the schema stays at version 1, and older journals still type-check.

## Realistic acceptance limits (I am not claiming any of these)

1. **Reader time is not physical time.** `observed_at` is taken after `fetch_events()` returns (`input.rs:166`). Events in one batch, or a backlog after the reader thread was descheduled, compress to nearly the same instant. Kernel `input_event` timestamps are available but unused.
2. **The encoder clock is not the time of the content on screen.** Media 0 is the instant the first frame is *staged* on the main loop (`mark_started`). Each frame's PTS is the clock index at `advance()`, so the pixels shown at media time *t* were captured earlier, by PipeWire delivery plus loop latency (typically one to two frames, more under load). Input projected to *t* lines up with the encoder timeline, not necessarily with the frame showing that moment. "Shares one monotonic clock" is accurate; "frame-accurate" would not be, and the docs correctly avoid that claim.
3. **Pause, resume and stop instants are the helper's handling of the stdin command**, not the user's HUD click. They are separate from the Electron `Date.now()` cursor pause ranges (N2) and from Godot's recording-control clock.
4. **No real-hardware proof.** There is no desktop or portal recording, no counted physical or virtual input on this helper, no held-button or device-loss acceptance, no A/V/frame alignment check, and no sustained capture. Fixtures, the software-encoder unit test and the startup probe do not cover these. I ran no desktop, CDP or Xvfb session and claim no desktop or physical acceptance.

## What I ran (read-only)

| Check | How | Result |
|---|---|---|
| Rust helper | `cargo test --offline --locked --manifest-path electron/native/pipewire-capture/Cargo.toml`, with `CARGO_TARGET_DIR` in my scratchpad outside the checkout and `LD_LIBRARY_PATH=$PWD/crates/thirdparty/ffmpeg-linux64-lgpl-shared/lib`, HEAD `ffc34ca4` | **117 passed, 0 failed, 1 ignored**. This matches the claim. The ignored test needs live PipeWire. |
| Focused Vitest | snapshot from `git archive ffc34ca4` outside the checkout, with node_modules linked one entry at a time so caches were written in the snapshot; pinned Node v22.22.1 | `linuxNativeCaptureSession.test.ts` + `src/native`: **13 files, 270 tests pass** |
| Full Vitest | same snapshot, `--maxWorkers=4` | **398 files pass; 5,330 passed + 1 skipped (5,331)**. The doc says 5,331 pass. The skip is environment-dependent in my snapshot, most likely the `describe.runIf(staged)` real-file block in `electron/media/audioPeaks.test.ts`, because the untracked `crates/thirdparty` FFmpeg is not in a `git archive`. It is not a failure. |
| TypeScript | snapshot: `tsc --noEmit` and `tsc -p tsconfig.test.json --noEmit` | both pass with no output |
| Not rerun | helper release build, staged-binary SHA, native probe, Biome, i18n, Vite build | I did not reproduce these; I relied on the implementer's record |

The checkout's `git status` was clean before and after. I found no new files under its
`node_modules/.vite`. Build output went only to my scratchpad.

## Recommended next actions, in priority order

1. N1: close the audio rings (or record a sample cutoff) at `stop_clock`, and add an audio-bearing stop test that compares the audio sample count with the video duration.
2. Stop drain, device-loss and evdev sync (already queued). When doing them, add a recovery or synthetic marker rather than relying on N3's `out-of-order` guard.
3. Document N4's tie-break rule and correct B1's doc sentence. Add a test for pause → encoder open → resume → first frame.
4. Before any lesson consumer joins clicks with cursor effects, put the click-sample gating (N2) on the same projection.
