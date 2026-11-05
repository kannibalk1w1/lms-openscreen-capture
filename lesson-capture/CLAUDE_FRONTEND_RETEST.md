# Claude frontend retest: Electron save path, F1–F5 fixes, bundles and clean playback

5 November 2026. This is Orca task `task_bbb132afd9f6`, a bounded, read-only retest after
Codex's fixes and the bundle/clean slice. I read `LESSON_CAPTURE_BUNDLES.md` and
`lesson-capture/CLAUDE_FRONTEND_FOLLOWUP.md`. `CLAUDE_FRONTEND_TEST.md` is unchanged. This
file is the only one I wrote in the checkout.

What I did not do:
- change any app or source file;
- check out, reset or stash anything;
- install an addon or run Godot;
- push or publish anything;
- run transcription or download a model.

This is partial development coverage, not release acceptance or Claude approval.

## Build and scope

- **snap3** is an rsync copy of the checkout without `.git`, with `node_modules` symlinked.
  - Taken: 2026-11-05T20:25:03Z.
  - SHA-256 of `git diff` plus untracked files: `a4d9b4c29f0c2986c4555aa01ba4a91ff3fa5f8adabeddd793c8ced2457e99ab`.
  - It includes `electron/ipc/typingExportFile.ts`, the preload `saveTypingExport`, the
    `typing-export:save` handler, bundle/clean `portable.ts`, the F1–F5 fixes and their docs.
- **Build:** `NO_ELECTRON=1 vite --port 5199` on snap3 built `dist-electron/main.js` and
  `preload.mjs` and served the renderer.
- **Real Electron run:** Playwright `_electron` launched `node_modules/electron` with snap3's
  `main.js` on a private `xvfb-run` display, with these options:
  - `--user-data-dir` set to a new scratch profile (`electron-userdata3`);
  - `--mute-audio` and `DO_NOT_TRACK=1`;
  - the silent fixture `godot-take.mp4` (silent AAC track) plus its `.flags.json` sidecar.
- **Harness changes inside the isolated main process only:**
  - `dialog.showOpenDialog` returns the fixture video.
  - `dialog.showSaveDialog` returns `ev3/saved/<defaultPath basename>`, or `{canceled:true}`
    in cancel mode. It records title, defaultPath, filters and properties.
  - The `stt:transcribe` handler is replaced with one that rejects. It was invoked once and
    blocked.
  - `webRequest` is set to block Hugging Face, GitHub and PostHog hosts. **No request was
    attempted.**
  - The `typing-export:save` handler is wrapped. The wrapper only records the renderer request
    `{name, content}` and then calls the original handler, so validation and writing are the
    app's own code.
- No `will-download` hook was installed.
- After the run, the profile contains no `stt-models`, and `~/Downloads` is unchanged.

Coverage, in four kinds:
- **CDP-driven Electron:** the real renderer, preload, IPC, main-process validator and
  `fs.writeFile`.
- **Chromium shim:** headless Chromium 1234 against the same Vite renderer, using the
  localStorage bridge.
- **Vitest:** node and jsdom.
- **Not covered:**
  - the actual OS or portal Save dialog (stubbed here);
  - real OS keyboard and mouse;
  - physical Godot or IME;
  - live recording and hotkeys;
  - Windows and macOS;
  - native MP4/GIF export.

Evidence is in `../openscreen-evaluation/claude-frontend-retest/`:
- `electron-retest-run1.txt` and `chromium-repeat-trim.txt` (run logs);
- `saved/` (the bytes Electron wrote);
- `fixtures/`, screenshots and `harness-src/`.

## Results

### Automated (snap3)

- The focused suites pass: **125 tests / 12 files**. These are typing, the dialog,
  CodePresentationControls, `typingExportFile`, recordingFlags and document-service.
- My earlier harness now fails exactly the two tests that asserted the old defects.
  - **S2 (F1)** now gets "Associated recording moment is trimmed out".
  - **S4 (F5)** now gets two deduplicated choices instead of four.
  - The other five pass. I left these two failures in place, because they show the fixes
    took effect.

### Priority 1: Electron save path (PASS, with the Save dialog stubbed)

Every write went renderer → preload `saveTypingExport` → `typing-export:save` → validator →
the stubbed dialog's path. **All passed:**

- **Dialog options.** Each export showed one dialog titled "Save typing export". Its
  defaultPath was in Downloads with the generated name. It had an extension filter and
  `createDirectory` and `showOverwriteConfirmation`.
- **D1 — byte-identical saves.** For the real Godot 4.7.1 take, the file on disk matched the
  request content byte for byte:
  - `res-lesson-event-2.typing-section.json`: 3075 B, sha256 prefix `3fad119ad943fafd`;
  - `res-lesson-event-2.gd`: 93 B, `cf1b35bfb9e9d03c`;
  - `res-lesson-event-2.typing-playback.json`, captured edits: 3688 B;
  - the clean recipe: 6691 B, `2e303d9108bf776a`.
  - The dialog showed no error.
- **D1 observation (N1).** The captured and clean recipes for one section get the **same
  filename**. My stubbed dialog let the clean recipe replace the captured one on disk. A real
  dialog would ask before overwriting.
