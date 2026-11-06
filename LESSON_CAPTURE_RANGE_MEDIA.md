# Selected-range media backend and encoded proof — slice22

This is a bounded backend building block, not a GUI/CLI/MCP export feature or a
standalone timed player. It materializes one explicitly authorized saved-project
range through the existing native compositor callback. No listener, discovery,
recording/input collection, recovery API, application adapter or auth/config
change is added. Existing capture, editor export and static guides are unchanged.

The current phase ends after its exact-SHA review and restart-safe checkpoint.
The user requested a pause to restart the computer; no player or other roadmap
phase starts before resumption.

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
source bytes. Output is H.264 at30fps, source/project aspect scaled down to at
most1280px on the long side, rounded to even dimensions. Webcam tracks, imported
audio, click sounds, external background/annotation images and webcam effects are
refused rather than silently omitted. Embedded screen-file audio uses the existing
native path but has no new audio-timing acceptance. Native zoom/cursor focus can
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
count. The written MP4 is hashed, then `range-export.json` is written last with
source/output hashes, path-free source ordinals and labelled provenance. It never
copies original media or capture sidecars into the output directory.

Checks are observations before/after the operation, not an immutable snapshot or
OS sandbox against another process with the same user's authority. Source changes
and native/stat failures leave the new folder inspectable without a completion
receipt. A fixed `RangeMediaError` carries the explicitly chosen artifact directory
for a future authorized caller; raw source/parser/OS error text is normalized.
Original source/evidence is never cleaned up. No new GUI permission or public
remote method is inferred from this backend helper.

## Encoded evidence and unresolved timing

The final retained driver uses a fresh, actually probed five-second H.264 source:
640x360,30fps,150 decoded frames. Real DocumentService saves/reopens an unchanged
baseline with sourceStart0, cut1–2 and2x speed2–4. Requested ruler0.5–4 yields
kept0.5–1 and2–4. The unchanged staged addon renders those selected windows only,
using Vulkan on the RTX4070 and software libopenh264 after VAAPI is unavailable.
It produces45 H.264 frames at nominal30fps. Source/project/original evidence bytes
are unchanged; the selected output's hash matches its receipt.

Actual ffprobe/FFmpeg decoding confirms45 frames. Encoded output frames0,15,44
match original-project native programme frames15,30,59 with RGB mean absolute
errors approximately1.97,1.96,2.03 (threshold8). Three representative image checks
are not universal frame-accuracy proof. No physical capture or audio alignment
is tested.

**Timing discrepancy remains open:** native stats report1.5seconds and the MP4
format duration is1.5, but the video stream reports1.466667seconds, with average
rate675/22 despite nominal30/1. The backend does not decode output at runtime;
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
forged/stale plans, unsupported dependencies, cursor sidecars, source links,
cancellation, native/stat/source/project failures, incomplete receipts and fixed
errors. Tests with mock bytes do not establish real codec validity; the separate
native/decoder fixture above supplies bounded actual encoded proof.

Review18 independently reported5591 passes plus one environment FFmpeg-on-PATH
skip in424files,114focused/8 and102broader/10 in different overlapping sets,
root/test TS, Biome35warnings and i18n1253. Its report did not identify the exact
individual skipped test name; do not label both candidate integration suites
skipped or extend that count to this slice. Worker slice21 was5592/424,0skip.
Actual review19 must inspect the new exact SHA. No new native/Rust source or binary,
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
The current phase's bounded backend/native proof is pending actual review19.
After its material findings are addressed, write the exact restart checkpoint and
pause as requested. No further roadmap phase starts before user resumption.
