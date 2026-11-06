# Claude overnight review 13 — 6 November 2026

Reviewer: Claude (real, read-only), Orca task `task_a88b751a6d8c`.
Head reviewed: `bef8b6e9c9046fab6f6ec07fdac42a58bb591ec9` ("feat: add reading profiles and source lesson review queries").
Base: `553bd9caa4bac6bd01de2a97dd024df2f512a109` (slice15, accepted in review 12).
`main` is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. The checkout was clean at the start. This report is the only file I wrote in the checkout. All test runs used an immutable `git archive` snapshot outside the checkout, with `node_modules` symlinked one entry at a time and `.vite` / `.vite-temp` left out. My scratch probe tests ran only in that snapshot, and I deleted them afterwards.

## Verdict

I found **no High or Medium issues**. There is one new Low (L16-1, UI filter/edit interaction, fails safe) and four notes (N16-1 to N16-4). The review-12 items are handled as stated: N12-1 now has a test, and N12-2 and B12-1 are intentionally unchanged. None of these findings blocks the next authorized item (safe editable-draft retention plus shared query/export access).

## Review-12 disposition checked

- **N12-1:** `src/lib/lesson/output.test.ts:89` asserts `"Derived lesson revision 0; source revision 7."`. Closed.
- **N12-2** (theoretical reservation-walk note) and **B12-1** (baseline duplicate materialized layout ids) are unchanged, as intended. `sceneDescription`/`frameSource` are not touched by this diff.
- **I14-3:** leading instruction indentation is emitted as `&#32;`/`&#9;` before the escaped line text. My probe gave `&#32;&#32;&#32;&#32;four\-space line`, `&#9;Tab line`, `\- dash`, `1\. num`, `&gt; quote`. These escapes stop indented-code, list and blockquote interpretation. I checked the syntax only; no CommonMark reader was run (same limit the worker states).

## Slice-16 scope checked (code + independent probes)

Diff: 34 files, +1484/−28. No file under native, Rust, helper, compositor or clock paths changed. `git diff --name-only` filtered for `crates|native|clock|helper|.rs` matched nothing.

**Schema / versioning** (`src/lib/lesson/output.ts`, `schema.ts`)
- `output` is optional and strict, with `version: z.literal(1)`, enum preset/direction and boolean include flags. Language must be a single tag accepted by `Intl.getCanonicalLocales`, 2–64 chars, and is stored canonicalized.
- Probe: `version: 2`, an extra key, `en_US`, `x-private`, `en-GB-oed`, `i-klingon` and `preset: "custom"` are all rejected. `AR-eg` is stored as `ar-EG`; `zh-hant-tw` as `zh-Hant-TW`, and it stays the same after a parse round-trip.
- A lesson without `output` parses back unchanged, and `lessonOutput()` returns the defaults (existing test plus my check).
- No untrusted CSS or script: appearance comes from three fixed objects in `guideAppearance`. `lang` is HTML-escaped and canonical. `dir` is an enum. The CSP is unchanged (`default-src 'none'`, no script).

**Derived pruning** (`export.ts projectLesson`, `electron/lesson/service.ts`)
- Projection sets `imageId: undefined, imageAlt: ""` and/or `code: undefined` per step. Assets are then filtered by the remaining `imageId`s, so excluded image bytes, `sha256` and `source` metadata (projectId, rulerSec, documentSha256) go too.
- Probe over all four include combinations, scanning HTML + Markdown + the derived manifest JSON with canary text:

  | images | code | alt in output | code in output | image id | base64 | assets |
  |---|---|---|---|---|---|---|
  | on | on | yes | yes | yes | yes | 1 |
  | off | on | **no** | yes | **no** | **no** | 0 |
  | on | off | yes | **no** | yes | yes | 1 |
  | off | off | **no** | **no** | **no** | **no** | 0 |

- Evidence `assetId` is the recording asset (`draftLessonSteps`), not a lesson image id, so keeping evidence does not leak an excluded image reference.
- `exportGuide` creates `assets/` only when assets remain. The shipped service test checks every receipt-listed file for code, alt and pixel canaries and confirms that the source file still holds the code.
- With images off, the alt-text requirement is waived in both the UI gate and `renderLessonGuide`, because the projection drops `imageId`. With images on, the requirement still applies.
- The receipt adds `output` (actual resolved settings) and `review.draftSteps` / `review.emptyInstructions`, counted over the **selected derived steps**. That matches the guide doc ("selected source draft/empty instruction counts").
- The new derived identity, `revision: 0` and `derivedFrom` lineage are unchanged. `extensions` are still dropped.

**HTML semantics**
- `<html lang dir>` comes from settings.
- The generated status label is `<p class="status" lang="en" dir="ltr">`. The text is now "Source step reviewed", not "Reviewed by author", so it no longer suggests the derived output was approved.
- Code is `<pre dir="ltr">`, and `<figcaption aria-hidden="true">`.
- I inspected the worker's `high-contrast-360.png` (Arabic RTL, mobile): right-aligned Arabic headings and body, LTR English status label, black-on-white, code block wrapping inside the viewport with no overflow.

