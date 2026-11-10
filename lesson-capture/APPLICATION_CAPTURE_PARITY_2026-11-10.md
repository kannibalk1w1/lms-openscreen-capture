# Selected application capture CLI/MCP parity

10 November 2026. Locally validated; independent Claude review pending.

## Result and author workflow

An author or agent can inspect one selected capture, choose observation IDs and
create a new editable lesson from that exact inspected source. This uses the same
application-neutral import and draft services as the frontend. It accepts normalized
application capture v1 and raw Godot scene journals v1/v2, including authored markers.
No live adapter, Godot installation, project scan or media renderer is needed.

[Commands and tool arguments](../LESSON_CAPTURE_COMMANDS.md#application-capture-inspection-and-selected-drafts)
include two CLI actions, `lesson inspect-capture` and `lesson import-capture`, and
two MCP tools, `inspectApplicationCaptureFile` and
`draftLessonFromApplicationCapture`. Inspection returns raw SHA-256, metadata and
up to 200 IDs/times/types/labels per page. Offset is 0–10,000. Baseline and payloads
are omitted; labels and scope are still captured content. Each page hashes the
source bytes it actually read; clients can compare hashes across pages.

Draft creation requires an exact raw source hash, 1–200 unique explicit IDs, a
title and a new output file. It re-reads a bounded snapshot, verifies the fingerprint
and selection, and copies only selected evidence. Timestamps stay unmapped and no
media selection, calibration, source grant or live collection starts. Drafts need
normal author review. Changed source bytes are refused rather than silently using
new content. Duplicate singleton CLI flags and unknown options are rejected.

## Authority and file boundaries

HTTP inspection checks existing MCP edits permission before any file read; stdio
retains its explicit-launch authority. Drafts require existing write permission
before reads and again just before writing, after asynchronous lesson validation.
SDK cancellation is checked at those boundaries. Shared file service assertions
also support the explicit CLI launch without adding a permission store.

The existing selected-file snapshot reader refuses symlink inputs, nonfiles,
concurrent mutation during reads and files above 8 MiB. UTF-8 decoding is fatal;
strict schema/whole-journal validation remains shared. Paths are absolute in MCP
and resolved from the caller's cwd in CLI. Output/source collisions, existing
outputs and unknown selections are refused. Output follows the existing exclusive
`wx` pattern, with POSIX mode 0600. This prevents replacement; it is not crash-atomic
temp/rename or a Windows ACL guarantee. A failed low-level write may leave a partial
new file. No existing source/output is deleted or overwritten. File/decoder errors
return fixed codes, not raw parser text, payloads or paths.

## Validation

- **6,499 tests in 475 files pass** in the final full regression run. The first run
  had one outdated production MCP tool-list assertion; it was updated for the two
  added tools, then the complete suite passed. A sandboxed focused real-server run
  lacked socket permission; the escalated focused rerun passed all 150 tests in
  seven files. Both unsuccessful logs are retained.
- Both TypeScript configs, Vite production build, lint (35 existing warnings, no
  fixes), i18n (15 catalogs) and docs (37 targets) pass. A draft generic schema
  helper caused a TypeScript error during integration and was replaced with a
  directly typed strict schema before the final successful checks/build.
- Real built **Linux Electron production registration** passes the required MCP
  initialize/listTools and normal CLI missing-project startup regression.
- An additional real-production probe from a foreign cwd passes **11 checks**:
  CLI inspect/paging/draft, MCP tool registration/inspect/draft, exact preserved
  evidence parity, unmapped clock/no media authority and unchanged source.
  CLI and MCP outputs reopen as saved lessons.
- The production shared file service, bundled without Electron, passes **27 checks
  each on Linux and WinBoat Windows 11 Node 22.22.1**. Cases cover normalized
  adapter-neutral captures, retained real Godot v1 and real Godot v2 marker journals,
  paging/redaction/raw hashes, selected offline reopen, no replacement, live
  authority refusal before write, untouched source and changed-hash refusal.
- Focused tests also cover fatal UTF-8, malformed/truncated/oversized sources,
  IDs/bounds, POSIX symlink refusal/mode, HTTP denial before reads and permission
  revocation after reading. Windows tests use canonical paths; POSIX mode/symlink
  creation assertions are excluded where Windows requires different OS facilities.

Evidence is retained outside Git in
`../openscreen-evaluation/application-capture-parity-2026-11-10/`, including build,
test, production startup logs, both runtime probes, original source fixtures and
saved lessons. Windows coverage is the real Node file-service path, not packaged
Windows Electron registration, physical input, native media capture or rendering.
The earlier Node bundling attempt included unrelated Electron consumers and failed
outside Electron; the retained final portable bundle contains only the pure shared
file service and lesson validator. Real Electron registration is separately tested
on Linux. No installer, account, network policy or authentication change was made.

## Roadmap continuation

Godot marker correction C1 is independently accepted in
[Claude's recheck](CLAUDE_GODOT_CHECKPOINT_RECHECK_D4682B4F_2026-11-10.md).
Next is bounded comparison of two explicitly selected authored Godot checkpoint
states within one validated take. A cheaper worker's isolated prototype is
preparatory only. Project archive/restore, runtime/error diagnostics and other
application adapters remain outstanding. The learner player stays parked.
