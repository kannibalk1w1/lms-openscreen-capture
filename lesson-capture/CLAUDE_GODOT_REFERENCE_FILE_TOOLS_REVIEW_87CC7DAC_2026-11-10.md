# Independent review: 87cc7dac (compare Godot reference takes through CLI and MCP) — 10 November 2026

Reviewer: Claude (independent; did not write the code). Base 2026fd3c. Snapshot
`/tmp/godot-reference-files-review-87cc7dac` (unchanged; only `dist-electron/` added by the requested `vite build`).

## Verdict: ACCEPTED WITH LOWS

There is no path to a false `agree`, to disclosure without consent, to partial disclosure or to a hash-unbound
source. Both Lows are gaps in tests or in CLI usability. Neither is a correctness or safety defect.

## Gates

| # | Gate | Disposition | How verified |
|---|------|-------------|--------------|
| 1 | Both descriptors, record IDs and SHA-256 values validated before any read | Met | `.strict()` zod schema (absolute paths, int 0-4095, `^[a-f0-9]{64}$`, finite tolerance 0-1) runs before `assertCurrent` and the first `snapshot`. The CLI refuses unknown, repeated or missing options, `-x` candidates and uppercase hashes (probed). |
| 2 | HTTP consent and cancellation gate reads and disclosure; stdio keeps launch authority | Met (one check untested, L1) | MCP denies up front. The currency callback checks `signal` and consent before the first read, between the reads, after the reads and before return. The catch rechecks consent. The tool is synchronous, so nothing can interleave after the last check. M9 and M16 are killed. M4 and M5 (the post-read and pre-disclosure checks) survive. |
| 3 | Bounded stable snapshots; actual bytes fingerprinted and compared; identity bound to hash | Met | Each side is one `readSelectedFileSnapshot` (8 MiB, realpath, O_NOFOLLOW, identity before and after). `digest()` and `text()` run on the same `Uint8Array`, so there is no TOCTOU between hashing and parsing. The returned `sha256` equals the verified request hash, spread before the library identity. M2, M12, M13 and M18 are killed. |
| 4 | A mismatch on either side rejects; no refresh, relink, discovery or resource loading | Met | Fixed `reference-file-changed` / `candidate-file-changed`. No fallback code exists. Confirmed in production on both sides. |
| 5 | Same-file and same-checkpoint behaviour defined; not independent confirmation | Met | `sameContent` (identical bytes), `relation.sameTake` (session and instance) and `sameCheckpoint` (plus record). Session and instance IDs are regex-validated and never empty, so legacy files cannot collide on `undefined`. Same path with a different sequence gives sameContent true, sameTake true, sameCheckpoint false. Same bytes at a different path gives all three true. A different-bytes copy of the same take gives sameContent false and sameTake true. That is consistent, and `sameContent` implies `sameTake`. |
| 6 | Library unknown, partial and truncation reasons and bounds preserved | Met | `...comparison` is passed through whole: unknowns, `partiallyCompared`, connection status and `excluded`, `truncated`, counts. Rows are capped at 200 per list and 256 KiB of row JSON in total. Header strings are bounded (label ≤200, enums, resource paths). The MCP text is therefore about 256 KiB plus a few KiB. CLI pretty-printing inflates this by a constant factor but it stays bounded. |
| 7 | Tolerance cannot soften discrete fields; regression at tolerance 1 | Met (guard currently equivalent, N1) | Code: `CONTINUOUS.has(field) ? tolerance : 0`. Connections compare through exact JSON keys. The tolerance-1 regression covers boundArgs, deferred, oneShot, script, visible and type. Production run "differ": tolerance 1 still differs. |
| 8 | Tests and production | Met, with gaps L1/N2/N5 | 19 new tests. Real production: 15/15 passed on my own build. Startup smoke passed. |

## Findings

- **L1 (Low): the post-read and pre-disclosure currency checks are untested.** Mutants M4 (drop the
  `assertCurrent()` before `return`) and M5 (drop the one after the second read) both survive. The MCP "revocation
  before return" test revokes inside the first read, so the between-reads check catches it. The test never reaches
  the pre-disclosure check the doc credits it with. The code is correct today. Fix: a test that revokes, or
  aborts, on the 3rd and 4th `assertCurrent` call.
- **L2 (Low): the CLI tolerance syntax does not match the help text `<0-1>`.** Probed with
  `parseCliArgs`. The parser refuses `1.0`, `1E-3`, `1e+0`, `+0.1`, `00.5` and decimals with 13 or more digits.
  It accepts `.5`, `0.50`, `9.9e-1`, `1e-0` and `1e-99`. `5e-0` and `2e-0` pass the regex, are then refused by the
  schema, and get the misleading message "Choose both explicit journals, their checkpoint records and inspected
  SHA-256 hashes". This was also seen in production (exit 2). Every refusal is safe; the problem is usability. Fix:
  allow `1.0` and `E`, and report schema refusals of tolerance as the tolerance error.
