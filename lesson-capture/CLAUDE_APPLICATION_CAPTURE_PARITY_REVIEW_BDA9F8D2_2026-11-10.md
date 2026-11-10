# Independent review: application-capture CLI/MCP parity — bda9f8d2 vs d4682b4f

- Reviewed HEAD: `bda9f8d2868339ea73823a5c4f93aa12687d8a39`. Base: accepted `d4682b4f`.
- Scope:
  - `electron/lesson/applicationCaptureFile.ts` and `applicationCaptureContracts.ts`;
  - the CLI `inspect-capture` / `import-capture` parsing (`args.ts`) and dispatch (`lessonCommands.ts`);
  - the MCP tools `inspectApplicationCaptureFile` and `draftLessonFromApplicationCapture` (`lesson-tools.ts`);
  - the tests and documentation.
- Excluded: the parked player, older history, and `/tmp/godot-checkpoint-comparison-prototype`.
- Reviewer: Claude (Opus 5.5), Orca task `task_07c46662d724`. Read-only; `git status` was clean before and after. Probes used an esbuild bundle of HEAD (built from stdin, `electron` external) in `/tmp/claude-parity-bda9f8d2/`, operating on a disposable copy of the retained real Godot v2 journal in a new `mkdtemp` directory.

## Verdict: ACCEPT

No blocking or Low findings. Informational notes follow.

## Independent probe results (`p.cjs`)

**Inspect**
- The SHA-256 equals the raw file bytes. Pagination works: `limit` 5 gives `nextOffset` 5, an offset past the end gives `[]` with `null`, and the final page gives `null`.
- Rows contain only `id, atMs, type, label`. The serialized result contains no `payload` or `baseline` anywhere.
- These are rejected:

  | Input | Error |
  |---|---|
  | relative path | `invalid-request` |
  | extra key | `invalid-request` |
  | symlinked source | `capture-file-unavailable` |
  | directory | `capture-file-unavailable` |
  | invalid UTF-8 byte | `capture-file-invalid` (fatal decode) |

- A BOM-prefixed file parses (TextDecoder strips the BOM) while the hash still covers the raw bytes, so the result stays consistent.

**Draft**

| Case | Result |
|---|---|
| wrong hash | `capture-file-changed`, no output |
| duplicate IDs | `invalid-request` |
| unknown ID | `capture-observation-invalid` |
| output equal to capture via a `.` path | rejected by the schema |
| output equal to capture via a symlink | `wx` fails, no overwrite |
| dangling symlink as output | `wx` fails and the symlink target is **not** created |
| existing output | rejected |
| missing parent directory | rejected |

**Permission timing**
- `assertCurrent` throwing on its first call: the result is `consent_required` and the (non-existent) capture path is never read. It returns the assertion error rather than `capture-file-unavailable`, which proves the assertion runs before the read.
- `assertCurrent` throwing only on its second (pre-write) call: `consent_required` and no output file.

**Success**
- Status `created`, mode `0600`, 2 steps.
- Evidence `eventId`s are preserved, the clock is `unmapped`, there is no `mediaSelection`, and the source bytes are unchanged.
- The lesson reopens with HEAD's `parseLesson`.

**CLI parsing (`parseCliArgs`)**
Rejected:
- repeated `--limit`;
- `--out` on inspect;
- duplicate `--observation`;
- `--out` equal to the capture;
- a repeated `--json` (alongside a missing `--out`);
- an empty value, by the existing `takeValue` rule.

An ID such as `-5:0` is accepted as a value. Paths resolve against the cwd.

**MCP and registration**
- Read in code: the HTTP inspect checks the edits permission before reading. Draft checks the edits permission before any read, then the callback checks `extra.signal.throwIfAborted()` plus the edits permission before reading and again after `validateLesson`, just before writing. Error results map to fixed codes, `consent_required` or `cancelled`, without echoing paths or payloads. Stdio inspect relies on explicit launch authority, as documented.
- Retained `production/report.json`: 11 checks pass, and the tool list ends with both new tools. `startup/startup-smoke.json` contains both tool names. `windows-stdout.log`: win32, Node v22.22.1, 27/27 checks, scoped to "shared file service … no Electron registration/native/physical claims"; stderr holds only an SSH warning.

**Focused vitest**
**18 passed / 3 files** (`applicationCaptureFile.test.ts`, `applicationCaptureCommands.test.ts`, `applicationCaptureMcp.test.ts`, which includes the real-HTTP cases; sockets were available here).

## Informational (no change required)
- **I1. Loose CLI number parsing:** `--offset`/`--limit` use `Number(...)`, so `--offset " "` becomes 0 and `--offset 1e2` becomes 100 (both accepted). The values stay bounded and integral, so this is harmless; a strict digit regex would only improve the error message.
- **I2. Request order is not kept:** draft steps follow capture order, not the order of the `--observation` / `observationIds` you pass (a reversed request gave the same order). That is reasonable for an evidence timeline; the docs could say so.
- **I3. The shared reader rejects symlinked paths:** `readSelectedFileSnapshot` (an existing helper) requires `realpath === resolve`. Any symlinked path component therefore fails as "unavailable", for example macOS `/tmp → /private/tmp`, a symlinked home folder, or on Windows a differently cased or 8.3 short path. This existing selected-file policy is safe; it is simply stricter than users might expect.
- **I4. A failed write can leave a partial file:** `writeFile(..., {flag: "wx"})` is exclusive but not atomic. A failure after the file opens (such as a full disk) can leave a partial lesson that then blocks a retry with "already exists". This is documented as "not crash-atomic". Removing the partial file on failure would be a small hardening step.
- **I5. Error codes reveal whether a path exists:** for any absolute path, the error codes distinguish unavailable from invalid, i.e. whether a regular file of at most 8 MiB exists. Over HTTP this needs edits permission; over stdio it needs explicit launch. That matches the existing lesson file tools.

## Limits
- No full suite, build or tsc rerun; I relied on root's 6499/475 and green final-run report, and kept the unsuccessful intermediate attempts separate. I did not run the built Electron app myself; registration evidence comes from the retained production and startup reports.
- I did not run the Windows probe myself and had no VM access. Nothing here amounts to packaged Electron, native, media or physical acceptance. I did not simulate a mid-write disk failure (I4 comes from reading the code).
