# Selected-range media backend and encoded proof — slice22

This is a bounded backend building block, not a GUI/CLI/MCP export feature or a
standalone timed player. It materializes one explicitly authorized saved-project
range through the existing native compositor callback. No listener, discovery,
recording/input collection, recovery API, application adapter or auth/config
change is added. Existing capture, editor export and static guides are unchanged.

The user explicitly resumed after the restart. [B22-2 native timing](LESSON_CAPTURE_NATIVE_VIDEO_TIMING.md)
now addresses the Linux final-video-sample defect with new proof; exact-SHA review
is pending. The slice22 evidence and paused checkpoint below are historical.
Runtime receipt flags remain false: this backend does not decode output or prove
audio alignment. No player or GUI/CLI/MCP materialization integration is added.

## Source, selection and output checks

`prepareLessonRangeMedia` validates the stored range and recomputes it against the
current saved project/render-input fingerprint. A structurally valid but forged
programme cache, stale project or changed source cannot be trusted. It adds cuts
to a private in-memory document, preserving original clips, annotations, speed,
source bytes and project files. Shared visible-clip/scene builders and the existing
output-frame-count reader determine the native inputs and expected frames. It
never renders a full-project temporary video for later cutting.

The first supported subset is deliberately narrow:1/30–120 programme seconds,
at most32 selected fragments and8 selected screen files, at most8GiB combined
source bytes. Video output is H.264 at30fps, source/project aspect scaled down to at
most1280px on the long side, rounded to even dimensions. Visible webcam tracks, imported
audio, click sounds, external background/annotation images and webcam effects are
refused rather than silently omitted. Embedded screen-file audio uses the existing
native path but has no new audio-timing acceptance. Native output may include
an AAC track, synthesized as silence when the source has no decodable audio.
The receipt labels the audio policy and explicitly leaves stream metadata and
audio timing unverified; an AAC track is not proof of recorded source audio. Native zoom/cursor focus can
read `.cursor.json` even when hidden, so any adjacent cursor sidecar is refused
before rendering and checked again afterwards; no cursor payload is collected.

A caller must supply explicit destination/selection authority, project reading,
serialization/cancellation and the native renderer. This module is not yet wired
to an app entry point. Cancelled folder choice creates nothing and starts no
render. An explicitly chosen existing parent (including a directory symlink) gets
a new UUID folder. POSIX modes are0700/0600; Windows ACL semantics are unverified.
No existing file is overwritten by the module's receipt write. Native writes only
its fixed `range.mp4` name inside that new directory.

Selected regular media files are read with leaf no-follow/nonblocking guards and
hashed in bounded chunks. The project is revalidated before and after native
encoding; source hashes and cursor-sidecar absence must remain the same. Native
frame count and native-reported duration must match the shared expected frame
count. An independent programme-duration frame-grid count must also agree with
the clip-list count, so a clip clamped to a shorter known asset duration cannot
certify only part of the selected programme. Refusal happens before destination
selection or rendering. The written MP4 is hashed, then `range-export.json` is written last with
source/output hashes, path-free source ordinals and labelled provenance. It never
copies original media or capture sidecars into the output directory.

Checks are observations before/after the operation, not an immutable snapshot or
OS sandbox against another process with the same user's authority. Source changes
and native/stat failures leave the new folder inspectable without a completion
receipt. A fixed `RangeMediaError` carries the explicitly chosen artifact directory
for a future authorized caller; raw source/parser/OS error text is normalized.
Original source/evidence is never cleaned up. No new GUI permission or public
remote method is inferred from this backend helper.

## Historical slice22 encoded evidence and then-unresolved timing

The final retained driver uses a fresh, actually probed five-second H.264 source:
640x360,30fps,150 decoded frames. Real DocumentService saves/reopens an unchanged
baseline with sourceStart0, cut1–2 and2x speed2–4. Requested ruler0.5–4 yields
kept0.5–1 and2–4, corresponding to original programme0.5–2 (1.5seconds). The unchanged staged addon renders those selected windows only,
using Vulkan on the RTX4070 and software libopenh264 after VAAPI is unavailable.
It produces45 H.264 frames at nominal30fps. Source/project/original evidence bytes
are unchanged; the selected output's hash matches its receipt.

Actual ffprobe/FFmpeg decoding confirms45 frames. Encoded output frames0,15,44
match original-project native programme frames15,30,59 with RGB mean absolute
errors approximately1.97,1.96,2.03 (threshold8). Three representative image checks
are not universal frame-accuracy proof. No physical capture or audio alignment
is tested.

**Baseline native timing defect remains open:** native stats report1.5seconds,
but the video stream reports1.466667seconds, with average675/22 despite nominal
30/1. Review19 pinned the stored MP4 timing:44samples have duration512ticks at
timescale15360, and the last sample has duration0. The edit list covers1467ms.
Earlier native exports also show the same N−1-frame duration pattern, so this is
not introduced by the backend.

The retained output also contains an AAC LC48kHz track,72 audio frames/1.5seconds,
at approximately−91dB (silence), while its source has video only. That audio track
sets the MP4 format duration1.5seconds; it is not independent corroboration of
video duration. Native clip inputs optimistically declare audio, so this is the
existing synthesized-silence path. Review19 confirmed both streams read-only. The backend does not decode output at runtime;
the return duration is explicitly `nativeReportedDurationSec`; the receipt also
says `mediaDecodedByValidator:false` and `encodedTimingVerified:false`. A completion
receipt proves this limited native-stat/hash contract, not timed-playback readiness.
Do not wire a timed learner player or claim exact encoded duration until this
packet/container timing discrepancy is resolved or explicitly validated.
No Rust/native change was made to hide or normalize it during this slice.

