# Claude overnight review 3: native cursor/click encoder timing (review 1 N2)

- **Reviewed SHA:** `43c2f91dbb9712845cc463858fd25f567894940f` ("fix: align native cursor and click samples with encoder intervals")
- **Compared with:** `249a09dad3f8905dc32390f4d9da1fc06be1f40d`
- **Root HEAD at review time:** `0593b2fe` (planning docs only; no code change against 43c2f91d).
- **Method:** I read every file at the immutable SHA with `git show`/`git archive`. The working tree has since gained uncommitted changes to `main.rs` and `capture.rs` (the privacy work). **I did not review those changes, and this report does not approve them.**
- **Reviewer:** Claude (Opus 5.5), read-only. This is the only file I wrote in the repo.
- **Date:** 5 November 2026

## Verdict

The N2 fix is right in its core design. Recording cursor samples now use the same `CaptureClock::project` instants as the input journal:

- Clicks are timed at the reader observation.
- Ordinary motion is timed at dispatch.
- Pre-start, paused and at-or-after-Stop observations are dropped by the half-open interval projection.
- Late historic clicks are still admitted during the Stop drain.
- Electron keeps native samples off the UTC rebase and the second pause compaction.

I found **one Medium regression** (cursor sprite assets can be lost) and three Low items: test-strength gaps and a misplaced doc comment. None of them blocks N2's timing claim. The Medium item should be fixed before anyone relies on native cursor sprites in exports.

## Findings

### M1 (Medium, regression): sprite assets for cursors first seen while Excluded can be lost

- **Where:** `electron/native/pipewire-capture/src/main.rs:1925` (the early `return` for `CursorTiming::Excluded`), with `main.rs:1506-1513` (`known_assets.insert`, then `pending_asset = Some(..)`) and `main.rs:1967` (`asset: pending_asset.take()`).
- **Cause:** a new sprite is marked known in `known_assets` straight away. Its bitmap only reaches Electron on the next sample that is actually emitted, through the single `pending_asset` slot. Recording samples are now suppressed while the clock is not running (pre-start, paused, after Stop), and `pending_asset` is simply overwritten when another new sprite arrives.
- **Scenario:** a teacher pauses the recording and moves across the desktop. The cursor changes from arrow to I-beam (asset B, new, pending), then to a resize cursor (asset C, new, overwrites B). After Resume the cursor returns to the I-beam. B is in `known_assets`, so `asset_is_new` is false, and the samples carry `assetId: B`. B's bitmap was never emitted, so `CursorRecordingData.assets` has no B. The same can happen between the stream reaching `streaming` and the first staged frame, including the crop wait (`MAX_CROP_WAIT`).
- **Why this is a regression:** at `249a09da`, recording-mode samples were emitted while paused, and before start once `size` was known (`content_rect` falls back to the stream size). `PipeWireCursorAccumulator.addSample` calls `rememberAsset` (`pipeWireCursorAccumulator.ts:193`) before compaction removes the paused or pre-start samples, so every sprite reached the asset table.
- **Impact:** editable-overlay playback and export get samples that point at a missing asset. I did not verify the renderer's fallback (default sprite or hidden cursor). Positions and timing are not affected.
- **Fix options, any one of these:**
  - Keep a queue or map of undelivered assets instead of one slot.
  - Only insert into `known_assets` when the asset is actually emitted.
  - Emit a standalone asset event while Excluded.
- **Test to add:** a sprite change A→B→C→B while Excluded, checking that every emitted `assetId` has a delivered asset.

### L1 (Low, test strength): the native fixture's two compared clicks are both media time 0 in interval 0, and it has no paused left press

- **Where:** `main.rs:2483`, `queued_native_edges_project_through_pause_stop_and_loss_without_synthetic_edges`, and the assertions added near `main.rs:2640-2670`.
- **What the fixture does:** it pauses immediately after start (nanosecond offsets). The two admitted clicks (`start+1ns` and `pause-1ns`) therefore both project to `mediaTimeMs: 0` and `intervalId: 0`, so `click == journal` compares 0 with 0. The only resumed-interval press is `0x111`, and the "paused observation" at `pause` is a **release**, not a left press.
- **Gaps that follow:**
  - No click sample in interval ≥1 with a non-zero media time is checked against the journal.
  - "Excludes paused clicks" is shown only by the direct `cursor_timing(&capture, pause, true)` assertion, not by a paused left press going through the drain.
  - Pre-start and Stop presses are covered.
- **Suggestion:** add a left press inside the resumed interval with millisecond spacing, and a left press observed mid-pause.

### L2 (Low, test fidelity): the fixture duplicates the production drain closure

- **Where:** `main.rs:2579ff` against production `main.rs:1582ff`.
- **What it means:** the test rebuilds the `PointerButton` → `emit_sample` + `emit_pointer_evidence` closure by hand instead of calling the code `run()` uses. If the production closure drifts (for example, it stops emitting clicks or passes `observed_at` wrongly), this test still passes.
- **Also untested:** the normal dispatch arm at `main.rs:841-858` (recording mode, projected or excluded) has no native-fixture test.
- **Suggestion:** move the drain handler into a named function that both `run()` and the test call.

