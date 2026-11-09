# Claude roadmap review 39 — verified package inspection and static editable copy (9 November 2026)

Reviewed: exact `8ae837666e0d7df64446985e366acf6a5c40eae3` ("feat(lesson): inspect verified
packages and save static editable copies") against `b0463121c1b2a8988ee48e717c27375ea01413f9`,
branch `lesson-capture/input-boundaries`. Main is still
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: `AGENTS.md`, the handoff, `VERIFIED_PACKAGE_OPEN_2026-11-09.md` and the diff (31 files):
`electron/ipc/lessonPackageOpen.ts`, `electron/lesson/packageOpen.ts`, the `package.ts` internal
`assertCurrent`, the `lessonWorkflow` wiring, preload, `LessonPackagePanel.tsx`,
`src/lib/lesson/packageOpen.ts`, and 15 catalogs.

## Verdict

**Accepted within the stated scope. There are no High or Medium findings, and one Low test
gap.**

The scope is honest: GUI inspection of a verified v1 package, plus a static-only new editable
copy. Video packages stay read-only with their bindings kept and copy refused until a
media-preserving reseal exists. There is no claim of full-project or lost-video equivalence.

- **Authority.** IPC requires the registered current editor's main frame, with the live
  session and dirty check through the production `registerLessonWorkflow` binding. Paths come
  only from the native pickers; the renderer supplies only UUIDs and tokens. Picker
  cancellation returns before any package read.
- **Verify first.** The strict v1 inspector runs **before** any status or snapshot reaches the
  renderer.
- **Rendering.** The panel renders plain React text and validated JPEG `data:` URLs only:
  no packaged HTML, iframe, file-protocol grant or MP4 path.
- **Capability.** One bounded owner-scoped capability per window, invalidated by navigation,
  crash, destruction or release.
- **Copy.** Copy re-inspects the package, then re-asserts the original pinned identities and
  the session. The destination must be outside the package under a canonical parent. Staging
  is private 0600; publication is an exclusive `linkSync` with no async gap; there is no
  receipt. It never touches current authored work.

**Required real startup smoke (per `AGENTS.md`).** The committed script ran on my production
build of `8ae83766` from a foreign working directory, with no decoder or `APP_ROOT` hint and
pinned Node: `success: true` (SDK stdio initialize plus `listTools`, and the full production
CLI registration and runner).

## Findings

### L39-1 Low — capability invalidation on project reselect or change is untested

A copy re-asserts the **open-time** session (`opened.assertCurrent()` at
`lessonPackageOpen.ts:126`, and inside the copy's `assertCurrent` at `:134`). The copy-time
`authorize(event)` captures a *fresh* session, so it cannot detect that the project was
reselected or changed after the package was opened. Nothing else on the main side invalidates
the capability on project selection: only navigation, crash and destruction do. The UI does
release its token on project change, but that is renderer-side.

- Removing either check survives the 9-file focused set (R10, R16).
- Removing **both** together also survives (165/165).

My real-Electron probe O8 shows the shipped code refuses a copy after a same-ID reselect
(`lesson-package-invalid`), so this is a regression-safety gap.

Fix: add a production-route test that opens, reselects (or switches) the project, then
attempts a copy.

### Nits

- **N39-1: refused copies leave a partial file.** A copy onto an existing destination leaves
  a private `.lesson-copy-*.partial` in the destination folder. The exclusive `linkSync`
  refuses after staging, and nothing checks the destination before staging. Observed in probe
  O3. An `lstat` pre-check, as `fileRange` does, would avoid the litter.
- **N39-2: any failed copy drops the opened package.** Every failure clears the opened
  capability (`if (state) state.opened = undefined;`), so after `destination-exists` the user
  must re-open and re-verify before choosing another filename.
- **N39-3: two redundant checks.** R9 (re-verify before copy; the pinned-identity and byte
  re-assertions still catch changes) and R13 (the post-picker session check; the inspector's
  first check runs immediately) are both covered by other checks.
- **N39-4: a reselect during the picker reports as "invalid".** It returns
  `lesson-package-invalid` rather than a cancelled or project-changed status (probe O12). That
  is honest but not specific.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 8ae83766` copies in my scratchpad.

| Check | Result |
| --- | --- |
| Focused: `ipc/lessonPackageOpen`, `LessonPackagePanel`, `LessonGuideDialog`, `package`, `package.privacy`, `cli/lessonPackage`, `mcp/package.integration`, `src/lib/lesson/lesson`, `output` | 165 / 9 pass, 0 skip |
| Both `tsc`, i18n (14 locales match en), Biome on the 3 new sources | pass |
| Production `vite build` + required startup smoke | pass |
| My mutants | 15 single: 12 killed, 3 survived; plus R10+R16 paired, which survived (L39-1). Snapshot restored clean. |

**Mutants killed:** R1 main frame, R2 workflow authority, R3 token equality, R4 cancel
operation ID, R5 service video-copy refusal, R6 outside-package destination, R7 rename
overwrite, R8 final source identity, R11 navigation invalidation, R14 canonical parent, R15 UI
video-copy disable.

**Mutants survived:** R9, R13 (N39-3), and R10/R16 (L39-1).

### Full-app real Electron probe (Playwright `_electron`, production build)

- **Setup:**
  - The **full application** (editor opened through `switch-to-editor`, plus a genuine second
    window), run from a foreign working directory with no decoder hint.
  - `showOpenDialog` and `showSaveDialog` stubbed in main; no picker clicks.
  - Packages were real CLI packages (static two-step with code; video with 75 frames)
    **copied elsewhere**, with the original authoring inputs renamed away.

| Probe | Result |
| --- | --- |
| O0 picker cancelled | `{status: "cancelled"}` |
| O1 open static | opened; 2 steps, code kept, `videos: []`, `images: exclude` |
| O2 save copy | `saved`; file mode 0600, revision 0, `derivedFrom` set, 2 steps, code kept, no pins |
| O3 save to the same target | `destination-exists` (a private `.partial` is left: N39-1) |
| O4 target inside the package | `lesson-package-invalid` |
| O5 forged token | `lesson-package-invalid` |
| O6 second window: open / copy with the real token | `lesson-package-invalid` / `lesson-package-invalid` |
| O7 dirty project: copy / open | `lesson-package-invalid` / `lesson-package-invalid` |
| O8 copy after a same-ID project reselect | `lesson-package-invalid` |
| O9 open video package | opened, video 75 frames / 2.5 s, bindings visible |
| O10 video copy | `lesson-package-video-copy-unsupported`; the save dialog was **not** opened (count unchanged), no file written |
| O11 tampered package (`index.html` appended) | `lesson-package-invalid` |
| O12 project reselect while the picker is open | `lesson-package-invalid` |

The package bytes stayed unchanged throughout (`sha256sum -c`, 0 mismatches).

**Not covered:** GUI clicks, the native picker, physical capture, audio, other platforms and
human translation (the 14 non-English catalogs use English fallback text).

## Preservation and cleanup

- **Imported inventories:** 1485 and 76 entries, 0 mismatches.
- **Extended inventories:** 1873 and 78 entries, 0 mismatches.
- **Follow-up files:** 125 entries in `prior-followup-files.json`, 0 mismatches.
- **Extra preserved files:** 2 entries, 0 mismatches.
- **Prior evidence:** 112 files, 0 mismatches.
- **Review 38** is in the tree at `6ecd16d3…`.
- **Addon:** hash unchanged.
- **Cleanup:** all my Electron processes have exited. I removed profiles, packages, copies
  and media, and kept scratch builds and probe JSON in the session scratchpad.

## Next

- Optionally add the L39-1 test.
- Coordinator private push.
- Then the separate media-preserving reseal, and the player.
