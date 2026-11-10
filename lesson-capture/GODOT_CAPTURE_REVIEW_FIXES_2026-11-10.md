# Godot capture review corrections — 10 November 2026

Parent `170eb141`. Claude's [independent original review](CLAUDE_GODOT_CAPTURE_REVIEW_170EB141_2026-11-10.md)
requested F1 (Medium), F2 (Low/Medium) and F3 (Low). The original report is preserved
unchanged. These corrections are locally validated and await Claude's recheck.

- **F1:** The cheaper implementation worker corrected the actual Lesson Guide
  append handler. It now performs an authoring edit, preserves existing inclusion
  choices and the active query, selects/pins the appended rows, and leaves the
  replacement generation alone. A real rendered-dialog import regression proves
  an excluded hidden prior step stays excluded, the query remains, and the new
  draft is visible and selected. No stub of `onAppend` is used.
- **F2:** Valid journals that expand beyond 10,000 observations or the normalized
  8 MiB byte budget retain an ordered prefix with `limited` coverage and explicit
  `decoder-observation-limit` / `decoder-size-limit` reason. The decoder still
  validates the whole raw journal, including scope, identity, sequence and footer;
  corrupt tails remain errors. Original source files remain unchanged. Baseline
  context shares the total 8 MiB budget rather than an inconsistent smaller cap.
  UI/draft wording now distinguishes capture or import limits.
- **F3:** Lesson application instance IDs now share the normalized format's existing
  200-character bound. A 200-character identity imports, appends and reopens; 201
  is rejected. No data is silently shortened.

## Validation

- Focused correction checks: **57 tests / 4 files pass**, before the final large-
  baseline regression was added. The cheaper worker separately ran all 26 dialog
  tests. Root inspected the changes and ran the full suite afterward.
- Full suite: **6,448 tests / 469 files pass**, 175.62 seconds, pinned Node 22.22.1,
  npm 10.9.4, four workers and required child-process/socket access.
- Both TypeScript checks, production Vite build, lint (35 baseline warnings),
  i18n (15 catalogs), docs (37 targets) and diff checks pass.
- Real production CLI/MCP startup smoke passes; expected missing-project CLI
  result only, not physical capture/export acceptance.
- Updated production decoder/authoring bundle executed on **WinBoat Windows 11,
  Node v22.22.1**, against the retained real Godot take and generated stress input:

| Stress case | Raw bytes | Kept observations | Normalized bytes | Result |
| --- | ---: | ---: | ---: | --- |
| Node removal/undo expansion | 600,672 | 10,000 | 2,083,326 | `decoder-observation-limit` |
| Large before/after differences | 5,692,598 | 1,932 | 8,384,580 | `decoder-size-limit` |

Both are explicitly limited and stay within the normalized byte budget. Corrupt
source tails are rejected after either cap. The 200-character identity round-trips
through selected draft creation and lesson reopen on Windows. This rerun tests the
changed JS decoder/authoring, not a new physical Godot/Inspector/WGC capture pass;
previous real Godot API observations remain separately evidenced.

Artifacts: `/tmp/godot-review-fix-tools/` and durable workspace copies in
`../openscreen-evaluation/godot-capture-review-fixes-2026-11-10/`, including Windows
stdout/stderr, bundled production code and verification script, root test/build/
startup logs and hashes. No Windows account/policy/installed-editor change occurred.

Owner direction remains autonomous Godot roadmap work with cheaper agents for
bounded implementation and Claude reviews. At this milestone Orca reports Codex
weekly usage **50%**, no session meter; target is roughly **75% weekly** unless
steered otherwise. Claude reports 80% of its current five-hour window. Next is the
application-neutral explicit timing association primitive, then reviewable UI;
recording control-clock metadata must not be represented as encoder/native sync.
