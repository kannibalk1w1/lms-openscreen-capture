# Recheck: 320b4912 (code) + 4f7a175a (docs) after review of 86c9930d

Reviewer: Claude (Opus 5.5), independent. Snapshot /tmp/surface-recheck-320b4912 was not modified.
Scratch: /tmp/surface-recheck-scratch-bo1GCP.

## Verdict: ACCEPTED (two Low test gaps, optional)

## Checks
- `npx vitest --run src/lib/applicationIntegrations`: 11 files, 206 tests pass.
- `tsc --noEmit` passes for `tsconfig.json` and `tsconfig.node.json`.
- I ran the surface test file through a vitest shim in scratch: 19/19 pass.

## Item by item

**(1) Medium: fixed.** `partialSurfaces()` behaves as specified. These results come from a scratch probe against the snapshot modules:

| Case | Outcome |
|---|---|
| unavailable vs list | partial-no-observed-difference, partiallyCompared row, `surface-overrides-partial` (the follow-up test) |
| unavailable vs unavailable | partial, partiallyCompared row |
| truncated lists, same count and entries | partial, partiallyCompared row |
| truncated lists, count 40 vs 41 | differs (surfaceOverrides) |
| truncated lists, entry 0 different | differs (the follow-up test) |
| null mesh vs unavailable | differs in `mesh`; surfaceOverrides is unobserved with `surface-overrides-partial` |
| null mesh vs list | differs in `mesh` and `surfaceOverrides`, with no unknown |
| unavailable vs list with a different mesh | differs in `mesh`; surfaceOverrides is unobserved |
| v6 vs v7 unavailable | partial, `surface-overrides-unobserved` (the pre-v7 rule still takes precedence) |

All of these are honest. Mesh-field differences still show up, and a node with both a real difference and an unobserved field carries `unobservedFields` on its differing row.

**(2) Low: fixed.** Partly compared nodes are now listed in `partiallyCompared`.

**(3) Low: fixed in both directions.** `surfaceFieldName` labels changes to or from `"unavailable"` in both `describeNodeChange` and `compareGodotSceneCheckpoints`.
- The probe shows unavailable → list labelled `Node changed: Crate (surfaceOverrides unavailable)`.
- A list → null-mesh change keeps the plain `surfaceOverrides` label.
- Consumers of `fields` only join the strings for display (GodotCheckpointComparison, GodotRetakeComparison) and the counts. The two-word value does not break them.

**(4) Strict test: fixed.** My earlier surviving mutant M4 (dropping `.strict()` on the surface object) is now killed by "refuses extra keys".

**(5) Nits: fixed.**
- The decoder comment now says that a capped snapshot is never written.
- The consent text reads "references, by surface index and at most 32 surfaces per node (engine class name…".
- The 4f7a175a doc describes the unavailable and cap semantics, the within-take label and the partial rule accurately. Its linked review file exists in the commit.

## New mutants
- M5, ignoring observed entries in `partialSurfaces`: killed.
- **M6, labelling only the after-side `unavailable`: survived.** Only list → unavailable is tested; unavailable → list is not. The code is correct (verified by probe).
- **M7, treating null against an object as partial: survived.** No test compares a null mesh with a recorded list. The outcome would still differ through `mesh`, but the surfaceOverrides difference would be hidden. The code is correct (verified by probe).

## Findings
- Low (test gap): add a test for the unavailable → list label direction (kills M6).
- Low (test gap): add a reference test for a null mesh against a recorded list, expecting the fields `["mesh","surfaceOverrides"]` (kills M7).

Note: the original review scratch dir (/tmp/surface-review-scratch-Hwcqym) no longer exists. Its report survives as lesson-capture/CLAUDE_GODOT_SURFACE_OVERRIDES_REVIEW_86C9930D_2026-11-11.md in 4f7a175a.
