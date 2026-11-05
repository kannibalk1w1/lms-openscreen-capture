# Godot section association and source placement

This local slice provides **explicit, human-calibrated section onset placement**.
It does not synchronize every Godot edit to the encoder clock. Restart OpenScreen
so the new main process can record session and pause metadata.

1. Record a take in OpenScreen and drop a recording flag at the first edit of each
   section you intend to present. The flag is a human cue; shortcut latency and
   the control clock's start offset are not frame-accurate measurements.
2. Capture/import the unsaved script with the optional Godot adapter as before.
   It remains opt-in; this change does not install or modify any Godot project.
3. Import the recording into the project, keeping its `.flags.json` beside it.
   Open **Typing capture**, import or reopen the Godot take, and choose a
   **Recording anchor for section N**. Each choice names the recording, flag and
   source seconds. This explicitly pairs the section's **first edit** to that cue.
4. **Add code at recording flag** saves the take, anchor and code region in one
   undoable gesture. With a single matching source placement, the playhead can
   be elsewhere. Repeated footage requires the playhead inside the intended
   occurrence. Missing/trimmed-out footage reports an error; it never silently
   changes an associated section to manual placement.
5. Choose **Independent take · place at playhead** to remove an association and
   use the existing manual placement. Capture-pad takes continue to use this path.

The initial presentation duration is bounded by the carrier clip and the end of
its recording pause interval. Teaching pace remains a presentation choice, and
captured edits retain their original independent clock. No UTC matching, event
clock extrapolation, video stretching, or inferred alignment between sections is
performed. A new section after recording resume needs its own cue. Do not pair a
section spanning recording pauses: split the demonstration into separate typing
sections/takes. Godot currently starts new sections on idle/focus boundaries; it
does not automatically observe OpenScreen's pause button.

## Persistence and clock provenance

New `.flags.json` files include optional `recordingClock`: a random recording
session UUID, `recording-control-active-ms`, and ordered active intervals. Each
captured flag identifies its interval. Pauses close an interval; resume opens a
new interval at the same compacted media time. Stop freezes the interval end even
if the video is stored later; cancellation discards the metadata. A take without
flags still stores its clock. After 1,000 intervals, association metadata is omitted
while captured flags are retained. Import rejects malformed/oversized sidecars.

This reuses the existing monotonic RecordingFlags lifecycle on supported recording
backends. It is **distinct from** the Linux native `.events.ndjson` encoder journal
session/clock; no equivalence between those UUIDs or time bases is asserted.
Existing flags are human review cues whose zero begins at the capture-running
notification. Native input journals and Godot source edit evidence are unchanged.
A live clock bridge and measured encoder alignment remain future work.

Video import embeds the clock and flags in the asset. Section metadata embeds the
recording UUID, interval ID, cue ID and source milliseconds, marked
`manual-recording-flag`. Removing/renaming a flag later does not erase that saved
calibration. Old assets and editor-created flags lack recording interval evidence
and are not offered as automatic association choices. Reimport the original new
recording to load its sidecar; existing assets are not silently backfilled.

Placement uses the existing raw source/ruler convention. Splits use half-open
source ranges, assigning an anchor at the boundary to the right fragment once.
Source offsets follow clip reorder/trim. Repeated placements require explicit
occurrence selection through the playhead. Once inserted, ordinary annotation
source projection handles the code region. Later region resizing remains a user
edit; the initial pause bound is not a permanent resize constraint.

## Validation — 5 November 2026

- Initial association full Vitest: **5,284 tests / 392 files pass**, four workers, 117.66 seconds.
  Review-driven follow-up validation is recorded below.
  Focused iterations also passed: 76 tests / 4 files; 45 tests / 6 files;
  final association/clock recheck 14 tests / 2 files. These overlap the full run
  and are not extra tests to add to that total.
- Tests cover flag/control-clock session renewal, stop/finalization delay,
  cancellation (existing test), repeated pause/resume, paused stop, empty flags,
  the 1,000-interval association bound, legacy/malformed sidecars, actual asset
  import/disk reopen without its sidecar, and clock schema validation.
- Association tests cover unchanged Godot evidence, explicit onset independent
  of elapsed typing time/UTC, anchor removal, normalized JSON/project roundtrip,
  saved anchors surviving flag removal, resumed-side interval ownership,
  trim/split/repeated-footage/missing-session handling, and rejecting invalid
  or capture-pad associations.
- Real React dialog under jsdom: choose a saved Godot take, pair its section to
  a recorded flag and insert away from the playhead in one history save.
  Assert source 4s / lesson 12s with playhead 99s, duration bounded at the 5s
  pause boundary, retained anchor and unchanged source events. This is a
  renderer test, not physical Godot capture or Electron desktop interaction.
