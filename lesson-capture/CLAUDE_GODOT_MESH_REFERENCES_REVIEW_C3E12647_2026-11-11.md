# Independent review: c3e12647 (Godot MeshInstance3D mesh/material identity references) vs 2298045f

Reviewer: Claude (Opus 5.5), independent; did not write the code. Snapshot /tmp/mesh-review-c3e12647 untouched.

## Verdict: ACCEPTED WITH LOWS

All coordinator gates hold: only owned MeshInstance3D `mesh`/`material_override` (owner rule in `_collect` and
`_property_edited`); no names, contents, sub-resource ids, loading, scans or project mutation; v1-v5 unchanged,
generic capture v1; identity explicitly distinct from equality/rendering/success; v6 gate, 3D requirement,
both-fields rule and strict `{type,path}` in the decoder; pre-v6 gaps become partial/unknown, never "none".

## Commands run (snapshot)
- `npx vitest --run src/lib/applicationIntegrations src/components/ai-edition/v4/GodotRetakeComparison.test.tsx`: 11 files, 191 tests passed.
- `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json`: clean.
- `npm run i18n:check`: PASSED (15 locales; new keys present, English fallback text as documented).

## Real Godot 4.7.1 probe (disposable project in scratch, headless, Dummy audio)
Mirrors `_identity_ref` inputs:
| Resource | get_class | resource_path | is_built_in | `_identity_ref` path |
|---|---|---|---|---|
| sub-resource of another scene (other.tscn) | BoxMesh | res://other.tscn::BoxMesh_abc | true | built-in-or-unsaved |
| mesh of an imported .glb | ArrayMesh | res://m.glb::ArrayMesh_pox3r | true | built-in-or-unsaved |
| imported .obj (main resource) | ArrayMesh | res://t.obj | false | res://t.obj |
| PlaceholderMesh.new() | PlaceholderMesh | "" | true | built-in-or-unsaved |
Also: SoftBody3D `is MeshInstance3D` = true (included, correct); CSGBox3D is not (excluded, consistent with narrow scope).
So the producer never emits a `::` sub-resource id. Instanced subscene children (glb instance) have a non-root owner and
are excluded by the existing owner rule.

## Boundary checks (scratch copies of leaf files)
- v5 vs v5 MeshInstance3D: `sampled-fields-agree`, no unknowns (correct).
- v5 vs v6 with `mesh:null, materialOverride:null`: partial, `mesh-references-unobserved`, both fields unobserved (correct: null is a recorded value).
- v6 vs v6 where one MeshInstance3D lacks the fields (decoder-accepted, producer never emits): `sampled-fields-differ` on mesh/materialOverride.
- Decoder accepts `{type:"ArrayMesh", path:"res://m.glb::ArrayMesh_pox3r"}` in v6.

## Mutations (scratch, restored and cmp-verified)
- M2 unrecordable `!== undefined` -> `!= null` (null side not treated as recorded): KILLED.
- M3 drop `.strict()` on identityRef: KILLED (2 tests).
- M4 v6 gate -> v5: KILLED.
- M1 route every unobserved field (incl. mesh) to `node3d-fields-unobserved` as well: SURVIVED (test uses `toContain`).

## Findings
1. Low - Docs/consent semantics: `built-in-or-unsaved` also covers sub-resources of OTHER files: imported .glb/.gltf meshes
   (`res://x.glb::ArrayMesh_*`) and sub-resources of other scenes (verified above). The doc describes the marker as
   "embedded in the scene or not yet saved". Behaviour is privacy-safe and honest-ish, but two different glb meshes, or a glb mesh
   and this scene's own embedded ArrayMesh, compare equal. A learner assigning meshes from a .glb, which is common in 3D courses,
   gets no file identity. State this in GODOT_MESH_RESOURCE_REFERENCES (and the scene doc); optionally rename the meaning to
   "built-in (in this or another file) or unsaved".
2. Low - Decoder is looser than the producer contract: v6 `identityRef.path` reuses `resourcePath`, which accepts `::`
   sub-resource ids (e.g. `res://a.glb::Mesh_1`). The doc says sub-resource ids are never recorded; that holds for the producer
   only. Reject `::` in identityRef paths (the producer cannot emit it), and add a test.
3. Low - Test gap: the separation between `mesh-references-unobserved` and `node3d-fields-unobserved` is not pinned
   (mutant M1 survives). A regression would add the misleading "some 3D fields" reason to mesh-only gaps. Use `toEqual` on
   `unknowns` in the v5-vs-v6 test.
4. Nit - A v6 node of type MeshInstance3D without mesh fields is accepted and, against a v6 node with references, reported
   as differing (undefined vs object). The producer always emits both fields for MeshInstance3D (and subclasses), so this
   only arises from hand-made journals. Acceptable given "no inference from type names"; mention it or leave it.

No High or Medium findings.
