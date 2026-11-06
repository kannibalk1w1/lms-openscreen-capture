# Claude post-restart review 22: slice24 runtime video validation

- **Reviewed commit:** `91b59b1d3dada970d1b28a9a702acef1e581456e` ("feat(lesson): validate encoded range video before completion")
- **Parent:** `f28c56f7`
- **Branch:** `lesson-capture/input-boundaries`
- **Date:** 6 November 2026
- **Reviewer:** Claude (Orca worker, task `task_a24607f2238c`)
- **Checkout state:** `git status` was clean before and after the review, and HEAD was the exact SHA above. This file is the only one I wrote in the checkout.
- **Toolchain:** Node 22.22.1 and npm 10.9.4 (pinned under `~/.local/share/lesson-capture-tools`). The FFmpeg used was the shipped `electron/native/bin/linux-x64/ffmpeg` (n8.1.2-34-g9b6c8969e0-20260731).

## Verdict

**Accepted for its stated scope. There are no High or Medium findings.**

The scope is a Linux-only backend check that runs before `range-export.json` is written. It verifies two things for a narrow MP4 subset: the stored video sample timing, and a full decode of every video frame. The output receipt then sets the video flags to true. The audio flags stay false.

What I verified:

- The parser is correct. I checked every field offset against the ISO BMFF layout.
- Every loop is bounded.
- The parser refused every random mutation of the video timing, offset and size tables.
- FFmpeg decodes from a pinned file descriptor, with protocol and external-reference restrictions applied.
- The receipt is tied to the exact bytes that were parsed and decoded.
- On failure, the output is kept and no receipt is written.
- The video flags can only become true after a real FFmpeg decode succeeds.

There are three new Lows (L24-1, T24-1, L24-2) and three nits. None of them blocks the next backend slice.

## What this review does and does not prove

All evidence here is Linux, synthetic and offscreen. The following were **not** tested and are **not** claimed:

- physical capture
- Windows or macOS
- VAAPI or other hardware encoding
- audio, or audio/video alignment
- a timed player
- visible GUI use

Decoded-frame proof means real FFmpeg decoding real files, on the probes and tests marked as "real FFmpeg" below. The unit tests in `encodedVideo.test.ts` and the authority tests in `rangeMedia.test.ts` replace the decoder with a mock. They prove control flow only, not decoding.

## Commands run and results

I ran everything from a `git archive` snapshot of `91b59b1d` in my session scratchpad. It had `node_modules` linked one entry at a time and the untracked `electron/native/bin/linux-x64` linked in. Nothing ran inside the checkout itself.

1. **Focused shipped tests.** Command: `npx vitest run electron/lesson/encodedVideo.test.ts electron/lesson/encodedVideo.integration.test.ts electron/lesson/rangeMedia.test.ts`. Result: **70 passed, 0 failed, 0 skipped (3 files).** The 8 integration tests ran with real FFmpeg; none were skipped.
2. **Probe P1 (real FFmpeg).** I tested the retained pre-fix slice22 output `lesson-range-native-fixture-verified/lesson-range-4eda86a5-…/range.mp4`, which has a zero-duration last sample.
   - The parser rejects it.
   - `validateRangeVideo` rejects it.
   - FFmpeg exits 0 with empty stderr.
   - `inspectDecodedFrames` **accepts** FFmpeg's real 45-row listing for this file.

   The accepted slice23 output (`lesson-range-134129f6-…`) passes validation in full. Result: pass. The probe is the basis for L24-1.
