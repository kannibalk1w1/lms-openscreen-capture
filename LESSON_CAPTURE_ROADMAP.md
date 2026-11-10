# OpenScreen Lesson Capture roadmap

Updated 10 November 2026. **Record once. Produce multiple editable teaching resources.**
This fork extends OpenScreen into a local-first teaching-content toolkit for coding,
game development and technology lessons, including SEND learners. Primary targets
are Windows and Linux, particularly CachyOS/KDE. Keep inherited macOS behavior
intact, without claiming untested fork support. This is incremental development,
not a replacement recorder/editor or a complete LMS.

**Application-agnostic foundation:** every ordinary feature must work with all
application adapters disabled and Godot absent. Three levels—universal capture,
generic enhanced context, optional application intelligence—progressively improve
evidence. Missing semantics reduce automation, not ordinary capture/edit/export.
See [integration controls, contract, refactor seams and required tests](lesson-capture/APPLICATION_INTEGRATIONS.md).
Godot is the first deep integration; no additional adapters are being built now.
Application presets and adapter enablement are separate.

Start with the [expanded product map and prioritised backlog](lesson-capture/PRODUCT_MAP.md).
It covers all new proposals A–K, smaller editor improvements, dependencies, risks,
acceptance/test strategies, relative complexity and now/later/experimental choices.
The [current-state audit](lesson-capture/CURRENT_STATE_AUDIT.md) distinguishes source,
automated results and physically validated functionality. The
[architecture overview](lesson-capture/ARCHITECTURE.md) defines reusable boundaries.
The [original specification](lesson-capture/project-spec.md) preserves rolling-buffer
capture, retakes, lesson/slide mapping, checkpoints and human/agent handoff.
Earlier roadmaps are historical: [5 November](LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-05.md)
and [10 November, before this status rewrite](LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-10.md).

## Unified workflow

Create/select a lesson → optionally import outline and starting project → choose
application/preset and inspect readiness → record naturally → capture supported
video/audio/input/text/semantic evidence → suggest teaching steps → review, replace
and annotate → generate differentiated resources → validate → export an editable
portable package. One source should produce video, illustrated HTML/Markdown/PDF,
stills, GIFs, typing/code recipes, offline follow-along and optional review/evidence
packs. Outputs share stable steps and source references; source evidence stays intact.

## Phased direction

| Phase | Scope | Status / gate |
| --- | --- | --- |
| 0 Capture correctness and privacy | Input clocks/gaps, native reliability, allowlists/suppression/retention/privacy review, preflight, rolling buffer | Partial; privacy is critical before broader input/semantic collection |
| 1 Structured lesson generation | Versioned steps, screenshot/guide drafts, editable ordering/numbering, manifests, portable course presets | [First editable manifest/HTML/Markdown guide slice](LESSON_CAPTURE_GUIDES.md); profiles/deeper generation remain open |
| 2 Application intelligence | Explicit Godot clocks, opt-in semantic editor events, checkpoint comparison, retake/handoff | Typing decoder, human onset calibration and explicit read-only native clock samples exist; continuous edit mapping/semantics remain open |
| 3 Learner-facing delivery | Standalone offline HTML player, differentiated accessible profiles, troubleshooting | Planned; caption/font/theme controls are reusable partial foundations |
| 4 Authoring efficiency | Script/checklist companion, QC/idle suggestions, object-linked arrows, local asset library | Partial existing notes/flags/diagnostics/styles; integrated workflows planned |
| 5 Review and evidence | Local comments/approval/revisions and optional tutor-curated evidence packs | Planned; never infer achievement from activity alone |

Phases express dependencies, not a reason to postpone small valuable improvements.
Accessibility, privacy and CLI/MCP parity apply throughout. AI may draft only when
explicitly configured; deterministic offline operation and human review remain.
No telemetry, cloud upload or third-party AI processing is to be enabled by default.

## Status on 10 November 2026

This section is the current account, in the present tense. The checkpoint-by-checkpoint
paragraphs it replaces are kept word for word in the
[10 November roadmap snapshot](LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-10.md), and the
[product map snapshot](lesson-capture/PRODUCT_MAP_HISTORY_2026-11-10.md) keeps the old map.
Every review, follow-up and evidence report stays unchanged in `lesson-capture/`.

