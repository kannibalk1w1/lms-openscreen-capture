# Claude overnight review 11 — slice 14 (review-10 corrections)

- **Reviewed:** `f801837a0469e46f6ee79bf74047a8a5cf233e76` ("fix: fingerprint render inputs across recovered project inspection") against `1bd83d66f6141cf4cbefe59aafbcbd087f98ac3b`.
- **Reviewer:** Claude (Orca reviewer11, in-terminal, read-only). No nested workers were launched. This file is the only write to the checkout. No git, config, API, auth, publish, upstream or release actions. `fd2775e2` and all earlier reports are untouched.
- **Read:** the original `CLAUDE_OVERNIGHT_REVIEW_10.md`, `CLAUDE_OVERNIGHT_FOLLOWUP_10.md`, the new "Review10 corrections (slice14)" section of `LESSON_CAPTURE_GUIDES.md`, the `clock_client.gd` change and every code change in the diff.

## Verdict

- **No High. One new Medium (M14-1). M13-1 is fixed only partly.** It is fixed for the case review 10 reported: recovered-capture key order and receipt re-inspection. It is not fixed for any saved project in which a zoom, annotation, caption, speed region, shader effect, layout or full-camera region spans a cut or a clip boundary. There the new fingerprint is not deterministic, so capture is refused on every attempt. It still fails closed: no wrong frame and no wrong source.
- **L13-1, L13-2 and L12-1: fixed.**
- **Info items I13-1, I13-2, I13-4, I13-7 and I13-8: fixed.** I13-3 is now disclosed, but the wording is ambiguous (I14-1).
- **Deferred items** are not claimed as fixed, and I agree they are deferred: profile/language, `figcaption` duplicating the alt text, and the guard for an unsaved draft.
- **I recommend not approving the M13-1 closure until M14-1 is fixed.** The other corrections can be accepted.

## M14-1 (Medium, new): the render-input fingerprint includes random fragment IDs, so capture fails for any region that spans a cut or clip boundary

**What happens:**
- `lessonRenderFingerprint` (`src/lib/lesson/frameSource.ts:13-14`) hashes `buildSceneDescription(document)`.
- `buildSceneDescription` projects zoom, annotation and caption regions, full-camera regions, speed regions, shader effects and layouts through `projectRegionsToSource(..., () => createId(...))` (`src/native/sceneDescription.ts:1123-1128, 1160-1165, 1166-1171, 1178-1183, 1207-1212, 1363-1366`).
- `projectRegionsToSource` keeps `region.id` for the first fragment only. Every later fragment gets `makeId()` (`src/lib/ai-edition/timeline/timelineMap.ts`, `id: emitted === 0 ? region.id : makeId()`).
- `createId` is `${prefix}_${crypto.randomUUID()}` (`src/lib/ai-edition/document/ids.ts`).
- So a region that reaches more than one kept segment produces a different scene on every call. The renderer's hash (`LessonGuideDialog.tsx`) and the main process's hash (`service.ts:51`) can never be equal. `captureFrame` → `project-changed` on every attempt, at every ruler position in the project, not only near the region.

**Repro (scratch probe in my snapshot, `electron/review11/p1-split-region.test.ts`, moved out before the other runs):**
- One clip 0–10 s, a trim at 2–4 s, and a zoom at 1–8 s that crosses the trim:
  - `buildSceneDescription(...).zoomRegions` ids are `["z", "zoom_c9d8fda3-…"]`;
  - two `lessonRenderFingerprint` calls on the same object give **different** hashes.
- Control, the same document with the zoom at 6–8 s (one fragment): the hashes are equal.
- Real `DocumentService` in a temp directory: `createProject` → `addAsset` → clip, trim and the crossing zoom → `documentSchema.parse(saveProject(...))` as the store, then fingerprint. `LessonService.captureFrame` through the real `getProject` gives `project-changed` at ruler 1 s **and** at 6 s. `renderFrames` is called 0 times.

**Impact:**
- Regions that cross a cut or clip boundary are normal in edited projects: a zoom or caption held across a trimmed pause, a speed ramp over two clips, a layout region. Captions come from the transcript, so any caption cue that crosses a trim triggers the problem with no manual region at all.
- For those projects, "Illustrate from current saved playhead" can never succeed. The new "Save and reload the current video project…" message is wrong for this case, because reloading does not help. This is the same class of user-visible failure as M13-1, from a different cause.
- It fails closed. No integrity or privacy exposure.