- **E1.**
  - The selected two-section clean bundle `typing-sections.typing-bundle.json` (4700 B,
    `de9b13c400245c24`) was written exactly.
  - Section 2's JSON was written as `Godot-player-event-2.typing-section.json`, exactly. The
    sequence suffix is present.
- **E2.** The re-exported imported bundle (8295 B, `037d08fdc752d4dc`) was written exactly.
- **D2 — cancel.** Two exports in cancel mode returned `{"status":"cancelled"}`. The saved
  directory's file list and mtimes did not change, and no alert appeared.
- **D3 — unsafe requests.** Four requests sent directly from the renderer to the bridge were
  all rejected before any dialog opened (0 dialogs):
  - `../evil.typing-section.json`;
  - `x.exe`;
  - a `.typing-section.json` with format `nope`;
  - an extra `path` key.

### Priority 2: trim and repeated copies (PASS)

- **Electron B1.**
  - I created a UI trim at 3.5–4.493 s on the imported clip, which covers flag f1 at 4.0 s.
  - Anchored add showed the alert "Associated recording moment is trimmed out", left the
    dialog open, and wrote **0** code regions to disk.
  - The anchor options listed each cue once.
- **Electron B2.** The untrimmed f2 cue was placed, with the playhead elsewhere, at
  8000–11800 ms (source 8–11.8 s).
- **Chromium R.** The fixture has clips `clip_a` (0–12 s), unrelated `clip_other`
  (12–20 s) and same-asset `clip_copy` (20–32 s). A UI trim on `clip_a` covers
  3.5–5.469 s, which contains f1.
  - **Playhead 25 s (copy):** placed on `clip_copy` at 24000–25000 ms, source 4.
  - **Playhead 6 s (trimmed original):** "trimmed out", nothing written.
  - **Playhead 16 s (unrelated clip):** "Repeated recording: place the playhead in the
    intended clip", nothing written.

### Priority 3: typing a font size (PASS, Electron)

- **Typing commits once, on blur.** Before the change, both the field and the disk value were
  26.
  - After select-all and typing "24", the field showed 24 but the disk value was still 26.
  - After Tab (blur), the disk value was **24**.
- **It is one history entry.** One Ctrl+Z returned to 26, a second removed the code region,
  and two redos returned to 24.
- **Invalid and cancelled drafts revert.**
  - Typing "5" and then blurring set the field back to 24, and the disk stayed at 24.
  - Typing "30" and then pressing Escape set it back to 24, and the disk stayed at 24.

### Priority 4: bundles (PASS, Electron)

**E2 — importing and editing a bundle.** I imported Codex's
`godot-and-independent.typing-bundle.json` (2 entries: a clean Godot member and a captured
independent pad member).
- It imported with no alert. The member selector showed "1. res://lesson.gd" and
  "2. Independent".
- **Member 1** had style `clean`. Its preview at 0.2 s showed the partial `extends Node…`
  reveal, and at 4 s the full Godot buffer, including Unicode/CJK and tabs.
- **Member 2** had style `captured-edits`. Its preview showed its own baseline,
  "Independent starting buffer\n日本語😀", so its text was not mixed with member 1's.
- **Edits survive switching.** I changed member 1 to label "Edited member one" at 2×, and
  member 2 to "Edited member two" at 0.5×. After switching back, member 1 still had its label,
  2×, and style `clean`.

**E2/E3 — re-export and reimport.** I used **Export imported bundle**, then reimported the
saved file.
- The reimport succeeded with members "1. Edited member one" and "2. Edited member two".
- Compared with the original file, for both entries these were the same:
  - `source` provenance (original takeId, sectionId, projectId, sequences and times);
  - `finalText`, `initialText`, `startedAt` and coverage;
  - operation count;
  - each member's style.
- Edits that changed as expected:
  - The labels and speeds carry the edits.
  - Clean operation timing scaled as expected; for example, the last operation moved from
    2133 to 1067 ms at 2×.
- In the embedded evidence, the only difference is the synthetic `:stop` event ID, which uses
  the new export take ID.

## New observations

None of these block the fixes. They are low severity.

- **N1 — clean and captured recipes share a filename.** For one section, the captured and
  clean playback recipes both export as `…-event-N.typing-playback.json`, so the style is not
  in the name.
- **N2 — every bundle has the same filename.** Every bundle export, whether new or
  re-exported, is named `typing-sections.typing-bundle.json`. In the real app the OS
  overwrite confirmation protects existing files; with my stub, E2 replaced E1's file.
- **N3 — error text is raw.** The rejection text for invalid bridge requests is a raw Zod
  issue dump inside "Error invoking remote method…". This is only reachable by calling the
  bridge directly, not through the UI.

## Still skipped

- The actual OS/GTK/portal Save dialog and overwrite prompt; the stub selects the path.
- Physical input, IME and Godot editing.
- Live recording, flag hotkeys and pause timing.
- Native preview correctness. This includes F6 and the CJK font fallback, which I did not
  re-inspect.
- MP4/GIF export.
- Windows and macOS.
- Long takes and performance.
- The full suite. I ran only the focused suites listed above.

After the run, the Vite server and Electron processes are stopped. The scratch profile stays
in the session scratchpad and holds no models.
