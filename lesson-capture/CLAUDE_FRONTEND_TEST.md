# Claude frontend test: Typing capture, Godot flag association, exports

5 November 2026. This was Orca task `task_4f0287516d43`, run by Claude as a worker. I tested
the local frontend while Codex was still implementing in this checkout. I wrote nothing here
except this file: no app code changed, no checkout was created, reset or stashed, no addon was
installed into a Godot project, and nothing was pushed or published.

This is partial development coverage. It is not release acceptance, and not Claude approval
of the build.

## What was tested

Codex was editing this checkout at the same time, so I ran every test against a copy of it
(rsync, no `.git`, `node_modules` symlinked) in a session scratch directory:

| Snapshot | Taken (UTC) | `git diff` + untracked SHA-256 | Contents |
|---|---|---|---|
| snap1 | 2026-11-05T19:52:53 | `e27963c9…cd3a0d` | association slice, before the export UI |
| snap2 | 2026-11-05T20:01:46 | `fd615e58…f4952a2b028ff1a8eab3f97edfe594ff7a34d3` | adds `portable.ts`, `download.ts` and the single-section export buttons |

Not tested: the later multi-section bundle export and clean teaching-playback work that Codex
started after snap2.

Evidence is in `../openscreen-evaluation/claude-frontend-test/`: screenshots, run logs,
downloaded and exported files, fixtures, and the harness source in `harness-src/`.

## What each kind of coverage means

1. **Vitest (node and jsdom).** Real React components with synthetic events. No browser
   engine, no Electron.
2. **Chromium browser shim.** Playwright drives headless Chromium 1234 against
   `NO_ELECTRON=1 vite` on port 5199. This uses the app's localStorage shim bridge, not the
   Electron main process. The fixture video does not load (the URL safety check refuses it),
   so there is no video preview.
3. **CDP-driven Electron on Xvfb.** This is the real app: snap2's dev build, Electron's
   `main.js` and preload, the native compositor (it reported a Vulkan backend on the RTX 4070)
   and real IPC and project files on disk. Setup:
   - It ran on a private display via `xvfb-run`, with `--user-data-dir` set to a scratch
     directory, `--mute-audio`, `DO_NOT_TRACK=1`, and a silent test video.
   - Playwright `_electron` drove it, so input was synthetic (CDP), not OS input.
   - The harness replaced only `dialog.showOpenDialog` in the main process (the video picker)
     and, for one step, the `will-download` save path.
4. **Real OS desktop input.** **Not covered.** `orca computer capabilities` reports
   `screenshot=false`. I did not drive the user's `:0` session, physical keyboard or IME,
   recording hotkeys, or a real capture.

Godot: I reused the earlier real Godot 4.7.1 journal
(`openscreen-evaluation/recording-association/godot-take.json`, read-only). I did not run
Godot or install any addon.

## Results

### Tier 1: Vitest

- The existing focused suites pass on both snapshots:
  - snap1: 95 tests / 7 files (`src/lib/typing`, TypingCaptureDialog, recordingFlags,
    document-service).
  - snap2: 124 tests / 12 files (the same suites plus portable/download/CodePresentationControls
    and my harness).
- I added 18 harness tests. All pass; each "FINDING" test asserts the current, defective
  behaviour:
  - **S1** pass. Two sections of one take: one can be anchored while the other stays
    independent. The anchored section lands at 8 s with maxDuration 4.
  - **S2** FINDING. An anchor inside a clip-anchored `timeline.trimRanges` span is placed with
    no error (see F1).
  - **S3** pass. With repeated footage, a playhead outside every copy throws "Repeated
    recording". At the boundary between adjacent copies, the playhead counts as the right-hand
    copy (12 s → copy, 11.999 s → original).
  - **S4** observation. The same recording imported as two assets gives duplicate, identical
    anchor labels. The anchor resolves by session, so it also works across assets. When both
    assets are on the timeline it needs the playhead to choose.
  - **S5** observation. A flag 0.05 s before the clip end gives a 0.05 s code region.
  - **S6** pass. These flags are not offered: one at the closed end of a segment, one outside
    its declared segment, one whose segment is unknown.
  - **S7** pass. If the clip that carries the anchor is trimmed past the flag, placement
    reports "missing" and does not fall back to the playhead.
  - **U1–U7** pass, all in the jsdom dialog:
    - Choosing the independent option clears the anchor, and the button changes from "Add code
      at recording flag" to "Add code to timeline". The code then lands at the playhead (14 s,
      source 6).
    - Repeated footage and missing footage both show an alert, write nothing and leave the
      dialog open.
    - With the playhead inside the copy, the code is placed in the copy.
    - An anchor whose flag was removed shows as a disabled "Saved recording anchor…" option, and
      the code is still placed.
    - Capture-pad takes get no anchor selector.
    - "Save take" keeps the anchor and does not add a code region.
  - **C1** FINDING. Clearing the font-size box and typing "24" leaves it at 26, with no commit
    (see F2).
  - **C2** pass. Each selector or checkbox change commits once.
  - **C3** inconclusive. jsdom does not emulate number-input arrow-key stepping.
  - **C4** observation. Selecting all in the line-count box and typing "30" commits twice
    (3, then 30), which is one history entry per keystroke.

