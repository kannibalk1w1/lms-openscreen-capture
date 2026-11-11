# Godot Sprite3D texture and AnimatedSprite SpriteFrames references — 11 November 2026

Built by Claude (Opus 5.5, lead builder), reusing the accepted
[v6 identity reference](GODOT_MESH_RESOURCE_REFERENCES_2026-11-11.md) representation. Raw Godot
scene journal **v8** adds explicit property identity for:

- the `texture` of an owned **Sprite3D**, as `spriteTexture`;
- the `sprite_frames` of an owned **AnimatedSprite2D** or **AnimatedSprite3D**, as
  `spriteFrames`.

v1–v7 import unchanged, and the generic normalized application capture stays **v1**.

## Supported API audit (real Godot 4.7.1)

- **Class hierarchy:** `Sprite3D` and `AnimatedSprite3D` both derive from `SpriteBase3D`
  (Node3D), and `AnimatedSprite2D` derives from `Node2D`. None of them is a `Sprite2D` or a
  `MeshInstance3D`, so there is no overlap with existing fields. Sprite2D keeps its v2
  `texture` path, unchanged.
- **Imported texture:** `res://tex.svg` loads as `CompressedTexture2D` and keeps its
  `res://` path. A SpriteFrames `.tres` keeps its path across save and reload.
- **Built-in SpriteFrames:** `is_built_in()` is true, and its path changes from `""` to
  `res://<scene>.tscn::SpriteFrames_<id>` on save. It therefore gets the stable
  `built-in-or-unsaved` marker, as in v6. An `ImageTexture` created in code is built-in too.
- **Playback state:** `animation`, `autoplay` and `frame` exist on the node but are playback
  state. They are **not** recorded.

## What a v8 take records

Consent adds: "Records Sprite3D texture and AnimatedSprite2D/3D SpriteFrames references (no
animation names, frames, pixels or playback state)", followed by the existing mesh and
identity wording.

- **Values:** each field is `null` (an observed empty property) or `{type, path}`, with the
  v6 rules:
  - the engine class name;
  - a `res://` path only for a resource saved as its own file, otherwise
    `built-in-or-unsaved`;
  - `external-or-unsupported` for unsafe paths;
  - no `::` ids.
- **Required:** in v8 these fields are required on those exact node types. On other types
  they are allowed only with complete transforms: 3D for `spriteTexture`, 2D or 3D for
  `spriteFrames`. A node never carries both.
- **Never recorded:** animation, library or frame names, frame lists, texture pixels,
  current animation, autoplay or playback position.
- **Inspector signals:** `texture` on a Sprite3D and `sprite_frames` on an animated sprite
  request a sample; the 250 ms poll remains the fallback.

**Unavailable versus legacy:** these properties always exist on the node types, so a v8 take
has no "unavailable" state; an empty property is an observed `null`. A journal older than v8
could not record them, so cross-take comparison lists them as unobserved with the unknown
`sprite-references-unobserved`, never as `null`.

Identity, not equality: equal references say which resource is assigned by class and path or
marker. They prove nothing about resource contents, object equality, rendered appearance or
successful playback, and two built-in SpriteFrames always share the marker.

## Comparison, drafts and GUI

- **Within-take comparison and drafts:** the new fields appear as changed field names, with
  before/after payloads.
- **Cross-take comparison:** exact text, with tolerance never applied, and the unknown above
  for pre-v8 journals.
- **Retake GUI:** the policy and reason texts are updated in all 15 locales (English
  fallback).

## Validation

- **Unit tests:** `godotScene.sprites.test.ts` (15 tests).
  - Decoding and change labels for all three node types, including null and built-in values.
  - Rejection of animation names or frame data, `::` ids, absolute paths, SpriteFrames
    without transforms, a texture on a 2D node, both fields on one node, missing fields on
    v8 Sprite3D or AnimatedSprite2D, and references in v7. A v7 Sprite3D without references
    is still accepted.
  - Cross-take agreement and a swapped resource that still differs at tolerance 1; a pre-v8
    journal as unobserved; an observed null compared as a value.
- **Mutants killed:** the v8 gate, both-fields refusal, Sprite3D required, the transform
  requirement and the pre-v8 unrecordable rule.
- **Real Godot 4.7.1 editor/API probe**, on Linux and WinBoat Windows 11:
  `SPRITE_REFERENCES_PASSED`, with all earlier sections still passing.
  - It adds a Sprite3D, AnimatedSprite2D and AnimatedSprite3D with null references.
  - It assigns `res://slime.svg`, a built-in SpriteFrames whose animation is named
    `PRIVATE_ANIM_CANARY` (also set as the current animation), and `res://walk.tres`, whose
    animation is named `PRIVATE_FRAMES_FILE_CANARY`, through an Inspector signal.
  - After a save the references are unchanged. Clearing the AnimatedSprite3D frames gives
    `null`.
  - The animation names, `sprites.tscn::` ids and `autoplay` are absent from the journal.
- **Production built Linux Electron CLI/MCP:** 13/13 checks on the real v8 journal.
  - `inspect-capture` decodes both fields, with no names or ids.
  - Four markers; the save comparison shows no sprite change; the clear comparison changes
    `spriteFrames`.
  - `compare-godot-reference` shows `spriteTexture` and labels the same take.
  - MCP matches the CLI, and the source file is unchanged.
- **Other checks:** the startup smoke passes. The full suite passes with 6,759 tests in 492
  files. Both `tsc` configs, lint (35 existing warnings), i18n and docs pass.

Evidence: `../openscreen-evaluation/godot-sprite-references-2026-11-11/`. These are headless
editor/API checks with programmatic property changes. No physical GUI, rendered output or
playback acceptance is claimed.

## Review

Awaiting an independent review of the immutable source commit.