3. **Probe P2 (random fuzz, real FFmpeg).** Method: change one random byte per mutant (80% of mutants inside `moov`), then run the parser. Every mutant that passed the parser then went through `validateRangeVideo`.
   - Committed 2-frame fixture, 1500 mutants: 584 refused by the parser, 150 refused by the decode stage, 762 accepted.
   - 45-frame native output, 300 mutants: 58 refused by the parser, 95 refused by the decode stage, 146 accepted.
   - **Every parser exception was the fixed error.** There were 0 raw `RangeError`s, and no parse took longer than 50 ms.
   - I sorted the accepted mutants by the box they changed. None of them were in the video `stts`, `stsz`, `stco`, `stsc`, `elst`, the `mdhd` time scale or duration, or the `tkhd` matrix or dimensions.
   - The accepted mutants were in fields the parser does not need to check: `mvhd` fields other than the time scale, the handler name, `vmhd`, compressor name and `pasp`, `avcC` bytes the decoder tolerates, `stss` entries, `udta`/`meta`, `tkhd` IDs and dates, and **the whole audio track**.
4. **Probe P3 (real FFmpeg).** I cleared the self-contained flag on `url ` in the native output.
   - On the video track, the parser rejects it.
   - On the audio track, the parser accepts it. FFmpeg (`-enable_drefs 0`, `-v error`) skips that track without any message. The full validation then **accepts** the file.
   - Result: matches the documented scope (only video references must be self-contained). Recorded as N24-1.
5. **Probe P4 (largest allowed output, real FFmpeg).** I made a 3600-frame 1280×720 30 fps file with libopenh264 (testsrc2, 4 Mb/s, 59.7 MB). The parser accepts its layout. `validateRangeVideo` accepts it in **13.4 s**, against the 30 s limit (single-threaded decode, this machine). Result: pass. See N24-2.
6. **Guard mutations, slice24 code.** I ran 36 mutants against the 3 focused files.
   - **11 killed:** M1 stderr, M2 frames+1, M3b chunk end, M4 url flag, M10 elst duration, M21 `-xerror`, M23 receipt hash binding, M25 matrix, M27 frame size, M30 stts delta, M33 timeout kill.
   - **25 survived.** The list is in T24-1.
7. **Guard mutations, T22-1 limits in `rangeMedia.ts`.** I ran 5 mutants.
   - **Killed:** the programme-duration lower bound (`< 1/30`) and upper bound (`> 120`). These are newly pinned by slice24.
   - **Survived:** the 32 kept-span limit, the 8-source limit and the total-byte limit.
8. **Evidence checks.**
   - All **111** files in `prior-hashes-complete-before.json` re-hash identically.
   - `compositor_view.node` SHA256 is `5d16ea98…09efca`, which matches the document.
   - The fixture is 891 bytes, SHA256 `74c200ee…bcc738c`.
   - The fresh `native-fixture-complete` receipt has the expected video flags, true, and both audio flags false. Its `output.sha256` equals `videoEvidence.sha256` (`32e1f8f3…8ead`). That is byte-identical to the slice23 retained selected output, so the native encoder is deterministic here.
   - `vitest-full.log` ends with 5669 tests passed in 427 files.

   I did not repeat the full suite or the TypeScript, lint and docs checks. Native source and the TypeScript outside these files are unchanged, and my focused runs left no gap that those checks would fill.

## Findings

### L24-1 — Low, new: the decoded-frame "duration" check is not independent timing evidence

**Where:**

- `electron/lesson/encodedVideo.ts:228` and `:237`
- `LESSON_CAPTURE_ENCODED_VIDEO_VALIDATION.md`, the bullet that starts "Actual decoded frames … Every expected frame must appear at the expected zero-based timestamp, duration …"

**What happens:** FFmpeg's `framemd5` output uses the time base `1/30`. Each timestamp in it is the stored timestamp, converted and rounded to that time base. FFmpeg fills in the duration column (`1`) itself, even when the stored sample duration is 0.

**Reproduction (probe P1):** I passed FFmpeg's real listing for the retained zero-last-sample slice22 file to `inspectDecodedFrames` with `{640, 360, 30, 45}`. It **accepts** it: 45 frames, each with duration 1.

**Why it matters:** The slice22 defect is caught only by the stored `stts` check at `encodedVideo.ts:157`. So the final-sample timing proof depends entirely on the sample tables. The decode check confirms that the frames exist, how many there are, their order and their size. It does not check durations, and the rounded timestamps would hide sub-frame jitter. The flags are still correct, because both checks must pass and `stts` is checked exactly. The document overstates what the decode step proves.

