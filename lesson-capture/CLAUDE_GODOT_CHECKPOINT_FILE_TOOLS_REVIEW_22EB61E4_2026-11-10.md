# Independent review: Godot checkpoint file tools (CLI/MCP) — 22eb61e4 vs 5055a279

- Reviewed HEAD: `22eb61e4e68b9b6f77c7b5f90855903796dfcb49`. Base: accepted `5055a279`.
- Scope: the new tools for listing and comparing checkpoint markers in one Godot journal file:
  - `electron/lesson/godotCheckpointFile.ts` and `godotCheckpointContracts.ts`;
  - the CLI `inspect-godot-checkpoints` / `compare-godot-checkpoints` parsing (`args.ts`) and dispatch (`lessonCommands.ts`);
  - `electron/mcp/godot-checkpoint-tools.ts`, registered through `registerLessonTools`;
  - the updated tool-list tests, and the permanent fixture `integrations/godot-typing/probes/fixtures/checkpoints.jsonl`.
- Excluded: the parked player, older history, and `/tmp/godot-spatial-capture-prototype`.
- Reviewer: Claude (Opus 5.5), Orca task `task_e4e49ddedb3b`. Read-only; `git status` was clean. Probes used an esbuild bundle of HEAD (built from stdin, `electron` external) in `/tmp/claude-cpfile-22eb61e4/`, operating on disposable copies in a new `mkdtemp` directory.

## Verdict: ACCEPT

No blocking or Low findings.

## Independent probe results (`p.cjs`)

### Inspect (on a copy of the committed fixture)
- SHA-256 equals the raw bytes, 4 markers `[1, 6, 7, 13]`, `nextOffset: null`, clock `unmapped`, and the path is not echoed.
- Paging: `offset 1, limit 2` gives `[6, 7]` with `nextOffset: 3`.
- Legacy v1 (the retained real journal) gives 0 markers.

**Refusals:**

| Input | Error |
|---|---|
| normalized capture JSON | `capture-file-invalid` |
| invalid UTF-8 byte | `capture-file-invalid` |
| symlinked source | `capture-file-unavailable` |
| relative path | `invalid-request` |
| extra key | `invalid-request` |

### Compare
- 1→13 gives `{added: 1}`, and the reverse gives `{removed: 1}`.
- The top-level keys are `format, version, sha256, adapterId, clock, comparison`. There are no `res://` values and no path echo.

**Refusals:**

| Input | Error |
|---|---|
| wrong SHA-256 | `capture-file-changed` |
| same record | `invalid-request` |
| record 0 (not a marker) | `checkpoint-invalid` |
| 4096 | `invalid-request` |

### Permission checks
- The callback throwing on its first call reaches the caller before any file access. A missing path returns the callback's error, not `capture-file-unavailable`.
- The callback throwing after decoding (its second call) also blocks the result.
- After all probes, the source bytes are unchanged and the service created no files. The directory contained only my own inputs.

### CLI (`parseCliArgs`)

| Input | Result |
|---|---|
| `--offset 1` | accepted |
| `--offset 01` | accepted |
| `--offset +1` | rejected |
| `--offset 1e2` | rejected |
| `--offset ١` (Arabic-Indic digit) | rejected |
| `--offset 4096` | rejected |
| `--limit 0` | rejected |
| duplicate `--limit` | rejected |
| inspect with `--from` | rejected |
| compare without `--sha256` | rejected |
| compare with the same from/to | rejected |
| compare with `--offset` | rejected |
| compare with `" 1"` | rejected |

Number parsing uses `^\d{1,4}$`, which matches ASCII digits only because the regex has no `u` flag. This closes the loose-number note from my bda9f8d2 review for these new commands.

### MCP (code read)
- Both tools are marked `readOnlyHint: true, destructiveHint: false`.
- Over HTTP, the edits permission is checked before any service call. The service callback re-checks `extra.signal.throwIfAborted()` and the edits permission before the read and again after decoding, before the result is returned.
- The catch block maps errors to `consent_required`, `cancelled` or fixed codes only.
- Stdio relies on explicit launch authority, as documented.

### Fixture and tests
- **Fixture privacy:** the only resource strings are `res://enemy.gd`, `res://enemy.tscn` and `res://slime.svg`. There are 0 matches for home paths, user or account names, `Users`, script source keywords, or canary and private markers.
- **Focused vitest:** **86 passed / 6 files** (`godotCheckpointFile`, `godotCheckpointCommands`, `godot-checkpoint-tools`, `lesson-tools`, `openscreen-mcp-server` tool lists, and `applicationCaptureMcp`).

### Retained evidence
- `startup/startup-smoke.json` contains both new tool names.
- `production/report.json`: 15 checks, `passed`.
- `windows-stdout.log`: win32, Node v22.22.1, 16/16 checks, scoped to "no Electron/native claim".
- All 19 entries in `SOURCE_SHA256.json` match `git show HEAD:<path>` (0 mismatches).

## Informational (no change required)
- **I1. Decoding cannot be interrupted midway:** cancellation is checked only before and after the decode, so a large journal (up to 8 MiB) still decodes fully after a cancel. This is documented.
- **I2. Stdio has no extra permission gate:** over stdio, any absolute path readable by the process can be inspected, and the error codes reveal whether a regular file exists there. This matches the existing selected-file tools, which rely on explicit launch authority.
- **I3. Labels and node names are passed through:** they are authored or project content, not redacted. This is documented, and it is the same exposure as the prior comparison UI.

## Limits
- No full suite or build rerun; I relied on root's 6529/481 report plus the focused runs.
- I did not run the built Electron app, the Windows probe or the VM myself; registration evidence comes from the retained startup and production reports. No packaged Windows Electron, native or physical claim.
