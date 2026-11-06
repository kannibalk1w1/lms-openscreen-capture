# Claude post-restart review 21 — slice23 / B22-2 (Linux final video sample duration)

- Reviewed commit: `2c29d268703374f332faa4ea58d2b08e709ef085` (parent `3eec7805`), branch checkout HEAD, working tree clean at start.
- Reviewer: Claude (Orca task `task_8e2d997fcb9a`), read-only. I made no edits, commits, resets, stashes, checkouts or pushes, and killed no processes. This report is the only file I wrote in the checkout.
- Evidence I inspected: `../openscreen-evaluation/overnight-2026-11-06/slice-23-post-restart-20261106T112509Z/` (97 files) and the slice22 baseline `../openscreen-evaluation/overnight-2026-11-06/lesson-range-native-fixture-verified/`.

## Verdict

**Accepted for its stated bounded scope**: Linux native export, software libopenh264, integer output fps, synthetic/offscreen fixtures. I found no High or Medium findings. B22-2 is closed on Linux software encode. This is not acceptance for VAAPI, Windows, macOS, audio alignment, physical capture or a timed player. Runtime receipts correctly still say `encodedTimingVerified:false` / `mediaDecodedByValidator:false` (`electron/lesson/rangeMedia.ts:240-241`, not changed by this commit).

## The change

`crates/compositor/src/pipeline_linux.rs:548-561` adds a new `rescale_video_packet`. If a packet's duration is 0, it sets the duration to 1 codec tick and then calls `av_packet_rescale_ts`. `Muxer::drain` (`:566-582`) now calls it. This is the only drain used by Linux video export: the encode worker loop (`:677-697`, including the final `flush` + `drain`) and the VAAPI path both go through `Muxer::drain`. AAC muxing is a separate path and is unchanged.

Assumptions I checked in the code:
- **Codec time base is one frame.** Software: `try_open` sets `time_base = 1/fps` and `framerate = fps/1` (`:276-277`). VAAPI: the same values (`:1428-1429`). The stream time base is seeded from the codec (`:1026`), then the MP4 muxer changes it to 1/15360.
- **Frame PTS go up by exactly 1 per frame.** `encoded_pts` starts at 0 and increments once per submitted frame on every path (`:814-815`, `:1150-1151`, `:1174-1175`, and the tail at `:1251`). There are no gaps, so a 1-tick fallback is exactly one frame. Middle sample durations in `stts` still come from DTS differences, so the fallback can only change the last sample.
- **Known durations are kept.** The fallback only applies when duration is `== 0`. Mutation M2 (always overwrite) is caught.
- **Order matters.** The fallback runs before the rescale, so 1 tick becomes 512 at 1/15360. Mutation M3 (fallback after rescale, giving 1 stream tick) is caught.
- **B-frames / reordering (VAAPI).** Each packet is still one frame, so 1 tick is right even when DTS is reordered. This holds in theory only: VAAPI returns early on this host, and I did not check whether `h264_vaapi` already fills in packet durations.

## Independent checks I ran

1. **ffprobe n9.0.2 on all 4 retained new MP4s** (selected range, single-30, short-60, fractional-source-30). For each I checked stream time_base/duration_ts/nb_frames, the PTS/DTS/duration of every video packet, and a full decode count with `-count_frames`:
   - selected: 45 packets, all duration 512, no DTS gaps, duration_ts 23040 = 1.500000 s, 45 decoded frames, 640×360
   - single-30: 1 packet × 512, 0.033333 s, 1 frame
   - short-60: 2 packets × 256, 0.033333 s, 2 frames
   - fractional-30: 45 × 512, 1.5 s, 45 frames
   
   All match `validation-summary.json` and the doc table.
