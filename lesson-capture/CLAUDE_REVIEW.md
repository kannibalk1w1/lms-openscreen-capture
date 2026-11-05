# Claude review of the LMS OpenScreen snapshot

- **Reviewed:** committed diff `d7adf059..f6189445` (`feat: preserve LMS capture toolkit and Godot code presentation`), branch `lesson-capture/voiceover-captions`. 205 files, +12,249 / −551.
- **Not reviewed:** the uncommitted clock-sync edits now in the working tree (`recordingFlags.ts`, `typing/schema.ts`, `typingTakes.ts`, `TypingCaptureDialog.tsx`, `typing/association.ts`, …). Line references below are to `f6189445`, not to the working tree.
- **Date:** 5 November 2026. Reviewer: Claude (Opus 5.5). No application files were changed. The only file written is this one.

Findings are ordered by severity. Each one has a file:line reference (at `f6189445`), the impact and how to reproduce it. "Measured" means I ran it. "Derived" means I worked it out from the code.

---

## High

### H1. The Godot adapter reaches its 10,000-record limit after about 2,500 typed characters, which stops capture partway through a normal lesson script

`integrations/godot-typing/addons/openscreen_typing/observer.gd:11-14,45`, `plugin.gd:102`

Each keystroke in the CodeEdit produces about four journal records:
- `gui_input` key press
- `gui_input` key release
- a `text_changed` snapshot
- a `caret_changed` snapshot

Each snapshot also carries the **whole buffer** (`"text": editor.text`), even when only the caret moved. When `_sequence >= 9999`, the plugin sets `_limited` and stops the take. That happens after roughly 2,500 typed characters, which is about 60–80 lines of GDScript, before counting navigation and corrections.

The 8 MiB byte cap is the binding limit for larger files. Typing a 4 KB script from empty writes about 2 × 2 KB × 4,000 ≈ 16 MB of snapshots, which is twice the cap.

- **Impact:** a single-take lesson script ends up `coverage: "limited"` and loses the rest of the typing. The only warning is a toolbar label in Godot that the presenter is unlikely to see while recording. The README lists the raw limits (10,000 records / 8 MiB) but not that they cost about 4 records per character.
- **Derived from code; not measured in Godot.**
- **Repro:** enable the addon, start capture on an empty script, type about 2,600 characters. The journal ends at sequence 9999 with `"coverage":"limited"`.
- **Fix direction:**
  - Send `caret_changed` as a selection-only record with no `text`.
  - Have the adapter send diffs (or only text when it changed) instead of the full buffer.
  - Optionally drop key releases, or make key events opt-in.
  - Raise the record cap to match.
  - Add a test that types N characters and checks how many records that uses.

---

## Medium

### M1. The default flag hotkey Ctrl+Shift+F is Godot's "Find in Files" and is grabbed globally while recording

`src/lib/shortcuts.ts:122`, `electron/recording/recordingFlags.ts:47`, `LESSON_CAPTURE_FLAGS.md` ("The desktop may retain the key reservation until app exit")

`RecordingFlags.start()` registers the binding through `globalShortcut` for the whole take. On X11, Windows and macOS this takes the key away from the focused app. So a Godot lesson that demonstrates Find in Files drops a silent flag and Godot never sees the shortcut. On Wayland the project's own docs say the portal may keep the reservation until OpenScreen exits, which would break Godot's shortcut for the rest of the session.

- **Repro:** start a recording, focus Godot's script editor and press Ctrl+Shift+F. The flag count goes up and the Find in Files dialog does not open.
- **Fix direction:** pick a default that Godot, Roblox Studio and Blockbench don't use (for example a chord with Alt, or F-key combinations), and note the conflict in the shortcut UI.

### M2. The input journal cannot yet support the clock-sync slice: no pause/resume records, unmatched button edges, and media time taken when the event is processed

`electron/native/pipewire-capture/src/main.rs:830-860`, `src/native/captureEvents.ts:35-47`, `electron/native-bridge/capture/linuxNativeCaptureSession.ts:518-522`

1. **No pause/resume records.** The journal has `session-start`, buttons, status, warnings and `session-end`, but nothing for pause or resume. The helper drops events while paused (`if !paused`), but the boundary itself is never written. A consumer cannot tell a quiet stretch from a pause, and cannot map `monotonicMs` to `mediaTimeMs` across a pause except by guessing between neighbouring events. The roadmap's next slice explicitly needs pause/resume boundaries.
2. **Unmatched button edges.** A button pressed before Pause and released while paused leaves a down with no up. After resume, the next click adds a second down. The same thing happens around the start boundary (an edge from the portal-picker click). Nothing marks these edges, so click/drag reconstruction double-counts or mis-pairs them, and the counted acceptance test ("each physical down/up represented exactly once") does not cover this case.
3. **Media time is taken late.** `media_time_ms` is `capture.elapsed_active()` read when the run loop handles the message, not when the event happened. The loop also does frame staging and encoding, so busy frames delay button messages. The event's own `monotonic_ms` could be used instead: `elapsed_active − (now_mono − event_mono)`. The type comment admits the dispatch-time clock, but this matters once the journal is used for frame-accurate placement.

