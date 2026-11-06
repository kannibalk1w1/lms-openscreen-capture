# Review19 bounded fix — pre-restart review20 required

Actual review19 examinedf7b8ed4c against8e0316ab and found MediumM22-1. The native
clip reader clamps to known asset duration before outputFrameCount, allowing
fewer frames to pass while the stored selected programme still claimed a longer
range. `prepareLessonRangeMedia` now independently applies the shared frame-grid
reader to the selected programme duration and requires equality with the actual
native clip-list count. No destination is chosen or native render started on a
mismatch. Existing ordinary planner/editor/native behavior is unchanged.

The new regression uses asset duration3, clip0–5 and selection1–5: the old code
could certify60frames/2seconds for a4second selection. The fix refuses it before
picker/render. An immutable f7b8ed4c archive outside checkout, overlaid with the
new test, passes1selected/15intentionally deselected with the fix and fails the
same selected regression against baseline. This is focused mutation/baseline
proof, not another full run.

C22-1: native may add AAC source audio or synthesized silence; the receipt now
states its policy, streamMetadataVerified:false and timingVerified:false. The
retained video-only-source fixture contains a silent AAC LC48kHz track with72
frames/1.5seconds (about−91dB). It sets format duration; that must never be cited
as corroborating the video-stream duration.

B22-2: baseline native muxer stores44samples×512ticks plus1sample×0 at timescale
15360, with1467ms edit-list coverage. Thus45 decoded frames have1.466667seconds
track duration/avg675/22 while native reports1.5. Earlier native exports share
this pattern. Review19 considers it nonblocking for the explicitly bounded
experimental backend/native-stat+hash contract, but blocking timed-player,
exact-duration or concatenation claims. Do not fix the muxer or start a next
phase before the requested restart pause. Timing flags remain false.

LowT22-1: added native NaN/infinite/wrong duration refusals, pre-render project
change, post-render cursor appearance, explicit changed/incomplete codes and
POSIX0700/0600 checks. Existing background-image refusal remains. Other individual
dependency/byte/source/fragment edge mutation coverage is not all pinned; retain
that honest coverage limit rather than claiming the Low fully closed.

Independent review19 results: first full5608pass/1environment skip in425files;
second full5607pass/1skip/1untouched copy-message flaky failure, which passed3/3
isolated runs. Skip: `electron/media/audioPeaks.test.ts` “decoding a real file
produces peaks in range, with real signal in them” because FFmpeg was absent from
its snapshot PATH. Focused72/7 differs from worker117/11;17guard mutations had2
killed/15survived before this fix. Reviewer ran codec probes, not new encoding,
tsc/Biome/Vite/i18n or physical acceptance. These are separate from worker evidence.
Original review19 is preserved unchanged. Actual focused review20 is required.


Worker fix checks:56focused/4files pass (16/1 overlap), new selected regression
fixed1pass versus baseline1fail with15intentional deselections, both root/test TS,
Vite renderer/main/preload, whole Biome35existing warnings and docs/diff pass.
No fresh full suite/native encode is claimed for the guard/receipt fix. The full
5609/425 zero-skip milestone is f7b8ed4c evidence before M22-1, not proof of this
follow-up. Actual focused review20 is pending.