### Tier 2: Chromium browser shim

All scenarios below passed: 8 association/controls scenarios on snap1 and 4 export scenarios
on snap2.

- **B1.** Same-asset copies at 0–12 s and 12–24 s, playhead at 0 s.
  - The options list shows Independent, "Godot take.mp4 · First edit · 4.000s" and "… Second
    edit · 8.000s".
  - Anchored add closes the dialog and creates a code region on `clip_a` at 4000–5000 ms,
    bounded by the pause at 5 s.
  - The take keeps the `manual-recording-flag` anchor.
- **B2.** Fixture with an unrelated clip between the copies, playhead at 16 s in that clip.
  - Alert: "Repeated recording: place the playhead in the intended clip".
  - The dialog stays open, with 0 code regions and no saved anchor.
- **B3.** Playhead at 25 s, inside the second copy: code placed on `clip_copy` at 24000–25000 ms.
- **B4.** After an anchored add, Ctrl+Z removes both the code region and the anchor, and
  Ctrl+Shift+Z restores both. Undo and redo treat it as one gesture.
- **B5.** Trim created through the UI (Add a trim at 3.5 s) on `clip_a`, playhead in
  `clip_copy`: placed in the copy at 16 s. This is correct.
- **B5b — F1 confirmed in the UI.** Single clip. The UI trim on `clip_a` covers 3.5–4.238 s,
  which contains the 4.0 s flag. Anchored add with the playhead at 10 s:
  - There is no alert and the "Code added" toast appears.
  - The region is placed at 4000–5000 ms, starting inside the trimmed span
    (`B5b-trimmed-anchor.png`, `B5b-doc.json`).
- **B6.** Independent placement with the playhead at 6 s: region at 6000–8000 ms, source 6,
  no anchor.
- **B7.** Code controls in the inspector, opened by clicking the code pill:
  - Font size: select-all and typing "24" leaves it at **26** (F2 reproduced). ArrowUp gives
    27, and `fill("40")` gives 40.
  - Lines: select-all and typing "8" gives 8.
  - Mode (faithful), theme (light) and line numbers persist in the project.
- **E1.** Export of a two-section take, with section 2 anchored to f2 at speed 2×:
  - It downloads 6 real Chromium files.
  - Section JSON has `format=openscreen-typing-section` and `version=1`. Section 2's JSON
    carries its anchor (f2/s2/8000 ms).
  - The recipe has `format=openscreen-typing-playback`, target `controlled-text-buffer`, mode
    `captured-edits`.
  - `.gd` holds the full buffer at the end of the section.
  - There is no alert, and the stored project is byte-identical before and after export.
- **E1 observation (F4).** All sections export with the same names (`Godot-player.typing-section.json`,
  `.gd`, `.typing-playback.json`). There is no section number, so section 2 silently replaces
  or collides with section 1.
- **E2.** Section JSON and the playback recipe, imported into a different project that lacks
  the recording:
  - Both import as 1 section at the exported 2× speed.
  - The anchor shows as "Saved recording anchor (flag or footage unavailable)".
  - Preview 1 reproduces the full final text.
  - "Add code at recording flag" shows "Associated recording moment is missing…", writes
    nothing, and does not fall back to the playhead.
- **E3.** Section JSON imported back into the original project:
  - The anchor resolves to "Godot take.mp4 · Second edit · 8.000s".
  - Add places the region on `clip_a` at 8000–10733 ms and saves it as a new take
    (`typing-section-<uuid>`). The original `take_godot` is kept.
- **E4.** A recipe with a tampered operation string, a non-typing JSON file and a truncated JSON
  file are each rejected with the import-error alert, and 0 sections load.

### Tier 3: CDP-driven Electron on Xvfb (snap2)

- **Launch.** The HUD window opens, and `switchToEditor` opens the editor. The native
  compositor reports a Vulkan hardware backend.
- **Real video import.**
  - "Import a video", with the picker stubbed to return
    `electron-media/godot-take.mp4` plus its `.flags.json` sidecar, creates an on-disk
    `.openscreen` project.
  - The project file has schemaVersion 9, the asset's flags f1/f2 with segment IDs, and the
    recording clock.
  - **Side effect:** the import automatically started transcription, and the app **downloaded
    Whisper `ggml-small-q8_0.bin` (264 MB) and `ggml-silero-v6.2.0.bin`** into the scratch
    profile. That is outbound network traffic I did not intend. My first run also failed with
    `stt:transcribe NoAudioTrackError` on a video with no audio track, and after that the
    renderer stopped responding to Playwright screenshots. A silent AAC track fixed it.