- **N1 (Nit): the CONTINUOUS guard is an equivalent mutant.** M1 (tolerance on all fields) survives,
  because no non-continuous field is numeric. The builder's doc states this honestly. A synthetic numeric discrete
  field cannot be added without a schema change, so this is acceptable as documented.
- **N2 (Nit): the `instanceId` term of `relation.sameTake` is untested.** Mutant M7 (sameTake by
  sessionId only) survives.
- **N3 (Nit): some error codes do not name the side.** `capture-file-unavailable`, `capture-file-invalid` and
  `checkpoint-invalid` do not say which side failed. Both files are also read before either hash is checked. So a
  stale reference combined with a missing candidate reports `capture-file-unavailable`, and the candidate is read
  even after the reference is already stale. Nothing is disclosed. This is a diagnostics issue only.
- **N4 (Nit): the CLI help line is incomplete.** It reads "exact unless a tolerance is given". It omits that
  tolerance applies only to continuous transforms, and that a comparison of the same file is not independent. The
  MCP description also omits the transforms-only scope.
- **N5 (Nit): some test coverage is weaker than the doc implies.** The "both-source mutation" tests swap hashes
  rather than rewrite bytes after inspection; this is equivalent because the digest is taken over the read bytes.
  Second-source failure is tested only for a missing file, not for a changed or invalid one, and only at service
  level, not through MCP. The "no disclosure" assertion is weak, because the errors carry only a code anyway.

No path or payload leakage was found. CLI errors are fixed codes: JSON `{"event":"error","message":"candidate-file-changed"}`,
and human `capture-file-unavailable` (verified in production). MCP failures are fixed codes or `consent_required`.
Pointing `--candidate` at `/etc/passwd` returns only `candidate-file-changed`.

## Commands and results

- `npx vitest --run electron/lesson electron/mcp electron/cli src/lib/applicationIntegrations`: 974 passed, 1 failed,
  10 skipped. The failure is `lessonCommands.test.ts › runs explicit selected MP4…`
  (`range-export-tool-unavailable` instead of `range-export-incomplete`). It is environmental and pre-existing:
  it fails the same way in a git-archive of parent 2026fd3c.
- `npx tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`: both exit 0. `biome check` on the changed files: clean.
- `npx vite build` (snapshot): passed. `production.cjs` run with my own esbuild bundle of the snapshot's `godotScene.ts` as the decoder:
  `{"checks":15,"status":"passed"}` (distMainSha256 ce8b7b6d…). The run included relative cwd, agree, tolerance-1 differ,
  both wrong-hash codes, CLI/MCP stdio parity, same-file labelling, the MCP fixed error and unchanged sources.
- Extra production probes: a missing candidate gave `capture-file-unavailable`, exit 1. `/etc/passwd` as the candidate gave
  `candidate-file-changed`. `--tolerance 5e-0` gave exit 2 with the generic message. `--help` shows the new usage line.
- `node scripts/smoke-headless-startup.cjs --evidence-dir …/startup-smoke`: `success: true`.

## Mutations (scratch copy `…-scratch/mut`; each restored and checked with `filecmp`, final `diff -rq` clean)

| ID | Mutation | Result |
|----|----------|--------|
| M1 | tolerance applied to all fields | survived (equivalent, N1) |
| M2 | drop the candidate hash check | killed |
| M3 | drop the between-reads currency check | killed |
| M4 | drop the pre-disclosure currency check | **survived (L1)** |
| M5 | drop the post-second-read currency check | **survived (L1)** |
| M6 | `sameContent` always false | killed |
| M7 | `sameTake` ignores `instanceId` | survived (N2) |
| M8 | MCP: drop the up-front HTTP denial | survived (equivalent: the first currency check denies before any read) |
| M9 | MCP: drop consent from the currency callback | killed |
| M10 | CLI: drop the tolerance regex | killed |
| M11 | CLI: candidate not resolved against cwd | killed |
| M12 | reference hash check weakened | killed |
| M13 | reference identity given the candidate hash | killed |
| M14 | `sameCheckpoint` ignores the record | killed |
| M15 | CLI: allow repeated options | killed |
| M16 | MCP catch: skip the consent recheck | killed |
| M17 | CLI: allow repeated `--json` | killed |
| M18 | candidate snapshot reads the reference path | killed |

## Limits

Linux only; Windows and macOS production were not run. The production script is the builder's, run against my
own build and decoder bundle. Cancellation through a real SDK abort was not exercised end to end; it was checked
by code reading plus the unit tests. Concurrent file replacement during a read is covered by the existing
`readSelectedFileSnapshot` tests and was not re-tested here. I did not run the full suite.
