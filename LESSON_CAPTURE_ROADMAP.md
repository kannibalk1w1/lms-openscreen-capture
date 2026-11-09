# OpenScreen Lesson Capture roadmap

Updated 9 November 2026. **Record once. Produce multiple editable teaching resources.**
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
The [previous roadmap](LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-05.md) is historical.

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

## Current implementation and exact limits

- [Narration captions](LESSON_CAPTURE.md): reuse local Whisper and transcript/caption
  editing, including recorded/imported narration. Hardware microphone acceptance
  differs from tested imported-audio/native export.
- [Input evidence](LESSON_CAPTURE_INPUT_EVENTS.md), [boundaries](LESSON_CAPTURE_INPUT_BOUNDARIES.md),
  [reader-time projection](LESSON_CAPTURE_INPUT_TIMING.md) and
  [stop/recovery](LESSON_CAPTURE_INPUT_STOP.md): Linux journal, interval identity,
  historical reader projection, bounded stop drain/audio admission and explicit
  device/kernel gaps. Global driver scope and physical/Windows acceptance remain open.
- [Editable lesson guides](LESSON_CAPTURE_GUIDES.md): separate bounded manifest, stable step IDs, metadata-only drafts, composed stills, selected offline HTML/Markdown, reading/language/direction profiles, source review/title queries, explicit bounded local recovery snapshots and real editable reopen. No automatic semantic interpretation or complete project/media packaging.
- [Explicit clock link](LESSON_CAPTURE_CLOCK_BRIDGE.md): optional same-project Godot native-clock samples, pause state and portable bounded journal inspection. Read-only round-trip brackets; no automatic edit mapping, typing pause control or physical timing acceptance.
- [Flags](LESSON_CAPTURE_FLAGS.md), [scoped typing](LESSON_CAPTURE_TYPING.md) and
  [Godot onset association](LESSON_CAPTURE_ASSOCIATION.md): human-calibrated source
  placement; no continuous Godot/encoder synchronization or arbitrary desktop text capture.
- [Code presentation](LESSON_CAPTURE_CODE_PRESENTATION.md),
  [typing exports](LESSON_CAPTURE_EXPORTS.md), [bundles](LESSON_CAPTURE_BUNDLES.md)
  and [typing review](LESSON_CAPTURE_TYPING_TIMELINE.md): editable code panels,
  independent clean/captured recipes and onset markers/catalog. External-app replay,
  selected typing MP4/GIF workflow and clock-supported continuous ranges remain open.
- [Vector annotations](LESSON_CAPTURE_ANNOTATIONS.md),
  [SVG styles](LESSON_CAPTURE_SVG_ARROWS.md) and [cursors](LESSON_CAPTURE_CURSORS.md):
  editable native-rendered overlays. Auto renumbering, object-bound endpoints,
  complete CJK/clipping and cross-platform acceptance remain open.
- Existing upstream CLI/MCP, checkpoints, presets and relinking are reused.
  Legacy pack supports sidecars but explicitly rejects current editor projects;
  complete checksummed lesson portability is not delivered.

## Active work and next concrete slices

Actual [review33](lesson-capture/CLAUDE_ROADMAP_REVIEW_33_2026-11-09.md) accepts
00bdbc77's explicit CLI/MCP source confirmation/save prerequisite with no new
High/Medium. It also confirms a pre-existing regression: edb74a00 made a provider
required but omitted it in the headless consumer, so already-pushed035c8313 broke
normal headless sources/record/export/captions/MCP startup; reviews31/32 missed it.
00bdbc77 fixes that bootstrap, pending coordinator private push. The
[L33-1 filesystem/startup follow-up](lesson-capture/CLAUDE_ROADMAP_FOLLOWUP_33_2026-11-09.md)
adds independent canonical-path/inode tests and a committed real production
CLI/MCP startup smoke required for future handler changes/reviews. It awaits exact-
SHA follow-up review/fixes/push before native headless selected-MP4 ownership and
materializer/validator transport parity. Existing editor MP4 and headless source
confirmation scopes remain bounded; no headless MP4, portable course, timed player,
audio/physical/other-platform readiness is claimed. Earlier labels are historical.

The user rescinded the original 07:30/08:00 overnight cutoffs on 6 November 2026
after a subscription interruption. Both scheduled checkpoints are disabled;
continue authorized coherent implementation/reviews under the unchanged authority
constraints. [Current authorization and superseded schedule](lesson-capture/OVERNIGHT_PLAN.md).

