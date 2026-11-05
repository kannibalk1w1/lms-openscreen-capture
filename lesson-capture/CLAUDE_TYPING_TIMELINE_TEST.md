# Claude frontend smoke test: Typing sections timeline row, review catalog, deep link

5 November 2026. This is Orca task `task_6a5dcb1652e6`, a bounded, read-only smoke test of the
source-linked **Typing sections** timeline row, the review catalog and the "Open section in
typing capture" link. I wrote only this file in the checkout.

Unchanged and untouched:
- `CLAUDE_FRONTEND_TEST.md` and `CLAUDE_FRONTEND_RETEST.md`;
- all app and source files;
- Git: no checkout, reset or stash;
- Godot: no addon installed, nothing run;
- nothing pushed or published.

This is partial development coverage, not release acceptance or Claude approval.

## Build and scope

- **snap4** is an rsync copy of the checkout without `.git`, with `node_modules` symlinked.
  - Taken: 2026-11-05T20:35:44Z, while Codex was still finishing tests and docs.
  - SHA-256 of `git diff` plus untracked files: `f74ecf353867082067aea57b185234e6a7dd86c905392dd892095370bb814992`.
  - It includes `TypingSectionLane.tsx`, `src/lib/typing/review.ts`, `reviewFixture.ts`, the
    `V4Timeline`/`NewEditorShell` wiring and the `TypingCaptureDialog` `initialSelection`.
  - I found no timeline/review LESSON_CAPTURE doc in the snapshot, so I tested against the
    source and the task brief.
- **Build:** `NO_ELECTRON=1 vite --port 5199` on snap4 built `dist-electron` main and preload
  and served the renderer.
- **Automated:** the focused suites pass, **70 tests / 12 files**. These are `src/lib/typing`,
  TypingCaptureDialog, TypingSectionLane, CodePresentationControls and `typingExportFile`.

Coverage, in four kinds:
- **Chromium shim:** headless Chromium 1234 driven by Playwright against the Vite renderer,
  using the localStorage bridge and Blob downloads.
- **Real Electron:** snap4's `main.js` and preload, launched by Playwright `_electron` under
  `xvfb-run`, with:
  - a new profile, `--user-data-dir=electron-userdata4`;
  - `--mute-audio` and `DO_NOT_TRACK=1`;
  - the silent fixture `godot-take.mp4` plus its `.flags.json`. Its recording clock session is
    `7570d5c5…` and it has flags f1 (4.0 s) and f2 (8.0 s).
- **Harness changes inside the isolated main process only:**
  - `showOpenDialog` returns the fixture video.
  - `showSaveDialog` returns `ev4/saved/<name>`.
  - `stt:transcribe` is replaced with one that rejects. It was invoked once and blocked.
  - `webRequest` blocks model and telemetry hosts. **No request was attempted.**
  - The `typing-export:save` handler is wrapped. The wrapper only records `{name, content}`
    and then calls the app's own validator and writer.
  - After the run, no `stt-models` exist and `~/Downloads` is unchanged.
- **Not covered:**
  - real OS input;
  - the actual OS Save dialog;
  - physical Godot or IME;
  - live recording and hotkeys;
  - native MP4/GIF export;
  - Windows and macOS.

Evidence is in `../openscreen-evaluation/claude-typing-timeline-test/`:
- `electron-lane-run1.txt` and `chromium-lane-run1.txt` (run logs);
- `saved/` (the bytes Electron wrote);
- `downloads/`, `fixture-lane.json`, screenshots and `harness-src/`.

## Real Electron results (all PASS)

- **A — video import.** The asset has the recording clock `7570d5c5…` and flags f1 and f2.
  Before any take was saved, the row showed "Review sections (0)" and no markers.
- **B — save an anchored take.** I imported the real Godot 4.7.1 journal, chose cue f1 and
  clicked **Save take to project** without adding code. On disk:
  - take `godot-1793906572253-4453` with section anchor `f1@4000` and session `7570d5c5`;
  - the independent two-section take `take_godot`, saved the same way;
  - 0 annotations.
- **C — marker and seek.**
  - There is exactly **one** marker: `res://lesson.gd · 0:04.0`, `left: 33.3333%`. Its
    measured left edge is ≈ 3.96 s on the 12 s ruler.
  - With the playhead at 9.01 s, clicking the marker seeks to **4.01 s** and opens
    "Typing sections".
  - The linked section is pre-selected.
  - The catalog lists 3 entries: one "Recording cue linked" and two "Independent take · no
    video time".
