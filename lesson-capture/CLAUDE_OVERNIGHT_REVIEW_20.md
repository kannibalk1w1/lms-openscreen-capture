# Claude overnight review 20 — focused final review of the review 19 fix (slice22)

- Reviewer: Claude (sole actual Claude reviewer, done by me with no delegation), 6 November 2026
- Reviewed: `125ec5de0bac7f5d3f5f06203b9fb184efe1aa0d` ("fix: reject shortened lesson range media outputs")
- Baseline: `f7b8ed4cff65f10041b96b945b1165ea6b167bce` (slice22, actual review 19)
- `main` is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` (unchanged). Branch `lesson-capture/input-boundaries`. `private/lesson-capture/input-boundaries` points at `125ec5de`.
- Method: I read the full diff, `AGENTS.md`, review 19, follow-up 19, `LESSON_CAPTURE_RANGE_MEDIA.md`, the handoff, the roadmap and the product map at the exact SHA.
  - Tests ran from immutable `git archive` snapshots outside the checkout: `~/.cache/r20/snap` (125ec5de) and `~/.cache/r20/base` (f7b8ed4c, with only the 125ec5de `rangeMedia.test.ts` copied in).
  - `node_modules` entries are symlinked one by one, with `.vite` and `.vite-temp` excluded.
  - I used the pinned Node v22.22.1 (`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`, first on PATH) and a private TMPDIR, `~/.cache/r20/tmp` (0700).
  - Probe and mutation scripts are kept in `~/.cache/r20/probes` and `~/.cache/r20/mut.py`, never in the checkout. Each mutated file was restored and `cmp`-verified.
- The only checkout write is this file. The untracked `lesson-capture/OVERNIGHT_REPORT_2026-11-06.md` is the writer's draft. I did not read it for content or touch it.
- I changed no code, git state, config, native code, Rust or binaries. I did no encoding and no publishing.

## Verdict

**Medium M22-1 is CLOSED.** I found **no new High or Medium and no new material blocker.** Review 20 accepts `125ec5de` as the end of the current backend phase, within the honest limits below. The restart checkpoint can proceed.

There is one new **Low (L23-1)**: rare false refusals at an exact frame boundary. The guard fails closed, so it never certifies a wrong range. This should be deferred until after the restart, not fixed now. **Low T22-1 is partially strengthened and stays open**, as the docs say. **C22-1 is closed.** **B22-2 stays deferred** and is correctly documented.

The backend is still unwired. `git grep` at 125ec5de finds no caller of `materializeLessonRange` or `prepareLessonRangeMedia` outside `rangeMedia(.test).ts`, apart from Markdown docs. It is not reachable from the GUI, CLI or MCP, and it is not a user-playable package.

## M22-1 — closed (verified by code reading, an independent baseline run and probes)

**Code.** `prepareLessonRangeMedia` now takes the selected programme duration and counts its frames separately. The duration is `selection.programme.endSec - startSec`, which `planLessonRange` builds from the raw clip ends, before any asset-duration clamp. It counts frames with the same shared `outputFrameCount` reader: one synthetic span `[0, duration]`, no speed regions, 30 fps. It then requires that count to equal `expectedFrames`, which comes from the clamped `buildNativeClipList` clips and the scene speed regions. On a mismatch it throws `range-media-unsupported`.

The check runs inside `prepareLessonRangeMedia`. That is the first step of `materializeLessonRange`, before `pickDirectory`, `mkdir` or `render`. It also runs again at both revalidation points.

The diff touches only `electron/lesson/rangeMedia.ts` (+15 lines) and its test, plus docs. The planner, `outputFrameCount`, the scene and clip builders, and native code are unchanged. Ordinary editor export is therefore unaffected.

**Regression, independently reproduced.**
- With the fix (125ec5de snapshot), `-t "native-clamped"`: 1 passed, 15 skipped. The full file passes 16/16.
- On the baseline (f7b8ed4c snapshot + new test), `-t "native-clamped"`: **1 failed**, 15 skipped. The failure: "promise resolved `{ status: 'materialized', … }` instead of rejecting". That is exactly the M22-1 false completion.
- The whole new test file against the baseline: 2 failed / 14 passed. The second failure is the POSIX test's `receipt.audio` expectation, which is new receipt content and expected to fail.
- The test checks that neither the picker nor the renderer is called and that no `lesson-range-*` folder is created. I confirmed by reading that refusal happens before the picker, so no completion receipt can exist.

**Mutation.** Deleting the guard line in the snapshot fails only the clamp regression (1 failed / 15 passed).

**Probes I wrote (snapshot only; values are prepared `expectedFrames` against the programme-grid count):**

| Case | Result |
|---|---|
| Fixture: cut 1–2, 2x speed 2–4, ruler 0.5–4 | accepted, 45 = 45 (1.5 s) |
| 1.25x region, odd endpoints 0.37–4.11 | accepted, 96 = 96 |
| 0.5x region, 0.2–5.3 | accepted, 213 = 213 |
| 3x region, 0.1–9.9 (non-terminating seconds) | accepted, 134 = 134 |
| Offset clips with a gap (review 19 P1) | accepted, 150 = 150 |
| Two assets with a timeline gap | accepted, 90 = 90 |
| Exactly one frame (1 → 1+1/30) | accepted, 1 = 1 |
| Float-dirty 0.30000000000000004 s | accepted, 9 = 9 |
| Selection exactly equal to a speed region | accepted, 30 = 30 |
| Asset 4.99, clip 0–5, ruler 0–5 (sub-frame clamp) | accepted, 150 = 150 (see limits) |
| Asset 4.95, clip 0–5, ruler 0–5 (one frame short) | **refused** |
| Asset 3.9 with the clamp inside a 2x region | **refused** |
| Clamp on a second clip (asset b = 1 s) | **refused** |
| Asset 3, clip 0–5, ruler 0.5–2.5 (clamp outside the selection) | accepted, 60 = 60 (correct: the selection never reaches the clamp) |

Cuts, speed, rounding and the control valid cases all agree. Every clamp that loses one or more grid frames is refused.

**Inherent limit (not a defect).** Comparing frame counts tolerates a clamp shorter than one frame. For example, a 4.99 s asset still yields 150 grid frames for a 5 s programme. Native also emits grid frames due before the clamped end, so the frame count and the receipt agree. The last frame is still sourced from real media (4.967 s < 4.99 s). The docs already say that frame count is the contract, not exact encoded timing (`encodedTimingVerified:false`).

## L23-1 — Low, new: exact frame-boundary float mismatch gives rare false refusals (fails closed)

I fuzzed 1,500 seeded valid documents with no clamp. They had millisecond-rounded clips, cuts, speed regions (0.5–3x), optional second clips and random selections. Results: 1,402 accepted, 91 `range-unavailable` from the planner, 5 refused for duration outside 1/30–120 s, and **2 refused by the new guard although no clamp exists.**

Example: one clip 0–15.552, cut 0.896–1.161, ruler 0.648–10.014, with no speed in range.
- The planner programme duration computes to `9.101`, so the programme grid gives `ceil((9.101 − 0.001) × 30)` = 274.
- The clip-list sum `0.248 + 8.853` computes to `9.100999999999999`, which gives 273.
- The true value sits exactly on the epsilon boundary `k/30 + 0.001`, and the two float paths round to opposite sides of it.

This happens when the programme duration is a whole number of 0.1 s plus exactly 1 ms. That is not rare for millisecond-authored values, but only about half of those cases round apart.

**Impact:** a spurious `range-media-unsupported` for a legitimate selection. It never accepts a short range and never writes a receipt, so it is not a correctness or certification defect. This backend is unwired, so no user hits it now.

**Recommendation, deferred until after the restart:** before any user-facing wiring, compare the clip-list programme seconds with the planned duration using a small absolute tolerance (for example, 1e-6 s) instead of comparing two separately rounded `ceil` results. Alternatively, round both durations to a shared resolution before `framesDue`. Keep refusing any mismatch of a frame or more, and add the example above as a regression. Do not change this before the pause.

## C22-1 — closed

- The receipt now carries `audio: { policy: "native-source-or-synthesized-silence", streamMetadataVerified: false, timingVerified: false }`. The POSIX test pins it, and that test fails on the baseline.
- `LESSON_CAPTURE_RANGE_MEDIA.md`, the handoff and the follow-up say that native output may include AAC LC 48 kHz silence (72 frames, 1.5 s, about −91 dB) for a video-only source. They also say this sets the MP4 format duration and is **not** video-duration corroboration, and that an AAC track is not proof of recorded source audio.
- `PRODUCT_MAP.md` now reads "native-stat/hash receipts, not encoded timing proof". That resolves the review 19 nit. The ruler and programme coordinates (0.5–4 → programme 0.5–2, 1.5 s) are now spelled out, which resolves the other nit.

## B22-2 — baseline, deferred to resumption, correctly documented

- The docs pin the stored timing: 44 × 512 + 1 × 0 ticks at timescale 15360, an edit list covering 1467 ms, and stream duration 1.466667 s / average 675/22 against a native report of 1.5 s. The same N−1 pattern appears in earlier native exports. The docs state that it is not introduced by the backend and is deferred until after the restart.
- `nativeReportedDurationSec`, `mediaDecodedByValidator:false` and `encodedTimingVerified:false` are kept in code and docs.
- No timed player, concatenation or exact-duration claim is made. The docs say it blocks those claims.
- The native artifact proof (45 frames, RGB MAE about 2) is labelled as retained f7b8ed4c evidence, not rerun, and not claimed as a new fix.
- I made no native, Rust or binary change, ran no encode, and claim no physical or platform acceptance.

## T22-1 — partially strengthened, stays open (honestly disclosed)

I mutated the snapshot's `rangeMedia.ts` one change at a time and reran `rangeMedia.test.ts` (16 tests). Every new or strengthened guard is now killed:

| Mutation | Result |
|---|---|
| Remove pre-render project revalidation | killed |
| Remove `Number.isFinite(videoDurationS)` (NaN) | killed |
| Remove the post-render cursor-sidecar check | killed |
| Remove the programme-grid guard (M22-1) | killed |
| Output folder mode 0o700 → 0o755 | killed |
| Remove `chmod 0o600` on the MP4 | killed |
| Remove the duration-tolerance check (1.6 s) | killed |
| Map `changed` → `incomplete` in the catch | killed (2 tests) |
| Source-file limit 8 → 80 | **survived** |
| Byte limit `MAX_BYTES` → 2× | **survived** |

The limit-edge and per-dependency mutations still survive. The docs correctly say "do not claim all 17 guard mutations are now pinned". T22-1 remains an open Low, not closed.

## Review 19 preservation

`CLAUDE_OVERNIGHT_REVIEW_19.md` was first committed in 125ec5de (100 non-empty lines) and is unchanged in the working tree. Its verdict, M22-1, T22-1, C22-1, B22-2 and test-count text match my review 19 record. I had no separate pre-commit copy to compare byte for byte. The follow-up is a separate file (`CLAUDE_OVERNIGHT_FOLLOWUP_19.md`), and review 19 was not edited.

## My own commands and counts (snapshot of 125ec5de unless stated)

- `node --version` → v22.22.1.
- Focused Vitest, 5 files: `rangeMedia`, `service`, `fileCommands`, `outputFrameCount` and `mediaSelection`. **59 passed, 0 skipped.** This set differs from the worker's 56/4 and my review 19 72/7; the counts are not comparable.
- `rangeMedia.test.ts` verbose: 16/16 pass, named individually, including the clamp regression, the NaN/Infinity/1.6 refusals, pre-render plus late cursor, and POSIX 0700/0600 with the receipt audio policy.
- Baseline overlay (f7b8ed4c + new test): selected regression **1 failed / 15 skipped**. Whole file: 2 failed / 14 passed.
- Probes: 14 deterministic cases plus a 1,500-document seeded fuzz (results above).
- Mutations: 10 (8 killed, 2 survived), each restored with `cmp`.
- `tsc --noEmit -p tsconfig.json`: exit 0. `tsc --noEmit -p tsconfig.test.json`: exit 0.
- `biome check` on the 2 changed code files: clean. Whole `biome check .`: 1284 files, **35 warnings** (the existing baseline), no errors.
- **Not run by me:** a full Vitest suite, the Vite build, i18n tooling, native encoding, ffprobe and real-device, Electron, stdio or platform acceptance. I judged them unnecessary for a 15-line guard plus receipt field, given the clean focused, static and mutation evidence.
- Worker-reported counts (56/4 with 16/1 overlap, Vite 3 bundles, Biome 35) are theirs; I reproduced only the Biome 35. The full 5609/425 zero-skip run is f7b8ed4c evidence from before M22-1 was fixed. My review 19 full runs were 5608 + 1 skip (`audioPeaks` real-file decoding, no FFmpeg on PATH) and 5607 + 1 skip + 1 `LeftPanel.copyMessage` flake (untouched file, passed 3/3 when run on its own). None of these is fresh evidence for 125ec5de.

## Before the pause

1. **Release the checkpoint gate.** M22-1 is closed, and there is no new High, Medium or blocker.
2. In the report, follow-up and handoff, record M22-1 closed, L23-1 (fail-closed boundary refusal, deferred), T22-1 still open (limit and dependency mutations survive), C22-1 closed and B22-2 deferred. Keep both timing flags false.
3. Do not start the next phase, fix native timing or change L23-1 before the user restarts.