- **E-2.** The real Godot 4.7.1 journal is imported through the dialog's file input: "13
  events · 1 typing sections". The anchor options name the real file (`godot-take.mp4 · First
  edit · 4.000s`, `… Second edit · 8.000s`).
- **E-3.** Anchored add closes the dialog. The file on disk records the code region on the
  clip at 4000–5000 ms (source 4–5) and the take's anchor (f1/s1/4000).
- **E-4.** Seeking to 4.5 s, the native compositor draws the code panel over the video
  (`electron-4-code-visible.png`). `print("😀 日本語")` renders as tofu boxes, the same
  font-fallback issue as L4. The top line of the panel is partly clipped.
- **E-5.** Ctrl+Z removes the code pill and Ctrl+Shift+Z restores it.
- **E-6 — F2 reproduced in Electron.** Select-all and typing "24" leaves the font size at 26.
  ArrowUp gives 27, and that value persisted to disk.
- **E-7 / X-2 — Electron export download (F3).** Clicking "Export section 1 as JSON" with
  Electron's default handling:
  - `will-download` fires (`res-lesson.typing-section.json`, `application/json`, blob URL,
    empty save path).
  - No save dialog appears among the visible X windows, no file is produced, and
    `~/Downloads` changed (mtime 20:15:08) but holds no new file.
  - So on this setup, the default Electron download path does not deliver the file. A real
    desktop session might show a native or portal Save dialog; that is unverified.
- **X-3.** With a harness-forced `setSavePath`, all three downloads complete (`res-lesson.gd`
  93 B, `.typing-playback.json` 3688 B, `.typing-section.json` 3075 B):
  - The `.gd` file is byte-identical to Codex's `openscreen-evaluation/typing-exports/godot.gd`.
  - The `.gd` file is the section JSON's `finalText` minus the trailing newline.
- **X-4.** Re-importing the section JSON that Electron saved gives "9 events · 1 typing
  sections", no alert, and Preview 1 reproduces the final buffer exactly, including
  Unicode/CJK and tabs.

## Findings, most severe first

- **F1 — Medium. A trimmed-out anchor is placed silently.** `associatedTypingPlacement`
  (`src/lib/typing/association.ts`) checks the clip's source bounds and pause segments, but
  not `timeline.trimRanges`.
  - If a UI trim covers the flagged moment, the code region is created inside the removed span
    and the success toast is shown.
  - The section's onset is skipped at playback, or the start of the region is hidden.
  - This contradicts LESSON_CAPTURE_ASSOCIATION.md: "Missing/trimmed-out footage reports an
    error". Only trims made by changing clip bounds are caught.
  - Reproduced in Vitest (S2), in the Chromium UI (B5b) and in Playwright logs.
- **F2 — Medium (usability). Code font size cannot be typed.**
  - `CodePresentationControls` drops every change outside min..max on a controlled number
    input. Any value whose prefix is below 12 can never be typed, which is every font size from
    12 to 60, because each one starts with a digit below 12.
  - Only the arrows or paste work.
  - Other fields commit on every keystroke, one history entry each (C4).
  - Reproduced in jsdom, Chromium and Electron.
- **F3 — Medium (unverified on a real desktop). Electron export has no save handler.** There is
  no `will-download` handler in `electron/`. The renderer's `<a download>` relies on Electron's
  default, which produced no file and no visible dialog on Xvfb. This needs a real desktop
  check, or an explicit save path or dialog.
- **F4 — Low. Exported file names collide across sections.** Names come only from the take
  title, so every section of a take exports to the same three names.
- **F5 — Low. Duplicate anchor labels.** If the same recording is imported twice as two assets,
  the anchor labels are identical and give no way to tell them apart (S4).
- **F6 — Low. Very short code regions are allowed.** A flag near the clip or pause end yields
  a code region as short as the remaining footage, 0.05 s in S5, with no warning.
- **Observation — automatic Whisper download.** Video import starts transcription, which
  downloads a 264 MB model on the first import into a fresh profile. That matters for
  offline, classroom or bandwidth-limited setups and for privacy notes. It is not part of
  this slice.
- **Observation — no-audio import.** Importing a video with no audio track logs
  `stt:transcribe NoAudioTrackError`, and in my first Electron run the renderer stopped
  answering CDP screenshots afterwards. I did not isolate the cause.

## Skipped or blocked

- Real OS desktop input on `:0`, physical Godot typing and IME.
- Real recording, the flag hotkey and pause timing.
- Windows and macOS.
- MP4/GIF export of code regions.
- Long takes and performance.
- Codex's bundle and clean-playback slice after snap2.

Afterwards I stopped the local Vite servers and Electron processes. The scratch Electron
profile, including the Whisper models, remains in the session scratchpad only.
