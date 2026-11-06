# Runtime selected-range video validation — slice24

This backend slice adds runtime evidence before `range-export.json` is written.
It follows actual [review21](lesson-capture/CLAUDE_POST_RESTART_REVIEW_21.md), which
accepts the Linux software native timing fix at2c29d268 with no High/Medium.
Actual [review22](lesson-capture/CLAUDE_POST_RESTART_REVIEW_22.md) accepts
91b59b1d with no High/Medium. The
[review22 follow-up](lesson-capture/CLAUDE_POST_RESTART_FOLLOWUP_22.md) strengthens
guards and decoder provenance. Actual [review23](lesson-capture/CLAUDE_POST_RESTART_REVIEW_23.md)
accepts361fde51 with no High/Medium and closes the review22 findings within scope.
[Slice25 settlement/provenance fixes](lesson-capture/CLAUDE_POST_RESTART_FOLLOWUP_23.md)
address review23 Lows L25-1/T25-1 and await their own exact-SHA review.
Existing source and destination authority, explicit folder cancellation, native-stat checks and
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
  using passthrough frame mode. Every expected frame must exist in the expected
  order/size/dimensions on FFmpeg's output grid. FFmpeg rounds/re-times output
  timestamps to1/fps and supplies the duration column; this listing does not
  independently prove exact stored timestamps, sub-frame jitter or final-sample
  duration. Exact duration comes exclusively from the stored `stts` deltas.
  Real decoded listings accept the zero-last-sample regression while the complete
  validator rejects it. Metadata/sample tables alone never set the decoded flag. Decoder errors,
  shortened output, missing/extra frames or malformed evidence refuse completion.

Successful receipts say `validation:mp4-video-samples-and-full-frame-decode`,
`mediaDecodedByValidator:true` and `encodedTimingVerified:true`, with separate
`videoEvidence.samples` (`timingBasis:stored-mp4-stts-deltas`) and
`videoEvidence.decoded` (`evidence:decoded-frame-existence-order-size`,
`timestampBasis:ffmpeg-rounded-output-grid`) records and a SHA256 of the frame
checksum listing. These flags concern **video only**. Source/synthesized AAC
may still exist; `audio.streamMetadataVerified` and `audio.timingVerified` stay
false. The audio track's structure and data references are not inspected; malformed
audio or external-reference audio can be skipped by FFmpeg without refusing the
video proof. No audio/AV alignment, source visual equivalence, or timed-player readiness
is implied. Pixel similarity remains separately demonstrated by slice23 evidence.

## Bounds, authority and failure behavior

Output is limited to128MiB,4096parsed boxes,3600frames, even dimensions2–1280 and
integer1–60fps; the production range path still uses30fps and its existing1/30–120s
programme bound. Sample-table loops/arrays are constrained by the frame limit.
FFmpeg has a30s kill deadline,1MiB stdout and64KiB stderr limits, one decoding/
encoding/filter thread, a64MiB per-allocation limit and1280×1280 max decoded pixels.
These are bounded work/per-allocation controls, not an OS-wide memory quota or a
hard deadline on kernel filesystem IO. A valid but slow output can be refused.
Review23 LowL25-1: these deadlines send SIGKILL to the direct child; inherited
pipes held by descendants can delay promise settlement indefinitely. The shipped
FFmpeg does not fork in these proofs. Fixing settlement is next-slice work;
the current process timeout is not an overall wall-clock bound.

`videoEvidence.decoded.decoder` now records the resolved executable's SHA256,
a bounded FFmpeg self-reported version token and `trust:same-user-local-executable`.
It contains no local executable path, full configuration/build line, inode or
filesystem timestamps. The canonical executable is hashed before and after the
version/decode processes, with regular-file/no-follow checks,256MiB per-read-pass
byte limits and size/inode/mtime/ctime stability checks. The `-version` process has
a3s kill deadline and16KiB stdout/stderr caps; any stderr/failure/malformed version
refuses completion with fixed errors. The decode limit remains30s and can refuse
valid output on slower hosts (N24-2); no deadline was relaxed.

This is provenance within the existing same-user tool trust boundary, not signed
or authenticated decoder attestation or a sandbox. The hash covers the executable
file, not its loaded libraries, delegated tools or runtime environment. `OPENSCREEN_FFMPEG_PATH` still
selects a local tool. A malicious same-user executable can forge both its version
and frame listing; before/after hashes identify observed executable bytes and
catch ordinary replacement, but do not prevent adversarial swaps between those
checks. No absolute machine paths are copied into portable receipts.

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
user-facing integration. L23-1 and broader dependency/refusal coverage remain open. The review22 follow-up
pins the three specifically remaining T22-1 span/source/total-byte limits, in
addition to the existing programme duration edges and validation-time races.

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


## Review22 follow-up coverage

The original review22 report is preserved verbatim. The follow-up report separates
independent guards from defense in depth, records mutation controls, and describes
the real FFmpeg zero-last regression plus path-free provenance. Its validation
results supersede the earlier slice24 counts above only for this follow-up; all
original fixtures, reports and external evidence remain unchanged.

Follow-up validation:139focused tests/5files and the single justified full rerun
5711tests/427files pass,0skip; root/test TS, lint35existing warnings, docs/i18n and
changed lesson links pass. Review23 corrects the mutation tally:50assertion kills
plus2test-timeout kills,
1expected defense-in-depth survivor (pre-open lstat), source restored byte-for-byte.
The original retained bad45-frame output still passes real decoded-list inspection
but fails the full validator, while all four rebuilt outputs pass with path-free
decoder provenance. Full follow-up details and initial corrected diagnostics are
in the linked report and its uniquely named evidence directory.

Review23 L25-1/T25-1 are addressed by the separate slice25 follow-up, pending
review: failures settle without waiting for descendant-held pipes, release our
read ends and signal only the direct child; success still requires complete
`close` output. Provenance guard tests cover canonical symlinks, path-like version
tokens and independent executable hash byte/size/inode conditions. The deadline
limits apply to process settlement, subject to scheduling, not preceding hash IO.
This does not terminate or sandbox wrapper descendants.

[Historical authored source identity](lesson-capture/AUTHORED_SOURCE_IDENTITY_PLAN.md)
remains unimplemented and is a distinct next backend slice. Current per-operation
hashes must never be presented as author-time identity. The user requested a pause
after this task: coordinator review/checkpoint/push precede explicit pause, with no
new roadmap item until resumption.
