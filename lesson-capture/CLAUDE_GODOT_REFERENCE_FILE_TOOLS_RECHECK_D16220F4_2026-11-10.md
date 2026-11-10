# Recheck: d16220f4 (follow-up to 87cc7dac review) — 10 November 2026

Reviewer: Claude (independent). Snapshot `/tmp/godot-reference-files-review-d16220f4` (unchanged). Focused recheck only.

## Verdict: ACCEPTED

L1, L2, N2, N3, N4 and N5 are closed. N1 stays retained as documented. Two new nits (R-N1, R-N2) need no action.

## Items

| Item | Status | How verified |
|------|--------|--------------|
| L1: currency checks after the second read and before return | Closed | New `it.each([3, 4])` test. Re-ran M4 (drop the pre-disclosure check) and M5 (drop the post-second-read check): both now **killed**. |
| L2: CLI tolerance | Closed | Parser probed through `parseCliArgs`. Accepted: `1.0`→1, `1E-3`→0.001, `1e+0`→1, `+0.1`→0.1, `.5`→0.5 (also `1.`, `0.`). Refused with "Choose a tolerance between 0 and 1": `5e-0`, `2`, `1e+1`, `-0.1`, `NaN`, `0x1`, `1e1000`, `Infinity`, `" 0.5"`. `''` gets "--tolerance requires a value" from `takeValue`. `1e-400` is accepted as 0 (see R-N1). |
| N3: side-specific codes, per-side hash before the next read | Closed | `side()` reads, hashes, decodes and pre-validates one source before the next `assertCurrent` and before the second read. The new test shows a stale reference is rejected after exactly one read. Errors are fixed `${which}-…` codes and carry nothing from either file. MCP second-source failure returns exactly `candidate-file-unavailable`. Mutants M20 (candidate labelled "reference") and M21 (hash check deferred) are killed. |
| N3: pre-validation cannot change outcomes | Confirmed | `readGodotCheckpointSnapshot(text, seq)` is a pure function, and the library's first two calls are the same function with the same arguments on the same decoded strings. Pre-validation can only reject earlier, with a side-specific code, what the library would reject anyway. A pass guarantees the library's reads pass too. The bytes compared are the same verified bytes. M19 (drop pre-validation) is killed, because the codes revert. |
| N2 / N5 tests | Closed | The same-session, different-instance test kills M7. There are now tests for a file rewritten after inspection, for invalid bytes (`candidate-file-invalid`), and for MCP second-source failure over stdio, which returns only the fixed code. |
| N4 wording / doc | Closed | The CLI help and the MCP description now state the transforms-only tolerance and that self-comparison is not independent. The doc's "File-tool review" section matches the code and tests. The "CLI and MCP file tools" section is still accurate. I did not re-verify the doc's full-suite count (6,647). |

## New nits

- **R-N1:** A tolerance that underflows (`1e-400`, `1e-999`) is silently accepted as 0. Output then reports
  `numbers.mode: "exact"`, which is truthful and safe. Refusing it would only matter for user clarity.
- **R-N2:** The "own message" range check in the CLI is not pinned by a test. Mutant M22 (remove the
  `0 <= n <= 1` range check) survives: the schema still refuses `2`, `5e-0` and `1e+1`, but with the generic
  message, and the `refuses` tests only assert `kind: "error"`. The behaviour itself is correct; I verified it
  by probe. The remaining generic `checkpoint-invalid` code, for a library throw after both sides pre-validate,
  cannot name a side, which is acceptable.

## Commands

- `npx vitest --run electron/lesson electron/mcp electron/cli src/lib/applicationIntegrations` (snapshot): 982 passed,
  1 failed, 10 skipped. The failure is the same environmental MP4 test in `lessonCommands.test.ts`, which also fails at 2026fd3c.
  `godotReferenceFile.test.ts`: 26/26.
- `tsc --noEmit` with `tsconfig.json` and with `tsconfig.node.json`: both exit 0.
- Mutations were run in a slim copy (electron, src, integrations and configs, 17 MB). Every file was restored and
  confirmed with `filecmp`, then the copy was deleted.
  - Killed: M4, M5, M7, M19, M20, M21, M23 (regex removed, so `0x1` is accepted).
  - Survived: M22 (range check removed; R-N2).

## Limits

I did not rerun production CLI/MCP or the startup smoke. That was skipped to save `/tmp` space; the builder reports
15/15 and a passing smoke. Linux only.
