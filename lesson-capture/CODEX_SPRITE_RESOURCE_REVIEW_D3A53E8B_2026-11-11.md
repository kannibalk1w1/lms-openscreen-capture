# Independent sprite-reference review — 11 November 2026

Reviewer: Codex/root, directly requested by the owner after Claude reached its weekly
limit. Reviewed immutable source `d3a53e8bec4754290bc2b5218f5d05c18a8fd148` against
`955a1355`. No implementation changes were made during this review.

**Verdict: accepted with one nonblocking Low.** No High or Medium finding in this
slice. This is not whole-branch, physical-input, rendered-output or release acceptance.

## L-SPRITE-1 — imported animated-sprite transforms need stronger validation

`src/lib/applicationIntegrations/godotScene.ts:270` accepts `spriteFrames` whenever any
2D or 3D transform field exists. The exact recognized node classes do not constrain
the transform dimension, and a 2D transform need not be complete. Independent probes
of the bundled production decoder accepted these schema-v8 inputs:

- `AnimatedSprite3D` with complete **2D** transforms and `spriteFrames: null`;
- `AnimatedSprite2D` with complete **3D** transforms and `spriteFrames: null`;
- `AnimatedSprite2D` with only `position: [0, 0]` and `spriteFrames: null`.

These states cannot be emitted by the producer's actual class checks. They can enter
through an edited/imported journal and acquire misleading normalized evidence or
comparison results. The ordinary producer path remains correct; no additional
resource contents are disclosed. This is an import-contract hardening issue, not a
demonstrated capture failure or security boundary escape.

Recommended follow-up: for the recognized animated-sprite classes require the
corresponding complete transform tuple, preserve intended forward-compatible type
handling explicitly, and add rejection tests for both dimension swaps and incomplete
2D transforms. Do not infer inheritance from type-name suffixes.

Negative-probe results: `/tmp/sprite-review-LX3q7i/negative-cases.json` and bundled
decoder in that directory. A control with `AnimatedSprite3D` missing `spriteFrames`
was correctly rejected.

## Independent checks

- Read the producer/Inspector hooks, v8 decoder/version gates, within-take and
  cross-take comparison changes, new tests, probe and consent/retake wording.
- 90 tests passed across `godotScene.sprites.test.ts`, `godotSceneReference.test.ts`,
  `godotScene.test.ts` and `godotScene.checkpoint.test.ts`.
- Both root and test TypeScript configurations passed under pinned Node 22.22.1.
- Ran the real Linux Godot editor/API probe, exit 0. Retained fixture:
  `/tmp/godot-scene-probe-9h3beP`. Sprite null/assignment/save/clear checks passed;
  animation-name privacy canaries were absent. Earlier mesh/surface/connections/
  history, journal limits, scope/stop and offline decoder checks also passed.

The previously reported full suite (6,759 tests / 492 files), WinBoat probes and
production CLI/MCP/startup evidence belong to the builder's run; they were inspected
as reported coverage and were not independently rerun here. No fresh full-suite,
Windows, physical GUI, screen-reader, rendered appearance or playback acceptance is
claimed. The Linux probe programmatically edits disposable Godot fixtures.

## Remaining Godot sprint work

- Physical WinBoat editor acceptance (A1), including the visible learner route,
  capture scope/stop/undo/Inspector behavior and manual clock/timing checks. Needs
  the owner's logged-in visible WinBoat desktop and about 15 minutes hands-off.
- Full retake workflow: explicit replacement/persistence, revision/source history,
  retained accepted steps, and revalidation of timing/annotations after replacement.
  The existing GUI compares two takes read-only.
- Tutor/agent/human handoff and a complete disposable Enemy-lesson acceptance run.
- Broader run diagnostics and expected-state verification. Run-state polling does
  not establish successful execution, output, errors or learning achievement.
- Optional broader resource semantics only when useful and explicitly scoped.
  Current resource references do not compare contents. Automatic video-clock
  synchronization remains open; manual calibration already exists.
- Project archive/restore (B1) and live-KDE acceptance (A2) remain deferred by the
  coordinator's earlier scope decision. Manifest/drift detection is not restoration.

Prioritize the decoder Low, then visible WinBoat acceptance and the retake/handoff
workflow over accumulating additional resource classes. The learner player remains
parked. Nothing was pushed by this review.