### Repository and review state

- **Main** is `fd2775e2`, unchanged.
- **Private feature branch** `lesson-capture/input-boundaries` was pushed by the coordinator
  at `139b9046`; subsequent Opus integration/lifetime work is accepted as described below and the coordinator owns its checkpoint push.
- **Independently reviewed:** everything through review 41 and its follow-up. Fable's 13 slices
  were reviewed in the [independent review](lesson-capture/FABLE_IMPROVEMENTS_INDEPENDENT_REVIEW_2026-11-09.md),
  which found M42-1; the [follow-up review](lesson-capture/M42_FIX_INDEPENDENT_FOLLOWUP_REVIEW_2026-11-10.md)
  accepts its fix `9355933a`.
- **Opus slices after `139b9046`:** `e3701396`, `7636185d`, `90116cae` and the docs commit
  `51e46e44`. The [independent review of `51e46e44`](lesson-capture/OPUS_INDEPENDENT_REVIEW_2026-11-10.md)
  requested changes for two Medium lifetime defects, R1 and R2.
- **R1/R2 fix accepted:** the [lifetime-fix review](lesson-capture/OPUS_LIFETIME_FIX_INDEPENDENT_REVIEW_2026-11-10.md)
  accepts `0c73895b` and `3e3785da` with no new High or Medium, and one nonblocking Low (L1).
  The coordinator pushed checkpoint `4489db2a` privately.
- **Player review:** the [offline-player review](lesson-capture/OFFLINE_PLAYER_INDEPENDENT_REVIEW_2026-11-10.md)
  of `43b18c70` closes L1 (`cabaf30e`). It requests changes for two Medium player lifetime
  defects: MP1, a range could be answered after release; and MP2, a close did not end a pending
  open.
- **Player recheck:** the [lifetime-fix recheck](lesson-capture/OFFLINE_PLAYER_LIFETIME_FIX_REVIEW_2026-11-10.md)
  of `5a304a4b` closes MP1 and DOC1. **MP2 remains open at Medium:** an open that waited for an
  earlier released open could survive a later close or cancel.
- **Self-tested, not independently reviewed:** `e2e31d32` (opens refused at once while an
  earlier one unwinds; nothing waits) and the documentation commit after it. **MP2 is not
  closed** until that reviewer rechecks it. The player (`82f69ca0`) is not accepted before then.

  Results and limits are in the [session handoff](lesson-capture/OPUS_SESSION_HANDOFF_2026-11-10.md).

### What an author can do today

These steps work on Linux, in the GUI. "Tested" means automated tests plus probes of the
production app under Xvfb with stubbed dialogs. Nobody has yet run them on real hardware,
with a real picker, with a screen reader, or on Windows or macOS.

1. **Record** with the inherited recorder. Button evidence is optional and off by default.
   Recording flags, the scoped typing pad and the Godot plugin are available.
2. **Author steps** in the Lesson guide: add them by hand or draft them from flags and typing
   labels. Each step has a title, instructions, code, and LMS lesson and slide references.
3. **Illustrate** a step from the saved playhead frame and describe the image.
4. **Export** the selected steps as an offline HTML and Markdown guide folder, with
   `lesson-mapping.json`.
5. **Attach a video range** to a step, confirm it, and export that step's MP4. The MP4 is video
   only, at most 1280 px, 30 fps and 120 s.
6. **Keep the lesson.**
   - Save a new editable copy, or save changes back to the lesson file this window opened or
     saved.
   - The app asks before unsaved lesson or package work is lost when you close the editor, open
     another lesson, switch project or start recording.
   - Recovery copies are made only when you ask.
7. **Package.**
   - Create a portable package, including exported step MP4s.
   - Open and verify a package.
   - Make a static editable copy, or edit supported text and step order and publish a new
     package that keeps its media bindings.
8. **Agents** (CLI and MCP, Linux) can create a lesson and add, edit, remove, move and
   illustrate steps. They can also query, export the guide, confirm and export ranges, package,
   and verify.
