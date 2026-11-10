# Focused recheck: eff20dc1 (parent 0777440c)

Reviewer: Claude (Opus 5.5), independent. Snapshot: `/tmp/godot-reference-review-eff20dc1` (not edited).
Scratch copy: `/tmp/godot-reference-review-0777440c-scratch/copy2`. After the run it is identical to the snapshot (`diff -r -q` is clean and each mutant was restored and checked with `filecmp`).

## Verdict: ACCEPTED WITH NITS

L1–L5, N1 and N2 are all resolved. No new High, Medium or Low findings. `godotScene.ts` is not
touched by this commit, so the within-take comparator is still unchanged.

Commands, run in the snapshot:

- `npx vitest --run src/lib/applicationIntegrations`: **164/164 passed**.
- `npx tsc --noEmit`: exit 0.
- `npx tsc -p tsconfig.test.json --noEmit`: exit 0.

## Items

| # | Item | Disposition | Evidence (probes R1–R4, scratch copy) |
| --- | --- | --- | --- |
| 1 | L1/L4 per-node unrecordable fields | Resolved | **Both sides v2, both Node3D:** `visible` and the three 3D fields are listed as `unobservedFields`, with `node3d-fields-unobserved` added. A script difference is still reported as differing. **v2 Node3D vs v3 Node3D, no other difference:** `partial-no-observed-difference`, `partiallyCompared: 1`. **v2 Node2D vs v3 Node3D:** `differ` on type, the 2D fields and the 3D fields, with **no spurious unknown**. **v2 vs v2 Node2D:** compared normally, with no Node3D unknown. Nothing is inferred from type names. Cannot give a false agree: every v1/v2 source also adds `connections-unobserved`, and `agree` requires `unknowns` to be empty. |
| 2 | L2 `partiallyCompared` | Resolved | Separate list and count, not counted as `matched`. Mutant K6 is killed. |
| 3 | L3 connection rows | Resolved | A row that differs only by `deferred` now shows `deferred:false` against `deferred:true`, plus `boundArgs` and `oneShot`. K8 is killed. |
| 4 | L5 PathTable | Resolved | Heavy worst-case probe: 512 nodes, 64 deep, control-character names, 256+256 connections. Compare takes **45 ms** (was 4.1 s), self-compare 25 ms, heap growth about 3 MB. Output is 203,731 bytes. The key `${parent}\u0000${name}` is unambiguous because `parent` is digits only, so the first NUL always splits it, even when the name contains NUL. A name `"a\u0000b"` does not match the nested path `a/b` (R3). The root has identity 0 and interned IDs are ≥1. One table is shared by both sides, with at most 1,025 entries. Separator mutant K1 is killed. |
| 5 | Per-list `truncated`, clean prefixes | Resolved | `truncated` is now an array of list names, and once a list is cut it takes no more rows (K4 killed). In R4 the kept `referenceOnly` rows are the first rows in order. The row-count cap is now tested (K5 killed). |
| 6 | N2 identity | Resolved | `checkpoint.snapshotSequence` is present. The header-scene caveat is in the type doc comment and in the doc. The doc's claims are true: "well under a second" (measured 45 ms), and the list of mutants it calls killed matches K1–K8 and K10. |

## Nits (new; none affects outcome or bounds)

- **R-N1:** Mutant K9 survives: the test suite never puts the legacy node on the candidate side. If
  `unrecordable(other, candidate.schemaVersion)` were dropped, a v3-reference/v2-candidate
  Node3D would come out `differ` instead of partial. That is wrong but cautious, and it is not a false agree.
  Fix: add the mirrored test.
- **R-N2:** Mutant K11 survives: no test asserts `snapshotSequence`.
- **R-N3:** Connection `referenceOnly` and `candidateOnly` share one truncation name, `"connections"`. If one is cut, the
  other also stops (it stays a clean prefix, possibly empty). The 200-row cap is checked per sub-list,
  but either sub-list hitting it stops both. Counts stay complete.

## Mutants (scratch copy; restored and compared after each)

| Mutant | Result |
| --- | --- |
| K1 interned-key separator removed | killed |
| K2 version gate `<3` changed to `<2` | killed |
| K3 2D-position gate removed | killed |
| K4 clean-prefix early return removed | killed |
| K5 row-count cap removed | killed |
| K6 partiallyCompared folded into matched | killed |
| K7 node3d unknown dropped | killed |
| K8 flags/boundArgs dropped from connection key | killed |
| K9 candidate-side unrecordable ignored | **survived** (R-N1) |
| K10 ambiguity refusal removed | killed |
| K11 snapshotSequence overwritten | **survived** (R-N2) |

## Limits

- Heap growth comes from `process.memoryUsage()` without a forced GC, so it is indicative only.
- No Godot run.