**Fix direction:**
- Append `capture-paused` / `capture-resumed` records that carry both clocks.
- Either keep a per-button pressed set and emit a synthetic release at pause/stop, or mark unmatched edges with `unpaired: true`.
- Compute media time from the event's monotonic stamp.

### M3. Captured-edit code panels are rebuilt synchronously on every document change; measured about 1 s and 2.3 MiB per rebuild

`src/native/sceneDescription.ts:1613-1638`, `src/components/ai-edition/NativeCompositorOverlay.tsx:164`, `src/lib/typing/capture.ts:178-192`, `src/lib/typing/presentation.ts:96-131`

`buildSceneDescription` calls `codePanelForRegion` for every code annotation, and does so separately for each split piece. It runs whenever `playbackDocument` changes, which includes every live slider/drag tick because `setLive` writes through `setDocument`.

Each call does three expensive things:
- `sectionPlayback` replays the **whole take from the beginning**. It does not stop after `endSequence`, and every `applyTextEdit` runs `Array.from` over the full text.
- Highlight.js runs on every frame.
- The whole result is serialised into the scene JSON sent to native code.

**Measured** with the committed `capture.ts` / `presentation.ts` (esbuild probe, Node 22): a 12,289-character script with 1,000 edits in captured-edit mode took **1,055 ms** to rebuild and produced **2,335 KiB** of `codePanel` JSON. The doc says captured-edit mode supports up to 1,000 edits per region, so this is a supported case.

- **Impact:** the editor freezes on each inspector drag or timeline drag tick while such a region exists. Large IPC payloads go to the compositor, and the main process also runs `resolveSceneAssetPaths` on each one.
- **Fix direction:**
  - Memoize panels by (take id, section, presentation settings, firstLine/lineCount).
  - Stop `sectionPlayback` at `endSequence`.
  - Send token frames to native once, keyed by an id, instead of inside every scene.

### M4. Hashing every image annotation's full source on every frame undoes a documented upstream performance safeguard, and animated code panels re-rasterise each frame

`crates/compositor/src/compositor_linux.rs:3084,3089` (same pattern at `compositor_windows.rs:3097,3102` and `compositor_macos.rs:2005,2010`), `crates/compositor/src/svg_image.rs:4-8`

The upstream comment on `ann_img_cache` (linux:424-428) says to key by annotation id and use the source **length** as the change marker because "an image annotation often carries a multi-megabyte data URI; hashing it every frame" is too expensive. `source_key` now runs SipHash over the full source **on every frame for every visible image annotation**, on all three backends, whether or not it is SVG. A 5 MB PNG data URI costs a few milliseconds per frame per image.

Code panels have a related cost. `image_source` produces a new SVG string whenever the type-out progress or caret blink changes, so the cache misses. Each miss runs resvg text layout and rasterises at `max(render_w, render_h)` (for example 1920 px) and creates a new GPU texture. For clean type-out that happens almost every frame.

- **Fix direction:**
  - For data URIs and paths, keep the old length test and add a cheap content fingerprint (length plus a hash of the first and last kilobyte).
  - Only use a full hash for `openscreen-code:` sources, or key code panels by `(id, visible char count, caret, blink phase, size)` before building the SVG at all.
  - Rasterise at the panel's on-screen pixel size, not the output's largest side.

---

## Low

### L1. In captured-edit mode, an edit outside the excerpt moves the caret and active-line highlight onto the wrong line

`src/lib/typing/presentation.ts:112-116`, `crates/compositor/src/code_panel.rs:116`

`caretLine = prefix.split("\n").length − firstLine` goes negative when the edit is above the excerpt, and past the last line when it is below. Rust clamps it to `0..lines.len()-1`, so the highlight and caret are drawn on the first or last visible line at the edit's column.

**Measured:** an edit at line 1 with `firstLine: 20` produced `caretLine: -19`. Hide the caret or highlight when it is out of range, or let the excerpt scroll to follow edits.

### L2. The section speed selector has no effect on the video

