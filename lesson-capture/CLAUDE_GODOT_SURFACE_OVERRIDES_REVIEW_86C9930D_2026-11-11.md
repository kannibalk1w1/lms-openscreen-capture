# Independent review: 86c9930d (Godot per-surface material override references, v7)

Reviewer: Claude (Opus 5.5), independent; did not write the code. Parent 1b1a751a.
Snapshot: /tmp/surface-review-86c9930d (unmodified). Scratch: /tmp/surface-review-scratch-Hwcqym.

## Verdict: ACCEPTED WITH LOWS (one Medium recommended before relying on cross-take outcomes)

## Checks run

- `npx vitest --run src/lib/applicationIntegrations src/components/ai-edition/v4/GodotRetakeComparison.test.tsx`: 12 files, 208 tests pass.
- `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`: both exit 0.
- `npm run i18n:check`: PASSED (15 locales). New reason keys are in all 15 locales as English text, the same fallback as earlier reason keys.
- Real Godot 4.7.1 headless (`--audio-driver Dummy`, XDG in scratch, disposable project), calling the addon's own `_surface_overrides` on real nodes:
  - Same-resource `ArrayMesh.add_surface_from_arrays` without reassigning the mesh: the override count follows at once (2/2) and the record is `{count:2,[mat,null]}`. Because the poll serialises the whole state, the change is captured.
  - `ArrayMesh.clear_surfaces()` on the same resource: the mesh count drops to 0 but the override count stays at 2, so the record is `"unavailable"`. The mismatch path can be reached in real use. After re-adding a surface, Godot keeps the old override 0, and that is recorded as engine state.
  - BoxMesh gives count 1. SoftBody3D is a MeshInstance3D and gets `{count:1,[null]}`.
  - A material set on the mesh surface (`surface_set_material`) is not reported. Only explicit overrides are reported, with no inherited material.
  - An imported 3-surface glTF (`--import`) gives mesh `built-in-or-unsaved` (its path was `multi.gltf::ArrayMesh_*`), count 3, all null even though the glTF has surface materials. An explicit override on surface 2 is recorded by index.
  - Aggregate: 33×32 entries gives `_limited` plus `"unavailable"` (entries 1056). `set_surface_override_material(40)` out of range is refused by Godot.
- Code reading (GDScript):
  - `_surface_entries` is reset in `_snapshot()`, so the cap applies per snapshot.
  - With `_limited`, `begin()` refuses before opening the file. `_sample()` calls `stop("limit", false)` without writing the state, then writes a `coverage:"limited"` footer. So the cap's `"unavailable"` never reaches a journal.
  - The Inspector trigger covers `surface_material_override/<i>` with `begins_with` and is limited to MeshInstance3D.
  - Bytes: at most 1,024 refs per state. Worst case is about 1 MB per state with 1,000-character paths, plus the existing per-node refs, so a few states fit before the existing 8 MiB `_write` guard stops the take with a limited footer. Bounded.
- Mutations (scratch copies, esbuild plus a vitest shim, baseline 15/15):
  - M1, dropping the truncated-flag refine: killed.
  - M2, dropping `"unavailable"` from the partial reason: killed.
  - M3, a one-way mesh-presence check: killed.
  - M4, dropping `.strict()` on the surfaceOverrides object: **survived**.

## Findings

### Medium: "unavailable" compared as data produces a false observed difference
`godotSceneReference.ts` compares `surfaceOverrides` as exact JSON text. `"unavailable"` against an observed list therefore counts as a differing field, and the outcome becomes `sampled-fields-differ`. It also adds `surface-overrides-partial`.

Verified in a scratch probe:

```
{"o":"sampled-fields-differ","d":[{"path":["Crate"],"fields":["surfaceOverrides"]}],"u":["surface-overrides-partial"]}
```

Real Godot reaches `"unavailable"` in practice: `clear_surfaces()` on an assigned ArrayMesh does it. An unknown should leave the field unobserved or partly compared, never differing. Exclude `surfaceOverrides` from the differing fields when either side is `"unavailable"`, and list it in `unobservedFields`/`partiallyCompared`.

### Low: a partial surface list leaves the node counted as "matched"
For truncated-vs-truncated or unavailable-vs-unavailable lists, the result is `counts.matched` = 2 and `partiallyCompared` = []. The only partial signal is the global unknown, so the node-level result does not show which node was only partly compared. Verified by probe.

### Low: within-take, a list becoming "unavailable" is reported as a node change
`compareGodotSceneCheckpoints` and the `node-changed` observation give "Node changed: Crate (surfaceOverrides)" when the value moves between a list and `"unavailable"`. This is a loss of observability, not an observed override change. The case is reachable through `clear_surfaces` (from the code path plus the real-Godot result above).

### Low (test gap): an object-level `.strict()` is unpinned
Mutant M4 survives. Without `.strict()`, an extra key on the surface object (for example `names`) is silently stripped instead of refused. The current code is correct; add a rejection test.

### Nit: the report and decoder comment say the cap yields "unavailable"
`GODOT_SURFACE_MATERIAL_OVERRIDES_2026-11-11.md` and the `godotScene.ts` comment say "unavailable" can mean the per-snapshot cap was exceeded. A capped snapshot is never written: the take stops first. In a journal, "unavailable" only ever means a count mismatch.

### Nit: consent wording has doubled parentheses
"...per-surface override references (by surface index, at most 32 surfaces per node) (engine class name, ...". It is accurate but awkward.

## Gates confirmed
- Only explicit overrides are recorded, with no inherited or effective materials.
- Enumeration is engine-supported and bounded: 32 per node, 256 clamp, 1,024 per snapshot, plus the existing node, byte and time bounds.
- A null mesh gives null, which is distinct from an observed null override.
- Surface indices are never matched across meshes.
- The built-in marker is reused, and `::` ids are rejected.
- v7 gating holds: v1–v6 are unchanged, and v6 against v7 gives `surface-overrides-unobserved`.
- Nothing new is loaded, no new properties are scanned, and no filesystem collection is added.
- The generic capture stays v1.