### L3 (Nit): a doc comment now attaches to the wrong item

- **Where:** `main.rs:1885-1899`.
- **What happened:** the `/// Emits one cursor sample…` rustdoc block (including the `click` description) now sits above `enum CursorTiming` (`main.rs:1900`) instead of above `emit_sample`.
- **Fix:** move it down to `emit_sample`.

## Items checked with no defect found

- **Helper projection.** `cursor_timing` (`main.rs:1906`) returns `Legacy` only when `output_path` is `None`. In recording mode with no `Capture` yet, or with a projection outside an interval, it returns `Excluded`. `CaptureClock::project` uses half-open intervals: an observation exactly at Pause or Stop is excluded, one exactly at Resume belongs to the new interval. Clicks use the reader `observed_at`; motion uses `Instant::now()` at dispatch, labelled `"dispatch"`. Media milliseconds use `as_millis()` flooring, the same as `PointerButton` journal events (`main.rs:1723`).
- **Late clicks.** A pre-Pause press dispatched during Pause or after Resume projects into its historical interval. The Stop drain runs after `stop_clock`, and `project` still admits observations from before Stop. The drain's hard-coded `recording = true` is safe: `input_evidence.started` is only set when recording starts (`main.rs:~1160`, `begin()`).
- **Cursor-only legacy behaviour.** Cursor-only sessions keep the `!paused && streaming_since` guard and emit no media fields. `PipeWireCursorRecordingSession.stop()` still calls `toRecordingData()` with no pause ranges, so nothing changes there.
- **Electron accumulator** (`pipeWireCursorAccumulator.ts`):
  - Projected samples (`mediaTimeObservation` present) bypass the UTC origin and are skipped by `rebase` (they never go below zero).
  - Pause compaction is applied only to legacy samples.
  - Results are sorted by `timeMs`, then `intervalId` (legacy = −1, so it comes first on a tie), then arrival sequence.
  - Malformed projected metadata is rejected: bad observation value, non-finite or negative media time, non-safe-integer or negative interval. `rememberAsset` runs before that rejection, so an asset on a malformed sample still survives.
  - The cap applies across both paths: `shift()` removes the oldest *arrival*, not the oldest media time. That is fine for the bounded late-click window.
  - `reset` clears the sequence.
- **Mixed or old helpers.** An old helper (no media fields) goes entirely through the legacy path with the previous compaction. A new helper in recording mode never emits `Legacy` samples. Mixing the two in one session only happens in the Electron fixture, and the documentation correctly says the tie order there claims no physical order.
- **Second compaction risk.** I checked `handlers.ts` at the SHA. `compactPendingCursorTelemetryPauseRanges` and `shiftPendingCursorTelemetry` are called only on the Windows (`:3689-3690`) and macOS (`:3867-3868`) paths. The Linux native result is written straight from `result.cursor` (`:2902-2905`), so there is no extra shift or compaction.
- **Export cursor timing.** Linux recording samples now carry encoder media time (zero at the first staged frame) instead of UTC minus the `capture-started` timestamp, compacted by control-side pause ranges. That is the intended correction: the same clock as the video and the journal. The persisted sample shape (`timeMs`, `cx/cy`, `visible`, `interactionType`, `assetId`) is unchanged. I made no pixel-level export check.

## Evidence I reproduced

- **Rust helper tests.** I ran them on a `git archive` copy of exactly `43c2f91d` in the session scratchpad, with its own `CARGO_TARGET_DIR`, `--offline`. The untracked FFmpeg headers were provided by a read-only symlink to `crates/thirdparty/ffmpeg-linux64-lgpl-shared`. Result: **124 passed, 0 failed, 1 ignored** (1.74 s), matching the implementer's claim.
- **Staged helper hash.** `build/`, `target/release/` and `bin/linux-x64/openscreen-pipewire-helper` all hash to `02b168013c66576d0d1d0dc16d667ab21b429d7624e76f9b3dec84ae68eb34ca`, matching the claim. I did **not** rebuild the release binary, so I cannot independently confirm it was built from `43c2f91d` rather than the newer working tree.

## Claims I did not reproduce

- The focused Vitest run (88 tests / 8 files) and the full suite (5,336 / 398)
- Both TypeScript configurations, the Vite build, Biome (35 warnings), and the docs/i18n/diff checks
- The probe

I did not run these because they would need `node_modules`/Vite caches inside the repo, and this review was read-only. I read the new Electron tests and they match the behaviour described.

## Known limits from earlier reviews (not new findings, unchanged)

- Click sample position is the latest PipeWire cursor/frame state, not a synchronous pointer read at the physical edge.
- Reader observation is not kernel or compositor event time. There is no physical edge, frame or audio alignment, and frame zero is staged after capture delivery and encoder preparation.
- Independent Godot clocks are not synchronised.
- There is no portal or desktop recording run, no physical or virtual device count on the rebuilt helper, no pixel validation of native cursor playback or export, and no Windows/macOS coverage.

## Scope statement

- This approves only the N2 cursor-timing change at `43c2f91d`, subject to M1.
- It gives no independent approval of the later privacy work (uncommitted working-tree changes) or of `0593b2fe` planning docs.
- It is not portal, physical, pixel or production acceptance.