- **D — catalog exports.** Section JSON, Resulting code/text and the clean Playback recipe
  went through the save bridge. Each file on disk was byte-identical to its request:
  - `res-lesson-event-2.typing-section.json`: 3075 B;
  - `.gd`: 93 B, `cf1b35bf…`;
  - `.typing-playback.json`: 6691 B, mode `clean`, anchor f1 kept.
  - No alert appeared.
  - The `.openscreen` project file's SHA-256 was **unchanged** across the marker click,
    review, seek and all three exports.
- **E — deep link.** I searched "Godot player", selected Section 2 and clicked "Open section
  in typing capture".
  - The Typing capture dialog opened with saved take "Godot player.gd".
  - Rows `section-take_godot:0:false` and `section-take_godot:1:**true**`: the requested
    section is the highlighted one.
  - The project file was still unchanged.
- **F — trimmed cue.** I made a UI trim at 3.5–4.493 s, which covers the 4.0 s cue. This was
  an explicit edit.
  - The marker becomes `res://lesson.gd · 0:04.0 · Trimmed out`, with `data-trimmed=true`.
  - With the playhead at 9.01 s, clicking the marker opens the review and the playhead
    **stays at 9.01 s**.
  - "Seek occurrence 1 · 0:04.0 · Trimmed out" is **disabled**, and the status reads
    "Trimmed out" (`electron-F-trimmed.png`).

## Chromium shim results (all PASS)

The fixture is `fixture-lane.json`. Its clips are `clip_a` (0–12 s), unrelated `clip_other`
(12–20 s) and same-asset `clip_copy` (20–32 s). It has two takes:
- **take_godot:** section 1 "Add health" anchored to f1; section 2 "Ready function"
  independent.
- **take_missing:** section 1 "Lost cue", anchored to an unknown session; section 2 "Other
  independent".

- **L1 — repeated copies.**
  - Two markers, `Add health · 0:04.0` (left 12.5%) and `Add health · 0:24.0` (left 75%),
    whose measured edges are ≈ 3.92 s and ≈ 23.92 s.
  - Clicking the second marker seeks to 24.02 s and opens the catalog. The detail shows "Seek
    occurrence 1 · 0:04.0" and "Seek occurrence 2 · 0:24.0".
  - Occurrence 1 seeks to 4.02 s, and the dialog stays open.
- **L1 — statuses.** The 4 entries have the statuses linked, independent, "Recording cue
  unavailable in current clips" and independent. The unavailable cue has no marker and 0 seek
  buttons.
- **L1 — read-only excerpt.**
  - `readOnly=true`, with value `extends Node2D\nvar hp = 10`.
  - Typing "XYZ" leaves it unchanged.
- **L1 — search.**
  - "ready" finds 1 entry.
  - "missing" finds 2. That match is on the take title "Missing recording take".
  - "res://" finds 4. That match is on the document name.
  - "zzz" finds 0 and shows the empty hint.
  - The "Showing N of 4" hint updates each time.
- **L1 — unavailable and independent sections stay exportable.**
  - The unavailable section exported `Lost-cue-event-1.typing-section.json` with its original
    unknown session anchor kept.
  - The independent section exported `Other-independent-event-2.gd`.
  - The localStorage project blob was byte-identical after review, seek and exports.
- **L2 — deep link.** Selecting "Ready function" (section 2) and opening it in typing capture
  loads take "Godot player.gd" and marks only `section-take_godot:1` as `data-selected=true`.
  The highlight is a solid outline in rgb(16,185,129).

## Notes

- From the original snap3 retest, N1–N3 stay tracked; I did not re-verify them as fixed.
  - **N1** is visible again: the clean recipe is still named `res-lesson-event-2.typing-playback.json`,
    with no style in the name.
  - **N2** (shared bundle filename) and **N3** (raw Zod bridge error) were not re-exercised.
- Marker placement is the cue onset only. The row does not show section duration, and I made
  no edit-timing claims.
- I found no new defect in this bounded pass.

## Skipped

- The real OS Save dialog and overwrite prompt.
- Physical keyboard, mouse and IME.
- Godot editing.
- Live recording and flag hotkeys.
- Native preview correctness, including CJK fallback and F6.
- MP4/GIF export.
- Windows and macOS.
- Long catalogs. Search is capped at 100 shown; I tested only 3–4 entries.
- Performance.
- The full suite.

After the run, the Vite server and Electron processes are stopped. The scratch profiles stay
in the session scratchpad only.
