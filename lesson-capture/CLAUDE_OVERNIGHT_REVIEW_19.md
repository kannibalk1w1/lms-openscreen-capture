# Claude overnight review 19 — slice22 bounded range-media materialization

- Reviewer: Claude (sole actual Claude reviewer, done by me with no delegation), 6 November 2026
- Reviewed: `f7b8ed4cff65f10041b96b945b1165ea6b167bce` ("feat: validate bounded lesson range media materialization")
- Baseline: `8e0316ab83fbbccb96f5787d47ad9a5b5c67cc43` (slice21, review 18)
- `main` is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` (unchanged). Branch `lesson-capture/input-boundaries`.
- Method: I read the code, tests and docs at the exact SHA (`git show`). Tests ran from an immutable `git archive` snapshot in `~/.cache/r19/snap`. Its `node_modules` entries are symlinked one by one, and `.vite` and `.vite-temp` are excluded. I used the pinned Node v22.22.1 and a private TMPDIR under `~/.cache/r19/tmp`. Nothing was built, edited or run inside the checkout. I ran read-only `ffprobe`/`ffmpeg` on the retained encoded artifact. No rebuild, and no `LD_LIBRARY_PATH`.
- The only checkout write is this file. An untracked `lesson-capture/OVERNIGHT_REPORT_2026-11-06.md` was already present. It is not mine and I left it alone.

## Verdict

**There is one new Medium (M22-1). It should be fixed, or explicitly disclosed, before the restart checkpoint.** There are also two Lows (T22-1, C22-1) and one baseline timing defect (B22-2, root cause pinned).

The slice22 scope is sound. The helper is backend-only and is not wired anywhere: `git grep` finds no caller of `materializeLessonRange`/`prepareLessonRangeMedia` outside `rangeMedia(.test).ts`. It adds no listener, config, channel, collection or native/Rust change. The stored range is re-planned and the result is compared byte-for-byte as JSON with the plan echo. Cuts are ephemeral trims on a `structuredClone`. Native inputs come from the shared `buildNativeClipList`, `buildLessonSceneDescription` and `outputFrameCount` readers. Nothing renders the full project to a temporary file.

Review 18 Lows T21-1 and T21-2, and nits N21-1 and N21-2, are accepted as addressed (see FOLLOWUP_18; I did not repeat the mutation proof for them).

## Findings

### M22-1 — Medium, new: the completion receipt can certify media shorter than the selected programme range

- `planLessonRange` builds `keptSpans` and `programme` from the raw `clip.sourceEndSec`.
- `buildNativeClipList` clamps each clip with `resolveClipSourceEndSec`, which is `min(clip.sourceEndSec, asset.durationSec)`. `outputFrameCount` then counts frames from that clamped list.
- `prepareLessonRangeMedia` never checks `expectedFrames` against the programme duration. The native stats only have to match the already-clamped `expectedFrames`.
- Result: when a clip's `sourceEndSec` is past `asset.durationSec`, the module writes a completion receipt. The receipt keeps the full `selection.programme` and says `basis: "selected-programme-seconds"`, but its `frames` cover only part of that range.

Repro (probe `electron/lesson/r19/probe2.test.ts` P5, in the snapshot only):
- Setup: asset `durationSec: 3`, one clip with source and timeline 0–5, ruler request 1–5.
- The plan has `programme 1→5` (4 s), `keptSpans [1,5]`, and `expectedFrames` is 60 (2 s).
- With a mock renderer that honestly reports 60 frames / 2.0 s, the result is `status: "materialized"`, receipt `frames: 60`, `basis: "selected-programme-seconds"`.

How it is reached:
- `applyProbedDuration` (`src/lib/ai-edition/document/timeline.ts`, the "user may trim the placeholder before metadata arrives" branch) replaces `asset.durationSec` with the real probed duration but leaves an already-set `clip.sourceEndSec` alone. A saved project can therefore hold a clip that ends past its media.
- Agent and MCP timeline edits can also write `sourceEndSec` freely.
- This is the same class as the worker's failed first attempt (3-second file, 5-second metadata). In that attempt the clamp happened inside native and the frame check caught it. Here the clamp happens in the shared reader *before* the frame check, so nothing catches it.

Fix (small, either one):
1. In `prepareLessonRangeMedia`, refuse unless `expectedFrames === max(1, ceil((programme.endSec - programme.startSec - 0.001) * 30))`. That is the same `framesDue` rule, applied to the programme seconds.
2. Or make `planLessonRange` refuse (`range-unavailable`) any clip whose `sourceEndSec` is past a known `asset.durationSec`.

Add a regression for this case. The planner-only inconsistency (a slice21 range reference whose programme runs past the media) is baseline; option 2 closes it too.

### T22-1 — Low, new: most refusal and limit guards are untested (15 of 17 guard mutations survive)

I swapped exact strings in the snapshot's `rangeMedia.ts` (one mutation at a time, file restored and `cmp`-verified afterwards) and reran `rangeMedia.test.ts`, `service.test.ts` and `fileCommands.test.ts` (37 tests).

Only two mutations were killed:
- removing the post-render project revalidation;
- removing the plan-echo comparison.

These all **survived**:
- the refusal checks for a visible webcam, `audioTracks`, `clickSound`, annotation `imagePath` and `webcamEffect`;
- the programme-duration limit (1/30–120 s);
- `keptSpans > 32`, `clips > 32` and `expectedFrames > 3600`;
- `sources > 8` and the 8 GiB total;
- the native duration-equality check and its `isFinite` check;
- the pre-render revalidation;
- the post-render cursor-sidecar check;
- the directory mode 0700, the output `chmod` 0600 and the receipt mode 0600;
- the "changed vs incomplete" error-code mapping. The `it.each` test asserts only `RangeMediaError` and never `code`.

The code itself behaves correctly in my probes:
- P3: 120 s and exactly 1/30 s are accepted; 120.001 s and 0.03 s are refused.
- P6: exactly 32 fragments are accepted; 33 are refused.
- P4: nine sources are refused with zero renders and no folder; a visible webcam is refused; a hidden webcam gives `webcamPath: ""`, so native has no dependency on it and it is accepted.

The gap is regression protection, plus the wording in `LESSON_CAPTURE_RANGE_MEDIA.md` that "unit tests cover … unsupported dependencies". Only the image background is pinned. Fix: one table test per refused dependency and limit edge, assert `error.code` per failure kind, and assert `stat.mode & 0o777` on the folder, output and receipt.

### C22-1 — Low, new: an undeclared AAC audio stream sets the "format duration 1.5" used as corroboration

The retained `range.mp4` (sha256 `48889834…633b86`, matching its receipt) has **two** streams:
- H.264 video: 45 frames;
- AAC LC audio at 48 kHz: 72 frames, `duration_ts 72000` = 1.500 s, `volumedetect` −91 dB, i.e. silence.

The source (`source-copy.mp4`, `slice-22-source-probe.json`) has only a video stream. The silent track appears because `buildNativeClipList` always passes `hasAudio: true`.

The worker's `encoded-probe.json` read only the video stream. The docs say "Output is H.264" and present "MP4 format duration is 1.5" as agreeing with native stats. That 1.5 s is the audio track's length, not independent evidence about the video. The receipt does not mention an audio stream at all.

Fix: documentation and receipt wording only. Say the output may carry an AAC track (synthesized silence when the source has none; otherwise embedded source audio with no timing acceptance). Do not cite format duration as corroboration of the video duration.

### B22-2 — baseline native muxer defect, not new: the last video sample has zero duration (the "open timing discrepancy")

Evidence from `ffprobe -v trace` on the retained output:
- `stts` has two entries, `sample_count=44, sample_duration=512` and then `sample_count=1, sample_duration=0` (timescale 15360).
- `elst` duration is 1467 ms (movie timescale 1000).
- So the track header and edit list cover 44 frames: `duration_ts 22528` = 1.466667 s, and avg rate 45/1.466667 = 675/22.
- The packet PTS values are an exact 1/30 grid from 0 to 1.466667. ffprobe *infers* the last packet's 1/30 duration for display; the file does not store it.
- `has_b_frames=0`, start 0. The frames themselves are correct: 45 decoded, and the worker's three RGB MAE samples are about 2.0 against a threshold of 8.

This is **pre-existing**. Earlier native editor exports in `openscreen-evaluation/` show the same N−1 pattern:

| File | Video stream duration | Frames | avg_frame_rate |
|---|---|---|---|
| `reopened-cli-export.mp4` | 4.966667 | 150 | 4500/149 |
| `edited-lesson-sample.mp4` | 4.966667 | 150 | 4500/149 |
| `godot-annotated.mp4` | 5.966667 | 180 | 5400/179 |
| `code-presentation/play-sharp.mp4` | 2.966667 | 90 | 2700/89 |

The cause is the native muxer writing the final sample with no duration. That fits packets written without `duration` set, or a missing final-sample duration at trailer time.

**Timing assessment: this does not block the *bounded experimental backend* completion or claim.** Why:
- The module's claim is limited to native-reported stats plus file hashes.
- The return value and receipt name the duration `nativeReportedDurationSec`.
- The receipt states `mediaDecodedByValidator:false` and `encodedTimingVerified:false`.
- The frame count and frame content are proven by real decoding.

It **is** a blocker for any timed-player, exact-encoded-duration or concatenation claim. A player that trusts the track or edit-list duration ends one frame (about 33 ms) early and may show the last frame for zero time. The docs correctly leave this open and do not normalize it away. Keep that wording, and add the pinned cause above so the next phase starts from it.

### Nits

- `PRODUCT_MAP.md` "Export manifest integrity: … verified output receipts" can be read as encoded verification. Prefer "native-stat/hash receipts".
- `LESSON_CAPTURE_RANGE_MEDIA.md` describes the fixture as "Requested ruler 0.5–4". The receipt's programme range is 0.5→2.0 (1.5 s). Spelling out both coordinate systems in one sentence would help a later integrator.

## Areas checked with no finding

- **Source authorization and scope.** The helper relies on a caller-supplied `readDocument`, `pickDirectory` and `render`, and the docs state that. A cancelled directory pick creates nothing. Sources are de-duplicated by `screenPath` and limited to 8 files and 8 GiB.
- **Proof that sources are unchanged.** I checked the before/after hashes, the size+mtime comparison, the regular-file `lstat` plus `O_NOFOLLOW|O_NONBLOCK` open with an `fstat` re-check (a FIFO swapped in during the race is refused), and the bounded 1 MiB chunks.
- **What this proof does not cover.** Native opens files by path separately. A swap-and-restore (with `utimes`) by a same-user process between the checks would go undetected. The docs disclose this correctly ("observations … not an immutable snapshot or OS sandbox"; "do not describe this as a complete source attestation"). These are operation-time hashes, not historical media identity, and that limitation must stay in place before any user integration.
- **Selected closure and cut math.** The mapping is correct for offset clips and gaps. P1: clip src 2–6 at timeline 1, plus clip src 10–14 at timeline 5, ruler 2–7 → windows [3,6] and [10,12], 150 frames, programme 5 s. P2: a gap between clips collapses consistently, programme 5 s = 150 frames. Cut-id generation avoids authored trim ids.
- **Paths, TOCTOU and privacy.** The output goes in a new folder `lesson-range-<uuid>` made with non-recursive `mkdir` (0700). Native writes the fixed name `range.mp4`. The output is hashed, then set to 0600. The receipt is written last with `wx`/0600 and holds no paths. Errors are fixed codes: an incomplete error carries the chosen directory, and raw OS/native text is never exposed. A parent that is a directory symlink is accepted, which is documented. Windows ACLs are unverified, which is also documented.
- **Native parameters.** H.264, 30 fps, 4 Mbit/s, long side at most 1280, even dimensions (P1 gives 1920×1080 → 1280×720). The 1e-6 duration equality matches `frames/30`, consistent with native reporting `frames/fps`.
- **i18n.** The `project-changed` text is neutral in all 15 locales.

## Test results (my own counts, snapshot of f7b8ed4c)

- **Full Vitest, run 1:** 425 files, **5608 passed, 1 skipped (5609)**, 52 s. The skipped test is `electron/media/audioPeaks.test.ts` "decoding a real file produces peaks in range, with real signal in them" (FFmpeg not on PATH in the snapshot environment).
- **Full Vitest, run 2 (JSON reporter):** 5607 passed, 1 skipped (same test), **1 failed**: `LeftPanel.copyMessage.test.tsx` "copies the full message through the preload bridge…" (button not found). That file is untouched since baseline and passed 3 out of 3 runs on its own, so this is load flakiness, not slice22.
- **Focused:** 7 files / 72 tests pass. The files are `rangeMedia`, `service`, `fileCommands`, `mediaSelection`, `outputFrameCount`, `LessonGuideDialog` and `ExportDialog.showInFolder`. This is a different set from the worker's 117/11.
- **Probes:** P1–P6 as above (scratch tests in the snapshot only, never in the checkout).
- **Mutations:** 17 total (2 killed, 15 survived) as listed in T22-1.
- **Not run:** I did not run tsc, Biome, the Vite build or i18n tooling, and I did not re-run native encoding. The worker's counts (5609/425 with 0 skipped, 117/11, 35 lint warnings, i18n 1253) are theirs and I have not reproduced them.
- **No acceptance claimed for:** real portal, input, Electron/UI, Windows/macOS, audio, or frame-accurate timing.

## Before the pause

1. **Required:** fix M22-1 with option 1 or 2 plus a regression test, or record it explicitly as a known limit in `LESSON_CAPTURE_RANGE_MEDIA.md` and the handoff.
2. **Recommended:** add the T22-1 table tests, and the C22-1 and B22-2 wording (AAC track; the `stts` last-sample-zero cause; baseline in earlier native exports).
3. Keep `encodedTimingVerified:false`, and keep the rule of no timed player and no next roadmap phase until resumption.