9. **Learners play a package (since `82f69ca0`, self-tested).**
   - Open the read-only Lesson player from the editor's "Lesson player" button or File > Open
     Lesson Player. No video project is needed.
   - Choose a package folder. The package is fully verified first.
   - Read each step's instructions, code and image in order, and play its step video. Play,
     pause and seek use the video's own controls, plus Replay, playback speed (0.5× to 1.5×)
     and Previous/Next.
   - Moving between steps pauses and never autoplays.
   - It is entirely offline.
   - Nothing is saved: no progress, no history.

The Lesson guide routes (draft, save, open, export, plan-range) serve only the main frame of a
registered editor window. The same-file save goes through a main-held, per-window permission.
Since `0c73895b` (self-tested, awaiting re-review), that permission ends on navigation, crash or
close, including for an open or save still in progress. A pending open grants nothing, and a
save not yet committed is refused with the file and the typed text kept. The one honest
exception: a save that had already committed when the context ended is reported as saved, with
no further permission.

### User value still open

| Gap | Who it affects | What it needs |
| --- | --- | --- |
| Lesson media runs only on Linux (H1) | Every Windows author; Windows is a primary target | Windows hardware for a supervised run (D2) |
| Learner playback is basic: no saved progress, captions, step shortcuts, troubleshooting or standalone (no-app) player | Learners | The [offline player plan](lesson-capture/OFFLINE_LEARNER_PLAYER_PLAN_2026-11-10.md) slices 2 to 6; slices 0 and 1 plus minimal controls are delivered, self-tested |
| A reload or renderer crash loses unsaved Lesson guide work (L42-2) | Authors | Owner decision on automatic recovery (D1); until then the manual-recovery promise stands |
| Audio is never verified in lesson outputs | Narrated lessons | Audio receipt design; real audio acceptance |
| No GIF or standalone PNG step outputs; video is capped at 1280 px | Slide authors | Owner decision (D4); the accepted contracts are unchanged |
| Package tools need a saved, clean video project (M2) | Authors handling received packages | D3(b) decided on 10 November 2026 for read-only inspection and playback only (player slice 0); create, copy and reseal keep the binding |
| No retakes, rolling buffer, save-recent or checkpoint handoff | Authors re-recording a step | Not started (product map P0.4, P2.2) |
| Headless illustrate and range export refuse the default wallpaper and do not name the refused dependency | Agents and new projects | A small usability slice |
| Non-English catalogues show English for lesson features | Non-English authors | Owner decision (D5) |
| No real-hardware pilot, screen-reader, physical-input or picker evidence (M5) | Release confidence | A person at a real desktop |
| Semantic Godot adapter, generated guides, redaction, QC report, asset library, tutor review, troubleshooting | Later phases | [Product map](lesson-capture/PRODUCT_MAP.md) |

### Next work, in order

1. The reviewer rechecks the MP2 fix `e2e31d32`, then the coordinator decides on a push.
2. The owner answers the remaining decisions below (D3 is decided).
3. A manual learner pass of the player on real hardware: a real folder picker, keyboard only,
   and a screen reader (Orca). This is the evidence the automated probes cannot give.
4. Player slices 3 to 5: explicit-click progress, captions (needs package v2 acceptance), and
   accessibility acceptance.
5. A Windows run (H1) and a manual pilot of the specification's Enemy sequence, when hardware
   and a person are available.
6. Small usability work: name the refused dependency kind, and guide authors away from the
   default wallpaper before a headless illustrate.

### Decisions awaiting the owner

