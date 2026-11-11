# Godot MeshInstance3D per-surface material override references — 11 November 2026

Built by Claude (Opus 5.5, lead builder), extending the accepted
[v6 mesh/material identity references](GODOT_MESH_RESOURCE_REFERENCES_2026-11-11.md). Raw
Godot scene journal **v7** adds the **explicit** per-surface material overrides of each owned
MeshInstance3D, by surface index. It records identity references only. It does not record
inherited or effective mesh materials, rendered appearance or resource contents. v1–v6 import
unchanged, and the generic normalized application capture stays **v1**.

## Supported API audit (real Godot 4.7.1)

- With a mesh assigned, `get_surface_override_material_count()` equals
  `mesh.get_surface_count()`. `get_surface_override_material(i)` returns the explicit
  override, or `null`.
- **Mesh replacement** keeps overrides **by index**: the list is truncated or extended to the
  new surface count, and earlier indices keep their materials (for example, surface 0 kept
  `res://mat.tres` when a 1-surface mesh was replaced by a 40-surface one).
- **Null mesh:** Godot *keeps* the previous override array (count 2 with no mesh), but nothing
  is applied. Recording it would report stale data as current.
- Overrides survive save and reload. A built-in override stays built-in.

## What a v7 take records

Consent: "Records MeshInstance3D mesh, material-override and per-surface override references
(by surface index, at most 32 surfaces per node) …", followed by the v6 wording on class names,
paths, built-in markers and no names or contents.

`properties.surfaceOverrides` on every v7 MeshInstance3D is one of:

- **`null`**: the node has no mesh, so there are no surfaces to describe. This is distinct
  from an observed `null` override on an existing surface.
- **`{count, overrides, truncated}`**:
  - `count` is the mesh's surface count, from 0 to 256.
  - `overrides` holds the first `min(count, 32)` surfaces in index order, each `null` (no
    explicit override) or a v6 identity reference `{type, path}`, using the same built-in
    marker and no `::` ids.
  - `truncated` is true when `count > 32`.
- **`"unavailable"`**: Godot's override count disagreed with the mesh's surface count. This is
  reachable in real use: the reviewer reproduced it with `ArrayMesh.clear_surfaces()`, which
  drops the surface count to 0 while the override count stays.

  The per-snapshot cap of 1,024 surface entries works differently: a snapshot over the cap is
  never written. The take stops with a valid `limited` footer, and a starting scene over the
  cap is refused.

Index meaning: entry *i* is surface *i* of **this node's current mesh**. Indices are never
matched across different meshes or topologies. The Inspector signal for
`surface_material_override/<i>` requests a sample; the 250 ms poll remains the fallback.

## Comparison and drafts

- **Within-take comparison and drafts:** `surfaceOverrides` is a changed field name, with
  before/after payloads. A change to or from `unavailable` is labelled `surfaceOverrides
  unavailable`, a loss or return of information rather than an override change.
- **Cross-take reference comparison:**
  - surface overrides compare as exact text, by index;
  - a different mesh on the same path also differs in `mesh`, and no surface matching is
    attempted;
  - a pre-v7 journal against a v7 one lists `surfaceOverrides` as unobserved, with the unknown
    `surface-overrides-unobserved`; it is never read as "no overrides";
  - missing surface information is **never** an observed difference. If either side is
    `unavailable`, or both lists have the same count and identical observed entries but one
    is truncated, the field is unobserved: the node appears in `partiallyCompared` and the
    unknown is `surface-overrides-partial`. A different count or a different observed entry
    is a real difference.
- **Retake GUI:** policy and reason texts are updated in all 15 locales (English fallback).

Identity, not equality: equal references mean the same assignment by class and path or
marker. They do not mean equal material contents or the same rendered result.

## Validation

- **Unit tests:** `godotScene.surfaces.test.ts` (15 tests).
  - Decoding and change labels; within-take fields.
  - No mesh versus an observed null override; mismatch refused both ways.
  - Rejection of count/length mismatches, more than 32 entries, a wrong truncated flag, a
    count above 256, `::` ids, resource names and unknown markers; required on v7 mesh nodes;
    refused in v6.
  - The unavailable marker and truncated lists accepted.
  - Comparison by index; v6-vs-v7 unobserved; truncated or unavailable partial.
- **Mutants killed:** the v7 gate, mesh-presence matching, presence required, the length
  rule, the pre-v7 unrecordable rule and the partial reason.
- **Real Godot 4.7.1 editor/API probe**, on Linux and WinBoat Windows 11:
  `SURFACE_OVERRIDES_PASSED`.
  - An explicit `res://mat.tres` override on surface 0 through an Inspector signal.
  - A 40-surface ArrayMesh, recorded as count 40, 32 entries and truncated, with surface 0
    still overridden as Godot keeps it.
  - No mesh gives `surfaceOverrides: null`.
  - 33 nodes × 32 surfaces stop a take with a limited footer, and an oversized start is
    refused.
  - Every earlier probe section still passes, and the main journal is now v7.
- **Production built Linux Electron CLI/MCP:** 17/17 checks on the real v7 journal, covering
  the earlier mesh checks plus the surface override change and the no-mesh transition through
  `compare-godot-checkpoints`. The startup smoke passes.
- **Other checks:** the full suite passes with 6,738 tests in 491 files. Both `tsc` configs,
  lint (35 existing warnings), i18n and docs pass.

Evidence: `../openscreen-evaluation/godot-surface-overrides-2026-11-11/`. These are headless
editor/API checks with programmatic property changes. No physical GUI, rendered output or
game-runtime acceptance is claimed.

## Review

[Independent review of `86c9930d`](CLAUDE_GODOT_SURFACE_OVERRIDES_REVIEW_86C9930D_2026-11-11.md):
**accepted with Lows**, plus one **Medium**. The reviewer's real Godot checks confirmed:

- the override count follows surfaces added to the same ArrayMesh, and the poll captures them;
- `clear_surfaces()` gives `unavailable`;
- materials set on the mesh, and surface materials of an imported glTF, are never reported;
- an explicit override on glTF surface 2 is recorded by index;
- the per-snapshot counter reset, oversized-start refusal and limited mid-take footer work.

Fixed in `320b4912`:

- **Medium:** `unavailable` against a recorded list was reported as `sampled-fields-differ`.
  Unavailable lists, and truncated lists with identical observed entries, are now unobserved
  and partial; counts and observed entries still differ.
- **Low:** such nodes now appear in `partiallyCompared`.
- **Low:** within-take changes to or from `unavailable` get their own label.
- **Low:** a strict-object test.
- **Nits:** the decoder comment now says that a capped snapshot is never written, and the
  consent bracket wording is fixed.

All new guards are mutation-checked. The real Linux probe reruns cleanly (all 8 sections) and
the full suite passes with 6,742 tests in 491 files.

The [recheck of `320b4912`](CLAUDE_GODOT_SURFACE_OVERRIDES_RECHECK_320B4912_2026-11-11.md)
**accepts** it. Its probes confirm honest results for no mesh against `unavailable`, no mesh
against a recorded list, and v6 against an unavailable v7 list. Its two optional test gaps are
closed in the next commit, and both mutants are killed:

- the `unavailable` → list label;
- a missing mesh against a recorded list differing in both `mesh` and `surfaceOverrides`.

Accepted state:

- source `86c9930d` + `320b4912`, plus a tests-only commit;
- real Linux/WinBoat probes at `86c9930d`, and a Linux rerun at `320b4912`;
- production CLI/MCP 17/17 and the startup smoke at `86c9930d`;
- full suite 6,742 tests in 491 files at `320b4912`.