**Why the tests missed it:** the two new real-`DocumentService` regressions (`electron/lesson/service.test.ts`, "recovered" and "receipt-change") and the native fixture use a single clip with no trims and no regions. In that case every region has at most one fragment.

**Suggested fix (any of these):**
- Build the fingerprinted scene with a deterministic fragment ID, for example `${region.id}#${n}`, through an injectable `makeId`. That keeps the "actual scene" contract.
- Or replace fragment IDs with a positional placeholder before hashing.
- Or fingerprint the authored region arrays (`zoomRanges`, `annotations`, `speed`, `shaderEffectRanges`, `layoutRegions`, captions/transcript source) instead of the derived scene.
- Add a regression test: real `DocumentService`, a trim, and a region across it. Also test two clips with a region across their boundary. Assert two fingerprints of the same document are equal.

**Baseline vs new:** the random fragment IDs are baseline behaviour, harmless before because the scene was never compared. Depending on them for equality is new in slice 14. Before this commit the full-document JSON hash did not include the scene, so this specific failure is new, while M13-1 was the earlier one.

## Review-10 items: what I verified

### M13-1: fixed for the reported cause; not closed overall because of M14-1
- **Fingerprint inputs:** `version`, `projectId`, `buildNativeClipList`, `buildSceneDescription`, raw clip geometry, `trimRanges` and `readSpeedRegions`. Keys are canonicalised with a sorting replacer (`frameSource.ts:27-33`). The replacer is applied recursively, so nested key order no longer matters.
- **Coverage:** these are exactly the inputs `captureFrame` passes to `renderFrames` and to `projectRawTimelineSecToPlayback` (`service.ts:63-75`). The render cannot change without the fingerprint changing.
- **Exclusions:** `capturePrivacy` and save timestamps are left out. I grepped `src/native/sceneDescription.ts` and found no `capturePrivacy` use, so leaving it out does not hide a render input.
- **Stale and edit guards retained:**
  - the renderer still refuses `dirty` or missing projects (`LessonGuideDialog.tsx:310`) and checks that `document === snapshot` after the IPC call;
  - main still checks `projectId` and the digest;
  - a `sourceStartSec` edit gives `project-changed` with 0 renders (new test, passes);
  - a raw-geometry overhang gives `frame-unavailable` (new test, passes).
- **`fingerprintKind: "render-inputs-v1"`:** optional in `lessonSourceSchema`, written on new stills. Older stills without the field keep their full-JSON meaning, as the guide document states.
- **Not an attestation:** the doc comment and the guide document both say the fingerprint does not cover source bytes or the whole project. That is accurate.
- **Policy note, not a defect:** the receipt-change test writes an invalid receipt after save and then expects capture to succeed. That is consistent with the documented contract: privacy inspection does not change the composed pixels. It also means a lesson still can now be taken from a recording whose capture-policy receipt is no longer valid. I see no exposure, because only video pixels are rendered, but the case should be a conscious decision.

### L13-1 (Markdown): fixed by inspecting the exact syntax (no renderer installed)
- `md` now escapes only `& < >` as entities and backslash-escapes ASCII punctuation, including `=`. `'` and `"` stay raw, so `Don't` → `Don't`.
- `\r\n` is normalised, and every newline becomes `"  \n"` (a hard break).
- A blank line (`"\n\n"`) becomes `"  \n  \n"`. A line holding only spaces counts as blank, so paragraph breaks survive.
- Remaining Info: see I14-3 (indented code blocks).

### L13-2 (subset identity): fixed
- `projectLesson` (`export.ts:28-36`) returns a fresh `crypto.randomUUID()`, `revision: 0`, and `derivedFrom {id, revision, stepIds}`. `stepIds` has `.min(1)` and cannot be empty, because `projectLesson` already rejects an empty selection.
- `derivedFrom` is optional and strict in the schema. The export receipt records `derivedFrom` (`service.ts:174`).
- The renderer no longer pre-projects: it sends the full lesson and the ids, and main is the only projector. The dialog test now expects 2 steps plus 1 id, which is consistent.
- Re-exporting a derived lesson overwrites `derivedFrom` with its immediate parent. This is intended and documented ("immediate parent").
- Nit: the Markdown header line `Lesson revision ${selected.revision}` now always prints `Lesson revision 0` for every guide (I14-2).

### L12-1 (Godot `limit` state): fixed by inspection
- `stop_journal` returns early when `_journal == null and _journal_state != "recording"` (`clock_client.gd:233-234`). The later `stop_journal("disconnect")` (line 93) therefore no longer overwrites `limit` with `off` or emits a second signal.
- An `error` state is preserved too.
- I did not re-run the Godot 4.7.1 fixture. The implementer reports that it asserts the footer, the final state and the last signal.

