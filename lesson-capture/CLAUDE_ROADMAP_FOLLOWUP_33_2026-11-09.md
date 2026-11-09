# Review33 filesystem guards and real startup follow-up — 9 November 2026

Base: `00bdbc77941a47a57926c5f5c412d2cf1de1b507`, accepted within scope by actual
[review33](CLAUDE_ROADMAP_REVIEW_33_2026-11-09.md), with no new High/Medium findings.
The original review33 is committed verbatim. This is a test, regression-smoke and
documentation follow-up: application/native production behavior is unchanged.
No headless MP4 integration starts here; main/private-main remain
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. One writer, no helper or push.

## Pre-existing pushed startup regression: preserve the exact history

Earlier implementation **edb74a00** made the production dirty-state provider
required while its headless consumer omitted that argument. Consequently, the
already-pushed **035c8313** failed every headless command that registered app
handlers: sources, record, export, captions and MCP. The file-only lesson commands
did not use that bootstrap. Reviews31/32 missed the regression; do not describe
that parent as generally functional based on editor or reconstructed bootstrap
checks. **00bdbc77 fixes it** with a conservative dirty=true provider, keeping
unregistered headless runners outside editor-only lesson authority.

Actual reviewer33 independently built both checkpoints: sources and MCP failed
with the missing-provider error on035c8313; MCP initialization and source-command
bootstrap progressed on00bdbc77, with Xvfb display enumeration still a limitation.
This follow-up does not rebuild/rerun the broken parent or infer physical/device/
export readiness. It preserves the reviewer's original account and adds the
following committed, repeatable current-production regression smoke.

## Durable real headless startup smoke

[AGENTS.md](../AGENTS.md) now requires future production changes **and reviews**
touching registerIpcHandlers, its consumers or CLI/MCP bootstrap to run:

```sh
# Pinned Node 22.22.1; build affected production sources first.
node scripts/smoke-headless-startup.cjs --evidence-dir /absolute/fresh/evidence-directory
```

The [committed smoke](../scripts/smoke-headless-startup.cjs) uses the real existing
production Electron entry, SDK stdio subprocess and isolated profiles under
xvfb-run, with DO_NOT_TRACK=1 and diagnostic milestones. It requires MCP
initialize/listTools and a normal CLI export **registration plus renderer request**.
The export selects a deliberately nonexistent disposable project and output path:
only the expected file-not-found validation failure with no input/output created
counts as startup success. A missing registration dependency, timeout or unrelated
error fails the smoke. This is stronger than a reconstructed registration mock or
a file-only lesson command, which bypasses the affected bootstrap.

The smoke does not enumerate devices, open real lessons, capture, render media or
claim a functional export. It retains stdout/stderr, commands, status and original
build/chunk hashes. Test-only follow-ups can reuse the original current production
build; production changes require a fresh build. Current real execution passes
both startup paths on the unchanged00bdbc77 build. No native picker or physical/
other-platform/audio acceptance is inferred. Initial and final smoke logs remain.

## L33-1 tests and independent controls

[Actual file transaction tests](../electron/lesson/fileRange.test.ts) use real
filesystem paths and the production confirmation, snapshot and publication code.
An openSync observation wrapper calls the real implementation; source observation
and publication are not rebuilt as test-only equivalents.

- **Initial output-folder symlink:** explicit output under a real ancestor link
  fails before any selected-input or media open, staging write or artifact-path
  disclosure. Exact original lesson/project/source bytes remain unchanged, and no
  output/partial appears. This independently pins F8's early refusal ordering.
- **Late output-folder change:** after real staging bytes passed canonical read and
  validation, an authority-check scheduling hook models an external rename plus
  ancestor link to the same owned directory. Permission stays valid. F9 refuses
  the new copy; neither lexical nor moved directory receives the final filename.
  Only the operation's retained private partial in its explicitly selected
  namespace is disclosed. Originals remain byte-identical. Removing F9 alone
  allows publication through the link and is killed.
- **Input ancestors:** lesson and project paths through a real directory link fail
  before the aliased file or media is opened, with no output/path disclosure.
  In the project case the separately authorized canonical lesson may already have
  been read. Removing F11 alone is killed; final-component no-follow guards cannot
  hide this ancestor case.
- **Same-byte project replacement:** during pending source observation **and**
  staging/publication, the original project inode is retained under a fixture
  name and replaced with identical bytes at the requested name. F3b refuses
  project-changed, with no completed output. The pre-observation case has no
  partial; staging retains only the authorized partial. Source/lesson bytes and
  both project byte copies remain exact; the expected inode change is asserted.
- **F18 nit:** an existing output is refused before reading selected inputs/media
  or writing a stage; the existing output and all inputs remain exact.

Six controls cover paired C89(F8+F9) and individual F8, F9, F11, F3b and F18. They
must produce real assertion failures, never timeout, load or compile failures;
source bytes are restored and hashed afterward. The paired output control is
killed by early no-read/no-stage/no-disclosure assertions. Other canonical staging
checks may still refuse eventual publication: that completion-only redundancy is
not claimed as an independent bypass. Existing reviewer33 equivalent survivors
(F1/F4/F12/F13+F15/F20/F22/F23) are unchanged and not claimed closed.

## Coverage, evidence and remaining scope

Unique evidence: `../openscreen-evaluation/review33-followup-2026-11-09T1541Z/`;
initial real smoke also retained at `review33-startup-smoke-2026-11-09T1540Z/`.
Pinned Node22.22.1/npm10.9.4. Exact commands, results and preservation inventories
are recorded with the final validation. Seven new transaction cases bring that
file to33tests. No new Vite/native build or full suite is warranted for unchanged
application/native behavior; prior5941/444 full and Vite remain historical runs.
Actual startup proof is fresh and uses the original current build with hashes.

Final **289 focused tests/16files**, zero skips, with7new cases and33transaction
tests. Both TypeScript configurations pass; Biome35baseline warnings/0errors,
docs37files and i18n15catalogs/1265literal keys pass. All **6 controls** are assertion
kills (1paired,5single), zero survivors/timeouts/load/compile kills; source restored
byte-for-byte and verified against00bdbc77. The committed smoke passes again after
formatting, with real MCP initialize/listTools and CLI registration/runner plus
expected exit1 for the absent project; no input/output media file is created.
Node syntax check passes. No application/native source changes or new build/full
suite/native-media validation is claimed.

Preservation verifies **70** original report/user-report entries, **675** prior
proof/evidence/initial-log files and **112** original native evidence files.
Original review33 SHA256:
`046ce6dbe78bb71cc6deb3cf78791a68c0e8687c8e5c45bfc91420be4f6e3260`.
Addon remains `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
Both imported stale-summary explanations and archived originals remain exact.

Review33's observations remain: bounded whole-file synchronous metadata re-reads
can briefly stall the main thread for large inputs, and some symlink failures use
the less-specific generic code. This slice changes neither. N31-3/N31-4/N29-3/N27-3
and physical/picker/audio/platform/player/package limits remain. All prior reports,
proofs, initial logs, stale imported-inventory explanations/archival originals and
the external user report are preserved.

Stop after the validated local commit. Coordinator independently obtains actual
Claude exact-SHA follow-up/fixes and pushes the accepted headless bootstrap fix
promptly; only then continue native selected-MP4 caller/channel/job ownership and
materializer/validator transport parity. Future handler-touching reviews must run
the committed real startup smoke, not infer it from mocked registration tests.
