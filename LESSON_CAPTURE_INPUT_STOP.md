# Native Stop drain and input recovery — overnight slice 2

The helper freezes its encoder clock at loop exit and closes audio-ring admission
before draining input or joining PipeWire. Queued pre-stop audio, pending mix
samples, drop evidence and owed silence survive; callbacks after `stop_clock`
returns cannot append new samples. As with Pause, ring gates are closed under
their individual mutexes after the video clock transition. This is a callback
admission boundary, not a new claim of physical-sample or frame synchronization.

## Bounded queue drain

Stop sends a FIFO fence to the shared channel and handles its already queued
prefix through the same reader-time projection and continuity functions used by
normal dispatch. Before-start, paused and at/after-Stop button observations remain
excluded. Admitted pre-Stop edges are marked `late: true`, even in the current
interval. There are no synthetic releases. Non-input control/frame messages in
the drained prefix do not restart or extend recording.

The drain has a 65,536-message / 100 ms budget. It appends `input-drain` with the
Stop monotonic instant, `scope: "queued-before-fence"`, completion and processed/
accepted/excluded counters, before the final Stop boundary and session-end.
A limit produces an explicit warning retained in the journal and live health.
Counters describe projected edges handed to the emitter; journal I/O failure is
still reported separately by the existing journal health.

A completed drain covers **only the queued prefix before its fence**, not every
reader or kernel backlog. Reader threads are not synchronously joined. An event
observed before Stop but not yet enqueued before the fence can remain absent.
The 100 ms check runs between messages; an individual blocking stdout write can
outlast it. These limits are explicit and are not complete physical-stop proof.

## Source discontinuity without reconstructed edges

Device loss now identifies the device and its reader observation instant. An
`input-discontinuity` record reports `device-lost`, `stream-lost`, or
`kernel-overflow` and the device's observed-down buttons cleared from each
historical interval. It does not append an up, down or click. Other devices keep
their continuity. A subsequent release with no observed post-gap press remains
unmatched. Snapshots and cleared lists describe processed state at dispatch, not
simultaneous physical device state. Recovery metadata encountered in the queued
Stop prefix can describe a source change during shutdown.

The evdev path now uses `RawDevice`, avoiding the synchronized wrapper's invented
SYN_DROPPED recovery edges. Kernel overflow marks a gap and ignores records through
the next SYN_REPORT; subsequent raw edges resume with explicit missing continuity.
Unplug notification is enqueued before releasing that path for a replacement
reader, so the reset precedes replacement evidence. KWin remains exclusive of
evdev and still requires recording restart after disconnect/invalid sequence.

Pre-start Pause no longer subtracts its duration from a later recording; that
upstream bug was fixed by the first slice's clock refactor. Pause before the first
staged frame keeps capture unstarted; Resume then its first frame produces only
Start, with interval zero. The unreachable start-while-paused branch is removed.

## Validation — 5 November 2026

- Rust helper: **124 pass / 1 existing live-PipeWire test ignored**. New tests
  exercise bounded FIFO drain and incomplete-budget reporting, actual encoder
  projection of 19 accepted edges spanning all eight buttons and two active
  intervals, three excluded pre-start/paused/Stop edges, device loss with two
  cleared historical/current downs, and unmatched post-loss release. This is a
  constructed native-message/channel/software-encoder fixture, not physical input
  or a portal session. The normal and drain paths share the emitted-edge function.
- The audio-bearing software-encoder test retains exactly 4,800 pre-stop stereo
  frames, rejects a further second of callback samples, pumps real AAC mixing,
  and verifies its 100 ms audio count against the 100 ms frozen clock and video
  duration within one 30 fps frame. No hardware/audio alignment is claimed.
- Pre-first-frame Pause/Resume test verifies Frozen/unstarted state and a complete
  100 ms post-start interval; the main-loop buffered-pause path was inspected.
- Electron journal/session/cursor focused tests: **53 tests / 3 files pass**.
  New fixture verifies gap/drain/warning preservation, live warning and no invented
  release. These tests pass through native payloads; Rust tests prove projection.
- Both TypeScript configs, renderer/main/preload build, Biome (35 existing
  warnings), docs/i18n and diff checks pass.
- Linux release helper build and startup probe pass; both staged copies hash-match
  `627338b6380d3f842204f8c3337fb8d94e9342ad007551038c331a2de3bd4aae`.
  The probe reports PipeWire 1.6.10 metadata readiness, not recording acceptance.
- Full Vitest milestone remains slice 1: **5,331 pass / 398 files**, before this
  change. It is not claimed as a rerun of the new slice; focused coverage is above.

Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-2-*`.

**Skipped:** real portal/desktop recording, counted physical or virtual device
exercise of this helper, actual kernel-overflow/unplug/replug, A/V frame timing,
sustained/device matrix, Windows/macOS and remaining manual checklist. The Orca
provider still lacks screenshot/hotkey/focus support. All original evidence is
retained and real lesson projects remain untouched.

Next concrete item: make click-effect cursor samples use the same reader-time
projection and prevent Electron UTC pause ranges from retiming those samples;
then live explicit Godot/recording clock bridging with measured bounds.
