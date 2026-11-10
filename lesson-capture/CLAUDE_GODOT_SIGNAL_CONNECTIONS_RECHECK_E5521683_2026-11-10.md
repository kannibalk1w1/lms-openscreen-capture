# Focused recheck: e5521683 (parent e0786f0f), saved Godot signal connections

Reviewer: Claude (Opus 5.5), independent. Date: 10 Nov 2026.
Snapshot: /tmp/godot-connections-review-e5521683 (immutable).
Mutations ran only in scratch copies (decoder: scratch/copy; GDScript: scratch/gdprobe2). Both were restored and verified with `cmp`.

## Verdict: ACCEPTED WITH LOWS (one Low, two Nits; nothing blocking)

All earlier findings are resolved: F1-F4, L1, L2 and N1-N4.

## Rechecks

1. **F1: labels: resolved.**
   - `shortName` cuts any segment over 48 chars to 47 chars plus "…".
   - Longest possible label: 38 ("Signal connection no longer observed: ") + 4×48 + 5 = 235 chars, under the 300 limit.
   - The new test (200-char names, 100-char signal and method) imports through `godotSceneCapture`, keeps every label ≤300, and leaves the full payload unchanged.
   - Mutation S1 (remove shortening) is killed.
   - Mutation S2 (leave only the signal unshortened) survives. That is harmless: the label is still at most 287 chars.

2. **F2: cap and cost: resolved.**
   - Cap is 256 in both producer and decoder. Mutation C1 (decoder allows 257) is killed.
   - The sort now computes each key once.
   - Real probe here: `CONNECTION_LIMIT_PASSED … 256-connection cap 10634 us`, about 10.6 ms for a full snapshot of 259 nodes. Builder's Windows run: 9530 us.
   - My direct measurement of `_connections` alone at the worst shape (512 nodes, 256 bound connections): best of 5 was **4.6 ms**, and `limited=false` at exactly 256.

3. **F3/F4: callable checks: resolved.** Direct Godot 4.7.1 calls to `_method_callable` on the follow-up script:

   | Callable | Result |
   |---|---|
   | plain method | accepted |
   | `bind(1)` | accepted |
   | `bind(obj, [1, {k: 2}])` | accepted |
   | `bind(NAN)` | accepted |
   | `bind(7).unbind(1)` | **rejected** (counted) |
   | bound self-capturing named lambda `f` | **rejected** (counted) |
   | nested `bind(1).bind(2)` | rejected (see L1 below) |

   - **Holding bound values for the equality check is acceptable.** `get_bound_arguments()` only copies Variant references into a local array. Nothing is serialized or invoked. Comparing Variants runs no user code: Objects compare by identity, and GDScript has no operator overloading.
   - In the real probe both canaries are counted: excluded is 5, and the `replacing_by` and `editor_description_changed` canaries are absent from both journals.
   - GDScript mutations:
     - Removing the unbound-count guard **survives**: `bind().unbind()` is still rejected by equality. This confirms the coordinator's note; the guard is redundant, kept as defence in depth.
     - Removing the equality check turns the nested bind and the lambda into accepted records (excluded drops from 3 to 1). So equality is what actually rejects F3.

4. **L1/L2: tests: resolved.**
   - Every field of the connection identity now has a test. Mutations K1 (drop `oneShot` from the key) and K2 (drop `boundArgs`) are killed. Both survived on e0786f0f.
   - There is a real limit take: the 256 limit timers plus the 1 baseline connection give 257, and `connections-limit.jsonl` ends with `{"event":"scene-stop","reason":"limit","coverage":"limited"}`.
   - The 256-entry decoder case is accepted and 257 is rejected.

5. **Docs: truthful.**
   - Byte budget is accurate: about 33 KiB per state at the cap (matches the 132 KB at 1,024 measured before), roughly 250 changed samples within 8 MiB.
   - Also documented correctly: the excluded count is capped at 1,000,000, labels are shortened and can be ambiguous, and the error wording is fixed.

## New findings

**L1 (Low): a nested bind is excluded but not documented as such.**
`Callable(t, m).bind(1).bind(2)` is a real method bind with two bound values, but it does not equal the flat `bindv([...])`. So it is counted in `excludedConnections` and not described. That is conservative and truthful, since it is counted. The doc, however, implies every "exact method bind" is recorded. Verified in Godot (`ok=false bound=2`). Fix: add one line to the doc, or accept nested binds.

**N1 (Nit): shortening can split an emoji.**
`slice(0, 47)` works in UTF-16 units, so it can split a surrogate pair (for example an emoji in a node name) and leave a lone surrogate in the label. Import still works; the effect is cosmetic.

**N2 (Nit): v5 journals from e0786f0f with more than 256 connections no longer import.**
Lowering the decoder cap means a v5 journal written by e0786f0f with over 256 connections would now be rejected. This only matters if such journals were kept as evidence; e0786f0f was never released as a producer.

## Commands

- `npx vitest --run src/lib/applicationIntegrations` gives 8 files, **139 passed**.
- `npx tsc --noEmit` and `npx tsc -p tsconfig.test.json --noEmit` both exit 0.
- Real probe: `OPENSCREEN_SCENE_PROBE_TMP=~/.cache/gcr6 GODOT_BIN=… node scripts/probe-godot-scene.cjs` exits 0.
  - Passed: SCENE_PROBE, all three limit footers, CONNECTION_LIMIT_PASSED (10634 us), CONNECTIONS_PASSED (5 counted), HISTORY_RUN_PASSED, OFFLINE_DECODER, PORTABLE_AUTHORING.
  - probe.log has 0 SCRIPT ERROR lines and there was no spawn error.
  - Fixture: ~/.cache/gcr6/godot-scene-probe-Sryjj5.
- Builder evidence (read-only): Windows stdout shows the same PASS lines with 9530 us; full suite is 6591 passed; the production report status is "passed".
- Not rerun: the full suite, production CLI/MCP and Windows.