### Info items
- **I13-1:** visibility now uses `keptRawSpans`, the same function the projection uses. Fixed.
- **I13-2:** bounded codes `project-changed`, `frame-unavailable`, `render-busy` and `destination-exists` (mapped from `EEXIST`), and `lesson-operation-failed` for everything else. No exception text crosses IPC. All 15 locales gained the `errors` block.
- **I13-4:** `eventId` max is now 220. Every authoring mutation goes through `author()`, which catches validation errors and shows a bounded message.
- **I13-7:** open now uses `O_NOFOLLOW | O_NONBLOCK`, and the regular-file check is repeated on the opened descriptor. Fixed.
- **I13-8:** `LessonTitleInput` keeps a local draft, reverts a blank or whitespace-only value on blur, and commits on blur or Enter. A mouse click on Save or Export blurs the field first, so the new title is committed before the click handler runs. Fixed. See I14-4 for a small leftover.

## New Info and nits

- **I14-1 (disclosure wording):** the new privacy line says "Editable output also retains selected evidence IDs, source project/render fingerprints and parent lesson lineage". The **exported guide folder**, the copy people share, also keeps all of these in `lesson.openscreen-lesson.json`: each step's evidence and each image's `source.projectId` / `documentSha256`. Its `export-report.json` holds the parent `derivedFrom.id`. A reader can take "editable output" to mean only "Save editable copy". Suggestion: say "Exports and editable copies", or remove the evidence IDs from the derived export.
- **I14-2 (nit):** every exported Markdown guide now says "Lesson revision 0", because derived manifests always start at 0. Consider printing the parent revision instead, or dropping the line.
- **I14-3 (Markdown nit):** an instruction line that starts with four or more spaces, or a tab, after a blank line still becomes an indented code block. Content is shown literally, so this is not an injection. Exact syntax only; no renderer was used.
- **I14-4 (UX nit):** if `onCommit` throws a validation error, `author()` shows the error but `LessonTitleInput` keeps showing the rejected draft, because `value` did not change. With the current `min(1).max(300)` schema and `maxLength=300`, I found no reachable input that does this. Noted for future schema tightening.
- **I14-5:** `update()` and the other authoring handlers now build from the render-time `lesson` instead of a functional `setLesson` updater. Two commits in the same event tick would lose the first. I found no current UI path that does this.

## Validation I ran (independent, outside the checkout)

**Environment:**
- Pinned Node `v22.22.1` (`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`) and Vitest 4.1.10.
- Snapshot: `git archive f801837a0469e46f6ee79bf74047a8a5cf233e76`, extracted into my session scratchpad (`…/scratchpad/r11/snap`).
- `node_modules` is symlinked entry by entry from the checkout (536 entries). `.vite` and `.vite-temp` are excluded. Nothing was built or run inside the checkout. The checkout HEAD is still `f801837a` and its status is clean, apart from this report.

**Results:**
- **Focused, 7 files:** `electron/lesson/service.test.ts`, `electron/ipc/lesson.test.ts`, `src/lib/lesson/lesson.test.ts`, `src/components/ai-edition/v4/LessonGuideDialog.test.tsx`, `electron/integrations/recordingClockBridge.test.ts`, `src/lib/clockBridge/journal.test.ts` and `src/native/sceneDescription.test.ts`. **7 files / 203 tests passed**, 3.84 s. This set differs from the implementer's "118/7" set because it adds `sceneDescription.test.ts`.
- **`npx tsc --noEmit`:** exit 0.
- **`npx tsc -p tsconfig.test.json --noEmit`:** exit 0.
- **Probe P1 (M14-1):** 3/3 ran and showed the behaviour above. It was run before the focused run and moved out of the snapshot.

**Not run, on purpose:**
- **Full suite:** the fix is bounded and focused tests plus static review were enough. The independent skips are the same as before: 1 conditional FFmpeg environment skip, because the snapshot lacks the untracked `crates/thirdparty`.
- **Rust, native build, compositor:** native sources and staged binaries are unchanged. I made no hardware or Vulkan claims.
- **Godot fixture, Biome, Vite build, i18n script, Chromium `file://` check:** not repeated. I accept the implementer's reports for these, apart from what M14-1 contradicts.
- **Visible Electron, physical recording, Windows/macOS, sustained runs:** all still open.
- **The implementer's Vulkan 1280×733 recovered-project still:** I did not reproduce it. It is consistent with M14-1, because that project had no region spanning a cut.
