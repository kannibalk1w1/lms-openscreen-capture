# Claude overnight review 17 — slice20

- **Reviewed:** `d0949f9f6c17eb8c35886638077056647d7c606a` ("feat: navigate offline guides within explicit file authority") against `74d58a5a0182fdbbda665e8d032858b746c822d6`.
- **Branch:** `lesson-capture/input-boundaries`. `main` = `fd2775e2` (unchanged).
- **Reviewer:** Claude (Opus 5.5), working alone with no subagents. The checkout was read-only. The only checkout write is this file.
- **Date:** 6 Nov 2026.

## Verdict

**No High or Medium findings.** Review-16 Low **L19-1 is closed**: HTTP `queryLessonFile` now refuses with `consent_required` before any filesystem access when MCP edits is off. This is the same boundary as `exportLessonGuide`. Mutation testing confirms the new regressions fail on a read-before-gate change, on a removed gate, and on the unfixed 74d58a5a baseline. The offline guide navigation is script-free and fragment-only. It renders only the selected steps, and the CSP is unchanged. Print hides the navigation and lets long sections flow. Three Nits are recorded below; none blocks acceptance.

## Scope check

There are 30 files, +528/−59. The code changes are:
- `electron/mcp/lesson-tools.ts`: the gate, plus explicit `{transport, editsAllowed}` dependencies.
- The registration call in `openscreen-mcp-server.ts`, plus the instructions text.
- The IPC trust comment in `handlers.ts`.
- The settings hint (`McpServerSettings.tsx`, plus 15 locale files).
- `src/lib/lesson/export.ts`: HTML navigation and print CSS only.

The tests are `lesson-tools.test.ts`, `openscreen-mcp-server.test.ts`, the new `navigation.test.ts` and the `McpServerSettings` test. The rest is docs, including the committed REVIEW_16 and FOLLOWUP_16.

Nothing in the diff adds a listener, config, auth, adapter, discovery, recovery-inventory or store API. No Rust or native file changed. Markdown output, the manifest schema and `projectLesson` are untouched. My probe confirms that the Markdown carries no navigation strings.

REVIEW_16 is committed in d0949f9f, and its working copy matches the commit (the checkout is clean). It reads as the original report: 136 lines, with the original verdict and findings.

## Authority fix (L19-1)

- `lesson-tools.ts:22-23` runs the check `transport === "http" && !editsAllowed()` first in the query handler. It runs before schema parsing and before `queryLessonFile`, which calls `readLessonFile`'s `fs.lstat` and then `fs.open`. Permission is read on every call, so revocation takes effect at once.
- HTTP deps (`handlers.ts:4983`) read `mcpSettings.getSettings().allowEdits` live. Stdio (`stdio-server.ts:42-43`) and app-channel (`app-channel.ts:107`) pin `editsAllowed: () => true`, so their explicit-launch authority is unchanged. CLI `lessonCommands.ts` calls `queryLessonFile` directly and does not use MCP, so it is unchanged.
- The tests spy on the same `node:fs/promises` default object that `readLessonFile` imports. The spies are not vacuous: the grant leg asserts that `open` was called.
- The settings hint is accurate. It names explicit absolute paths, including known recovery-copy paths, and guide folder creation, and it says no discovery is provided. The tool description, server instructions and IPC comment all match.

## Guide navigation

- **Targets.** Each target is `step-<uuid>`. Schema `z.string().uuid()` plus the duplicate-ID rejection makes it attribute-safe and unique. Uppercase UUIDs also parse and work, since HTML ID matching is exact on both sides. `lesson-steps` cannot collide with any target. Every heading target has `tabindex="-1"`.
- **Contents.** The probe confirms that only selected steps appear, in source order, and that subset renumbering keeps the IDs stable. An empty selection still throws `Choose valid lesson steps`, so `anchor(0)` cannot hit an empty array.
- **Language and direction.** Titles are HTML-escaped. `output.direction` is a zod enum (`auto|ltr|rtl`), and `language` is escaped. System labels are marked `lang=en dir=ltr`. Authored contents titles carry the profile language and direction.
- **Script-free.** The page has no JS, storage or network. The CSP is unchanged: `default-src 'none'`, no script-src.
- **Print.** Print uses `nav,.skip-link{display:none!important}`, `@page{margin:16mm}`, `section,pre{break-inside:auto}` and keeps headings and figures together. The previous `section{break-inside:avoid}` is removed, which fixes long-section clipping and blank pages.
- **Worker artifacts** (`lesson-navigation-fixture-final`):
  - All 4 HTML files contain the final `.contents a{display:block}` rule and 0 `<script` tags.
  - `pdfinfo` gives page counts 5/6/8/8 (standard/high-contrast/large-print/RTL). `pdftotext` finds 0 navigation strings in each PDF.
  - The recorded browser is 151.0.7922.34.
  - I inspected the `rtl-360.png` screenshot: no overflow, and the links wrap.

## Findings