- Both TypeScript configurations, `npm run build-vite` (renderer/main/preload),
  i18n, docs and diff checks pass. Biome: zero errors, 35 existing warnings.
  No native capture/compositor source changed; those binaries were not rebuilt or retested here.
- Orca computer provider rechecked: screenshots, hotkeys and window focus are
  unavailable. No desktop pass claimed. Physical Godot/IME, actual OS recording
  flags/pause timing, encoder alignment, Windows/macOS runtime, native preview/
  export, GIF, webcam/audio, long recordings, full cut/speed/undo matrix and the
  remaining capture checklist are **skipped**. Existing presentation renderer
  evidence is in LESSON_CAPTURE_CODE_PRESENTATION.md; it was not rerun here.

This is partial local development coverage, not release acceptance. No new
checkout, addon installation into real projects, push or publication occurred.

Next concrete roadmap item: portable section JSON, resulting text/code and a
controlled playback-file recipe, with standalone re-import/precondition validation.
Broader live Godot/encoder synchronization remains separate acceptance work.

## Review-driven follow-up

Claude's completed [baseline review](lesson-capture/CLAUDE_REVIEW.md) was read and
incorporated; its scope explicitly excludes the new association edits. See
[per-finding disposition](lesson-capture/CLAUDE_REVIEW_FOLLOWUP.md). This is not
Claude approval of the current build.

The Godot addon now emits compact replacements and selection-only records and
deduplicates unchanged snapshots. Both key edges are retained. Import accepts old
snapshot journals and new compact records with replacement preconditions. Raw/
normalized takes permit 50,000 events within 8 MiB; the pad remains at 10,000.
The addon still enforces the full-buffer text bound before persisting a delta.

Code-panel token frames are reused across source-origin/duration/geometry changes,
with two cached variants per immutable live take. Playback stops after the chosen
section. A Node probe with 12,288 initial characters and 1,000 captured edits
measured **1,283.31 ms cold, 0.41 ms for 100 warm compilations**. Its panel JSON
is still **6,382,798 bytes**: serialization/IPC, cold compilation and native raster
performance remain open. This is not a native/desktop performance measurement.

Focused review follow-up: **88 tests / 6 files pass**, including compact record
preconditions, 4,000 edits plus 8,000 key edges and token-cache reuse/invalidation.
Actual Godot 4.7.1 headless ScriptEditor: replacement, multiline/tab/Unicode,
undo/redo, auto-pair/indent and script-switch stop reconstruct the final unsaved
buffer exactly. The small probe contains **14 journal records, 2,643 bytes,
6 compact edits, 1 selection-only record, 0 snapshots; 13 normalized events,
6 text edits and 2 key records**. Input was injected into the Godot viewport;
physical OS typing/IME remains skipped. The first attempt inherited an already
edited disposable fixture and failed its baseline check; resetting that separate
fixture to its declared starting text allowed the successful run. Prior evidence
and real Godot projects were untouched.

Evidence/probes: `../openscreen-evaluation/recording-association/`.

Final review-follow-up validation: **5,287 tests / 392 files pass**, four workers,
118.06 seconds. Both TS configurations, Vite/main/preload rebuild, Biome (35
existing warnings), i18n, docs and diff checks pass. A second full run was needed
because the review arrived after the first full run and introduced adapter/import/
cache changes. No native capture/compositor rebuild or export rerun was performed.

The real Godot viewport long-take regression captures **4,000 characters**, stays
active until explicitly stopped, and imports as `complete`: **8,044 records,
1,707,776 bytes, 41 observed text edits, 4,000 key presses and 4,000 releases**.
Its final buffer reconstructs exactly. Godot coalesces text signals between the
injected batches; this does not claim 4,000 distinct native text-edit events.
The separate synthetic importer regression covers 4,000 distinct edits. All
physical OS input, IME and desktop timing exclusions above remain in effect.

Review report SHA-256 at incorporation:
`008cb0c8d91675821b74e7da5d7a1e00263a4fa1faad5bfd8b028161748e6414`.

## Subsequent frontend-test fixes

Claude's [frontend report](lesson-capture/CLAUDE_FRONTEND_TEST.md) found that UI
trim ranges were not checked even though clip source-bound trims were checked.
Placement now applies `trimAppliesToClip`, rejects onsets inside a UI trim, bounds
initial duration at the next trim and retains repeated-clip selection. Identical
recording cue choices across duplicate asset imports are deduplicated. See
[fix disposition](lesson-capture/CLAUDE_FRONTEND_FOLLOWUP.md) and final bundle-build
validation in LESSON_CAPTURE_BUNDLES.md. Real desktop acceptance remains open.
