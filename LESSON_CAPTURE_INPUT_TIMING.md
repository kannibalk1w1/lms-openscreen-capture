# Native reader-time projection — overnight slice 1

The Linux encoder and input journal now share one monotonic `CaptureClock`.
Its epoch is the first staged video frame, and it retains the exact pause/resume
instants used by the encoder. Each reader message retains its `Instant` through
the queue; projection uses that observation, rather than the current pause state
or the time the main loop eventually handles it. No independent clock or UTC
conversion is used. Active intervals are half-open: Pause and Stop are excluded;
Resume belongs to the new active interval. Pre-start and paused observations
remain excluded.

The driver observation is when the helper reads the event, **not** the kernel
physical edge time, compositor generation time or synchronized pointer position.
Protocol timestamps are millisecond values, while internal boundary comparison
retains full `Instant` precision. Membership is already decided by the helper: do
not reapply half-open exclusion using floored millisecond timestamps. Consumers
must retain `intervalId`; order media evidence with `(mediaTimeMs, intervalId,
sequence)` to disambiguate pause/resume ties. Boundary `timestampMs` is UTC at
emission; `monotonicMs` is the encoder transition instant. Those are distinct
observations, not a cross-clock calibration. The existing latest-frame position is still
explicitly labeled and may be newer than a delayed button observation.

## Evidence contract

Pointer records add `mediaTimeObservation: "reader"`, `dispatchDelayMs`, and
`late`. Older helper records lack these fields and used dispatch-time media
projection. A delayed event from an already closed interval keeps that interval
and its original projected media time, even if delivered during Pause or after
Resume. Journal sequence/IDs still describe append order; media times need not be
monotonically increasing in that order. Consumers must sort/project intentionally,
not overwrite source timestamps to make them increasing.

Continuity state is retained separately for historical intervals. A delayed
release can match an observed press in its original interval without joining a
drag into the resumed interval. Boundaries retain immutable dispatch snapshots;
late input does not rewrite them. A defensive guard marks an observation delivered out of order for the
same device/interval `continuity: "out-of-order"` and does not mutate
that device's already processed state. Current one-reader-per-device FIFO drivers
do not produce this reordering; the guard does not detect kernel overflow. No inferred press/release is appended.
The schema remains version 1 with additive optional TypeScript fields.

Capture-started and boundary monotonic/media timestamps now come from the exact
encoder transition. Stop freezes the clock before session joining/finalization,
so finalization latency does not extend the encoded take. The subsequent [stop and recovery slice](LESSON_CAPTURE_INPUT_STOP.md) adds
bounded queue draining, closes audio admission, and records device/kernel gaps. Existing drivers, global scope and physical/tap limits remain unchanged.

## Validation — 5 November 2026

- Rust helper: **117 passed, 1 existing ignored**. New tests cover historical
  projection across multiple pauses, exact boundary ownership, submillisecond
  comparison, idempotent controls, paused stop, late historical continuity and
  out-of-order delivery. A real software-encoder test verifies projection against
  its actual staged-frame epoch, pause/resume instants and frozen stop clock.
  The ignored test still needs a live PipeWire test node.
- Focused Electron session/journal: **40 tests / 2 files pass**. New fixture
  coverage verifies late historical pairs retain timestamps, interval identity,
  metadata and arrival sequence with no extra edge, followed by session-end.
- Full Vitest: **5,331 tests / 398 files pass**, four workers, 131.61 seconds.
- Renderer/main/preload Vite build, docs, i18n and diff checks pass.
- Both TypeScript configurations pass. Biome passes with **35 existing warnings**.
- Linux helper release build, both staged copies and startup probe pass. SHA-256:
  `c53a926d8d576e2d42ead2f43a5e4bca0dc55eeb59cf1db0e0cf70354831afd1`.
  PipeWire 1.6.10 and metadata cursor readiness are reported. This is a startup
  probe, not a portal recording. A later test-only addition and comment correction
  do not change the compiled production behavior.
- Orca computer capabilities rechecked: screenshot, hotkey and window focus
  support remain false. **Skipped:** desktop/portal recording, counted physical
  or virtual input on this helper, held-button/device-loss acceptance, physical
  event timing/frame/audio alignment, sustained capture, Windows/macOS and the
  remaining manual checklist. Fixture/software encoding results do not cover
  those paths. No real lesson project was modified.

Logs and capability receipt: `../openscreen-evaluation/overnight-2026-11-06/`,
files prefixed `slice-1-`, plus `computer-capabilities.json`.

Next concrete item: bounded stop-queue drain, explicit device-loss continuity,
and avoiding synthetic evdev recovery edges; then live Godot clock bridging.
Claude reviewed baseline `17dd44a8` and head `ffc34ca4`: [actual report](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_1.md).
No High/Medium defect was found; its Low audio-tail finding and evidence notes
are addressed in [the follow-up](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_1.md).
This is partial code/test review, not desktop or production acceptance.