**UI** (`LessonGuideDialog.tsx`, `LessonOutputControls.tsx`, `LessonReviewControls.tsx`)
- Output settings go through `author(reviseLesson(...{output}))`, so they persist in the editable lesson and are written by Save. The shipped dialog test asserts this.
- The language `<select>` keeps an unlisted canonical tag from a reopened file as an extra option, so it is not silently dropped.
- Query: `queryLesson` is pure and read-only and returns `lesson.steps` filtered in source order. Ids, order and evidence are untouched. The title is cut to 300 chars before NFKC + `toLowerCase`.
- Filter/selection safety:
  - `hidden = active − matches`. Export is disabled while `hidden > 0`, with a status message.
  - "Select matching steps" replaces the selection.
  - Add, Draft and Open reset the query, so new or opened rows are never hidden.
  - Move up/down are disabled whenever `matches.length !== steps.length`, with help text.
  - The inventory image count shows 0 when images are off.
- Checks are factual labels (`draft`, `empty-title`, `empty-instructions`, `missing-alt`) with scope text saying they are not approval or certification.
- The guide-doc claims are consistent with the code.

## Findings

New:
- **L16-1 (Low, UI, fails safe):** With the "Source review label" filter set to **Reviewed**, the first edit to a reviewed step's instructions or code (or a committed title change) makes the row disappear in the middle of the edit. This happens because `update()` always demotes the step to `draft` (`status: change.status ?? "draft"`). The row is removed while the user is typing, focus drops to `<body>`, and later keystrokes are lost. If the step was selected, export becomes blocked with the "selected steps are hidden" message.
  - Reproduced in jsdom with the real dialog: rows 1 → 0 after one `change`, `document.activeElement === body`, export disabled, status "1 selected steps are hidden…".
  - No data leaks and no wrong export; it is confusing editing behaviour.
  - Suggested fix: keep rows that were edited while a filter was active visible until the query changes (or keep the match set fixed while editing), and announce the demotion.
  - The same pattern applies, less surprisingly, to ticking "I have reviewed this step" under the Draft filter.
- **N16-1 (Note, compatibility):** `projectLesson` always writes a resolved `output` block into the **derived** manifest, even when the source had none. So every guide exported by this build, including from an untouched old lesson, contains `output`, and pre-slice16 builds (strict schema) will refuse to open it. The source editable lesson does stay unchanged until settings are chosen, as stated. The guide doc says "older strict readers may reject newly added fields". That is accurate, but it does not say this now applies to all new derived exports. Either document it explicitly or omit `output` from the derived manifest when it equals the defaults and the source had none.
- **N16-2 (Note, query precision):** title matching is NFKC + locale-independent `toLowerCase`, not full Unicode case folding. Probe: the title "İstanbul" is **not** found by "istanbul" (`toLowerCase` gives `i̇` with a combining dot), and `ß`/`ss` do not match. Full-width "Ｃｏｄｅ ＳＴＥＰ" **is** found by "code step". The doc wording "case-insensitive Unicode-normalized" is acceptable but slightly generous. The brief's "casefold" overstates it.
- **N16-3 (Note, a11y wording):** the "selected steps are hidden" `<p role="status">` is mounted conditionally. Some screen readers do not announce a live region that is inserted already holding its text. Keeping an empty status element mounted and filling it would be more reliable. This was not checked with a real screen reader.
- **N16-4 (Note, i18n, disclosed):** the 44 new `timeline.lesson.output/query/findings` keys hold English text in all 14 non-English locales (for example, the `ar`, `de` and `ja-JP` `lesson.query.hidden` strings are the English sentence). The i18n check passes because keys match. The guide doc says translated wording remains open.

Baseline (unchanged, not re-raised): N12-2, B12-1, I14-4, I14-5.

## Validation actually run (this review)

All runs used pinned Node v22.22.1 on the snapshot of `bef8b6e9`.
- Focused Vitest on `src/lib/lesson`, `electron/lesson` and `src/components/ai-edition/v4/LessonGuideDialog.test.tsx`: **63 passed / 5 files, 0 skipped** (matches the worker's focused 63/5).
- Independent probes (scratch, then deleted):
  - `zz-probe13.test.ts` (1 test): 4-combination pruning, escaping/`<script>` absence, Markdown indentation, schema rejects/canonicalization, derived `output` presence, query normalization.
  - `zz-probe13.test.tsx` (1 test): L16-1 reproduction in the real dialog.
- `tsc --noEmit -p tsconfig.json`: exit 0. `tsc --noEmit -p tsconfig.test.json`: exit 0.
- `biome check` on `src/lib/lesson`, `electron/lesson` and the three dialog/control components plus the dialog test: 17 files, clean.
- `npm run i18n:check`: PASSED (14 locales, 1220 keys). `npm run docs:check`: OK (37 files).

Not run by me:
- The full Vitest suite. The worker's log `slice-16-full-vitest.log` shows 5,537 passed / 417 files in 135.91 s. That is their count, not mine, and it is not added to mine.
- Vite builds, and the whole-repo Biome run (the worker reports 35 existing warnings).
- The Chromium `file://` 4×2 viewport run. I only read the worker's `browser-validation.json` summary (4 profiles, 8 viewports, 0 external requests / scripts / overflow, 1 alternative name per illustration) and inspected one screenshot.
- The real LessonService file-workflow probe.
- Rust/native builds, Vulkan, Godot, portal, OS input, visible Electron, Windows/macOS and sustained runs. Nothing native changed, so no native rerun was needed and no native coverage is claimed.
- Real screen-reader or physical accessibility testing. Neither the worker's nor my evidence is an a11y certification. Arabic fixture text tests rendering only, not translation.

## Next

Slice 16 can stand. L16-1 and N16-1 are small enough to fold into the next authorized slice (safe editable-draft retention plus shared query/export access). That slice should keep rows edited under an active filter visible, and decide whether derived manifests should carry a default `output` block. No new app adapters or semantic collection.
