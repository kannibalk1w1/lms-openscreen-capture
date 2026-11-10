# Independent review: Godot Node3D observations — 5a77ac5d vs 22eb61e4

- Reviewed HEAD: `5a77ac5d5ebc38acfb87743224a1fd3040dd32f1`. Base: accepted `22eb61e4`.
- Scope:
  - `scene_capture.gd`: the Node3D branch, the Inspector property list, and `schemaVersion` 3;
  - the `plugin.gd` consent text;
  - `godotScene.ts`: v3 acceptance, the 3D field rules and the comparison fields;
  - tests, probes, the `spatial.jsonl` fixture and the documentation.
- Excluded: the parked player and older history.
- Reviewer: Claude (Opus 5.5), Orca task `task_0eab97f80f96`. Read-only; `git status` was clean. Probes used an esbuild bundle of HEAD (built from stdin) in `/tmp/claude-n3d-5a77ac5d/`.

## Verdict: ACCEPT

No blocking or Low findings.

## Independent evidence (`p.cjs`)

### Fixtures
- **New `spatial.jsonl`:** v3 with 5 records:

  | Record | Content |
  |---|---|
  | start | Node3D root plus owned `GridMap` child (type taken from Godot, not guessed from the name) |
  | marker | "3D root baseline" |
  | Inspector-triggered state | — |
  | marker | "3D root adjusted" |
  | stop | — |

  It decodes to "Node changed: SpatialRoot (visible, position3, rotation3, scale3)". The only resource string is `res://spatial.tscn`, and there are 0 matches for home paths, user names, canaries or script source.
- **Untouched older fixtures:** they still import. `checkpoints.jsonl` (v2) gives 15 observations and `scene.jsonl` (v1) gives 8.

### Version and shape rules (mutating the real fixture)

| Mutation | Result |
|---|---|
| 3D fields in a v2 or v1 journal | rejected ("require … v3") |
| 2D and 3D transform keys on one node | rejected ("Mixed") |
| `scale3` or `rotation3` missing | rejected ("Incomplete 3D") |
| a 2- or 4-item triple | rejected |
| a `null` or string axis | rejected |
| `1e309` (parses as Infinity) | rejected |
| a v3 node with only 2D transforms | accepted (2D takes stay valid in v3) |

### Change detection and saving
Changing a later `position3` to `[8, 9, 10]` gives a node-changed observation. A draft lesson built from it reopens with `[8, 9, 10]` kept in the evidence payload.

### Retained real Linux and WinBoat journals, decoded with HEAD
- `spatial.jsonl` checkpoint compare: 1 node changed, fields `visible, position3, rotation3, scale3`.
- Main mixed `scene.jsonl`: 7 markers; first→last gives 1 added and 1 changed (`position3, rotation3, scale3`).
- `spatial-nonfinite.jsonl` on both platforms: 2 records, `limited`/`limit`, 0 observations, and no `inf`/`NaN` text in the file. A non-finite 3D value stops the take with a valid footer and never writes the bad value.
- Record, byte, marker-limit and disable journals: v3, accepted. Footer-failure: rejected.

### Copies, hashes and tests
- The Windows guest's `scene_capture.gd` and `plugin.gd` are byte-identical to HEAD after CRLF normalisation.
- All 17 entries in `SOURCE_SHA256.json` match `git show HEAD:<path>`.
- `windows/windows-report.json`: Godot 4.7.1 and Node 22.22.1 on NT 26200, scoped to headless APIs and injected signals.
- Focused vitest: **61 passed / 5 files** (`godotScene`, `godotScene.checkpoint`, `godotCheckpointFile`, `applicationCaptureFile`, `sceneDraft`).

### Code read
- **Producer:** the `elif node is Node3D` branch runs only when the node is not a Node2D (Node2D and Node3D are disjoint in Godot). It checks `Vector3.is_finite()` on position, rotation and scale before writing, and on failure sets the limit flag and stops, matching the existing 2D handling. The fields are explicitly named and owned-scope collection is unchanged. No mesh, material or other resource is read: `GridMap` contributes only its transform and visibility.
- **Inspector trigger:** adds Node3D `position`/`rotation`/`scale`/`visible`.
- **Decoder:** checkpoints are allowed for v2 and later, and v1 markers stay rejected.
- **Comparison and labels:** comparison fields add `position3`/`rotation3`/`scale3`, and the generic diff labels include the 3D keys automatically.

## Informational (no change required)
- **I1. Some edits are only caught by polling:** the Inspector trigger lists only `position/rotation/scale/visible`. Edits through `rotation_edit_mode` quaternion or basis, `transform`, or viewport gizmo drags do not fire an Inspector-triggered sample, so they are captured only by the 250 ms polling. That fits the "sampled" wording.
- **I2. Shape is not tied to node type:** the decoder accepts a 3D node without `visible`, or with `texture`, because it deliberately does not tie fields to class names. Only the real producer constrains this. That is consistent with "class claims unverified".
- **I3. Older apps cannot open new journals:** every new take, even a purely 2D one, is v3, so older OpenScreen builds (v1/v2 decoders) reject journals from this addon. That is expected when versioning forward; release notes should pair the addon and app versions.
- **I4. Limited 3D data:** values are local Euler radians and local visibility only. There is no rotation order, `top_level`, basis or world transform. This is documented as not world, render or runtime proof.

## Limits
- No full suite, build or startup rerun; I relied on root's 6532/481, Vite and startup reports. No new UI.
- I did not run Godot or the VM myself in this pass. The 3D producer behaviour rests on the retained real Linux and WinBoat journals and on reading the code. No physical input, 3D rendering, gameplay or packaged Windows Electron claim.