| ID | Question | Options (current behaviour first) |
| --- | --- | --- |
| D1 | May Lesson guide work be saved automatically? | (a) Manual recovery copies only. (b) Opt-in automatic copies to the local recovery store, off by default. (c) Automatic copies on by default, with a retention limit. (b) and (c) close L42-2. |
| D2 | Windows lesson media (H1) | (a) Linux only, unchanged gates. (b) Provide Windows hardware or a VM for a supervised run, then open the gates per measured result. (c) Say "Linux only" in the UI and defer. |
| D3 | Package tools and the video project (M2) | **Decided 10 November 2026: (b), for read-only inspection and playback only.** The owner answered "reccomended" to the root's question ("For learner player should opening/playing explicitly chosen package work without first opening saved video project? read-only capability; create/edit keep author checks"), and the root confirmed. Not approved: unbinding create, copy or reseal; automatic recovery writes; any change to Windows gates, the package format, GIF/PNG outputs or the 1280 px cap. The options as first offered: (a) keep the binding to a saved, clean project; (b) an owner-bound, explicit-file capability for inspection and playback only, with reseal and create keeping the binding; (c) unbind every package action. |
| D4 | GIF, standalone PNG and 1920 px | (a) MP4 only, 1280 px cap. (b) Add GIF and PNG as separate derived outputs under new contracts. (c) Raise the cap under a new contract version. |
| D5 | Translations of lesson features | (a) English fallback. (b) Machine drafts with human review. (c) Human translation for chosen locales. |
| D6 | Package verification depth (M3) | (a) Freeze the current layer. (b) State a threat model and simplify at the next format version. |
| D7 | Same-file save sets the file to mode 0600 and replaces the inode | (a) Keep it private, as now. (b) Preserve the original mode; hard links still break. |

### Latest player review disposition

The first read-only player and L1 correction are independently accepted through
`1dd36bc8` / `e2e31d32`: MP1 and MP2 are closed with no new findings. The
[final continuation review](lesson-capture/OFFLINE_PLAYER_MP2_CONTINUATION_REVIEW_2026-11-10.md)
records actual production video/protocol and cancellation evidence. The player
busy-refuses opens until older work settles; it does not queue requests that could
survive release. This is Linux DOM/CDP/stubbed-picker evidence, not physical,
screen-reader, audio or other-platform acceptance. Next: loop/keyboard usability
and explicitly saved learner progress; captions and standalone output remain later.

## Evidence and review ledger

Audit baseline is `249a09da`, after first timing milestone `ffc34ca4`. The latter
recorded 5,331 Vitest passes/398 files and 117 Rust passes/one ignored. Slice 2
recorded 124 Rust passes/one ignored, 53 focused Vitest/three files, both TS checks,
Vite/native build/probe and lint/docs/i18n; no new full-suite claim for slice 2.
Claude [review 1](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_1.md) independently reproduced
117 Rust passes/one ignored, both TS and a snapshot full run of 5,330 passes/one
environment skip. No High/Medium finding; the audio-stop Low is addressed by
slice 2. Claude [review 2](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_2.md) is now complete
for `249a09da`: the audio fix and stop/recovery handling check out, with no High/
Medium defect; one Low warning-code issue plus documentation/test-strength notes
were recorded at that historical stage; subsequent follow-ups supersede that
pending disposition. Independent checks: 124 Rust passed/one ignored, 80 focused
Vitest/seven files, both TS configurations. Cursor slice `43c2f91d` has implementer
results of 5,336 full Vitest/398 files, 124 Rust/one ignored and 88 focused Vitest/
eight files, plus both TS and native/Vite builds; actual review3 and its
follow-ups are completed as recorded above (the original pending note is historical).
See [cursor evidence](LESSON_CAPTURE_CURSOR_TIMING.md) and
[disposition](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_1.md) and dated audit.
Later worker implementation documents carry newer slice evidence; never extend
these counts/approvals to an unreviewed SHA. Historical docs retain old next-step
and validation text as a record; this file owns the current product queue.

No complete physical desktop or cross-platform production acceptance is claimed.
CDP/Xvfb, injected Godot input, software encoders and offscreen native renders each
have narrower scopes. Latest helper physical/portal/count/device and timing tests,
Windows/KDE runtime matrix, sustained/audio/webcam/recovery/transfer, physical IME
and real Enemy trial remain open. Use the established manual checklist.

## Delivery rules

Commit each completed validated slice; report what changed/reused, components,
exact checks/results/skips, limitations, architectural decisions, status and next
item. Preserve original media/evidence through edits. Use established AGENTS.md
conventions and existing components. Highlight major architecture, destructive
migration, external-service or privacy-assumption changes before proceeding.
During the [authorized overnight run](lesson-capture/OVERNIGHT_PLAN.md), push only
private feature branch `lesson-capture/input-boundaries`; leave main unchanged.
No publishing, release workflows, force pushes, real lesson changes or paid APIs.
