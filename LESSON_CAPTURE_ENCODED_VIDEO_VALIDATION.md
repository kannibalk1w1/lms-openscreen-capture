# Runtime selected-range video validation — slice24

This backend slice adds runtime evidence before `range-export.json` is written.
It follows actual [review21](lesson-capture/CLAUDE_POST_RESTART_REVIEW_21.md), which
accepts the Linux software native timing fix at2c29d268 with no High/Medium.
Slice24 itself awaits coordinator-dispatched exact-SHA review. Existing source and
destination authority, explicit folder cancellation, native-stat checks and
incomplete-artifact retention remain. No player or GUI/CLI/MCP entry point exists.

## Evidence and supported subset

The existing `electron/media/audioPeaks.ts` resolver already finds shipped FFmpeg
(including the packaged Windows shared build). No dependency, ffprobe requirement,
PATH search or download is added. This validator is deliberately enabled only on
Linux: a pinned inherited regular-file descriptor provides seekable local input
through `/proc/self/fd/3`. Missing tools and unsupported platforms fail closed.
macOS/Windows need their own accepted file/process contract; L23-W1 still tracks
unchanged native drains. VAAPI/reordered output is not accepted by these proofs.

`electron/lesson/encodedVideo.ts` distinguishes three evidence levels:

- Container metadata: one `avc1` video track, optional separate audio track,
  dimensions, media time scale/duration, identity track matrix and unshifted edit
  duration rounded to the native millisecond movie ticks. Movie/format duration never proves video length.
- Stored sample timing: every `stts` delta equals one output-frame tick, sample
  counts agree with `stsz`, and `stsc`/`stco` map positive-size samples into `mdat`.
  This is sample-table evidence, not a claim that ffprobe inspected packets.
  Fragmented, reordered/composition-offset, encrypted, extended-size and other
  unsupported layouts are refused. A zero-duration final sample fails here.
- Actual decoded frames: FFmpeg decodes the video to raw YUV420P frame checksums,
  preserving timestamps with passthrough frame mode. Every expected frame must
  appear at the expected zero-based timestamp, duration, size and dimensions.
  Metadata/sample tables alone never set the decoded flag. Decoder errors,
  shortened output, missing/extra frames or malformed evidence refuse completion.

Successful receipts say `validation:mp4-video-samples-and-full-frame-decode`,
`mediaDecodedByValidator:true` and `encodedTimingVerified:true`, with separate
`videoEvidence.samples` and `videoEvidence.decoded` records and a SHA256 of the
frame checksum listing. These flags concern **video only**. Source/synthesized AAC
may still exist; `audio.streamMetadataVerified` and `audio.timingVerified` stay
false. No audio/AV alignment, source visual equivalence, or timed-player readiness
is implied. Pixel similarity remains separately demonstrated by slice23 evidence.

## Bounds, authority and failure behavior

Output is limited to128MiB,4096parsed boxes,3600frames, even dimensions2–1280 and
integer1–60fps; the production range path still uses30fps and its existing1/30–120s
programme bound. Sample-table loops/arrays are constrained by the frame limit.
FFmpeg has a30s kill deadline,1MiB stdout and64KiB stderr limits, one decoding/
encoding/filter thread, a64MiB per-allocation limit and1280×1280 max decoded pixels.
These are bounded work/per-allocation controls, not an OS-wide memory quota or a
hard deadline on kernel filesystem IO. A valid but slow output can be refused.

Spawn uses no shell, a resolved absolute executable and fixed argument slots.
Only local file protocol is enabled; external MP4 data references are disabled
and video references must be self-contained. No caller path is parsed as an
FFmpeg option. Regular-file/no-follow/nonblocking opens, descriptor/path identity,
size/mtime/ctime checks and the final output hash comparison bind the sample and
decode evidence to the bytes included in the receipt. Current project, sources
and cursor-sidecar exclusions are revalidated after decode. Process/OS diagnostic
text is mapped to fixed errors. Failed output remains in the unique private
folder with no completion receipt. Folder cancellation still returns before
source reads, rendering or decode.

Per-operation source hashes establish stability during this operation; they do
**not** establish historical identity at range authoring time. Authored source
attestation/availability remains the next separate backend prerequisite before
user-facing integration. L23-1 and remaining T22-1 limits/dependencies remain open;
this slice additionally pins programme duration edges and validation-time races.

## Validation and evidence

All Node commands use22.22.1/npm10.9.4. Disk inspection found14GiB available on
`/tmp` and555GiB on `/home`; no cache purge or user-app termination occurred.
Native source and binaries are unchanged; no native rebuild is needed or claimed.
The current addon SHA256 remains
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

Unique evidence is under
`../openscreen-evaluation/overnight-2026-11-06/slice-24-runtime-video-20261106/`.
A fresh bundled DocumentService/native selected-range run produces45decoded
640×360frames at30fps, with45×512sample ticks at15360Hz and1.5s of video.
The runtime validator accepts the retained rebuilt selected45-frame, single30fps,
short2-frame60fps and fractional-source outputs; it rejects the retained slice22
zero-last-sample output despite its45decodable frames and1.5s AAC/format duration.
All111inventoried slice22/23 evidence files remain SHA256-identical. The fresh
native source/project copies also remain unchanged.

The committed891-byte MP4 fixture is synthetic blue64×32,2frames at30fps, generated
locally with the existing shipped FFmpeg/libopenh264. Production-path tests use
the real resolver/decoder, with platform/tool skips explicit when unavailable;
structural and child-process failure tests use controlled fixtures/mocks. Coverage
includes truncation, corruption, wrong stream/codec/dimensions/count/timing/edit,
external references, malformed boxes, decoded-frame errors, spawn/exit/error
output/timeout, oversized/nonregular files and path replacement. Materialization
tests check receipt gating, unchanged audio flags and source/project/output
changes during decode. Validation totals are recorded below after final checks.

These are Linux synthetic/offscreen backend proofs. Physical capture, visible
Electron/keyboard/screen-reader use, macOS/Windows, hardware encoding, audio/AV
alignment, authored historical source identity and sustained use are skipped
because this slice does not establish their acceptance. No packaging/release,
publication, main/upstream mutation or remote push is performed by this worker.

Final checks: focused97tests/5files pass,0skip; the single full suite run
`npm run test -- --maxWorkers=4` passes5669tests/427files,0skip (127.07s).
Root/test TypeScript pass; lint:fix and final lint pass with35existing warnings;
docs check37files, i18n1253literal keys/15locales,73relative links across the five
changed lesson documents and diff whitespace checks pass. The initial root
TypeScript check found2nullable child-stream accesses; those were corrected
before all final runs. All focused test runs passed; the malformed/failing cases
are expected refusals within passing tests. No Rust/helper tests, native rebuild,
renderer rebuild or package build were run because their source is unchanged.
Final runtime records: `retained-fixture-results-complete.json`,
`native-evidence-complete.log`, `evidence-result-complete.json` and the fresh
`native-fixture-complete/` receipt, plus tool identities/version, prior-file hashes,
focused/full/type/lint/docs/i18n/link logs and the complete disposable driver/bundle.