### N20-1 Nit: the `transport` branch is not reachable in production, and the stdio test uses a combination production never builds
- **Files:** `electron/mcp/lesson-tools.ts:22`, `electron/mcp/lesson-tools.test.ts:147-163`
- **Scenario:** Every stdio and app-channel construction pins `editsAllowed: () => true`. So the gate behaves exactly as plain `!editsAllowed()`.
  - The new test "keeps stdio … explicit-launch authority" registers `{transport:"stdio", editsAllowed:()=>false}`, which production never builds.
  - Mutation M4 hardcoded `transport: "http"` at `openscreen-mcp-server.ts:945`. All 181 `electron/mcp` tests still passed.
  - Behaviour is still correct today. The risk is a future change that gives stdio a real `editsAllowed`: it would expose the routing mistake that M4 shows no test would catch.
- **Suggestion:** none required. Optionally assert the transport routing through `createOpenScreenMcpServer`, or document the parameter as defence-in-depth.

### N20-2 Nit: a section with an empty title is named "2." although its contents link reads "Step 2" (baseline heading, newly exposed)
- **File:** `src/lib/lesson/export.ts:78`
- **Scenario:** Take a step titled `"   "`.
  - The contents link reads `Step 2`, but the target `<h2>` is `"2.    "`.
  - `<section aria-labelledby>` (new) now gives the region the name "2.".
  - After following the link, screen-reader users hear a heading and region name that do not match the link text.
  - The baseline heading text was the same. Only the region naming is new.
- **Suggestion:** use the same neutral `Step N` fallback (lang=en) in the heading when the title is blank. Markdown and the source stay unchanged.

### N20-3 Nit: in RTL guides the contents list and step links are laid out LTR
- **File:** `src/lib/lesson/export.ts:68,77`
- **Scenario:** In an Arabic/RTL profile, the whole `<nav class="contents">` is `dir="ltr"`. List markers and alignment sit on the left, while every other block in the page flows right to left. This is visible in `rtl-360.png`.
  - Each title span correctly keeps `dir=rtl`, so the text itself renders correctly.
  - This is a deliberate design choice ("English system labels"), not a defect.
  - Scoping `lang/dir` to the English label elements only, rather than the whole `nav`, would keep list layout in the document direction.
- **Suggestion:** none required.

No baseline defects were newly found in this slice.

## My own checks

All checks ran under pinned Node v22.22.1, in an immutable `git archive` snapshot under a private short `TMPDIR` (`~/.cache/r17`). I used per-entry `node_modules` symlinks, excluding `.vite` and `.vite-temp`. The checkout was never built in or mutated.

- **Focused Vitest at d0949f9f:** **165 passed / 15 files, 0 skipped.** Files covered:
  - `electron/mcp/lesson-tools`, `openscreen-mcp-server`
  - `src/lib/lesson/navigation`, `export`
  - `McpServerSettings`
  - `electron/lesson/*`, `electron/cli/*`
  - `src/components/lesson/*`
- **Mutations in the snapshot (each restored, confirmed with `cmp`):**
  - **M1:** add an `fs.lstat` before the gate. Both HTTP zero-read tests fail: in-memory SDK and the real authenticated HTTP.
  - **M2:** remove the gate. The same 2 tests fail.
  - **M3:** gate stdio too. The stdio authority test fails.
  - **M4:** hardcode `transport:"http"` in the server registration. All 181 tests pass (N20-1).
  - **M5:** overlay the d0949f9f test files on the 74d58a5a baseline. 3 tests fail: the HTTP grant/gate tests and the authenticated HTTP test. Baseline vulnerability confirmed.
- **Probe** (scratch test, deleted afterwards):
  - Uppercase UUID parses and renders.
  - Every ID is unique, and every link target resolves.
  - Empty selection is refused.
  - Empty title labels as shown in N20-2.
  - Markdown has no navigation strings.
- **Static checks:**
  - `tsc -p tsconfig.json` and `-p tsconfig.test.json` report no errors.
  - Biome over the 24 touched ts/tsx/json files is clean.
  - `i18n-check` PASSED with 1244 keys. All 15 locales carry `lessonFilesHint` identical to the English text, and no existing translation lines were removed.
- **Worker artifacts:** PDF page counts, navigation absence, script absence and the final CSS rule were checked directly. One screenshot was inspected.

## Skipped and limits

- I did not rerun the full Vitest suite. I accept the worker's 5,580/423, 0 skipped, 133.19 s. That run started before the final display-only contents CSS change. My focused run and the final artifacts cover that change.
- I did not rerun the Vite build, whole-repo lint, Rust/native or Electron, and launched no real stdio process. There are no new browser or PDF runs of my own; I relied on the worker's Chromium 151 artifacts and checked them myself.
- There is no screen-reader, physical printer, cross-browser, platform or accessibility certification. This is not a timed learner player or a universal PDF claim.
- No network, paid API, publishing, git or config mutation.
