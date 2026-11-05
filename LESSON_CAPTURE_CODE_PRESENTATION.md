# GDScript presentation in preview and video export

Restart OpenScreen after this build so Electron loads the rebuilt native compositor.

1. Open a video project and place the playhead inside a clip.
2. Open **Typing capture**, capture a snippet in the pad or import a journal from
   the optional Godot adapter. Choose **Add code to timeline** beside a section.
   This saves the take and its presentation together in one undoable gesture.
3. Select the new **Code** timeline region. Its inspector offers **Pause picture**
   or **Continue playing**, and an independent **Blur background** switch.
4. Drag the selected panel on the preview and resize its corner handles. Choose
   light/dark colour, font size, source line/excerpt length and line numbers.
5. Drag the region's timeline edges to change its duration and typing pace. Preview
   and normal video export use the same native renderer.

Defaults are clean type-out, paused picture and blur enabled. Clean type-out reveals
syntax-coloured final GDScript while retaining its indentation. **Captured edits**
replays the observed intermediate buffers, including corrections. Neither mode
rewrites or discards the original take. This is a ScriptWriter-style visual result;
it does not import ScriptWriter project formats or type into Godot.

The panel follows the caret vertically/horizontally when an excerpt overflows.
Choose an excerpt of up to 60 lines/12,000 characters. Captured-edit mode supports
up to 1,000 edits per region. This keeps generated presentation frames bounded;
the captured take retains its separate evidence limits. Changing presentation
settings is undoable; ordinary project persistence embeds both take and settings.

**Pause picture** holds the source screen and camera frames (and cursor time)
while the code types. The lesson timeline and original audio continue. When the
region ends, the picture returns to the current timeline moment. It does not add
extra duration or pause narration. Layout/effect animations still use timeline time.

Typing capture has an independent clock. Placement is explicit at the playhead,
with a source anchor inside its carrier clip. This build does not claim automatic
Godot/video synchronization. A newly added region is bounded by that clip's end.
Adjacent same-source split fragments share presentation timing; unrelated-asset
transitions and the complete cut/speed/duplicate matrix still need acceptance work.

## Implementation and licenses

The code region reuses annotation geometry, source anchors, history and selection,
with its own timeline lane. Highlight.js and the BSD-3 GDScript grammar supply
syntax colours; the grammar license ships in `public/licenses/`. Godot 4 annotations
and keywords extend the upstream grammar. The native renderer rasterizes a generated
SVG with bundled IBM Plex Mono through resvg, then uses the existing image path.
Full-frame blur samples the composed screen/camera frame before painting code.
Separate decoder caches hold paused source frames without stopping timeline decoding.
Linux, Windows and macOS share the data model and renderer logic; only Linux was
compiled and exercised here.

## Validation — 5 November 2026

- Full Vitest: **5,272 tests / 391 files pass**. Model/UI tests cover syntax token
  preservation (including markup and Unicode), clean/captured compilation, saved
  settings/native source-time projection, independent switches and undo-write audit. Final targeted recheck: 6 tests
  pass, including 2 added after the full run for atomic insertion/source anchoring,
  clip-end bounds and project-switch cancellation.
- Actual isolated Chromium controls: switch pause/play and blur independently,
  choose captured edits/light theme/font size, drag and resize the real annotation
  overlay. This is browser UI coverage; it is not a full Electron desktop pass.
- Native Rust: 3 code-card tests and 1 existing SVG raster regression pass.
  Linux native offscreen preview seeks into the middle of the code region. Six
  MP4 exports cover all pause/play × blur on/off combinations, a smaller light
  panel and captured-edit mode, using the actual prior Godot journal. Inspected
  PNGs show syntax colours and bundled font rendering. Background pixel change
  is 0.48 for paused picture versus 5.48 for playing; blur reduces edge energy
  from 0.47 to 0.20 in the sampled margin. Code-coloured pixels grow from 12 to
  223 while the underlying picture stays paused. Preview/export images agree
  visually at the seeked time. These are synthetic-footage checks, not real
  desktop capture. Evidence: `../openscreen-evaluation/code-presentation/`.
  Addon SHA-256: `a66dbe748a1d8129292e6099cd34ed875bf5ef17eddad5cf082541831e72f446`.
- Both TypeScript configurations, Vite/main/preload build, i18n and Biome checked.
  Biome reports the same 35 existing warnings. Native build has existing warnings.
- Skipped: physical Godot typing/IME, OS file picker/full Electron desktop pass
  (Orca provider has no screenshot/hotkey and exposes only a terminal), Windows/macOS
  build/runtime, GIF, webcam/audio combinations, all cut/speed/overlap combinations
  and the remaining manual checklist. This is local partial validation, not a release.

Next: associate Godot capture sessions with recording media time and preserve clock
anchors/pause boundaries, so code sections can be placed automatically on the right
source clip. Portable text/JSON/playback-file exports follow.

## Subsequent association slice

[Explicit section onset association](LESSON_CAPTURE_ASSOCIATION.md) now offers
recorded-flag placement for Godot sections. New recording session/pause metadata
bounds initial placement on matching source footage; independent takes retain
playhead placement. Live edit-level synchronization remains open. Next: portable
section JSON/text/playback-file exports.