`src/components/ai-edition/v4/TypingCaptureDialog.tsx:355`, `src/lib/typing/presentation.ts:128`

`sectionPlayback` divides times by `section.speed`, but `codePanelForRegion` then divides them by the total (`frame.atMs / total`), so speed cancels out. Only the dialog's text preview is affected. The documented control for pace is the region's duration ("Drag the region's timeline edges to change its duration and typing pace"). Either drop the speed selector, label it "preview speed", or use it to set the default region length.

### L3. Code panels have no fallback font, and one documented Rust test only passes with an environment variable set

`crates/compositor/src/code_panel.rs:130,142,153`, `code_panel.rs:266-272`, `svg_image.rs:21-24`

The panel SVG asks only for `font-family="IBM Plex Mono"`. The bundled fonts load only when `OPENSCREEN_FONTS_DIR` is set, and `set_monospace_family` only affects the generic `monospace` family. Without the variable, on a machine without Plex Mono, **no code text is drawn**.

**Measured:** `code_panel::tests::code_raster_is_a_visible_rgba_panel` **fails** under plain `cargo test` and passes with `OPENSCREEN_FONTS_DIR=public/fonts`. The Electron app sets the variable, so production builds are fine, but the "3 code-card tests pass" claim depends on the environment. Use `font-family="IBM Plex Mono, monospace"` and have the test set or locate `repo_fonts_dir()`.

### L4. Custom arrow-head SVG is sanitised only when imported; SVG loaded from a document goes into the final drawing unchecked

`src/lib/ai-edition/annotations/svgAssets.ts:30` (`sanitizeSvg`), `src/lib/ai-edition/schema/index.ts:420`, `src/lib/ai-edition/annotations/arrowSvg.ts:79`

