# Godot MeshInstance3D resource identity references — 11 November 2026

Built by Claude (Opus 5.5, lead builder). Raw Godot scene journal **v6** adds one narrow
resource-semantics capability to the already consented, captured scene. For each **owned
MeshInstance3D**, it records identity references for its `mesh` and its `material_override`.
No other Inspector property, resource, file or project content is collected. v1–v5 import
unchanged, and the generic normalized application capture stays **v1**. Ordinary capture,
review and drafting work with all adapters disabled and Godot absent.

## Supported API audit (real Godot 4.7.1)

- `MeshInstance3D.mesh` and `GeometryInstance3D.material_override` are public properties.
- `Resource.get_class()` gives the engine class (`BoxMesh`, `StandardMaterial3D`).
- `Resource.is_built_in()` is true for embedded or unsaved resources.
- A built-in resource's `resource_path` is `""` until the scene is saved, then becomes
  `res://<scene>.tscn::<Class>_<id>`, with no user action. Recording that path would report
  a fake change on every save, and the embedded id is not meaningful to a learner.
- A resource saved as its own file keeps `res://<file>.tres` across save and reload.

## What a v6 take records

Consent: the start dialog adds "Records MeshInstance3D mesh and material-override references
(engine class name, plus the res:// path only when the resource is saved as its own file;
built-in resources are marked built-in; no resource names or contents)".

For an owned MeshInstance3D, `properties.mesh` and `properties.materialOverride` are each
either `null` (no resource) or `{type, path}`:

- `type`: the engine class name (an identifier of at most 100 characters), otherwise
  `unsupported-type`;
- `path`:
  - `built-in-or-unsaved` for any built-in resource, whether embedded in the scene or not
    yet saved;
  - otherwise the existing safe `res://` path rules, giving `external-or-unsupported`
    outside `res://`, for traversal or for control characters.

**Never recorded:** resource names, sub-resource ids, contents (sizes, colours, albedo,
shaders), surface material overrides, loaded or rendered state, or any other property.
Nothing is loaded or opened by OpenScreen. The Inspector signal for `mesh` or
`material_override` on an owned MeshInstance3D requests a sample. The 250 ms poll remains the
fallback.

## Meaning and limits

- **Identity, not equality.** A reference records *which* resource is assigned, as a class
  plus a file path or the built-in marker:
  - two `built-in-or-unsaved` BoxMesh references compare equal even if their sizes differ;
  - the same `res://cube.tres` compares equal even if the file's contents changed.
- **Not proof of:** rendering, material appearance, resource loading, a successful run or
  learning.
- **Within-take comparison and drafts:** `mesh`/`materialOverride` appear as changed field
  names and in before/after payloads.
- **Cross-take reference comparison:**
  - references compare as exact text, never with a numeric tolerance;
  - when one journal is older than v6 and the other recorded a reference for that path, the
    fields are listed as `unobservedFields`, with the unknown `mesh-references-unobserved`
    and a partial outcome; the old journal is never read as "no mesh";
  - the retake GUI shows that reason and an updated field-policy text in all 15 locales
    (English fallback).
- **Decoder bounds:** references are accepted only in v6, only on a node with complete 3D
  transforms, and only with both fields present. Extra keys, such as a name or contents,
  non-identifier types, and absolute or traversing paths are rejected.

## Validation

- **Unit tests:** `godotScene.mesh.test.ts` (15 tests).
  - Decoding with change labels and payloads, the within-take comparison fields, and
    normalized v1.
  - Rejection of a name, contents, absolute and `..` paths, bad types, a missing
    material-override field, flat (non-3D) nodes, and references in v3–v5.
  - The unsupported/external markers.
  - Cross-take agreement on equal references compared as text, a differing mesh at
    tolerance 1, and a v5-vs-v6 partial result with the unknown.
- **Mutants killed:** the v6 gate, the 3D requirement, both-fields presence, the strict
  identity object, the pre-v6 unrecordable rule and object equality.
- **Real Godot 4.7.1 editor/API probe** (`scripts/probe-godot-scene.cjs`), on Linux and on
  WinBoat Windows 11 (portable Godot/Node):
  - the probe adds a MeshInstance3D with a built-in BoxMesh and StandardMaterial3D, both
    with private `resource_name` canaries;
  - it saves the scene: the reference stays `built-in-or-unsaved` and the within-take
    comparison shows no mesh change;
  - it assigns `res://cube.tres` and `res://mat.tres` (with private name and
    `0.123`-valued content canaries) through an Inspector signal: the references show the
    file paths and class names;
  - all canaries and `mesh.tscn::` ids are absent;
  - the result is `MESH_REFERENCES_PASSED`, and every earlier probe section
    (history/run, connections, limits, 2D/3D, decoder, portable authoring) still passes;
  - the main journal is now v6.
- **Production built Linux Electron CLI/MCP** on the real v6 journal: 13/13 checks.
  - `inspect-capture` decodes the mesh change; no names or ids appear.
  - Three markers; the save checkpoint shows no reference change; the file checkpoint
    changes `mesh` and `materialOverride`.
  - `compare-godot-reference` shows the mesh field and labels the same take.
  - MCP `inspectApplicationCaptureFile` matches the CLI; the source is unchanged.
- **Other checks:** the startup smoke passes. The full suite passes with 6,721 tests in 490
  files. Both `tsc` configs, lint (35 existing warnings), i18n and docs pass.

Evidence: `../openscreen-evaluation/godot-mesh-references-2026-11-11/`. These are headless
editor/API checks with programmatic property changes. No physical Inspector or GUI input,
rendered output or game-runtime acceptance is claimed.

## Review

Awaiting an independent review of the immutable source commit.
