# Claude review brief

User requests a review of everything implemented so far, then continuation of the
next roadmap slice in a fresh Codex context. The repository is private and the
complete accumulated implementation is committed over upstream `d7adf059`.

Work in the EXISTING nested openscreen checkout. Read AGENTS.md, all
LESSON_CAPTURE_*.md documents, lesson-capture/project-spec.md and reuse-research.md.
Review the implementation diff from d7adf059, not all historical upstream code.
Scope includes narration captions, Linux input journaling/health and opt-in KWin
capture, custom cursor imports/click markers, vector/SVG arrows and step boxes,
recording/editor flags, scoped typing capture and Godot unsaved CodeEdit adapter,
GDScript code presentation, timeline controls and native preview/export.

Review for correctness, evidence/data loss, timing/source projection, undo/save
races, privacy boundaries, untrusted SVG/import handling, resource/cache behavior,
Linux runtime and cross-platform integration/build risks. Compare claims to exact
coverage. Prioritize actionable defects over style. Spot-check tests as useful;
do not repeat all full suites without cause. The native addon is already rebuilt;
use documented hashes/evidence and identify limitations honestly.

A fresh Codex session will start the next roadmap task in the same checkout.
Review the committed snapshot, ignoring later work that belongs to clock sync.
Do not modify application code, reset/stash, create a checkout, install adapters
in user lesson projects, push, publish, or change GitHub settings. You may write
only lesson-capture/CLAUDE_REVIEW.md. This report should state reviewed commit,
findings ordered by severity with file/line references and reproducible impact,
checks actually run, uncertain items and skipped coverage. Report directly in
your chat to the user when done. Codex can read that file and handle findings.