2. **My own MP4 box parser** (independent of the worker's validator), reading `mvhd`/`mdhd`/`elst`/`stts`/`stsz`:
   - New selected range: `stts [(45,512)]`, `mdhd 23040`, video `elst` 1500 ms.
   - Slice22 baseline range.mp4 (sha `48889834…`, unchanged from the pre-run inventory): `stts [(44,512),(1,0)]`, `mdhd 22528`, `elst` 1467 ms.
   - So the doc's description of the cause and the fix is exact.
3. **Pixel and bitstream preservation.** Decoded RGB24 of baseline vs new: whole-stream sha256 is `4586e126…` for both, and a per-frame framemd5 diff over 45/45 frames is identical. I also compared stream-copy packet payload hashes: video packets are byte-identical, and the AAC packets are byte-identical as well. Only the container timing changed.
4. **Focused Rust tests** on a `git archive 2c29d268` snapshot (vendored `crates/thirdparty` symlinked, `CARGO_TARGET_DIR` in scratchpad, `--offline --locked`, `LD_LIBRARY_PATH=<thirdparty>/lib`, `OPENSCREEN_FONTS_DIR=public/fonts`): `sample_duration_tests` **4/4 pass** (533 filtered out).
5. **Mutation testing**: 6 mutants, each applied to the snapshot alone, then the source was restored and `cmp`-verified against the commit blob. **All 6 killed**:
   - M1 remove fallback → 4/4 fail
   - M2 overwrite known durations → 1 fail (the rational unit test)
   - M3 fallback after rescale → 4 fail
   - M4 2-tick fallback → 4 fail
   - M5 `drain` bypasses the helper → 3 fail (the three MP4 tests; the unit test passes as expected)
   - M6 `< 0` guard → 4 fail
6. **Addon identity.** The staged `electron/native/bin/linux-x64/compositor_view.node` hash today is `5d16ea98…`, which matches the doc and `rebuilt-addon-identity.json`. The committed `pipeline_linux.rs` sha256 `694a6d0e…` matches the restored-source hash in `baseline-doctest-control.json`.
7. **Doctest baseline claim.** The retained logs show 14/14 generated-FFmpeg doctest failures at both baseline and fix. Statically, the commit adds no ``` fences (count 0), so the doctest set cannot change. I agree this is baseline, not a regression. Retained unit/integration totals: 536 + 19 + 3 + 3 + 1 = 562 pass, 1 ignored (`rust-compositor-fonts.log`). I did not rerun them, because there was no gap that needed it.

I did not rerun: the full Rust suite, full Vitest, the addon build, the PipeWire helper suite, or lint. I relied on the worker's retained logs for these; they are internally consistent.

## Findings

No High or Medium findings.

- **L23-W1 (Low, open gap, not a regression): macOS and Windows drains have the same zero-duration pattern.**
  - `pipeline_macos.rs:1488` (`drain_encoder`) and `pipeline_windows.rs:3186` still call `av_packet_rescale_ts` directly, with no duration fallback.
  - macOS lists `libopenh264` as its software last resort (`pipeline_macos.rs:803`). It will probably produce the same N−1 video stream duration whenever it is used.
  - VideoToolbox and Media Foundation may or may not fill in durations; I have not verified either.
  - The doc does say "Windows/macOS code is unchanged and untested", so this is not a false claim. It should still be tracked before any cross-platform timed-player work.
- **N23-1 (nit): the MP4 regression tests build a `Muxer` by hand.** The `EncodeWorker`/`render_*` export entry point is not unit-tested. The tests do use the production `VideoEncoder::try_open` and `Muxer::drain`, and the rebuilt-addon DocumentService run covers the real worker path end to end. Acceptable.
- **N23-2 (nit, existing audio behaviour): the silent AAC track ends about 1 ms before the video in short outputs.**
  - single-30 and short-60: AAC `elst` 33 ms, `mdhd` 2624 @48k, ffprobe AAC 0.033000 s, against video 34 ms / 0.033333 s.
  - AAC payloads are unchanged, so this is not caused by this commit. It is one more reason that `audioTimingVerified:false` must stay.

## What this does and does not prove

- **Proven** (Linux, this host, software libopenh264, Vulkan compositor on RTX 4070, synthetic/offscreen fixtures): the final video sample now has a full frame duration. This holds for 1 frame, 2 frames at 60 fps, 45 frames at 30 fps, and a 30000/1001 source on the 30 fps output grid. Pixels and bitstream are unchanged.
- **Not proven:** hardware VAAPI encoding (refused or returns early on this host); Windows; macOS; audio/AV alignment; physical PipeWire capture; visible Electron interaction; a timed player; non-integer output fps (the API accepts integer fps only). Runtime encoded validation still does not exist, and the false flags in the receipts stay correct.

## Open items carried forward

L23-W1 (new, Low). L23-1 and T22-1 from earlier reviews, historical source-file identity, runtime encoded validation, and the remaining product map stay open. These are as stated in the handoff, and I did not re-verify them here.