An initial attempt used an older three-second fixture with five-second metadata.
Native shortened it, the frame-count check failed, and no completion receipt was
written. That failed artifact/log/initial driver are preserved. It is not a passing
encode. The final clean baseline, driver source, selection, references, actual
encoded probes and decoder validator are retained separately. The prior slice21
fixture also remains in its documented post-stale-source state (sourceStart0.25);
it was not overwritten to make the headline pre-change plan easier to reproduce.

Artifacts outside checkout: `slice-22-*`, `lesson-range-native-fixture/` (failed),
`lesson-range-native-fixture-final/` (initial labelled proof), and
`lesson-range-native-fixture-verified/` (current receipt labels/clean baseline).
The `.cjs` drivers and Python encoded validator are preserved. An Electron app-path
lookup is stubbed only in this external Node fixture; this is not an Electron run.
Staged compositor SHA256 remains
`a66dbe748a1d8129292e6099cd34ed875bf5ef17eddad5cf082541831e72f446`.

## Review18 follow-ups and acceptance limits

Boundary regressions now accept exact clip/cut kept starts and ends, accept exactly
128 fragments/refuse129, independently reject a leading unexplained imported gap,
check query presence=false, and refuse dirty non-render state or a wrong plan echo.
Stale-project guidance is neutral for both stills and range references. These
strengthen existing correct guards; review18 found no High/Medium defect.

Unit tests cover ephemeral projection, source preservation, source/output hashes,
forged/stale plans, background-image refusal, cursor sidecars, source links,
cancellation, native/stat/source/project failures, incomplete receipts and fixed
errors. Tests with mock bytes do not establish real codec validity; the separate
native/decoder fixture above supplies bounded actual encoded proof.

Review18 independently reported5591 passes plus one environment FFmpeg-on-PATH
skip in424files,114focused/8 and102broader/10 in different overlapping sets,
root/test TS, Biome35warnings and i18n1253. Its report did not identify the exact
individual skipped test name; do not label both candidate integration suites
skipped or extend that count to this slice. Worker slice21 was5592/424,0skip.
Actual review19 examined f7b8ed4c; the bounded fix requires actual review20. No new native/Rust source or binary,
physical OS/portal/keyboard/camera, Windows/macOS, actual Electron/stdio process,
screen-reader, full course package or timed-player acceptance is claimed.

Final worker evidence: **5,609tests/425files,0skipped**,127.59s;117focused/11files
(overlap). Root/test TypeScript, final renderer/main/preload Vite build, lint35
existing warnings, i18n1253, docs/diff pass. The pre-resume build/full logs ended
without summaries and are not counted. No Rust source or staged binary changed;
actual native encoding/decoding used the unchanged addon, not a rebuild or a new
physical/native capture acceptance run.

Stored range plans do not pin historical source-file bytes. The new file hashes
prove equality at the checks surrounding this materialization, not that a source
has remained unchanged since the reference was authored. Before any later user-
facing materialization workflow, source identity/availability and encoded timing
need explicit treatment; do not describe this as a complete source attestation.
Actual review19 requires the bounded M22-1 fix; actual review20 must assess it.
After its material findings are addressed, write the exact restart checkpoint and
pause as requested. No further roadmap phase starts before user resumption.


Actual review19 found MediumM22-1: native clip readers can clamp a clip to known
asset duration before expected-frame counting. The new independent programme-grid
comparison refuses that shorter window before folder choice/rendering. Its new
regression passes the fix and fails f7b8ed4c in an outside-checkout snapshot.
C22-1 AAC attribution/receipt policy is corrected above; baselineB22-2 last-video-
sample duration0 is pinned and intentionally deferred until after restart.
Timing flags remain false. Review19 considers that baseline timing limit
nonblocking for this bounded experimental backend, but blocking for timed players,
exact encoded duration and concatenation claims. No such next phase starts now.

LowT22-1 coverage is strengthened for native NaN/infinite/wrong duration, pre-render
project change, post-render cursor appearance, error-code mapping and POSIX modes.
Per-dependency and all byte/source/fragment limit-edge mutation coverage is still
incomplete; do not claim all17 guard mutations are now pinned. Code-reading and
reviewer probes remain distinct from regression tests. Actual focused review20
must assess the fix before the final restart checkpoint.


Bounded review19-fix validation:56focused tests/4files pass, with16/1 narrower
overlap. The selected clamp regression passes fixed and fails f7b8ed4c; its other
15 cases are intentionally deselected in that mutation/baseline run. Root/test TS,
renderer/main/preload Vite build, whole lint35 existing warnings and docs/diff
pass. The full5609/425 zero-skip milestone belongs to f7b8ed4c before M22-1 was
fixed; it was not repeated for this narrow guard/receipt change. Native encoding,
Rust/binaries, physical input, UI/stdio and platform acceptance were not rerun.


Final actual review20 accepts125ec5de as the end of this bounded backend phase,
CLOSED M22-1 and C22-1, and found no High/Medium/material blocker. Independent
59focused/5files,0skip,root/test TS, Biome35warnings and baseline/mutation/probe
checks support that verdict; no fresh full/Vite/native encode was run by it.
LowL23-1 rare exact-boundary float mismatch fails closed and is deferred; T22-1
remaining guard coverage stays open; baselineB22-2 native last-sample duration0
stays deferred. All timing/audio validator flags remain false. The user-requested
restart checkpoint/pause follows; do not start a new phase or fix deferred items.
