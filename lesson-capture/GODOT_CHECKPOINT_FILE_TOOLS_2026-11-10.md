# Read-only Godot checkpoint file tools

10 November 2026. Locally validated; independent Claude review pending.

## Result

An author or agent can list authored markers from one explicitly selected original
Godot journal, then compare two raw marker record IDs against that exact inspected
file. The CLI and both MCP transports reuse the same pure list/comparison functions
as the accepted frontend. Nothing starts Godot, discovers a project, loads resource
paths or writes a source/output file.

```sh
openscreen lesson inspect-godot-checkpoints ./scene.jsonl --offset 0 --limit 200 --json
openscreen lesson compare-godot-checkpoints ./scene.jsonl --from 1 --to 6 --sha256 <inspection-hash> --json
```

Inspection returns raw SHA-256, Godot adapter identity, `clock: unmapped`, total
marker count, at most 200 marker labels/record IDs/source times/snapshot IDs and
`nextOffset`. Offset is 0–4095. Legacy v1 journals return zero markers; v2 markers
remain distinct even when labels repeat. Normalized captures cannot substitute for
the original snapshot records and are refused.

Comparison requires two distinct marker record numbers (0–4095) and the exact raw
SHA-256. Direction follows From/To, including reverse. It returns the source hash,
adapter/unmapped clock and the existing bounded comparison: marker metadata,
node identities, counts, changed field names and changed selection IDs. Captured
resource values and full state are omitted; authored labels and node names are
still content. The chosen path is not echoed into these results.

This describes sampled endpoints, not intermediate history, correct configuration,
save durability, completed work or runtime behavior. No clock mapping, source grant,
project archive/restore, native media call or live integration setting is involved.

## Contracts and authority

MCP exposes `inspectGodotCheckpointsFile({journalPath, offset?, limit?})` and
`compareGodotCheckpointsFile({journalPath, fromRecordSequence, toRecordSequence,
sha256})`. Both are read-only/non-destructive with explicit absolute server-local
paths. HTTP requires existing MCP edits permission before any file access; stdio
uses explicit-launch read authority. SDK cancellation and current HTTP consent are
checked before reads and before returning data. The bounded operations are
synchronous; they do not interrupt a decoder in the middle of an operation.

CLI relative paths resolve from the caller's cwd. Numeric flags use decimal digits
only, with schema range checks; missing/unknown/duplicate flags, non-marker/same
choices and malformed hashes are refused. CLI cancellation uses the supplied signal
at service boundaries. Fixed file/error codes omit raw parser/OS text and payloads.

The existing selected-file reader bounds input to 8 MiB and rejects nonfiles,
symlink inputs and mutation during reads. UTF-8 decoding is fatal. The full original
journal is validated, including malformed tails after normalized-prefix limits.
Each inspection page fingerprints the bytes it read; comparison re-reads and checks
that fingerprint. Source changes produce `capture-file-changed`, not an automatic
refresh. The service has no writer, mutation or source-discovery path.

## Validation

- Full regression: **6,529 tests / 481 files pass**. Final focused service/CLI/MCP
  checks: **55 tests / six files pass**, including explicit denial-before-read for
  both new MCP tools. Tests cover v1/v2, duplicate labels, paging/hash, forward/
  reverse, normalized refusal, invalid UTF-8/bytes/records, source changes, strict
  CLI flags and HTTP refusal/revocation. POSIX symlink creation assertions are
  skipped on Windows, where they require separate OS facilities; other bounds run.
- Both TypeScript configs, Vite production build, lint (35 existing warnings,
  no fixes), i18n15 and docs37 pass. A temporary CLI union-type insertion error
  was corrected before the successful checks. The final test-only addition for
  both denial paths and Windows symlink guard has focused/type coverage without
  repeating the already passing full suite.
- The real built Linux Electron passes MCP initialize/listTools and normal CLI
  startup before the expected missing-project error.
- An additional real-production foreign-cwd probe passes **15 checks**, covering
  CLI inspection/paging, comparison/reverse, MCP read-only registration and exact
  CLI/MCP response parity, legacy v1, fixed hash-mismatch failure, omitted resource
  values/source paths and unchanged source bytes.
- The production shared file service, bundled independently of Electron, passes
  **16 checks each on Linux and WinBoat Windows11 Node22.22.1**, using original real
  Godot v1/v2 journals. It checks raw hashes/marker pages, known endpoint results,
  unchanged snapshots, reverse, malformed requests, live authority and unchanged
  source bytes. The harness deliberately mutates its own disposable copy only for
  hash-change refusal. Windows coverage is Node file-service behavior, not packaged
  Windows Electron, physical input, recording or project execution.

The new committed `integrations/godot-typing/probes/fixtures/checkpoints.jsonl` is
retained real Godot4.7.1 Windows output from a disposable scene, not a real lesson
project. It has four authored markers and no private metadata/script contents.
Evidence lives outside Git in
`../openscreen-evaluation/godot-checkpoint-file-tools-2026-11-10/`, including logs,
production/startup results, both runtime probes, original fixtures and comparisons.
No server/profile remains running for this Windows Node-only probe.

## Continuation

[Checkpoint comparison 5055a279 is accepted](CLAUDE_GODOT_CHECKPOINT_COMPARISON_REVIEW_5055A279_2026-11-10.md).
Original-file inspection and comparison now support author→agent handoff of sampled
state. Application-project checkpoints/restoration, retakes, broader Godot editor/
runtime diagnostics and physical acceptance remain outstanding. The learner player
stays parked; main and the private remote are unchanged.
