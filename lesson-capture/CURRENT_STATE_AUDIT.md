# Expanded-roadmap implementation audit

5 November 2026. Audit base: feature branch `lesson-capture/input-boundaries`,
HEAD `249a09dad3f8905dc32390f4d9da1fc06be1f40d`; clean at initial inspection.
Private main remains `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
The checkout is active: Codex dispatch `ctx_a1b1e3ccf552` implements cursor timing;
Claude dispatch `ctx_b61a09562b32` reviews immutable `249a09da`. This audit reserves
only roadmap/discovery/new planning docs; neither worker's code/build/report is
overwritten. This is a dated snapshot, not a claim that later HEAD has been audited.

## Read and inspected

Read AGENTS.md, original `lesson-capture/project-spec.md`, inherited ROADMAP.md,
existing LESSON_CAPTURE_ROADMAP.md and relevant LESSON_CAPTURE implementation
documents: narration, flags, input events/boundaries/timing/stop, typing,
association, presentation, exports/bundles, typing timeline, annotations, SVG and
cursors. Older documents intentionally preserve historical validation and future
tense; their old 'next' sections are not the current queue. The previous roadmap is
preserved at [history](../LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-05.md).

Source inspection checked the current capture event interfaces/journal, native
timing/recovery implementation records, Godot plugin and observer, typing schema/
services, document schema/store paths, annotation connectors, presets, CLI pack,
relinking, MCP/checkpoint surfaces and privacy-related references. Tests were
located/read through implementation evidence and existing source/tests; no fresh
application build or physical test is claimed by this documentation audit.
This is an engineering assessment, not exhaustive proof that every absent feature
has no prototype anywhere in the repository or archived research.

## Code-backed capability map

| Capability | Current code / reusable seam | Status and actual evidence boundary |
| --- | --- | --- |
| Screen/audio/camera editing, trims/speed, captions, MP4/GIF | Existing recording managers, `src/lib/exporter/`, `crates/compositor/` | Implemented upstream foundations; fork changes do not certify all inherited releases/platforms |
| Caption creation from recorded/imported narration | Voiceover integration and existing local Whisper pipeline | Implemented bounded path; earlier imported-audio/native export evidence, hardware microphone/full desktop matrix open |
| Linux button journal and health | `src/native/captureEvents.ts`, `electron/recording/captureEventJournal.ts`, `linuxNativeCaptureSession.ts` | Partial complete-input milestone; append-only records, device gaps and bounded drain; global scope explicitly reported |
| Observation/media timing | `electron/native/pipewire-capture/src/capture_clock.rs`, helper loop/evidence modules | Implemented reader-time projection, not physical-edge/frame-accurate alignment; new helper requires fresh physical trial |
| KWin input integration | `integrations/kwin-input/`, helper driver | Experimental/opt-in; earlier nested-compositor count is not physical touchpad acceptance or validation of latest binary |
| Typing and unsaved Godot buffers | `src/lib/typing/`, `integrations/godot-typing/.../plugin.gd`, `observer.gd` | Implemented bounded pad/single-CodeEdit capture; headless actual Godot probe, physical IME/layout/multicaret coverage partial |
| Recording flags and onset association | `electron/recording/recordingFlags.ts`, `src/lib/typing/association.ts` | Implemented explicit human calibration; control-clock UUID differs from native journal clock; live bridge missing |
| Code layer and portable typing files | typing presentation/portable services, Code regions, Electron typing export IPC | Implemented bounded clean/captured views and single/bundle recipes; controlled-buffer playback only, no external app replay or selected video excerpt workflow |
| Typing review lane | `src/lib/typing/review.ts` and timeline components | Implemented onset/catalog seek/edit/export; no invented continuous range; Electron/CDP review is not OS input acceptance |
| Editable arrows/numbered annotations | `src/lib/ai-edition/annotations/connectors.ts`, scene/native rendering | Implemented geometry/SVG styles; boxes choose next highest number at creation, no automatic renumber/object attachment |
| Presets and asset repair | `electron/ai-edition/style-preset-service.ts`, `electron/media/projectMediaRelinker.ts` | Implemented existing appearance/relink seams; no portable course-wide lesson profile or searchable teaching library established |
| Packaging | `electron/cli/projectCommands.ts` | Partial: legacy project pack copies sidecars; explicitly rejects current editor-saved projects; no complete transitive checksummed lesson package |
| CLI/MCP and checkpoints | `electron/cli/`, `electron/mcp/project-tools.ts`, document service | Implemented general recording/edit/export/checkpoint foundations; lesson queries/step operations and app-project retake checkpoints still missing |
| Privacy controls | Explicit scoped pad/Godot start, mode0600 journal create, visible status, existing blur | Partial: these are not allowlist enforcement, lifecycle redaction or a pre-export privacy review; global driver cannot infer app scope from selected video window |
| Semantic Godot events | Plugin observes CodeEdit signals/text only at this base | Planned beyond typing: no verified scene-tree/inspector/resource/signal/run/error capture |
| Shared steps/guides/player/review/evidence | Original spec plus existing source anchors/events | Planned integrated product capabilities; numbered text annotations and typing sections are not a durable lesson-step model |

## Validation ledger — do not combine these counts

- Implementer slice 1 `ffc34ca4`: recorded **5,331 Vitest / 398 files passed**;
  Rust **117 passed, one ignored**, both TS configs/build/native probe, lint/docs
  checks. [Timing evidence](../LESSON_CAPTURE_INPUT_TIMING.md).
- Claude review 1 actually delivered: [report](CLAUDE_OVERNIGHT_REVIEW_1.md),
  baseline `17dd44a8` and `ffc34ca4` vs private main. Independently **117 Rust
  passed/one ignored**, **270 focused Vitest**, full **5,330 passed/one environment
  skip** in isolated snapshot and both TS configs. No High/Medium finding; Low audio
  stop regression and consistency/evidence notes. These are separate runs.
- Implementer slice 2 `249a09da`: **124 Rust passed/one ignored**, **53 focused
  Vitest / three files**, both TS configurations, Vite/native helper/probe, lint
  (35 existing warnings), docs/i18n/diff. Full 5,331 is the previous milestone,
  not a rerun on slice 2. Audio-bearing encoder fixture checks gated admission;
  stop drain covers a bounded queued prefix, not every reader/kernel backlog.
  [Stop evidence](../LESSON_CAPTURE_INPUT_STOP.md), [review-1 disposition](CLAUDE_OVERNIGHT_FOLLOWUP_1.md).
- Claude review 2 of slice 2 was **pending at audit creation**. Do not count the
  implementer's fixes as independent approval. Subsequent completed reports must
  update the current roadmap/implementation ledger with exact SHA and coverage.
- Older frontend reports cover specified snapshots via Chromium/Electron CDP,
  Xvfb and stubbed save dialogs. Native code presentation has Linux offscreen
  preview/MP4 pixel evidence. Neither proves complete physical desktop workflow.
- Latest rebuilt helper has no new physical portal/count/unplug/overflow acceptance
  in this audit. Windows/KDE full production, physical touchpad/IME/audio/video
  timing, sustained/recovery/transfer and real Enemy handoff remain open. Orca's
  provider lacked screenshots/hotkeys/focus in prior capability probes.

## Overlap and missing-work conclusions

Reuse existing event journal, flags, typing capture, source projection, annotations,
transcripts, presets, exporters, checkpoints and CLI/MCP. Do not create replacement
systems named after the new proposals. Stable lesson steps unify A/D/E/F/H/I/J/K;
privacy C and timing are cross-cutting prerequisites. G reuses existing diagnostics
but needs one reviewable report, not a second health mechanism. Course presets
extend existing style services. Numbering binds annotations to stable steps;
connectors extend existing geometry. Idle suggestions use existing non-destructive
edits. Packaging must address current editor files explicitly.

The original rolling-buffer/recent footage, lesson/slide manifests, failed-step
replacement, known project baselines, isolated automation and bidirectional handoff
remain in the [product map](PRODUCT_MAP.md). The guide/player/library additions do
not displace them. Major proposed boundary: an additive versioned lesson manifest
alongside backend editor state; proposed privacy change: suppress unsupported
restricted collection before persistence. Both are highlighted before coding;
no migration/service or broader capture was enabled by this audit.

## This documentation slice's checks

`npm run docs:check` passes (37 checked files); `git diff --check` passes.
All 36 local links in the four new/current planning documents resolve. The saved
previous roadmap matches `249a09da:LESSON_CAPTURE_ROADMAP.md` byte-for-byte.
No application/native build, unit-suite rerun, physical capture, accessibility or
cross-platform execution was performed for these documentation-only changes.
Concurrent implementation results belong to their own SHA/report, not this slice.