**Fix:**

- Reword the "Actual decoded frames" bullet. It should say that decoded timestamps and durations are re-timed to 1/30 by FFmpeg, and that duration correctness comes from the stored `stts` deltas.
- Optionally, name the probe P1 case in the tests. That way the decode check is never mistaken for proof of the final duration.

### T24-1 — Low, new: most individual parser and process guards are not pinned by tests (25 of 36 mutants survive)

**What happens:** The shipped tests pass after each of these guards is removed.

- `encodedVideo.ts:207`: the check that chunk offsets increase (`offset < previousEnd`). Without it, overlapping or duplicated video chunks are accepted by the parser.
- `:128`: the stbl box whitelist. The "composition-offsets" test renames `stco` to `ctts`, so it actually fails because `stco` is missing. It never tests a `ctts` added next to `stco`. This is the guard behind the headline "reordered/composition-offset refused" claim.
- `:75` `mvex`, `:84` track count, `:91` duplicate video track.
- `:121` / `:122` elst media_time and rate (the "unshifted edit" claim).
- `:100` mdhd duration equality, `:138` / `:139` avc1 dimensions, `:108` / `:109` tkhd dimensions. These are each covered only together with other checks, through a different `expected` value.
- `:169` zero sample sizes, `:186` stsc first chunk, `:190` stsc sample description.
- `:235` / `:236` the decoded pts and dts checks, each removed on its own.
- `:226` the single time-base line.
- `:340` the stdout cap. The 1 MiB test still fails, but only later, at the parse step.
- `:362` named inode and `:366` ctime. The rename test is caught by both, so each one survives when removed alone.
- `:255` the pre-open lstat (made redundant by `O_NOFOLLOW`).
- `:253` the Linux platform gate (cannot be tested on Linux).
- The FFmpeg argument hardening (`:294`–`:295` `-protocol_whitelist file`, `:302`–`:303` `-enable_drefs 0`, `:300`–`:301` `-err_detect explode`, `:290`–`:291` `-max_pixels`). The mock test uses `arrayContaining` with only five arguments.

**Why it matters:** I read every one of these guards, and each is present and correct. The code does the right thing today. The risk is that a later refactor could silently remove the security-relevant FFmpeg flags or the layout refusals, and no test would fail.

**Fix:**

- Pin the full argument array, or at least each hardening flag.
- Add single-guard structural fixtures: `ctts` next to `stco`, a non-monotonic `stco`, `elst` with media_time ≠ 0 and with rate ≠ 1, a duplicate `vide` trak, a third trak, `mvex`, and a zero-size sample.
- Add one in-place rewrite that keeps the same inode, and check that only the ctime guard rejects it.

### L24-2 — Low, new: the receipt does not record which decoder proved the frames

**Where:** `encodedVideo.ts:258` uses `resolveFfmpeg()`, which honours `OPENSCREEN_FFMPEG_PATH` first (`electron/media/audioPeaks.ts`, `ffmpegCandidates`). The receipt at `rangeMedia.ts:246`–`249` records no executable path, version or hash.

**What happens:** Any absolute executable that exits 0 with empty stderr and prints a plausible `framemd5` listing will set `mediaDecodedByValidator: true`. Only the `#software` line inside the hashed listing indirectly shows which tool ran.

**Why it matters:** This is within the same-user trust boundary, so it is not an exploit. It is a gap in provenance for a receipt that claims to be evidence.

**Fix:** Record the resolved decoder's absolute path, SHA256 and `-version` line in `videoEvidence.decoded`. Alternatively, ignore the environment override for validation in packaged builds.

### N24-1 — nit: the audio track's structure is not inspected at all

The parser only checks that the second track's handler is `soun` (`encodedVideo.ts:93`). Probe P3 shows that an audio track with an external data reference is accepted without any message. Mutated audio `stts`, `stsz`, `stco` and `stsc` tables are also accepted.

