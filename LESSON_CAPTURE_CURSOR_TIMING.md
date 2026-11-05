# Native cursor and click timing — overnight slice 3

New Linux recording cursor samples now carry `mediaTimeMs`, `intervalId`, and
`mediaTimeObservation` from the same encoder clock used by input journals. A left
press uses its original reader observation and is marked `reader`; ordinary
cursor position samples project their current helper dispatch instant and are
marked `dispatch`. Position remains the latest known PipeWire cursor/frame state,
not a synchronous pointer observation at the physical edge.

Pre-start and paused recording samples are suppressed by the helper's exact
active-interval projection. A pre-Pause press dispatched during Pause or after
Resume still produces its click sample in the historical interval. A press
observed during Pause does not become a click when dispatched after Resume.
Bounded Stop draining also emits admitted late click samples. No click is created
for an excluded pre-start, paused or at/after-Stop button observation.

Electron keeps projected cursor samples on their native media clock. It never
UTC-rebases them or applies recording-control pause compaction a second time.
Native samples are ordered by media milliseconds, interval ID, then arrival;
this preserves ownership when timestamps floor to the same millisecond. Internal
clock/interval metadata is used during accumulation; the normal persisted cursor
sample format retains its existing media `timeMs` representation.

Older helpers and cursor-only sessions retain their UTC-relative path and
existing pause compaction. In a mixed fixture, legacy samples are compacted
separately and merged with native samples; a millisecond tie places legacy first,
without claiming the two clocks establish physical order. The combined sample
limit still applies across both paths. Projected payloads with invalid time or
interval are rejected rather than silently interpreted as UTC.

This addresses review 1 N2. It aligns the journal and click-effect **media clock**;
it does not establish physical edge time, compositor capture time, or frame/audio
synchronization. The helper still stages frame zero after capture delivery and
encoding preparation. Independent Godot clocks are not synchronized by this work.

## Validation — 5 November 2026

- Rust helper: **124 pass / 1 existing live-PipeWire test ignored**. The actual
  software-encoder/native-message fixture now also verifies two admitted left
  click samples exactly match their journal media times and intervals after Stop,
  with no samples for its excluded pre-start/paused/Stop presses. Pause/Resume/
  Stop cursor timing ownership is checked against the encoder's exact instants.
  Existing position/crop/sprite protocol and cursor-only cases remain covered.
- Focused Electron cursor/session/journal: **88 tests / 8 files pass**. New tests
  cover legacy/native mixing, extreme UTC rebase, pause-range bypass, stable
  interval/arrival ties, combined cap/reset, malformed metadata and real session
  persistence of late clicks/resumed motion without second compaction. Session
  payload fixtures prove pass-through; Rust proves actual clock projection.

- Full Vitest milestone: **5,336 tests / 398 files pass**, four workers,
  141.59 seconds. Docs, i18n and diff checks pass.
- Both TypeScript configurations, renderer/main/preload build and Biome (35
  existing warnings) pass. Linux helper release/probe passes, both copies match
  `02b168013c66576d0d1d0dc16d667ab21b429d7624e76f9b3dec84ae68eb34ca`.
  Probe reports PipeWire 1.6.10 metadata readiness only.

Artifacts: `../openscreen-evaluation/overnight-2026-11-06/slice-3-*`.

**Skipped:** actual portal/desktop recording, counted physical/virtual devices
on the rebuilt helper, pixel validation of native cursor playback/export, physical
timing/frame/audio alignment, sustained capture, Windows/macOS and remaining
manual checklist. Orca's provider lacks screenshots/hotkeys/focus. No physical or
desktop acceptance is implied by channel/software-encoder or Electron fixtures.

Next concrete item: the expanded product brief's privacy collection/exclusion
foundation before broader input or semantic capture; live explicit Godot clock
bridging follows under that privacy contract. Root owns the expanded roadmap and
architecture documents while they are being written; this slice does not stage
those files.
