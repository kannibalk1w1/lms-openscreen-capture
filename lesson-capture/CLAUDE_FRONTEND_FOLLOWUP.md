# Codex disposition of Claude's frontend test

5 November 2026. `CLAUDE_FRONTEND_TEST.md` was read in full after the worker reported.
It covers snapshots from 19:52 and 20:01, explicitly excluding bundle/clean playback.
The report is preserved unchanged. Worker success means the testing task completed;
it does not mean the product has no findings or that Claude approved this build.

Local fixes made after the report:

- **F1 — fixed in source; regression tested.** Recording association now applies
  the shared `trimAppliesToClip` rule to UI trim ranges. An onset inside a nonempty
  trim is rejected. The next trim bounds initial duration. Repeated-footage
  disambiguation still chooses the playhead's occurrence; choosing a trimmed copy
  reports an error instead of silently choosing a different copy. Clip bounds and
  pause interval checks remain. Tests cover trimmed onset, copy choice and next
  trim boundary.
- **F2 — fixed in source; regression tested.** Code inspector number fields keep a
  local text draft. Intermediate values such as empty/2/24 are accepted while
  typing; a valid change commits once on blur or Enter. Escape restores the value;
  invalid drafts revert. Dropdowns and checkboxes still commit immediately.
  A jsdom regression checks typed font size 24 and invalid-value restoration.
- **F3 — replaced the Electron export path.** A typed preload method calls
  `typing-export:save`. Main validates the filename, UTF-8 byte bound, text bound
  or complete portable JSON contract before showing an explicit Save dialog. Only
  that dialog selects the write path. Cancellation writes nothing; file failures
  reach the dialog's error display. Browser fixtures retain Blob downloads.
  Tests cover actual temporary-file save/reimport, cancellation, UTF-8 text bytes,
  unsafe/invalid requests, byte limits and bridge/error routing. A native OS Save
  dialog was not driven by these tests. Restart the app for the new main/preload.
- **F4 — filenames now include the original starting event sequence.** Different
  sections in one take get distinct names even when their labels are identical.
  Imported excerpts retain this origin index during re-export. Existing filename
  and download regressions were updated. Dialog overwrite confirmation remains
  available for deliberately exporting the same section/name again.
- **F5 — identical recording cue choices are deduplicated.** A cue is identified by
  recording session, flag, segment and source time; importing the same recording
  twice no longer duplicates that choice. Placement still resolves repeated clips
  by the playhead. A regression covers duplicate source imports.

**Still open:** F6 very short region UX, native code-panel CJK/font fallback and
clipped text, initial Whisper model download behaviour, no-audio import/CDP
responsiveness, native/platform performance and the broader desktop/capture matrix.
None of those was silently marked fixed. No capture/compositor native source changed.

Final automated results are recorded in LESSON_CAPTURE_BUNDLES.md. A bounded
Claude retest can verify the updated save path and controls; until its report
arrives, the new fixes have automated local coverage only.

Retest dispatched after the final main/preload build: `ctx_d1af3ff3eda0` /
`task_bbb132afd9f6`, expected report `CLAUDE_FRONTEND_RETEST.md`. It is pending;
no claim of frontend or physical desktop success for these fixes is made yet.

Retest received and read: `CLAUDE_FRONTEND_RETEST.md` (snap3, 20:25:03Z).
All four priorities passed in the reported bounded tests. Actual OS dialog/input,
physical Godot/IME, native export and cross-platform coverage remain skipped.
The later `CLAUDE_TYPING_TIMELINE_TEST.md` also passed its snap4 row/catalog smoke,
with no new defect; final paging and label changes have local tests only.
N1–N3 naming/raw-error observations remain open. Neither report is release approval.