This is consistent with `audio.streamMetadataVerified: false` and `audio.timingVerified: false`. The fix is a sentence in the document: "the audio track's structure and data references are not inspected". Then nobody will read "external MP4 data references are disabled" as covering audio.

### N24-2 — nit: the time margin at the largest allowed output is about 2.2×

On this machine, a 3600-frame 1280×720 output decodes in 13.4 s against the 30 s limit. A much slower Linux machine could falsely refuse an output at the maximum size. The document already says "A valid but slow output can be refused". The current production use (≤120 s at 30 fps, 640×360-class output) is far inside the limit.

### N24-3 — nit: misleading integration test names

In `encodedVideo.integration.test.ts`, the cases are named "runtime decoder refuses …". Four of the five (truncated, shortened, dimensions, zero-timing) are refused by the parser before FFmpeg starts. Only corrupt-bitstream reaches the decoder. The names overstate how much real decoder rejection the tests cover.

## Areas checked with no finding

- **Parser bounds:**
  - 4096 box budget across all nested calls.
  - No extended-size or size-0 boxes.
  - `stts` runs ≤ frames.
  - `stco` chunks ≤ samples.
  - `stsc` maps ≤ chunks, and their first-chunk numbers strictly increase.
  - The inner sample loop is capped at `samples` (≤3600).
  - Every read has a length check first (fuzzing found no raw `RangeError`).

  I verified the field offsets for `mvhd`, `tkhd`, `mdhd`, `elst`, `hdlr`, `stsd`/`avc1`, `stsz`, `stco` and `stsc`.
- **mdat binding:** each video chunk starts at or after the previous chunk's end, and inside the single `mdat` payload. The sum of its sample sizes stays inside `mdat`.
- **Process handling:**
  - no shell
  - an absolute executable
  - fixed argument slots
  - the input is only `/proc/self/fd/3`, an inherited `O_NOFOLLOW|O_NONBLOCK` descriptor checked with fstat as a regular file
  - `-v error` with any stderr byte treated as failure
  - SIGKILL on the deadline and on the output caps
  - after a kill, `failed=true` forces rejection, and double settlement is harmless
- **TOCTOU limits:**
  - The receipt hash is taken from the same bytes the parser read.
  - The path inode and the descriptor's size, mtime and ctime are compared after the decode.
  - `rangeMedia.ts:226`–`228` re-hashes the path and requires the same bytes and SHA256.
  - The remaining window (after hashing and before the receipt is written, inside the private 0700 folder) is the same as in slice22, and the document states the honest limits.
- **Authority:**
  - Cancelling the folder picker still returns before any source is read.
  - The project and source hashes and the cursor-sidecar exclusion are revalidated after the decode.
  - On failure only `range.mp4` is kept, with no receipt (the integration test runs real FFmpeg for this case).
  - Errors are mapped to fixed codes.
- **Flags:** `validation`, `videoEvidence`, `mediaDecodedByValidator` and `encodedTimingVerified` are set only after `validateRangeVideo` succeeds. That requires a parsed sample table **and** a decoded listing with exactly N rows. Metadata, the format duration or the AAC duration cannot set them. Both audio flags are hard-coded to false.

## Remaining limits and next blockers

1. **Authored historical source identity is still the next prerequisite.** The source hashes in each run prove the sources stayed the same during that run only. They do not prove the source is the one used when the range was authored. Slice24's documents say this correctly. Do not build user-facing materialization or timed delivery before it is in place.
2. **T22-1 is still open.** Slice24 newly pins the programme-duration edges (the 1/30 s and 120 s mutants are killed). The 32-kept-span, 8-source and total-byte limits still survive mutation.
3. **Still open:** L23-1 (fail-closed boundary refusal), L23-W1 (macOS/Windows drains still write zero-duration packets) and the audio/AV timing work. The validator is enabled only on Linux, so L23-W1 cannot produce a false acceptance.
4. **Before relying on the argument hardening:** fix the doc wording for L24-1 and add the T24-1 single-guard tests. Optionally, add decoder provenance to the receipt (L24-2).
