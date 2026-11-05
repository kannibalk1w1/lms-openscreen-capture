# Portable typing sections

Open **Typing capture**, finish/import a take or reopen a saved take, then use
one of the three export buttons beside a section. Multi-section bundles and clean
teaching playback are now described in [the bundle workflow](LESSON_CAPTURE_BUNDLES.md):

- **Section JSON** downloads `*.typing-section.json`: versioned evidence for one
  section, its starting buffer, final text, label/speed, source project/take/section
  references and any explicit recording anchor.
- **Resulting code/text** downloads `.gd` for a GDScript document, or `.txt` for
  other documents. It contains the **full buffer at the selected section's end**,
  including text present before that section, rather than only inserted characters.
- **Playback recipe** downloads `*.typing-playback.json`: a versioned,
  captured-edit recipe for a controlled text buffer, with the same embedded section
  evidence and paced text replacement operations. Keys remain evidence; recipes
  never execute keyboard shortcuts or type into another application.

In Electron these use an explicit Save dialog and validated main-process file
writer; the browser fixture uses Blob downloads. Restart the app for new main/preload. Export does not save or modify the
project, captured take or recording. File names are sanitized. The three actions
create separate files; an export has a new take ID so importing it and saving
cannot overwrite its original whole take by matching that ID.

Use the existing **Import typing journal** control to reopen either JSON format.
Review its section, change the label/speed, and use **Preview** or save it as a new
take. It works without the original video or journal. Preview always starts from
that section's embedded baseline. Recipe import validates the target, version,
mode and every operation against its evidence and speed; inconsistent files are
rejected. Editing recipe speed by hand requires updating its operations too.
Exporting again after changing speed in the dialog does that automatically.

## Contract and limits

`src/lib/typing/portable.ts` implements schema version 1:
`openscreen-typing-section` and `openscreen-typing-playback`. The only playback
target is `controlled-text-buffer`, the modes are `captured-edits` and `clean`, and
all replacement offsets use Unicode code points. The pure `replayTypingFile`
function checks the **entire starting buffer** before replay, validates the whole
recipe before applying any operation, and checks replacement preconditions.
Original active timing is retained at 1×; the section's 0.25×–4× speed scales it.
It does not infer video timing from UTC or the independent typing clock.

A selected section exports the evidence from its **first through last text edit**.
Selections, keys and boundaries inside that range are retained; records before/
after it stay in the original take. Event IDs remain traceable, sequence numbers
and active times are rebased to zero, and an explicit synthetic stop closes the
standalone excerpt. Earlier sections are replayed only to obtain its correct
baseline; later edits are excluded. Source range/project references are retained
as `sourceExcerpt` on imported takes, so normal project save preserves them.
The take's source producer, original UTC start and `limited` coverage label remain.

The portable file limit is 8 MiB, including envelope and playback operations.
A large section JSON can fit while its recipe exceeds that bound; the recipe
export reports an error and asks for a smaller section. Existing 200,000-character,
50,000-event and 24-hour evidence bounds still apply. A pace of 0.25× can yield
up to 96 hours of controlled playback; no video duration is changed.

The individual buttons export one section per file. The subsequent
[bundle/clean slice](LESSON_CAPTURE_BUNDLES.md) adds selected-section bundles,
independent member import/edit/re-export and generated clean playback. Neither
path launches a Godot playback adapter or claims ScriptWriter format compatibility.
MP4/GIF typing excerpts and external-app playback remain separate roadmap work.

## Validation — 5 November 2026

- Full Vitest: **5,297 tests / 394 files pass**, four workers, 125.01 seconds.
  The new export slice adds 10 tests (8 portable-contract, 1 download lifecycle,
  1 dialog export action). Focused tests passed before the full run; totals overlap.
- Both TypeScript configurations, Vite renderer/main/preload build, i18n and docs/
  diff checks pass. Whole-repository Biome: zero errors, 35 existing warnings;
  final touched-code Biome: zero errors/warnings. No native source/binary changed.
- Tests cover independent middle-section baselines, rebased event time/sequence,
  unchanged source evidence, retained in-range keys, Unicode/paste/undo/redo,
  adjusted speed and partial replay, starting-buffer and replacement preconditions,
  standalone imports, source anchors and limited coverage, text output/filenames,
  single-edit zero duration, invalid versions/targets/actions/evidence/provenance,
  malformed schema rejection and an oversized duplicated recipe.
- jsdom exercises actual download construction (Blob contents/import, filename,
  anchor click and object-URL cleanup) and all three real dialog actions without
  saving/changing the project. The anchor click is intercepted; this does not
  prove an Electron/OS download or file picker.
- A standalone Node artifact roundtrip uses the prior actual Godot 4.7.1 take:
  one section has 9 normalized events and 6 playback edits; section JSON is
  2,873 bytes and playback JSON 3,486 bytes. Both reimport from disk without the
  source video, retain provenance, and replay to the exact exported `.gd` text.
  Evidence: `../openscreen-evaluation/typing-exports/`.
- **Skipped:** new physical Godot/IME capture, native preview/export, full Electron
  desktop/download UI, Windows/macOS, multi-section continuity, clean playback
  and external application playback. No native rendering claim is made.

This is a development slice, not desktop or release acceptance. Claude's concurrent
frontend pass was dispatched as `ctx_3fa5d7b218f1` (terminal
`term_5822ac40-7ba7-4f4c-ad8f-62e07010e563`). Its report is expected at
`lesson-capture/CLAUDE_FRONTEND_TEST.md`; at this build report it is pending.
Do not count its frontend checks as passed before that report arrives.

Delivered next slice: [multi-section bundles and clean teaching playback](LESSON_CAPTURE_BUNDLES.md).
Next concrete roadmap item: source-linked typing-section review in the timeline.