`figureData.headSvg.svg` is only validated as a string of up to 400,000 characters (the sanitiser's cap is 256 KiB). `resolveSvgAnnotation` splices it raw into a generated SVG in the main process.

A project file, a pasted region, or an agent/MCP document write can carry SVG that never passed through `sanitizeSvg`: closing tags that break the outer SVG, heavy filters, or `<image>` elements. The impact is limited:
- The DOM shows these only through `<img src=data:…>`, where scripts don't run.
- resvg runs no scripts, and the code disables image href resolution.

So the realistic effect is a broken or slow render of that annotation, not script execution. Re-run `sanitizeSvg`, or a server-side equivalent, when the scene is resolved, and make the schema's cap match `SVG_MAX_BYTES`.

### L5. The input-capture HUD notice appears for Linux recordings that write no journal

`src/components/launch/LaunchWindow.tsx:1190`, `electron/ipc/handlers.ts:2651`

`showInputCapture = recording && platform === "linux"`. A Linux recording that goes through the browser/X11 recorder instead of the native helper has no `linuxNativeCaptureSession`, so health is `null` and the HUD shows the "unknown" state with the physical-button scope text, which suggests buttons are being captured. Show the notice only when a native session exists, or add an explicit "not captured on this backend" state.

### L6. The Windows and macOS compositor changes have never been compiled

`compositor_windows.rs` / `compositor_macos.rs` add the `code-blur` draw, `frozen_code_source`, new texture bindings (`ann_copy_srv`, `ann_copy`), connector batches, and an import edit that removes `decode_data_uri` on Windows. `live.rs` and `timeline_walk.rs` (shared) now open a second `Decoder::open_for_export` for paused pictures. The docs say only Linux was built.

These changes affect what users see and could break the build. Before relying on them, run `cargo check` for the Windows and macOS targets (CI or cross-checking) and do one export on each platform.

### L7. Maintainability: large formatting-only diffs and dense one-line code

- `electron/native/pipewire-capture/src/capture.rs` and `main.rs` include several hundred lines of rustfmt-only reflow of untouched upstream code (for example `AudioMix`, the microphone tests and the crop tests). That makes future upstream merges conflict-prone.
- `svg_image.rs`, `code_panel.rs` and the new `code-blur` arms pack control flow onto single lines, which AGENTS.md advises against ("A dense one-liner that hides control flow is worse").

Consider moving the reformatting to its own commit, or reverting it.

### L8. The evidence archive contains real desktop recordings

`lesson-capture/evidence/evaluation.tar.gz.part-000..003` (≈116 MB)

The reassembled archive's SHA-256 matches `manifest.json` (`d096342a…3613`). It holds 286 entries, including 77 video/image files. Some are real KDE desktop captures, for example `input-events/embedded.mp4` (36 MB), and one 13 MB recording appears twice (`recording-1793880276858.mp4` and its `portable-raw-capture/` copy). File names show no credentials, browser profiles or `.env` files.

**I did not view the media.** The repository is private, but the user should check that the captures show nothing personal before the repository is shared further.

### L9. Changes to upstream helper behaviour (recorded for upstreaming, not defects)

- evdev readers now start whatever the cursor mode is. Upstream skipped them when the session paints no cursor.
- The `click-capture-unavailable` warning was replaced by `input-capture-status`. No TypeScript code used the old warning.
- Left-click cursor samples are now suppressed while paused. Upstream emitted them.

These are deliberate, but any upstream pull request should list them.

---

## Spot-checks that held up (no finding)

- **Typing schema/importer:** contiguous code-point diffs, rejection of sequence gaps and unfinished takes, rejection of edits during pause, section coverage, 8 MiB checks, and the UTF-16 versus code-point bridge in `padSelection`. Godot `String` columns are code points, so `_offset` agrees.
- **Project switches:** `saveTypingTake` / `addCodePresentation` / teaching-flag writes check project id, write epoch and `waitForDocumentSaves`.
- **Event journal:** created with `wx` and `0600`, no history overwrite, failures preserve video. A discarded recording removes `.events.ndjson`. CLI pack copies the journal and flags sidecars.
- **KWin plugin and helper:** single consumer, user-only socket, 1 MiB backpressure abort, sequence-gap rejection, 1 KiB line bound, and evdev and KWin never run together.
- **Custom cursors:** PNG signature, size and dimension checks, hotspot clamped.
- **Flags:** stored in source time, pause compaction, 300 ms debounce, discard on cancel/restart, `readRecordingFlags` size cap plus zod validation.
- **Paused-picture decoder cache:** keyed by path and target; the cursor time override is reset by `sync_time_at` on the next normal frame.

## Uncertain / not verified

- Whether flag clock zero matches media zero on the macOS and Windows native paths. `setAppRecording(true)` placement relative to the encoder's first frame was not traced.
- Whether Godot's autocomplete popup or other editor plugins trigger focus/blur and split sections unexpectedly.
- Whether the KWin `InputEventSpy::pointerButton` / `nativeButton` API is stable beyond KWin 6.8.2. Physical libinput tap coverage is still untested, as the docs state.
- `handleVoiceoverReady` passes `language: null` to `patchCaptionSettings`. I did not check whether that overwrites a language the user chose explicitly.
- How often the preview drops frames during clean type-out because of the per-frame resvg work in M4. This was not profiled.

## Checks actually run

- `git diff --check d7adf059..f6189445`: clean.
- Vitest (Node 22.22.1), 16 files / **120 tests pass**: `captureEventJournal`, `src/lib/ai-edition/annotations/*`, `customCursors`, `teachingFlags`, `typing/{capture,import,presentation}`, `linuxNativeCaptureSession`. Caveat: run in the shared working tree, where `typing/schema.ts` and `ai-edition/schema/index.ts` already carry uncommitted clock-sync edits that those tests import.
- Rust `openscreen-compositor`: connector (2), click markers (1), SVG raster (1) and code-panel (3) tests. **6 pass and 1 fails without `OPENSCREEN_FONTS_DIR`**; all pass with it set (see L3). Needs `LD_LIBRARY_PATH=crates/thirdparty/ffmpeg-linux64-lgpl-shared/lib`.
- Rust `pipewire-capture`: `input`, `kwin_input` and `events` tests, **6 pass**. Crate files are unchanged in the working tree.
- An esbuild probe of the committed `capture.ts` / `presentation.ts` (L1, M3 measurements). The probe lives in the session scratchpad, not the repository.
- Reassembled the evidence archive from `git show` blobs, compared its SHA-256 with the manifest, and listed its contents (L8).

## Skipped

- The full Vitest suite, both `tsc` configurations, Biome and i18n: the working tree no longer matches the snapshot, and the brief said not to repeat full suites.
- Native helper and addon rebuilds and hashes: relied on the documented hashes.
- Any GUI/desktop, Godot, KWin, physical-device, Windows or macOS runtime test.
- Line-by-line review of the localisation JSON (15 locales) and CSS modules, and of `ConnectorHandles.tsx`, `ArrowDrawingLayer.tsx`, `CustomCursorControls.tsx` and `CursorPane` beyond their data paths.

## Suggested order for Codex

1. **M2** first, because it sits directly in the clock-sync slice: pause/resume records, unmatched-edge handling, media time from the event's own timestamp.
2. **H1:** adapter record cost.
3. **M1:** default hotkey.
4. **M3** and **M4:** performance.
5. **L1–L5** as small follow-ups.
6. **L6:** before any cross-platform claim.
