# Bounded Node3D scene capture

10 November 2026. Locally validated; independent Claude review pending.

## Result

The explicitly started Godot scene take now samples Node3D transform properties
alongside the existing hierarchy, selection, Node2D fields and script/texture
identities. The confirmation names both Node2D and Node3D. Nothing installs or
starts automatically, and the same current-root/owned-node/stop/privacy bounds apply.

| Raw property | Godot property |
| --- | --- |
| `position3` | Node3D `position`, three finite components |
| `rotation3` | Node3D `rotation`, three Euler components in radians |
| `scale3` | Node3D `scale`, three finite components |
| `visible` | Node3D's local visibility flag |

These are sampled editor property values, not a complete world transform or proof
of rendered appearance. Basis, quaternion, rotation order, top-level semantics and
mesh/material contents are outside this slice. The field mapping follows the
[official Node3D API](https://docs.godotengine.org/en/stable/classes/class_node3d.html)
and is tested against actual Godot4.7.1 on Linux and Windows. The coordinate and
rotation interpretation remains Godot-specific; the downstream capture container
and lesson evidence remain application-neutral.

## Versioning and reuse

New raw journals use schema v3, including new 2D-only takes. The offline decoder
continues to accept v1/v2 with their original fields. New 3D fields are rejected in
older versions, mixed versions are refused, and a node cannot mix 2D transform keys
with the new 3D keys. The three 3D vector fields must be present together with exact
finite three-element shapes. No inheritance is inferred from a native type's name:
Godot's real `GridMap` inherits Node3D without a `3D` suffix. Capture uses the real
`is Node3D` check; imported type/state claims remain unverified.

The shared normalized `openscreen-application-capture` format stays v1. Generic
review, selected drafts, manual timing and file tools consume the same bounded JSON
payloads. New fields participate in existing change labels and authored checkpoint
comparison. No mandatory Godot/3D schema was added to lesson authoring or the generic
capture contract, and no other program adapter was implemented.

Inspector requests for the allowlisted Node3D properties use the existing signal
path and 250 ms fallback polling. Checkpoints force a current sample. Nonfinite 3D
values stop visibly with a valid limited footer; a marker is not claimed as saved.
Node/record/byte/depth bounds, observer teardown, scene scope and independent clocks
are unchanged. Journals remain unmapped to video and recording pauses.

## Validation

- Final focused decoder/comparison/draft/file tests: **61 tests / five files pass**.
  They cover legacy/version/mixed-axis/complete-vector validation, exact 3D field
  names and unsuffixed type-name compatibility. A test-construction issue that
  initially mixed versions was corrected so malformed-axis cases test the intended
  shape rather than failing for version mismatch.
- **6,532 tests / 481 files pass** in the final full suite. Both TypeScript configs,
  Vite, lint (35 baseline warnings, no fixes), i18n15/docs37 and real production
  startup pass. The first suite exposed one old negative fixture using v3 as an
  unsupported version; it now uses v4, and the complete suite reran successfully.
- Real Godot4.7.1 editor/API probes pass on **Linux and WinBoat Windows11**. Each
  main take has20 records and20 normalized observations with 2D/3D evidence and
  baseline/later/stop markers. Existing scope/disable/privacy, Unicode labels,
  short selection/Inspector signal, record/byte/footer tests still pass.
- Both platforms also open a separate Node3D-root scene with an owned native
  `GridMap` child. Injected Inspector signals are sampled, both authored endpoints
  compare as one changed root/four fields, and a nonfinite position refuses a
  marker and preserves a valid limited journal. The root is reset afterwards in
  the disposable fixture. No real project is modified.
- Both platforms save and reopen a lesson containing a selected marker and selected
  3D observation after Godot exits; coordinates `[8,9,10]` survive generic evidence.
  The new permanent v3 fixture `probes/fixtures/spatial.jsonl` is original Windows
  output from this disposable scene, alongside unchanged v1/v2 fixtures.
- Real built Linux Electron production startup passes. An additional foreign-cwd
  production probe passes **15 checks** for v3 CLI/MCP inspect/compare/reverse,
  exact response parity, unmapped clock/no resource-value output, legacy v1 and
  fixed stale-hash refusal. This is production registration, not a reconstructed
  handler. Actual 3D editor coverage on Windows is separate from packaged Windows
  Electron coverage.

Evidence lives outside Git in
`../openscreen-evaluation/godot-node3d-capture-2026-11-10/`, including raw original
journals, comparisons, normalized captures, reopened lesson, API-probe logs,
source hashes and production/startup checks. The cheaper worker's sandboxed engine
run printed its internal success marker but its wrapper failed with `spawnSync
EPERM`; that is retained as unsuccessful. Root's escalated Linux and actual Windows
wrappers exit0. Dummy-renderer thumbnail warnings are retained. No physical input,
3D rendering, runtime success, project restore or encoder synchronization claim.

## Remaining roadmap

[Checkpoint file tools 22eb61e4 are accepted](CLAUDE_GODOT_CHECKPOINT_FILE_TOOLS_REVIEW_22EB61E4_2026-11-10.md).
Broader editor/resource/run/error semantics, project archive/restore, retakes,
expected-state verification and physical acceptance remain open. The learner
player stays parked. This bounded slice exercises 3D data reuse before adding
another application's adapter.
