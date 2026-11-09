# Claude roadmap review 38 — review-37 follow-up (9 November 2026)

Reviewed: exact `17bed4e69963ac8d78ad3a9d44954c05f1e8bd87` ("test(lesson): pin portable package
privacy verification") against the review-37 base `36d30d2488f60777f08281a3a283bdb01ecf1813`,
branch `lesson-capture/input-boundaries`. Main is still
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and the addon is unchanged (`5d16ea98…`). The
checkout was clean at the exact HEAD at the start and at the end. This review added only this
file.

Read: the committed review 37 (`9125dc62…`, first committed here and preserved word for word),
`CLAUDE_ROADMAP_FOLLOWUP_37_2026-11-09.md`, and the new
`electron/lesson/package.privacy.test.ts`.

**Scope:** `git diff --quiet 36d30d24 17bed4e6` over the production `electron` and `src` paths
(tests and test support excluded) shows no change. The commit adds tests and documents only,
so no full suite, build or startup-smoke repeat was warranted.

## Verdict

**Accepted. L37-1 is closed, and there are no new findings.**

### What the new test does

- **Forgery construction.** The test builds **coherent re-signed malicious packages** from a
  real created package. It edits the editable lesson or manifest so exactly one privacy policy
  is violated:
  - media pin plus refresh history;
  - source evidence;
  - `extensions` (raw-journal canary);
  - manifest `code: excluded` with code present;
  - authored `includeCode: false` with code present;
  - manifest `images: exclude` with an asset present;
  - authored `includeImages: false` with an asset present.
- **Coherence checks.** It asserts that the re-derived guide HTML and Markdown are
  byte-identical to the original, so the guide-projection check cannot be what catches the
  forgery. It then regenerates every inventory hash, the manifest and the receipt, re-reads
  the stored bytes, confirms the canaries are present, and takes the authoring sources offline.
- **Expectation.** Verify must refuse each one.
- **Benign controls.** Explicit `includeCode` and explicit `include-external-provenance` images
  still verify, with no pins, evidence or extensions. The existing v1 compatibility tests are
  unchanged and pass.

### Guards are the deciding check

The forgery tests only assert the generic `lesson-package-invalid` code, so I checked
attribution separately. Removing each `validateProjection` predicate or operand
(`package.ts:111-124`) kills **only** its matching forgery case:

| My mutant | Killed test(s) |
| --- | --- |
| Q1: remove the whole `mediaSelection \|\| evidence.length` predicate | `media-pins-and-refresh-history`, `source-evidence` |
| Q1a: remove the pins operand | `media-pins-and-refresh-history` only |
| Q1b: remove the evidence operand | `source-evidence` only |
| Q2: remove `lesson.extensions` | `extensions` only |
| Q3: remove the manifest-code predicate | `manifest-code-excluded` only |
| Q4: remove the authored-code predicate | `authored-code-excluded` only |
| Q5: remove the manifest-images predicate | `manifest-images-excluded` only |
| Q6: remove the authored-images predicate | `authored-images-excluded` only |

So each forged package is accepted when only its own privacy guard is missing. The refusal
comes from that guard, not from an unrelated check. This agrees with the worker's seven
predicate and operand controls.

### Independent CLI check

I took scratch copies of the worker's preserved CLI forgeries
(`review37-followup-2026-11-09T1831Z/forged-*`) and confirmed with my own script:

- all seven are **coherent** (the receipt matches the manifest bytes and hash, and every file
  matches its manifest hash);
- each has exactly one violation: pin; evidence 1; ext; code under `scope: excluded` or
  `output.includeCode: false`; an image under `scope: exclude` or `output.includeImages: false`.

I ran `lesson verify-package` with **my own production build** from review 37 (production code
identical), from a foreign working directory with no decoder hint:

- all seven are refused with `lesson-package-invalid`;
- the worker's benign package is `verified` (`code: included`,
  `images: include-external-provenance`).

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshot:** `git archive 17bed4e6` in my scratchpad.

| Check | Result |
| --- | --- |
| Focused: `package.privacy`, `package`, `cli/lessonPackage`, `mcp/package.integration`, `src/lib/lesson/lesson`, `output` | 110 / 6 pass, 0 skip |
| `tsc -p tsconfig.test.json`, Biome on the new test | pass / clean |
| My guard mutants | 8 (Q1–Q6, plus operands Q1a/Q1b), all killed, each by only its matching case; snapshot restored clean |

The new test mocks `validateRangeVideo` only for the reused fixture. These privacy cases
contain no video, so no native acceptance is implied.

## Preservation and cleanup

- **Prior evidence:** 112 files re-hashed, 0 mismatches.
- **Authoring evidence:** 1873 entries in `preserved-prior-evidence.json` re-hashed,
  0 mismatches.
- **Reports:** 78 entries in `preserved-reports.json` re-hashed, 0 mismatches.
- **Imported inventories:** 1485 and 76 entries, 0 mismatches.
- **Addon:** hash unchanged.
- **Cleanup:**
  - I verified scratch copies only; the worker's evidence was untouched.
  - The CLI Electron processes have exited. I removed my copies and profiles.

## Next

- Coordinator private push.
- Then verified GUI import/reseal or the player dependency.
- Physical, audio, platform and full-course claims are unchanged.
