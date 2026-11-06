# Implementation follow-up to actual Claude review22

Review22 accepts91b59b1d with no High/Medium for Linux synthetic/offscreen software
video validation. Its original report is included verbatim, SHA256
`66322a535af413e237e56f6fb550ac2c9f06adc30e82486eb6357bfc1f2e9de6`.
This follow-up is implementation/validation evidence, not an independent review
verdict; coordinator-dispatched exact-SHA review of this follow-up remains pending.

## Findings and exact evidence boundaries

**L24-1 addressed:** code comments, receipt evidence labels and documentation now
say exact timing comes from stored `stts` deltas. The raw decoded frame listing
proves actual frame existence, order and dimensions/size on FFmpeg's rounded
output grid. FFmpeg supplies durations and rounds timestamps to1/fps; it can hide
sub-frame jitter and zero last-sample duration. It is not independent stored
packet/sample timing evidence. Both sample validation and real decoding are
still mandatory before either video flag becomes true; audio flags stay false.

The new899-byte `range-video-zero-last.mp4` is derived from the existing891-byte
synthetic two-frame H.264 fixture, changing only `stts` to1×512and1×0ticks and
adjusting enclosing box lengths. Original sample payloads, offsets, expected
`mdhd`/`tkhd`/edit metadata and dimensions remain intact. A real shipped-FFmpeg
listing has two regular rows with supplied duration1; `inspectDecodedFrames`
accepts it, while `inspectRangeVideo` and the complete validator refuse it. This
isolates the `stts` timing check from metadata and decode evidence. The original
fixture and retained historical slice22/23/24 outputs are unchanged.

**L24-2 addressed:** successful runtime evidence now stores
`decoded.decoder.{sha256,version,trust}`. The identity hashes the canonical resolved
executable before and after version/decode, with regular-file/no-follow,
size/inode/mtime/ctime checks and256MiB per-pass read bounds. Only the bounded
self-reported version token is retained: full command/configuration/build output
and absolute executable paths are excluded from portable receipts. The existing
resolver/environment override remains, scoped as `same-user-local-executable`.
These records are provenance, not signed attestation or a defense against a
malicious same-user executable or swaps between observations. The executable
hash does not attest loaded libraries, delegated tools or the runtime environment.

The version subprocess is shell-free with fixed `-version` arguments,3s deadline,
16KiB stdout/stderr caps and fixed errors; malformed version, stderr, missing/
nonregular/oversized tool, spawn/exit failure or replacement refuses completion.
The decode subprocess retains its30s limit and all hardening arguments. Hash IO
is byte-bounded, not given a hard kernel filesystem deadline. N24-2's slower-host
fail-closed timeout remains documented; no arbitrary limit relaxation occurs.

**N24-1 addressed:** the documentation explicitly says audio structure and data
references are not inspected. `-enable_drefs 0` prevents FFmpeg from following
external references; it does not require audio structure/reference validity and
FFmpeg may silently skip that audio. No audio verification flag is enabled.
**N24-3 addressed:** real-output integration cases name whether container parsing
or the real decoder refuses them; corrupt bitstream explicitly passes structural
inspection first. Parser refusals are not counted as real decoder refusals.

## T24-1 guard coverage and redundancy

New controlled fixtures isolate these guards while keeping other required
metadata valid:

- A `ctts` sibling beside an intact `stco`; `mvex`; duplicate video; a third track
  after a valid video+audio control; independent `elst` media_time and rate changes.
- Valid two-chunk control followed by overlapping offsets; zero variable sample
  size; independent `stsc` first chunk and sample description; independent `mdhd`
  duration, `tkhd` width/height and `avc1` width/height changes.
- Independent decoded PTS and DTS rows and duplicate valid time-base lines. These
  check the rounded output-grid contract, not exact stored timing.
- The entire decode argument array, version arguments and stdio contract; stdout
  and version caps observe SIGKILL directly, with otherwise ignorable comment
  padding, and provenance/version timeout/failure cases remain fixed-error refusals.
- Explicit unsupported-platform tests require refusal before file/tool access.

The named-inode case performs a real path replacement, masking only the old
handle's ctime in the controlled stat view so the named-inode check stands alone.
The ctime case performs a real same-inode/same-size/same-byte rewrite, masking only
mtime in the controlled stat view to model coarse/unavailable mtime resolution.
It requires actual ctime change and unchanged inode/size. No `utimes`, system
clock change, source-authority change or unsafe timestamp trick is used. These
are tests of independent guard logic with controlled stat views, not a claim
that this host naturally returned unchanged mtime on the rewrite.

