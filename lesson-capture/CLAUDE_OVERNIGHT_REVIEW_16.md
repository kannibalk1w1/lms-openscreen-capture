# Claude overnight review 16 — slice19 (explicit lesson-file query/export)

- Reviewer: Claude (Opus 5.5), sole reviewer, no helpers or subagents.
- Head: `74d58a5a0182fdbbda665e8d032858b746c822d6` ("feat: query and export explicitly selected lesson files").
- Base: `414823d662e13a6efab4cd5dc92319d8ecbc5e27` (review 15's accepted slice18).
- `main` / `fd2775e2` were not touched. This file is the only thing written in the checkout. Prior
  reports and follow-ups (including `CLAUDE_OVERNIGHT_REVIEW_15.md` and `CLAUDE_OVERNIGHT_FOLLOWUP_15.md`) are unchanged.
- Read: the diff, `LESSON_CAPTURE_COMMANDS.md`, `LESSON_CAPTURE_GUIDES.md`, `CURRENT_IMPLEMENTATION_HANDOFF.md`,
  follow-up 15, `electron/lesson/{readLessonFile,service,draftStore}.ts`, `electron/mcp/{app-channel,stdio-server,openscreen-mcp-server,project-tools}.ts`,
  `electron/ipc/handlers.ts` (MCP deps), `electron/cli/cliMain.ts`, the MCP settings hint in `src/i18n/locales/en/editor.json`.

## Verdict

**No High or Medium findings.** Slice19 matches its stated scope: one explicit file per call, no discovery,
no recovery-store API, no new listener, and the existing projection/fresh-folder export pipeline is reused.
There is **one Low**, about consent wording versus the HTTP read authority that this slice adds (L19-1), plus some notes.
Review 15's T18-1 is **closed**, and I confirmed it with mutation tests.

## Findings

### L19-1 (Low, new) — HTTP `queryLessonFile` is the first edits-off tool that reads a server path the caller names; the shipped consent wording still says "read your projects"

- Code: `electron/mcp/lesson-tools.ts:10-25` (no gate on query, by design), registered for every transport at
  `electron/mcp/openscreen-mcp-server.ts:944`. HTTP deps: `electron/ipc/handlers.ts:4981`, `editsAllowed` = the "MCP edits" setting.
- Baseline comparison: before this slice, the only HTTP tool that probes a path the caller names is `importMedia`.
  It runs `prepareImportMedia` only when `editsAllowed` (`openscreen-mcp-server.ts:780`). The comment at `handlers.ts:4970-4975`
  says "turning the server on grants a client read access and nothing more". The settings hint `editor.json:430` says
  "Off by default: clients can read your projects…".
- Scenario: the user enables the HTTP server and leaves MCP edits off, expecting project-only read access. An authenticated
  client (for example an agent following injected instructions) calls `queryLessonFile` with an absolute path to any file
  the user can read. When the file is a valid lesson manifest, the client gets the lesson UUID, revision, title, step
  IDs/titles, status, source kinds and findings. For any other file it gets a uniform failure, which still tells it
  "this is a valid lesson manifest" or "it is not". Probe P2 (below): a manual recovery copy saved by `LessonDraftStore`
  under `<root>/lesson-recovery-copies/<uuid>.openscreen-lesson.json` can be queried with edits off when the full path is
  known. Instructions/code are not returned. The file names are random UUIDs, and no MCP tool lists them, so this is not
  discovery.
- Mitigations already in place: only minimal metadata is returned; errors are fixed; a 16 MiB regular-file reader with no
  leaf symlinks; `/proc`, devices, directories and `EACCES` files are all refused (P4). `LESSON_CAPTURE_COMMANDS.md` states
  this authority openly ("works with MCP edits disabled", "can read that file… not a sandbox").
- Why Low: the authority is documented in the developer doc but not in the user-facing consent wording or in the
  baseline's own trust comment. It is a real, if small, widening of what "edits off" means on HTTP.
- Options (coordinator/owner decision, not changed here): (a) update `editsHint` and the `handlers.ts` comment to say
  edits-off clients can also query a lesson file by explicit path; (b) gate HTTP query behind MCP edits, leaving stdio as
  it is; or (c) accept and record it. No code change is needed for stdio or app-channel parity (see N19-1).

### N19-1 (Note, parity confirmed) — channel authority

- stdio (`stdio-server.ts:43,55`): `editsAllowed: () => true`. The lesson tools are registered directly on the server, not
  through the runner, so `openscreen mcp` runs them in its own process and never forwards them. This matches the
  explicit-launch trust model.
- App channel (`app-channel.ts:107,136`): the existing token-guarded Unix socket now also lists both lesson tools, with
  edits always on. This is the same authority as running `openscreen mcp`, as that file's trust comment explains, and adds
  no new listener. The stdio client does not use them (they are local there).
- HTTP: the export gate is read on every call, before any filesystem access. Mutation M1 below proves the test detects a
  read placed before the gate.

### N19-2 (Note) — output parent handling

`exportGuide` (`service.ts:120-180`, baseline) builds `path.join(parent, "lesson-<uuid>")` and calls `mkdir` without the
recursive option. Probe P1: a missing parent gives `ENOENT` and a missing deep parent gives `ENOENT`, with nothing
created; a parent that is a regular file gives `ENOTDIR`; a parent that is **a symlink to a directory is followed**, and
the folder is created in the target. Rejecting leaf symlinks applies only to the source manifest. This is acceptable for
an explicitly chosen destination (it is the same as the GUI picker path), but the docs do not say it. Success returns the
absolute folder path, which the caller chose and which can contain the OS username. This is documented.

### N19-3 (Nit) — CLI repeated query flags are last-wins

Probe P3: `lesson query f.json --title a --title b` → `title: "b"` silently. A repeated `--out` is refused ("Choose one
output directory"). This is inconsistent but harmless. Missing values, unknown options, a leading-dash file and a missing
`--out` are all refused through the existing error path.

### N19-4 (Note) — SDK validation diagnostics

Probe P2b/P2c: schema failures come back as SDK `-32602` text naming field paths and unrecognized key **names**
(`"extra"`). They do not echo values (`PRIVATE_VALUE` and `/home/PRIVATE` were not echoed). Fixed file errors stay
`lesson-file-operation-failed`. This matches the docs.

## Review-15 disposition check

- **T18-1 closed.** The final committed `LessonGuideDialog.test.tsx` now waits until `fieldset.disabled === false` before
  asserting. I placed this test file on an immutable `414823d6` snapshot (`git archive`, outside the checkout): **12/12 pass**.
  With `generation.current++` removed (`LessonGuideDialog.tsx:54`): **11 pass / 1 fail**, and the failing test is
  `ignores a pending illustration after restoring a lesson (same identity: true)`. The worker reported 11/11 and 10/11.
  The extra test in my count is the later delayed-digest case. This is the same result, not a discrepancy in substance.
- **Delayed-digest test (N18-1).** On the head snapshot I removed the second
  `document !== snapshot` check that follows `validateLessonImage` (`LessonGuideDialog.tsx:419-420`). The new test
  `rejects source changes while illustration integrity validation is still pending` then fails (11/12). So it really does
  exercise the second guard.
- **The reachability correction is recorded honestly.** Follow-up 15 and the guides keep review 14 and 15 unchanged and
  call the state fixes defence in depth. I agree. I did not re-run real-Chromium input.
- The next item named in the docs (offline guide navigation/print) is **not** reviewed or approved here.

## Validation and source preservation (code reading plus tests)

- Query: `queryLessonFileSchema` (strict, absolute path ≤4096, `lessonQuerySchema` strict, title ≤300, enums) →
  `readLessonFile` (lstat regular, `O_NOFOLLOW|O_NONBLOCK`, size ≤16 MiB re-checked while reading) → `parseLesson` (full
  validation). The output fields are the ones listed in `fileCommands.ts:7-31`. It never includes instructions, code,
  image bytes/alt, evidence IDs, extensions or paths. Mutation M2 (adding instructions/code to the output) fails 3 tests
  across the file, in-memory MCP and HTTP suites.
- Export: strict schema (1–200 unique UUIDs, both paths absolute) → the same reader → `LessonService.exportGuide` with
  project/render callbacks that always throw → `validateLesson` → `renderLessonGuide` (the reading profile and the
  include-image/code settings) → a fresh `lesson-<uuid>` folder, `wx` 0600 files, SHA-256 readback, then the receipt.
  The source is only ever opened read-only. The tests compare source bytes before and after. A partial folder without a
  receipt on failure is documented.
- CLI: the `lesson` route runs right after `app.whenReady` and before permission handlers, the runner window, IPC
  registration, STT and the usage ping (`cliMain.ts:311-316`; the ping is at `:443`). Errors become a fixed string with
  exit 1.

## Evidence (my own runs only)

Environment: Node `v22.22.1` (`~/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin` first on PATH). Private
TMPDIR `~/.cache/t16wqDb`. Immutable snapshots `~/.cache/evaluation/r16F82b` (head) and `~/.cache/evaluation/b1551tO` (base),
with node_modules symlinked entry by entry and `.vite`/`.vite-temp` excluded. Every mutation was reverted and checked
byte-identical with `cmp` against `git show`. The probe test file was deleted from the snapshot.

| Run | Result |
|---|---|
| Focused Vitest at head: `electron/lesson`, `electron/cli/{args,cliMain,lessonCommands}.test.ts`, `electron/mcp/{lesson-tools,openscreen-mcp-server}.test.ts`, `LessonGuideDialog.test.tsx`, `src/lib/lesson` | **11 files / 167 pass / 0 fail / 0 skip** |
| `tsc --noEmit` for `tsconfig.json`, `.node`, `.test`, `.workbench` | all exit 0 |
| `biome check` on the 15 touched TS/TSX files | clean, no fixes |
| M1: export reads the manifest before the edits gate | `lesson-tools.test.ts` gate test fails (1/59 across the 2 MCP files) |
| M2: query output adds `instructions` + `code` | 3 fail / 61 pass (fileCommands, in-memory MCP, HTTP MCP) |
| M3: base `414823d6` + head dialog test | 12/12; without the generation bump 11/12 |
| M4: head with the second post-validation document check removed | 11/12 (delayed-digest test fails) |
| P1–P4 scratch probes (in-memory MCP with edits off, real `LessonDraftStore`, `parseCliArgs`, the reader) | results as quoted in the findings |

**Not run by me:** the full Vitest suite, the Vite builds, i18n/docs checks, a real Electron CLI process, a real
`openscreen mcp` stdio process, a native/compositor build, or any desktop/OS input. The in-memory and test-harness HTTP MCP
runs prove the protocol and logic only. I make no claims about the worker's full-run figures (5575/422, 125.76 s) beyond
noting that they were reported.

## Summary

Accept slice19 at `74d58a5a` with no High or Medium findings. Before the server is described as read-only to users, decide
L19-1: either fix the edits-off consent wording or gate HTTP query. N19-2 (destination symlinks are followed) and N19-3
(repeated flags are last-wins) are optional polish.
