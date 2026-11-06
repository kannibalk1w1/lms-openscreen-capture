# Linux native video sample timing — post-restart slice23 / B22-2

The user explicitly resumed with “continue from where we left off pre-restart”.
This slice fixes the Linux compositor's unknown final video sample duration,
using the existing native encoder/muxer path. It adds no player, GUI/CLI/MCP
materialization entry point, audio timing validator or capture functionality.
Actual Claude review of the committed SHA is pending; no push is part of this
worker's completion. Prior reviews and slice22 evidence remain unchanged.

## Cause and narrow change

The retained slice22 MP4 has 45 video samples at nominal30fps. Its video `stts`
contains44×512ticks and1×0ticks at timescale15360:22528ticks/1.466667seconds.
The video edit list covers1467ms. AAC silence extends the format duration to1.5s;
that was never evidence that the video stream itself covered1.5s.

`pipeline_linux::Muxer::drain` forwarded unknown encoder packet durations
unchanged. FFmpeg can infer preceding sample durations from DTS differences,
but the final sample has no successor. Both Linux software and VAAPI paths
advance by one codec-time-base tick per output frame. The drain now supplies that
one tick only when duration is zero, before `av_packet_rescale_ts`; known encoder
durations, PTS/DTS, encoder configuration, frame contents and audio stay intact.
The shared Linux drain covers both encoder paths; only software libopenh264 was
actually available and validated on this host. Windows/macOS code is unchanged
and untested. The existing public export API accepts integer output fps only.

Four regressions check actual software encode → production drain → MP4 → demux
for1frame/30fps,2frames/60fps and45frames/30fps, plus packet rescaling with known
and unknown durations including a1001/30000 rational frame tick. No AAC samples
are written by the encode/demux tests, so audio cannot hide a short video track.
Removing only the fallback makes all4tests fail, including video duration22528
versus23040ticks in the45-frame case; fixed source was restored byte-for-byte.

## Rebuilt addon and actual output

The affected addon was built separately with pinned Node22.22.1/npm10.9.4:
`npm run build:native:compositor:linux` (release build3m53s). Built `.so` and staged
`.node` hashes match; SHA256 is
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
The build verified no unprefixed FFmpeg imports. Identity evidence records source
hash, all6matched namespaced libraries, dependencies and ORIGIN runpath. Direct
Node loaded this addon without unnamespaced `LD_LIBRARY_PATH`. The prior addon
and libraries were copied into the uniquely named evidence directory before build.

A fresh bundle of the current DocumentService/range-media path saved/reopened a
new disposable project, kept the original slice22 selection and rendered its
selected windows with the rebuilt addon. A synthetic30000/1001fps source also
exercises source sampling on the existing integer30fps output grid.

| Actual encode | Decoded video frames | Video stream duration | Video sample durations |
| --- | --- | --- | --- |
| Selected cut/speed range,30fps | 45 | 1.500000s | 45×512ticks at15360Hz |
| Single frame,30fps | 1 | 0.033333s | 1×512ticks at15360Hz |
| Short output,60fps | 2 | 0.033333s | 2×256ticks at15360Hz |
| 30000/1001fps source →30fps output | 45 | 1.500000s | 45×512ticks at15360Hz |

Independent ffprobe/FFmpeg readback checks every video packet's PTS/DTS/duration,
stored/decoded frame count, stream rate/duration and dimensions640×360. Direct
MP4 box inspection confirms one full-duration `stts` run for every output. The
selected video's `mdhd` duration is23040ticks and its edit list now covers1500ms.
The format duration was recorded separately, never substituted for video timing.

Selected encoded frames0/15/44 match retained original-project native frames
15/30/59 with RGB mean absolute errors1.967/1.958/2.029 (threshold8). All45decoded
RGB frames are also byte-identical to the retained pre-fix encode, SHA256
`4586e12616240261e75b212339a4d999948e9503caec42b07e4045f5e5932cd0`;
only timing changed. The three decoded PNGs were visually inspected. Additional
short/fractional-source reference comparisons have RGB MAE2.75–2.95. Every
original fixture/project/evidence file covered by the pre-run inventory retained
its SHA256; the new project's source and saved bytes also remain unchanged.

These are bounded synthetic/offscreen Linux export proofs, using Vulkan on an
RTX4070 with software H.264 after VAAPI refusal. They prove neither physical
capture nor audio alignment, hardware encoding, Windows/macOS, visible Electron
interaction, screen-reader behavior or timed-player readiness. Runtime range
receipts still say `encodedTimingVerified:false` and
`mediaDecodedByValidator:false`; offline proof does not change that contract.

## Validation and retained evidence

All Node commands used22.22.1/npm10.9.4. Current disk checks found about555GiB
available on `/home` and a largely empty16GiB `/tmp`; no shared caches were purged.
No competing implementation writer was found and no user apps were killed or
restarted. Original07:30/08:00cutoffs remain revoked.

- Focused Rust timing tests:4pass; missing-fallback control:4expected failures.
- Compositor unit/integration stages:562pass,1existing ignored. This includes
  536unit tests plus26integration cases; zero-test platform/fixture-gated binaries
  are not physical acceptance. Some opt-in fixture/GPU tests can return early;
  no `OPENSCREEN_TEST_MEDIA` was supplied. VAAPI probes return early on this host.
- Default `cargo test -p openscreen-compositor` exits101 on14generated-FFmpeg
  doctests (C snippets parsed as Rust). A guarded control with the only changed
  Rust source temporarily restored to baseline3eec7805 reproduces the same14
  doctest failures; the fixed source was then restored byte-for-byte and matches
  the rebuilt addon's recorded source hash. This is separate from passing
  unit/integration stages; no blanket all-Rust-green claim is made.
- Initial Rust unit run:535pass/1fail/1ignored because the standalone process
  lacked bundled fonts. The failing code-raster test passes with
  `OPENSCREEN_FONTS_DIR=$PWD/public/fonts`, the app's normal runtime contract;
  the complete unit/integration rerun used that setting. No font code changed.
- PipeWire helper Rust suite:134pass,1existing ignored; helper source/binary
  unchanged and no capture run claimed.
- Focused Vitest:70tests/3files pass; root and test TypeScript pass.
- Initial full Vitest:5614pass/1fail in425files under concurrent load (chat copy
  button lookup). Focused rerun4/4passes; full rerun with `--maxWorkers=4`:
  **5615tests/425files pass,0skipped**,160.69s. Both original logs are preserved.
- `npm run lint:fix`: no fixes,35existing warnings; docs check37files and
  i18n1253keys pass. Final documentation links and diff checks are recorded with
  the slice. No renderer rebuild or packaging/release run was needed or claimed.

All fresh artifacts are under
`../openscreen-evaluation/overnight-2026-11-06/slice-23-post-restart-20261106T112509Z/`:
original hash inventory and baseline packets/frames/streams/boxes; preserved
baseline addon/libraries; build and test logs; bundle/stub/driver/validator source;
new selected/short/fractional media; every packet/frame/box probe; decoded PNGs,
visual comparisons, pixel identity and `validation-summary.json`. The initial
short-driver call omitted required `hasAudio` and failed before encoding; its
script/log and the dependent validator failure remain beside the corrected run.
The Electron app-path stub is confined to the external Node fixture, not the app.

Next: coordinator commissions actual read-only Claude review of the exact local
commit. B22-2 has bounded implementation/proof, not review approval. L23-1/T22-1,
historical source-file identity, runtime encoded validation and the remaining
product map stay open before broader user-facing integration or timed delivery.