**Post-restart resumption:** the user explicitly said “continue from where we
left off pre-restart”. The pause is resumed; original time cutoffs remain revoked.
Review20 accepted the bounded range-media backend at125ec5de. Actual
[review21](lesson-capture/CLAUDE_POST_RESTART_REVIEW_21.md) accepts
[B22-2 Linux native timing](LESSON_CAPTURE_NATIVE_VIDEO_TIMING.md) at2c29d268
with no High/Medium, within Linux software synthetic/offscreen scope.
[Slice24 runtime video validation](LESSON_CAPTURE_ENCODED_VIDEO_VALIDATION.md)
adds bounded stored-sample timing and actual decoded-frame evidence; actual
[review22](lesson-capture/CLAUDE_POST_RESTART_REVIEW_22.md) accepts91b59b1d with
no High/Medium. Its [guard/provenance follow-up](lesson-capture/CLAUDE_POST_RESTART_FOLLOWUP_22.md)
is accepted by actual [review23](lesson-capture/CLAUDE_POST_RESTART_REVIEW_23.md)
at361fde51, no High/Medium. The
[settlement/provenance follow-up](lesson-capture/CLAUDE_POST_RESTART_FOLLOWUP_23.md)
is accepted at fd749b82 by actual [review24](lesson-capture/CLAUDE_POST_RESTART_REVIEW_24.md),
with no High/Medium or material blocker. The user explicitly resumed with “continue”.
[Slice26 authored source identity](lesson-capture/AUTHORED_SOURCE_IDENTITY.md) adds
explicit bounded Linux content capture/refresh and stored-pin materialization
enforcement, accepted at93518c36 by actual [review25](lesson-capture/CLAUDE_POST_RESTART_REVIEW_25.md).
Its [bounded follow-up](lesson-capture/CLAUDE_POST_RESTART_FOLLOWUP_25.md) tightens
same-project refresh and pins six guards. Actual
[review26](lesson-capture/CLAUDE_POST_RESTART_REVIEW_26.md) acceptsd017e4b8
with no findings and closesL26-3/T26-2/N26-5. Its accepted source-identity scope was backend-only;
user-facing materialization and timed delivery are separate remaining work.
Earlier pause/pending notes below are historical snapshots.

Cursor timing `43c2f91d` passed the 5,336-test milestone. Actual Claude review 3
found a Medium undelivered-bitmap regression; [slice 4](LESSON_CAPTURE_CURSOR_RECOVERY.md)
fixes delivery ownership and strengthens shared production-handler tests.
Actual [review 4](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_4.md) confirms M1 resolved
at `a58f56d9`; [the Linux button-policy slice](LESSON_CAPTURE_PRIVACY.md) follows
with separate validation/review and explicit remaining privacy gaps. Actual reviews 2/3 and their [disposition](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_2_3.md)
are preserved; ordinary capture remains adapter-free while privacy coverage expands.

1. Actual Claude review 4 confirms the cursor bitmap Medium finding resolved at
   `a58f56d9`; minor retry/pending-clear and documentation follow-ups were included
   in subsequent validated slices. Reviews 1–4 retain their exact SHA and test boundaries.
2. The [Linux button collection policy](LESSON_CAPTURE_PRIVACY.md) now provides
   default-off/explicit global consent, fail-closed unknown application scope,
   producer/storage gates, live suppression, durable receipts and canary tests.
   Actual [review 5](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_5.md) found two Medium
   gaps; the [privacy lifecycle follow-up](LESSON_CAPTURE_PRIVACY_FOLLOWUP.md) fixes
   asynchronous consent and adds real source-bound import/reopen inspection,
   reviewed at `d6fd5302`: all review-5 findings fixed, with a new High countdown
   ownership and Medium optional metadata failure. The [recovery follow-up](LESSON_CAPTURE_PRIVACY_RECOVERY.md)
   addresses those and packaging/metadata limits; actual reviews7/8 and later
   follow-ups are preserved in the review ledger.
   It is a bounded collection gate, not complete
   text/media redaction, retention exclusions or pre-export privacy inspection.
3. The [first optional boundary](LESSON_CAPTURE_INTEGRATIONS.md) adapts selected-file
   Godot journal import with durable default-off controls, bounded instance/session/
   scope/capability routing and disabled/failure/isolation/offline-reopen tests.
   Live application/project attestation and integration CLI/MCP commands remain open.
   Actual review8 reports no High/Medium on slices8/9; bounded Low followups are in slice10.
   [Slice11](LESSON_CAPTURE_CLOCK_BRIDGE.md) adds explicit read-only Godot/native clock samples and pause state under that policy, with continuous edit mapping still open. The shared
   lesson manifest and offline illustrated-guide slices described below are now
   implemented within their bounded manual workflows. Expanded semantic capture waits for privacy.
4. [Shared lesson guide slices13–18](LESSON_CAPTURE_GUIDES.md) deliver separate
   editable manifests, native illustrations, selected offline outputs, reading
   profiles, source review filters and explicit manual recovery copies.
   [Slice19](LESSON_CAPTURE_COMMANDS.md) adds explicit-file CLI/MCP query/export
   parity without recovery-store discovery. Actual review15 accepts414823d6
   with no High/Medium; actual review16 accepts74d58a5a with no High/Medium. Slice20 tightens HTTP lesson
   query permission before file access and adds script-free offline guide
   navigation/print flow; actual review17 accepts d0949f9f with no High/Medium.
   [Slice21](LESSON_CAPTURE_RANGES.md) adds explicit authored range references
   bound to saved render inputs and existing trim/speed mapping, with no media
   copying/playback. Actual review18 accepts8e0316ab with no High/Medium; its
   boundary-test gaps are addressed in slice22.
   Current phase: backend selected-media materialization/revalidation and native
   encoded-output proof, including the bounded review19 M22-1 fix CLOSED by actual review20 at125ec5de.
   Actual review21 accepts the post-restart B22-2 Linux software timing fix.
   Slice24 adds runtime sample/decode validation for a narrow Linux MP4 subset,
   with video flags true only on success; review22 accepts91b59b1d. Its
   guard/provenance follow-up awaits exact-SHA review.
   Synthesized AAC stays separate from video checks; audio flags remain false. This is not
   GUI/API/player delivery; physical/native/platform acceptance remains open.
5. Progressively deliver the [remaining dependency-ordered backlog](lesson-capture/PRODUCT_MAP.md),
   including original rolling buffer, retakes and real Enemy handoff proof.

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
