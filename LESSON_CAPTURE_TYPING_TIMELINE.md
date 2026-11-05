# Source-linked typing-section review

Saved typing sections now have their own **Typing sections** row in the editor's
edit timeline. The row is review UI, separate from the Code regions that govern
in-video presentation. It adds no rendered overlay or inserted video time.

## Workflow

1. Capture/import a take and **Save take to project**, or add a Code region (which
   also saves the take). Unsaved drafts are not included in this row.
2. A section explicitly paired with a recording cue gets a marker at each matching
   source occurrence. Click a visible marker to pause playback, seek and open review.
3. A marker inside a UI trim is dashed/dimmed. Clicking it opens review without
   moving the playhead; its occurrence seek button is disabled. Other visible
   copies of the same source remain seekable.
4. **Review sections (N)** opens the catalog, including independent sections and
   sections whose recording/clip is unavailable. These have no invented video
   position and remain inspectable/exportable.
5. Search by section label/number, take title, document or section ID. The first
   100 matches are shown; **Show 100 more sections** reaches further matches.
6. Select a section to see a read-only result excerpt (up to 12,000 Unicode code
   points), source status and occurrence seek buttons. Choose a playback recipe
   style and export section JSON, full resulting code/text or a playback recipe
   through the existing local export path. The excerpt does not limit exported data.
7. **Open section in typing capture** opens that exact saved take and outlines the
   requested section. Use the existing label, pace, association, preview, bundle
   and save controls there. This request is guarded by project identity.

Review, selection, seeking, searching and exporting do not mutate the project or
add undo entries. Explicit edits/saves in Typing capture retain their normal
history semantics. A missing original flag does not erase a persisted source
anchor; clock/session/segment and footage must still match.

## Timing and mapping

These are **onset markers**, not inferred typing ranges. They reuse the explicit
human recording-flag calibration. No UTC comparison or independent typing-clock
extrapolation is used; there is no new claim of edit-level encoder alignment.

`typingSectionPlacements` is shared by automatic code placement and review.
Source offsets project onto the raw editor ruler. A split-boundary anchor belongs
to the right fragment once. Reordering/clip bounds preserve source identity, and
repeated footage gets one marker per matching clip. UI trim rules reuse
`trimAppliesToClip`: a cut on one occurrence does not hide the other copies.
Retained trimmed occurrences are displayed for review but not seekable here.

The catalog reports linked, trimmed, independent and unavailable states. Mixed
trimmed/visible copies remain linked with per-occurrence state. Out-of-window
anchors and missing/mismatched recording sessions have no marker. Neither moving
a marker nor changing capture timing is offered by this slice. Multiple markers
can overlap visually; the catalog keeps every saved section accessible.

The row appears in edit mode alongside Flags and Code. There is no schema
migration: it reads the already embedded `typingTakes`, source anchors, recording
clock and clip/trim data. All native capture/compositor and export-renderer code
is unchanged.

## Validation — 5 November 2026

Final local full suite: **5,329 tests / 398 files pass**, four workers,
124.06 seconds. This slice adds 13 tests: 5 model/projection, 6 row/catalog and
2 exact-section/project-guard tests. Both TypeScript configurations,
renderer/main/preload build, i18n, Biome (35 existing warnings), docs and diff
checks pass. No native rebuild or push/publication occurred.

- Focused model and existing association tests: **14 tests / 2 files pass**.
- Timeline/row geometry and waveform run: **89 tests / 3 files pass** (before
  adding the sixth catalog-paging test). New model/dialog/row focused run:
  **30 tests / 4 files pass** (before paging). Final row run: **6 tests pass**.
  These overlap and are not extra tests to add to a full-suite total.
- New behaviors tested: source offset projection, JSON project roundtrip,
  untouched evidence, split/right-boundary assignment, repeated occurrences,
  per-clip trim handling, independent/unavailable states, retained anchors after
  flag removal, marker position/seek, trimmed seek blocking, read-only excerpt,
  export style dispatch/failure, unchanged project data, search, access to section
  101, exact saved-section highlighting and cross-project request rejection.
- The final renderer/main/preload build and both TypeScript configurations pass.
  i18n passes. Biome has zero errors and the same 35 existing warnings. Docs and
  diff checks pass. Native binaries were not rebuilt.

## Independent Claude frontend coverage

Both completed reports were read in full and preserved:

- [Previous-build retest](lesson-capture/CLAUDE_FRONTEND_RETEST.md), snap3 at
  20:25:03Z: Electron renderer/preload/IPC writes byte-exact files through a stubbed
  Save dialog, cancellation/unsafe-request rejection, trim/copy guards, typed
  font-size commit/undo and independent clean/captured bundle import/edit/re-export
  pass. 125 focused tests / 12 files pass. This is not an OS dialog/input test.
- [Timeline smoke](lesson-capture/CLAUDE_TYPING_TIMELINE_TEST.md), snap4 at
  20:35:44Z: 70 focused tests / 12 files pass. In real Electron driven over CDP on
  a private Xvfb display, the marker seeks to the paired cue, opens review, exports
  byte-exact files through the save bridge and opens/highlights the requested
  section; project bytes remain unchanged. A UI-trimmed marker opens review without
  seeking, and its seek button is disabled. Chromium covers repeated copies,
  independent/unavailable sections, search and the read-only excerpt. No new defect
  was found. That snapshot precedes final paging/label changes; those are covered
  by local UI tests, not claimed as independently desktop-tested.

Evidence: `../openscreen-evaluation/claude-typing-timeline-test/` and
`../openscreen-evaluation/claude-frontend-retest/`. The workers used isolated
profiles, picker/save-dialog stubs and synthetic input; transcription/network/model
fetches were blocked. They stopped their test app/server processes.

**Skipped:** real OS dialogs/input, physical Godot/IME, recording/hotkeys and pause
alignment, native preview correctness/MP4/GIF, Windows/macOS, real-world long-catalog
performance, and the remaining desktop checklist. Low-severity export naming/raw
bridge error notes N1–N3 and native font/very-short-region issues remain open.
Completed bounded tests are not release acceptance or Claude approval.

Next concrete roadmap item: native pause/resume journal boundaries and reconciliation
of mouse-button edges spanning capture start/pause/resume/stop (original review M2),
with a rebuilt helper and counted boundary tests.

Preserved report checksums at incorporation:
- `CLAUDE_FRONTEND_RETEST.md`: `a48e29b48d8493632b0312a4b3a40e2675bbea6ae952114e6df4680c3f7bc4a1`.
- `CLAUDE_TYPING_TIMELINE_TEST.md`: `107e3e14e8d227495fcd82e8430d98f2debd2a1a84f50d802bd4991ef1d47a7d`.