The pre-open lstat check is defense in depth: `O_NOFOLLOW` and descriptor fstat
still independently reject symlinks/nonregular input. Removing that lstat alone
is intentionally recorded as a redundant surviving mutant, not falsely called
an untested independent boundary. Filesystem rename normally changes ctime too;
the separate controlled stat views above pin the two independent checks.
This is scoped regression protection for review22's identified guards, not a claim
that every parser expression or adversarial interleaving has been mutation-tested.

## T22-1 three remaining limit cases

Tests pin8accepted/9refused sources and32accepted/33refused kept spans. The span
case also observes that the refusal occurs before creating a derived native
projection; merely hitting the later32-clip limit would fail that assertion.
The total-byte boundary accepts exactly8GiB and refuses8GiB+1 with two modeled
regular-file streams, each individually within the existing limit. Read results
obey the1MiB buffer bound and hashing is mocked; no gigabytes are allocated,
written, read or hashed. These prove accounting/control flow, not large-file IO
performance or source content identity. The three specific review22 T22-1 guard
gaps are addressed; broader historical dependency/refusal coverage stays separate.

## Validation and retained evidence

Unique evidence directory:
`../openscreen-evaluation/overnight-2026-11-06/slice-24-review22-followup-20261106T122255Z/`.
Pinned Node22.22.1/npm10.9.4; disk inspection found14GiB free on `/tmp` and555GiB
on `/home`. Native source/addon/FFmpeg are unchanged; no native rebuild, Rust suite,
renderer/package build, visible Electron, physical capture or Windows/macOS test
is claimed. No new worker, checkout, reset/manual stash, auth/config/paid API,
real lesson, main/upstream/publication edit or worker push occurs.

Final validation, all pinned Node22.22.1/npm10.9.4:

- Focused139tests/5files pass,0skip; the three direct test files contain112passes,
  including10real-FFmpeg integration cases (the parser-refusal cases are labeled).
- The single full rerun is justified by material runtime executable hashing,
  version probing and bounded-process refactoring:5711tests/427files pass,0skip,
 122.61s. No second full rerun was needed.
- Root and test TypeScript pass. Initial test TS found7Buffer generic assignment
  errors in new fixture helpers; explicit Buffer annotations fixed them before
  final checks. Initial formatting/new empty-block warning were also corrected.
- Lint:fix and final lint pass with35existing warnings; docs37files and i18n
 1253literal keys/15locales pass, as do 83relative links across6changed lesson documents and diff checks.
- 53single-guard mutation controls:52killed by failed test assertions,1expected
  redundant lstat survivor. No transform/load failure was counted as a kill.
  This includes all three T22-1 limit removals and individually removed hardening
  arguments. Both source files were restored byte-for-byte and SHA256-verified.
- Runtime readback accepts all four retained rebuilt selected/single/short/
  fractional outputs, rejects the retained historical zero-last45-frame output,
  and separately confirms its real rounded decoded listing is accepted. All111
  inventoried prior evidence files and the original review22 bytes remain unchanged.
- Runtime decoder executable SHA256 is
  `393d9fa40315da9075c6cfc3b8702a16687c181d0881e2d502b36b27e7c4e814`,
  self-reported version token `n8.1.2-34-g9b6c8969e0-20260731`;
  unchanged addon SHA256 is
  `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

Evidence includes `mutation-controls.py`,53mutant logs, `mutation-results.json`
(with restoration checks), `mutation-source-identities.json`, focused/full/type/lint/docs/i18n/link logs,
`runtime-evidence.cjs`, its bundled validator/stub and `runtime-results.json`, and
`retained-zero-last-real-framemd5.txt`. No runtime executable/version path is added
to portable receipts; external local evidence may identify the tool paths used.
L24-1/L24-2, the identified independent T24-1 guards and three specific T22-1 limit
gaps are addressed pending independent review. N24-1/N24-3 wording is corrected;
N24-2 remains a documented fail-closed performance limitation. Redundant lstat is
retained as defense in depth, not falsely reported as independently pinned.
Historical authored source identity/availability remains the next separate
backend prerequisite after independent review; no GUI/API/player work is added.
