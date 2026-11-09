# Claude roadmap review 37 — portable selected lesson package v1 (9 November 2026)

Reviewed: exact `36d30d2488f60777f08281a3a283bdb01ecf1813` ("feat(lesson): package and verify
portable selected media") against `f0eacc958959222915ff93ac2b410ec460b828e2`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and
the addon is unchanged (`5d16ea98…`). The checkout was clean at the exact HEAD at the start and
at the end. This review added only this file.

Read: `AGENTS.md`, the handoff, `PORTABLE_LESSON_PACKAGE_2026-11-09.md`, the full diff (26 files):
`electron/lesson/package.ts`, `packageContracts.ts`, `packageIO.ts`, `packageMedia.ts`,
`mcp/package-tools.ts`, the CLI `args`/`lessonCommands`/`cliMain`, the `src/lib/lesson/export.ts`
refactor, and the v1 `.fixture` compatibility files.

## Verdict

**Accepted within the stated scope. There are no High or Medium findings, and one Low test
gap.**

The package is an additive, derived static lesson plus already-rendered MP4. The document
honestly excludes native projects, raw media, journals, evidence, pin history and the original
receipts, and makes no claim of lossless editing, full-course portability or a timed player.

- **Explicit authority.** Create requires explicit `--step`, a mandatory `--code`, a mandatory
  `--images` policy, explicit `--media STEP MP4 RECEIPT` triples and an existing `--out`.
  Missing choices are refused as usage errors (exit 2). A receipt grants no path, and nothing is
  discovered, relinked, refreshed or rendered.
- **Media checks.** Every selected MP4 is checked against the selected lesson's current v2 pin,
  target and revision and against its receipt's bytes and hash. It is then sample- and
  full-decode validated twice (source and copy).
- **Publication.** No-overwrite UUID folder at mode 0700, files at 0600. The receipt is written
  last in one synchronous turn after read-back.
- **Verify** reads only the explicit root and its bounded fixed tree, and re-derives the guide
  bytes from the verified editable lesson. A forged or script-bearing guide therefore cannot
  pass, even with checksums re-signed. It re-decodes every MP4.
- **Unchanged contracts.** The existing lesson schema (`src/lib/lesson/schema.ts`) is
  unchanged. The guide renderer refactor is behaviour-preserving for derived lessons, and the v1
  byte fixture pins the guide contract.
- **Permissions.** HTTP checks live MCP-edits permission before any filesystem access, for
  verify as well; stdio and CLI keep explicit-launch rights and the existing lifetime and drain.

**Required real startup smoke (per `AGENTS.md`).** The committed script ran on my production
build of `36d30d24` from a foreign working directory, with `OPENSCREEN_FFMPEG_PATH` and
`APP_ROOT` unset and pinned Node: `success: true`, with 63 tools including
`createLessonPackage`/`verifyLessonPackage`, and CLI bootstrap and runner reached.

## Findings

### L37-1 Low — verify-side scope and privacy projection guards are untested

`validateProjection` (`package.ts:121-124`) refuses a package whose derived editable lesson
still carries `mediaSelection` or `evidence` (P6), or holds code or images that the manifest
declares excluded (P17, P16). Removing each guard leaves all 305 focused tests passing.

For code and JPEGs, the re-derived guide-byte check (P1, killed) still catches a forged
package in practice, unless the attacker also regenerates the guide with the same renderer.
For pins and evidence, which the guide does not render, P6 is the only barrier. Without it, a
re-signed package could carry source hashes or evidence while its manifest says
`historyAndEvidence: not-included`.

The shipped code refuses all three, so this is a regression-safety gap, not a live defect.
Fix: add re-signed-package verify tests for each.

### Nits

- **N37-1: every refusal has the same code.** Every create and verify refusal maps to one fixed
  `lesson-package-invalid` code and message: a missing file, an extra file, a symlink, a forged
  guide, corrupt video, a forged receipt, a symlinked output folder or a wrong MP4 all look
  identical. That suits privacy but gives little diagnosis; a bounded reason category without
  paths would help.
- **N37-2: equivalent survivors.**
  - P2, the first tree enumeration: the final enumeration still runs.
  - P7, create-side stripping of `mediaSelection`: `projectLesson` already strips it, and
    `validateProjection` refuses otherwise.
  - P13, the HTTP pre-check: the service's first `assertCurrent` runs before any filesystem
    access.
  - P14, the explicit `isSymbolicLink`: a symlink dirent fails the `isFile`/`isDirectory`
    branches anyway.
- **N37-3: one link check only.** The guide's video links are plain relative file links (no
  player), matching the scope. I confirmed the only `href` to media is
  `media/<step-uuid>.mp4`.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 36d30d24` copies in my scratchpad. `node_modules` is symlinked per
  entry, and the addon directory is symlinked read-only.

| Check | Result |
| --- | --- |
| Focused: `package.test`, `cli/lessonPackage`, `mcp/package.integration`, `lesson-tools`, `openscreen-mcp-server`, `cli/args`, `lessonCommands`, `fileExport`, `encodedVideo` | 273 / 9 pass, 0 skip |
| Focused plus the existing guide and lesson suites (`src/lib/lesson/lesson.test.ts`, `output.test.ts`; mutation baseline) | 305 pass |
| Both `tsc`, Biome on the 8 changed sources | pass / clean |
| Production `vite build` + required startup smoke | pass |
| My mutants | 18: 11 killed (P1 guide projection, P3 verify decode, P4 receipt manifest hash, P5 duplicate paths, P8 receipt-pin compare, P9 media bytes, P10 create source decode, P11 descriptor identity, P12 path regex, P15 artifact gate, P18 receipt target), 7 survived (P6/P16/P17 = L37-1; P2/P7/P13/P14 = N37-2); snapshot restored clean |
| Worker logs | `completion.json`: final full run 6060/450, 0 skip (`--maxWorkers=4`); the initial default run had 1 failure in the unrelated untouched clipboard test, re-checked; 13 distinct controls. Not repeated by me. |

### Real transport probes

All on my production build, run from a foreign working directory with no decoder hint.

**Fixture:**
- 5 s source, cut 1–2, ruler range 0.5–4, giving 75 frames.
- Step 1 has a script/`onerror` title and instructions plus a `CODE_CANARY` code block.
- Step 2 is unselected and contains `UNSELECTED_CANARY`.

**Chain:** CLI `confirm-range` → `export-range` → `package --code exclude --images exclude`
produces `packaged`.

**Package contents** (folder 0700, files 0600):
- **Files:** `index.html`, `lesson.md`, `lesson.openscreen-lesson.json`, `lesson-package.json`,
  `media/<step>.mp4` and `package-receipt.json`.
- **Absent:** `CODE_CANARY`, `UNSELECTED_CANARY`, source and project names, the scratch path,
  `previousSelections`, `documentSha256` and `identity`.
- **Escaping:** the HTML payloads appear only as escaped text (`&lt;img … onerror=…&gt;`,
  `&lt;script&gt;`).

**Moved copy with the originals renamed away (unavailable):**
- CLI `verify-package` → `verified` with 75 samples / 2.5 s / 75 decoded frames, audio flags
  false.
- A **fresh** SDK stdio `verifyLessonPackage` → same result,
  `checksumAuthenticity: local-readback-not-signature`.
- `queryLessonFile` on the derived lesson reopens it, with no code canary.

**Tamper refusals.** Every one of these exits 1 with `lesson-package-invalid` (stdio: `isError`
plus a fixed message):
- missing MP4;
- extra file;
- hidden file;
- symlinked `lesson.md`;
- `<script>` appended to `index.html` with checksums **re-signed**;
- corrupt MP4 bitstream **re-signed**;
- manifest frames changed to 74 **re-signed**;
- `../escape.html` path with the receipt re-signed;
- edited lesson bytes;
- edited manifest bytes;
- package folder reached through a symlink alias.

**Create-side:**
- `--code include` explicitly includes the code canary.
- Selecting step 2 includes its text, as expected.
- Wrong MP4 bytes, a forged receipt revision and a symlinked output folder are refused, and
  none leaves a package folder behind.
- Media for an unselected step, or a missing code policy, is a usage error (exit 2).

All six original hashes (source, project, lesson, confirmed lesson, range MP4, range receipt)
are unchanged.

**Not covered:** HTTP live, GUI, picker, physical capture, installer, audio, and Windows or
macOS (Linux-only acceptance).

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 1485 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 76 entries in `preserved-reports.json` re-hashed, 0 mismatches.
- **Imported inventories:** 1254 entries with 0 mismatches. 74 report entries with 1
  explained change: `HEADLESS_SELECTED_MP4_2026-11-09.md` is `c66bdb89…` at `e45e4b34` and
  `d6d8458a…` at `f0eacc95` and `36d30d24`, a coordinator checkpoint edit that the worker
  recorded.
- **Review 36** is in the tree at `672d9e19…`.
- **Addon:** hash unchanged.
- **Cleanup:** all my probe Electron processes have exited. I removed profiles, packages,
  outputs and media, and kept scratch builds and logs in the session scratchpad.

## Next

- Optionally close L37-1 with three verify tests.
- Coordinator private push.
- Then GUI verified import/reseal or the timed player.
- Still unclaimed: physical capture, audio, installer, other platforms and full-course
  portability.
