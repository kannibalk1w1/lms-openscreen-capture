# Typing bundles and clean teaching playback

This extends [single-section exports](LESSON_CAPTURE_EXPORTS.md). Source evidence
remains intact; each exported section retains its own starting buffer.

## Use it

1. Open **Typing capture** and finish/import a take or choose a saved take.
2. Check **Include** beside the sections you want. Choose **Preview / recipe
   style**: **Captured edits** or **Clean teaching version**.
3. **Export selected bundle (N)** downloads one `*.typing-bundle.json`. Selection
   comes from the current take, in section order. Choose 1–20 sections.
4. **Preview N** and individual **Playback recipe** downloads use that style.
   **Section JSON** continues to preserve captured evidence. The video code-region
   inspector continues to govern in-video presentation.
5. Use **Import typing journal** to reopen a bundle without its original video.
   **Imported bundle section** chooses a member. Its baseline, label, pace and
   recipe style are loaded independently; preview does not concatenate buffers.
6. Edit members' labels, pace or style and switch between them. These draft edits
   remain in memory. **Export imported bundle** writes all members back to one
   file, retaining each member's style and original source references.
7. **Save take to project** saves the active member only, through the existing
   undoable save. Save other members explicitly if needed. Recipe style is stored
   in recipe/bundle files; project typing takes retain capture evidence and pace.
   New take, choosing an unrelated saved take or quitting can discard bundle drafts.

There is no new application adapter, key injection, filesystem installation, or
automatic typing into Godot. Browser downloads and Electron Save dialogs are local.
In Electron, exports now use an explicit Save dialog and a validated main-process
file writer. Cancel writes no export file; write failures appear as an
error in the typing dialog. The browser fixture retains Blob downloads. Restart
OpenScreen after this build to load the new main/preload. File names carry the
original starting-event sequence to distinguish sections with equal labels.

The UI creates bundles from the current take; selecting across unrelated saved
takes is not implemented. The file contract/API and importer support independent
takes and mixed playback styles.

## Clean versus captured playback

Captured playback uses the observed text replacements and active time, scaled by
the section's 0.25×–4× pace. Keys and other evidence remain in the embedded section;
playback executes only text replacements in a controlled buffer.

Clean playback computes the net contiguous replacement from the section's baseline
to its final text. It removes the old changed span at time zero and reveals the
final replacement at **30 Unicode code points per second × section speed**.
Unchanged prefix/suffix text stays in place. Whitespace, tabs and Unicode content
are retained. Corrections remain available in the embedded captured evidence;
they are omitted from the generated clean operation sequence.

A deletion-only transition removes its span at zero. Corrections returning to the
baseline produce a valid zero-operation clean recipe. Large insertions are grouped
into code-point-safe chunks to stay within the operation budget. That introduces
coarse reveal steps for large pastes. There is no claim about physical keystrokes,
editor autocomplete behaviour, video duration or encoder timing.

The controlled player validates the complete recipe and exact starting buffer
once. Forward progress and backward seeks operate on that validated copy. Clean
seek computes the visible net transition directly rather than constructing a full
text frame for every generated operation.

## Format and bounds

`openscreen-typing-bundle`, version 1, contains an ordered `entries` array of
`openscreen-typing-playback` files. Each member embeds its standalone section,
final text and canonical operations. Members can mix `clean` and `captured-edits`.
Original source project/take/section references, range, UTC start, recording anchor
and limited-coverage status survive. Re-export maps source offsets back to the
original excerpt rather than replacing its provenance with an imported draft ID.

Import is all-or-nothing: every member is validated before any is displayed. Empty
bundles, duplicate source ranges/take IDs, unsupported actions/targets/versions,
inconsistent evidence/operations and malformed members are rejected. The singular
library importer rejects multiple members rather than silently returning the first;
the dialog uses the bundle-aware importer.

Bounds: **20 members, 50,000 total evidence events, 50,000 total playback operations,
8 MiB for the whole serialized file**. The per-take text/time bounds still apply.
Exceeding a budget reports an error; evidence is not silently dropped. Members
must each start from their own exact buffer. There is no automatic continuous
playback across unrelated documents, target-app execution or ScriptWriter-format
compatibility.

## Validation — 5 November 2026

- The bundle/clean full suite before frontend fixes: **5,308 tests / 395 files
  pass**, four workers, 123.59 seconds. Final full results are appended below.
- Focused bundle/typing/dialog run: **49 tests / 8 files pass**. Final imported
  bundle re-export follow-up: **18 tests / 2 files pass**. Counts overlap.
