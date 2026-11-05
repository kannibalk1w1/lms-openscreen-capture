> Historical baseline slice below. The feature branch is now authorized for private
> pushes by [the overnight plan](lesson-capture/OVERNIGHT_PLAN.md). Subsequent
> [reader-time projection](LESSON_CAPTURE_INPUT_TIMING.md) supersedes its timing
> limitations; its original validation evidence is retained unchanged.

# Native input capture boundaries — first local slice

The completed typing/association/export/review work is committed and merged into
private `main` at `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. Remote SHA and private
visibility were verified; repository Actions remains disabled. This newer native
work is local on `lesson-capture/input-boundaries` and has not been pushed.

## Implemented

The Linux PipeWire helper now emits `capture-boundary` records at capture start,
pause, resume and stop. The Electron native session appends them to the existing
`.events.ndjson` journal, after session-start and before session-end. They carry:

- helper monotonic milliseconds and the encoder's pause-compacted active media
  milliseconds **at dispatch**;
- `reason`: `start`, `pause`, `resume` or `stop`;
- `intervalId`, starting at zero and incrementing on recording resume;
- `buttonsDown`: device/code identities observed down when that interval closed;
- `buttonStateObservation: "dispatch"`, identifying the snapshot's meaning.

Each active pointer-button record now carries its interval ID. An up without an
observed down in that interval has `continuity: "unmatched-release"`; a repeated
down has `continuity: "repeated-press"`. Ordinary pairs omit that flag. Identity
is keyed by both device and button code. Interval closure clears the observed set.
No synthetic release, extra click or reconstructed physical edge is appended.

Examples:

- A button held at Pause is listed in the pause record. Its release during Pause
  remains excluded by the existing paused-input policy.
- If that release arrives after Resume, it belongs to the new interval and is
  explicitly unmatched; it is not paired with the old interval's press.
- A release after recording starts whose press occurred before recording is also
  marked unmatched. Stop lists any remaining observed downs.

Repeated pause/resume commands are idempotent in the capture loop. Boundary records
are suppressed until actual capture-started, and no recording journal is created
for picker input or cursor-only sessions. Start while already paused emits the
start and paused state. Stop is emitted on capture-loop exit before PipeWire joins
and the existing encoder finalization; it is not a trailer-success assertion.
A missing final boundary/session-end can still identify interrupted evidence.

The schema stays version 1 with additive fields/event vocabulary. Old helper
journals remain supported: pointer interval/continuity fields are optional in the
shared TypeScript contract. Existing packaging copies the journal unchanged.
The mouse driver scope, text capture, cursor effects, Godot calibration and video
rendering are unchanged. Restart the development app to load the new main process
and use the staged helper for subsequent native recordings.

## Important limits

This starts the native boundary/reconciliation stage; it does **not** finish the
original Claude review M2 or claim observation-time/frame-accurate synchronization.

Media timestamps still use `Capture::elapsed_active()` when the run loop handles
an event. Busy encoding can delay dispatch. The observed held-button set is a
snapshot of processed events, not a simultaneous physical device-state query.
Queued events near a boundary may still be excluded according to the current
pause state. Stop does not drain every queued input message. Device-loss recovery,
late-event reconciliation and historical observation-to-media projection remain
open. Consumers must preserve boundaries/interval IDs rather than joining a drag
across a pause or treating an unmatched release as a new click.

No native observation clock has been equated to the separate recording-control
clock used by Godot's explicit flag calibration. No physical-input count, real
recording pause alignment, desktop workflow, cross-platform support or crash
recovery claim is made for this slice.

## Validation — 5 November 2026

- Rust focused tracker: **5 tests pass**. Full Linux helper suite after protocol
  coverage: **111 pass, one existing ignored**. New tests cover ordinary pairs,
  held-at-pause/resumed unmatched up, pre-start missing down, repeated down,
  device/button independence and actual NDJSON boundary serialization with fixed
  compacted media times and observed open-button snapshots.
- Focused Electron journal/session tests: **39 tests / 2 files pass**. The new
  test rejects pre-recording boundary evidence, persists start/pause/resume/stop,
  preserves the unmatched release/interval, adds no synthetic pointer record,
  keeps unique sequence/IDs and ends with the normal session-end. This drives
  helper protocol fixtures through the real session/journal, not physical input.
- The Linux helper release build and build-script startup probe pass. Both staged
  helper copies match SHA-256
  `14a6db2a81d22c775602b8075cbe7f94f20076ef060393fb8a803210ede62136`.
  The binary contains `capture-boundary`, `unmatched-release` and the existing
  `capture-started` control string. The probe reports PipeWire 1.6.10 and metadata
  cursor support; it is not a portal recording or counted-input run. Final native
  source formatting and test-only imports followed the release compilation; the
  production behavior is unchanged by those edits, and final source passed Rust tests.
- Both TypeScript configurations, renderer/main/preload build and Biome pass
  (35 existing warnings). Native compilation has existing warnings. Full Vitest
  results are appended below.
- Orca computer capabilities were rechecked: screenshots, hotkeys and window focus
  remain unavailable. **Skipped:** real desktop/portal capture, counted physical or
  virtual-button exercise on the rebuilt helper, held-button boundary/device-loss
  acceptance, frame/audio alignment, sustained capture, Windows/macOS, and the
  remaining manual checklist. Installed applications and real Godot projects were
  not modified. No compositor/native video-export source changed.

Next concrete roadmap item: observation-time media projection across pause history
and counted start/pause/resume/stop input tests, retaining explicit uncertainty and
unmatched-edge evidence.

Final local full Vitest: **5,330 tests / 398 files pass**, four workers,
118.80 seconds. Both TypeScript configurations, Vite/main/preload, i18n, Biome,
docs and diff checks pass. The single ignored Rust test is
`shim::tests::negotiates_a_stream_against_a_local_pipewire_node`, requiring a live
PipeWire daemon and `OPENSCREEN_PIPEWIRE_TEST_NODE`. Build/test logs are retained
in `../openscreen-evaluation/input-boundaries/`.

Private main was reverified at fd2775e2 after starting this local slice. New native
source/docs are committed locally on `lesson-capture/input-boundaries`; they are not
part of the pushed snapshot.
