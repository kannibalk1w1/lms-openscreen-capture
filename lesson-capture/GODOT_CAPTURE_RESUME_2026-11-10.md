# Godot capture resume checkpoint

> **Superseded ownership note (10 November 2026, later):** the owner handed building to
> Claude. The utilisation stop below was a Codex budget stop; it no longer blocks
> Claude implementation. Current state: [handoff](CURRENT_IMPLEMENTATION_HANDOFF.md) and
> [history/run slice](GODOT_HISTORY_RUN_CAPTURE_2026-11-10.md).

Stopped new feature work on 10 November 2026 at **74% weekly Codex utilisation**, near
the owner's requested roughly 75% cap. No session meter was available. Source HEAD
`5a77ac5d` is independently accepted; this checkpoint only preserves docs/review.
No active worker, required review or known blocking finding remains.

## Completed in this run

- Explicit, bounded scene observations: owned hierarchy/selection, 2D and 3D
  transform properties, script and Sprite2D texture identities, scene saves,
  signals plus polling, visible stop/limit behavior and independent source clocks.
- Application-neutral capture/review/draft pipeline. Raw Godot v1/v2/v3 import;
  generic normalized capture stays v1. Other applications can use that container
  without Godot; their live adapters are not implemented.
- Manual recording-time calibration and selected timing annotations, with pause/gap,
  source fingerprint and stale-result guards. No automatic encoder sync.
- Authored marker labels, within-take sampled checkpoint comparison and read-only
  frontend review. Labels are annotations, not completion/runtime proof.
- CLI/MCP capture inspection and selected draft creation, plus original-journal
  marker listing and fingerprint-bound comparison. Explicit IDs/paths, existing
  permission checks, safe errors; source files remain untouched.

All slices were reviewed by actual Claude workers. The final
[Node3D review](CLAUDE_GODOT_NODE3D_REVIEW_5A77AC5D_2026-11-10.md) accepts `5a77ac5d`
with no blocking or Low findings. Prior reviews and original findings/fixes are
preserved beside their dated implementation reports. Cheaper workers prepared
bounded prototypes/tests; root integrated and validated source.

## Validation and limits

Final full suite: **6,532 tests / 481 files pass**. Final focused 61 tests / five files, both
TypeScript configs, Vite, lint (35 existing warnings), i18n15/docs37 pass. Real
Linux and WinBoat Windows 11 Godot 4.7.1 probes cover 2D/3D scenes, a Node3D root,
GridMap, injected Inspector/selection signals, privacy, scope, limits, nonfinite
stop/footer behavior, comparison and offline lesson reopen. Real Windows Edge
covered calibration and comparison UI in earlier accepted slices. Final production
Linux Electron startup and 15 v3 CLI/MCP parity checks pass.

These are editor/API/injected-signal and headless/browser checks. They do not claim
physical input acceptance, packaged Windows Electron/native capture, 3D rendering,
game runtime success, project restoration or complete intermediate history.
Node3D values are sampled properties/Euler radians/local visibility, not a complete
world transform. Quaternion/basis/gizmo changes may depend on fallback polling.

Evidence is outside Git under `../openscreen-evaluation/`, especially
`godot-node3d-capture-2026-11-10/`, `godot-checkpoint-file-tools-2026-11-10/` and
`godot-checkpoint-comparison-2026-11-10/`. Reports include source hashes, original
journals, saved lessons, comparisons, production/startup logs and failed-attempt
classification. Owned test browser/server/tunnel processes were cleaned up; the
Windows Node/Godot probes exited. Disposable portable tools remain for future use.

## Git boundary

Branch: `lesson-capture/input-boundaries`. Last source commit: `5a77ac5d`.
No new push or merge was performed. Read-only remote verification at this checkpoint
found private feature head `e3c00e0e025d2b12266dee65f185207b2c446cb7`;
main remains `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
Godot reviews exclude the parked player and older mixed branch history; they are
not a whole-branch approval. Preserve the learner-player parked state, original
user workflow report and real lesson projects.

## Next roadmap work when resumed

1. Physical Windows/KDE authoring acceptance on disposable projects, clearly
   separated from injected/API evidence and native media acceptance.
2. Broader Godot semantics: resources/signals, undo/history attribution and scoped
   run/error diagnostics, each with explicit capability/privacy bounds.
3. Application-project checkpoints/archive/restore, expected-state verification,
   retakes and tutor/agent/human handoff. Current marker comparison does not supply
   those capabilities.
4. Other program adapters only after the owner prioritises them. Reuse the generic
   capture/draft boundaries and keep ordinary recording usable with adapters off.

Use pinned Node 22.22.1/npm 10.9.4 and the existing disposable WinBoat tools. Continue
local validated slice commits and economical Claude reviews. Consult AGENTS.md and
the current roadmap; do not turn this budget stop into a claim that the roadmap is
complete or start another feature in response to a stale orchestration wake.