- Bundle tests cover independent baselines/order, whole-bundle rejection,
  duplicate/member/aggregate budgets, mixed styles, stable source provenance,
  unchanged captured evidence, canonical clean Unicode operations, deletion/no-op,
  direct end seek for an 80,000-code-point paste, backward seek and validation-copy
  isolation. UI tests cover selection, mode dispatch, member switching, clean
  preview, draft retention and complete imported-bundle re-export.
- A standalone Node artifact roundtrip uses the prior Godot take plus an
  independent capture-pad take: **2 entries, clean/captured styles, 8,284 bytes,
  66/2 operations, 9/3 evidence events**. Each reconstructs its own final buffer;
  wrong-baseline replay is rejected and re-export retains original provenance.
  Evidence: `../openscreen-evaluation/typing-exports/bundle-clean/`.

Claude's completed [frontend test](lesson-capture/CLAUDE_FRONTEND_TEST.md) covers
older snapshots, not this bundle/clean build. It separately reports 18 harness
checks, 12 Chromium scenarios and CDP-driven Electron/Xvfb work. Its 124 focused
Vitest count includes harness tests; do not add 18 to that total. Real OS input,
physical Godot/IME, live recording/hotkeys, Windows/macOS and MP4/GIF were skipped.
Its Electron download finding led to the explicit Save-dialog path. See
[per-finding disposition](lesson-capture/CLAUDE_FRONTEND_FOLLOWUP.md). The original
report is unchanged; completed testing is not approval of this build.

Skipped for this slice: real OS Save dialog/input, fresh physical Godot/IME,
native preview/export rerun, Windows/macOS runtime, external-app typing, continuous
multi-document execution and the remaining desktop/capture checklist. Native
capture/compositor sources and binaries were not modified.

Next concrete roadmap item: a source-linked typing-section review row in the
lesson timeline, with seek/select and export actions. Live Godot/encoder clock
alignment, native input pause/button-edge work and the platform acceptance matrix
remain open.

## Frontend-fix validation and retest status

After Claude's original frontend report arrived, the implementation also fixed
UI trim placement, numeric inspector drafts, Electron's explicit Save-dialog
writer, section filename collisions and duplicate recording cue choices. These
changes required a final build and second full-suite run after the earlier
bundle-only run. See lesson-capture/CLAUDE_FRONTEND_FOLLOWUP.md.

Focused frontend-fix tests passed: **32 tests / 6 files**, then **17 tests / 4 files**
including the additional bridge-routing and UTF-8-bound regressions. Counts overlap.
The save-service tests use actual temporary files and a supplied destination;
they do not exercise a real OS Save dialog. The renderer test checks the Electron
bridge, awaited failures and the absence of a silent Blob fallback on failure.
Browser Blob download construction remains tested separately.

The final Vite/main/preload build passes. Both TypeScript configurations, i18n,
Biome (35 existing warnings), docs and diff checks pass. A real Electron/frontend
retest has been dispatched to Claude as `ctx_d1af3ff3eda0`, task
`task_bbb132afd9f6`, terminal `term_7570dc156126c0d0bc41fd807666da77` on the same
Orca run. Expected report: `lesson-capture/CLAUDE_FRONTEND_RETEST.md`.
At this build report, the retest is pending and is not counted as passed.

Final full suite after all frontend fixes: **5,316 tests / 396 files pass**, four
workers, 123.84 seconds. This includes bundle/clean behavior and the added main
save-service, Electron bridge, numeric-input, UI-trim and cue-dedup regressions.
Final app and test TypeScript checks and renderer/main/preload build pass; i18n,
Biome (35 existing warnings), docs and diff checks pass. No native binary rebuild,
physical desktop pass, push or publication was performed.

The original Claude frontend report remains byte-identical at incorporation:
`4512811402235ec7f822ee78c8c6beba4ebd6b56b09f796e0d2a7da44bf96fdd`.
The final build's Claude retest remains pending independently.

## Subsequent timeline review and completed frontend retest

Claude's snap3 retest is now [complete](lesson-capture/CLAUDE_FRONTEND_RETEST.md):
all four requested save/trim/font/bundle priorities pass in bounded Electron/CDP
and Chromium coverage, with the native Save dialog stubbed and OS input skipped.
N1–N3 low-severity export naming/error notes remain open. The original reports
are preserved. The newer [typing-section timeline row](LESSON_CAPTURE_TYPING_TIMELINE.md)
now provides catalog/seek/edit/export access to saved captures.
