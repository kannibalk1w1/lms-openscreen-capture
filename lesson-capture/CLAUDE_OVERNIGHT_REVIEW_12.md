# Claude overnight review 12 — 6 November 2026

Reviewer: Claude (real, read-only), Orca task `task_2d30b72e65b2`.
Head reviewed: `553bd9caa4bac6bd01de2a97dd024df2f512a109` ("fix: stabilize lesson scene fragments across cuts and clips").
Base: `f801837a0469e46f6ee79bf74047a8a5cf233e76` (slice14, reviewed in review 11).
This report is the only file written in the checkout. All test runs used an immutable `git archive` snapshot outside the checkout, with `node_modules` symlinked one entry at a time and `.vite` / `.vite-temp` left out.

## Verdict

**Medium M14-1 (review 11) is closed.** I found no new High or Medium issues. There are two new Low/notes (N12-1, N12-2) and one baseline note (B12-1). None of them blocks the next slice.

## M14-1 rereview

Original defect: `lessonRenderFingerprint` hashed `buildSceneDescription`. There, `projectRegionsToSource` gives every fragment after the first a random `createId` id. So any region that crosses a trim or clip boundary always produced `project-changed`.

What changed:
- `buildSceneDescription(document, webcamSourceSize, makeFragmentId = createId)`. All six projection call sites (zoom, ann, camfull, speed, fxr, layout) now go through `makeFragmentId(kind)`. The default is still `createId`, so preview (`NativeCompositorOverlay`), export (`ExportDialog`, `CliExportRunner`), the MCP media tools and the `sceneDescription.ts` internal callers are unchanged. `createId` is no longer used anywhere else in `sceneDescription.ts`.
- `buildLessonSceneDescription` walks the whole document and reserves every string `id`, including legacy payloads (for example `legacyEditor.speedRegions`). It then allocates `__lesson_fragment_<kind>_<n>` from one counter that starts fresh on every call, skipping reserved ids. Only extra fragments get these ids. The first fragment keeps the authored id, or keeps it missing if there was none (`emitted === 0 ? region.id : makeId()`), so a missing authored id is not normalized away.
- The fingerprint and the main-process still render (`LessonService.captureFrame`) both call `buildLessonSceneDescription`, so the hash and the scene the compositor gets come from the same function.
- Other id sources in the scene path are already deterministic: caption cues use `caption-${n}`, and materialized layouts use `existing.id ?? layout_${clip.id}_${a}`. The native compositor does not branch on id prefixes. Its caches are keyed by id, which works the same with deterministic ids. No Rust, ABI or native schema changed.

Independent probe (my own scratch test in the snapshot, deleted afterwards; real `DocumentService` saved and reopened):
- Geometry: 3 clips (0–4, 4–8, 8–12 s) plus 2 trims (1–2, 9–10 s). One zoom crosses everything. A second authored zoom has the colliding id `__lesson_fragment_zoom_1`. A legacy speed region has the colliding id `__lesson_fragment_speed_3`.
- Zoom ids came out as `z, …_0, …_2, …_3, …_4, __lesson_fragment_zoom_1 (authored), …_5`. They are unique, the authored id was kept and the colliding generated id was skipped.
- With ids stripped, the scene equals the default `buildSceneDescription` scene, so pixel payload and draw order are unchanged.
- Three reopen cycles (parsed, and raw `getProject` as main sees it) gave the same fingerprint and an identical scene each time.
- `captureFrame` through the main callback at 0.5 / 3 / 5 / 10.5 s rendered 4 times. Each render received exactly `JSON.stringify(buildLessonSceneDescription(store))`.
- Staleness: moving the second trim (fragment geometry only) gave `project-changed`. Changing the legacy speed value gave `project-changed`. The render count stayed at 4.

Shipped tests checked: 14 parameterized cases (7 families × trim / two clips), with allocation assertions on each. The only exception is two-clip layout, which asserts that no allocation happens, and that is correct because layouts are already materialized per clip. The tests also cover repeated scene and fingerprint identity, pixel/order equivalence with ids omitted, source-geometry changes altering the hash, an authored-id collision case, and two real `DocumentService` crossing-zoom capture fixtures at 1 s and 6 s with a stale depth edit refused. They match the brief.

## Other corrections checked

- The en and the other 14 locale `privacy` strings now say that exports and editable copies keep the correlation metadata. That matches `projectLesson`, which keeps `derivedFrom` in the subset.
- Markdown now reads `Derived lesson revision N; source revision M`. `projectLesson` always sets `derivedFrom`, so in practice the `?? lesson.revision` fallback is never used. This is correct (see N12-1).
- The Markdown leading-indentation format debt is still deferred, as stated. I did not claim a CommonMark render.

## Findings

New:
- **N12-1 (Low, test coverage):** No test asserts the new Markdown revision line (`grep "Derived lesson revision"` matches only `src/lib/lesson/export.ts`). A regression back to one combined revision would go unnoticed.
- **N12-2 (Note):** The reservation walk covers the whole document, including derived fields that main re-inspects (`capturePrivacy`). The renderer and main can only diverge if some stored string `id` literally equals `__lesson_fragment_<kind>_<n>` in one copy but not the other. That is theoretical and gives no reason to change anything. The walk is O(document) for each fingerprint or capture, which is negligible for this path. Speed fragments use up counter values even though the scene drops speed ids. This is harmless and deterministic.

Baseline (not introduced here):
- **B12-1 (Note):** `materializeLayouts` reuses `existing.id` for every materialized piece of one authored layout region (per clip, and per legacy envelope boundary), so the scene can contain duplicate layout ids. This was already the behaviour before this slice, it is deterministic, and the compositor does not key layout behaviour on these ids.

Earlier notes I14-4 and I14-5 remain as described in the handoff (unreachable or not current UI paths). I did not retest them.

## Validation actually run (this review)

All runs used pinned Node v22.22.1 on the snapshot of `553bd9ca`.
- Focused Vitest on `src/lib/lesson`, `electron/lesson` and `src/native/sceneDescription.test.ts`: **191 passed / 4 files, 0 skipped**. The worker's figure of 177 / 3 files leaves out `sceneDescription.test.ts`.
- Independent probe: 1 test passed (described above, then deleted).
- `tsc --noEmit -p tsconfig.json`: exit 0. `tsc --noEmit -p tsconfig.test.json`: exit 0.
- `biome check` on `src/lib/lesson`, `src/native/sceneDescription.ts` and `electron/lesson`: 11 files, clean.

Not run by me: the full Vitest suite (no gap needed it), Vite builds, the i18n/docs scripts, Rust or native builds, real Vulkan renders, Godot, or desktop/Electron acceptance. The worker's 5,519 / 416 full-suite result and the Vulkan two-still evidence (`slice-15-*`, `lesson-guide-crossing-fragment-fixture`) are their claims, not counts from me. Physical portal, OS input, visible Electron, a11y, Windows/macOS and sustained-run checks are still open.

## Next

With M14-1 closed, the planned next slice can go ahead: accessible profiles / language / figcaption duplication, and bounded review/query controls over the existing manifest, with no extra app adapters. Optional: add the N12-1 test.
