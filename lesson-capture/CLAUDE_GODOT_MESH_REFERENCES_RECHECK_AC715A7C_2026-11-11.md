# Focused recheck: ac715a7c (parent c3e12647), Godot mesh/material identity references

Reviewer: Claude (Opus 5.5), independent. Snapshot /tmp/mesh-recheck-ac715a7c untouched; scratch /tmp/mesh-recheck-scratch-OVOfKd.

## Verdict: ACCEPTED

## Runs (snapshot)
- `npx vitest --run src/lib/applicationIntegrations`: 10 files, 187 tests passed.
- `tsc --noEmit -p tsconfig.json`: exit 0; `-p tsconfig.node.json`: exit 0.

## (1) L1 wording: resolved
- Consent (plugin.gd): "built-in resources and sub-resources of other files, such as meshes inside imported .glb scenes, are only marked built-in".
- Producer comment (scene_capture.gd): it names embedded, unsaved and other-file sub-resources such as an imported .glb.
- Doc: it states this explicitly, including "two different .glb meshes of the same class compare equal ... privacy-safe but coarse".
- Retake policy text: updated in all 15 locales (English fallback): "all built-in and sub-resources, including meshes inside imported .glb files, share one marker", alongside "compared as text". This implies they compare equal but doesn't say so in those words. That is acceptable for a one-line policy string (no finding).

## (2) L2 `::` rejection: resolved
- `identityRef.path = resourcePath.refine(v => !v.includes("::"))`, with a test (`res://ship.glb::ArrayMesh_1`).
- Probes: `external-or-unsupported`, `built-in-or-unsaved`, `res://t.obj` and a single-colon `res://a:b.tres` are still accepted.
- `res://a.tscn::1` in materialOverride is rejected.
- I found no bypass: the refine runs on both fields, and both markers contain no `::`.
- Producer-compatible: Godot reports `::` resources as is_built_in, which gets the marker (verified in the c3e12647 probe).
- Mutant: removing the refine gets KILLED.

## (3) L3 exact unknowns: resolved
- `expect(result.unknowns).toEqual(["mesh-references-unobserved"])`.
- My previously surviving mutant M1 (every unobserved field also adds `node3d-fields-unobserved`) is now KILLED.

## (4) Nit: v6 MeshInstance3D must carry both refs: resolved, honest
- Rule: `schemaVersion >= 6 && node.type === "MeshInstance3D" && !meshRefs` throws (only-one-field is already rejected by the existing both-fields rule).
- Mutant (gate moved to v7) gets KILLED.
- It can't reject producer output: `_collect` emits both fields for every `node is MeshInstance3D`, and `type` is `get_class()` (native class, never a script class_name). So every v6 node typed "MeshInstance3D" has both refs (null or object) and complete 3D transforms.
- Still accepted (probed): a v5 MeshInstance3D without refs; a v6 SoftBody3D without refs; v6 refs both null; a MeshInstance3D root with null refs.
- Not forcing subclasses (SoftBody3D) keeps the "no inference from type names" policy. Only the exact native class is pinned, which the producer guarantees. That is honest.
- Residual (no action): a hand-made v6 SoftBody3D without refs compared with one that has them reads as differing. The producer cannot write this.

No new findings.
