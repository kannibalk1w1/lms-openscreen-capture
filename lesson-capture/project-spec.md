# Lesson capture toolkit — working specification

Version: 0.1, 5 November 2026.

Status: confirmed product requirements from the specification interview, with proposed architecture and acceptance targets clearly marked below. Initial implementation has started in the [OpenScreen development checkout](openscreen/LESSON_CAPTURE.md), beginning with recorded/imported narration captions. Dependency choices remain subject to the [reuse evaluation](reuse-research.md).

## Purpose and priority

Help LMS authors and agents produce screenshots, videos, and GIFs that demonstrate real application workflows in Godot, Roblox Studio, Blockbench, and later applications. Human capture must be effortless enough to beat the current screenshot/OBS-and-fix-in-post workflow. The author should be able to demonstrate naturally, then review a timestamped session and turn selected moments into editable teaching assets.

Capture friction is the primary problem. Automated annotation and post-production assistance are valuable, but cannot compensate for clumsy capture.

## Confirmed decisions

- Support human capture on Windows and Linux, specifically CachyOS/KDE. Most automated work will run on CachyOS.
- Use a common project format for human and agent work, including handoffs in either direction.
- Start with explicit lesson outlines and known starting project files; agents generate a reviewable first pass.
- Capture the actual learner-facing UI route. File/API operations may prepare starting state and inspect results, but cannot substitute for required on-screen demonstrations.
- Record full sessions by default after explicit start. Also offer rolling-buffer mode and a save-recent-footage shortcut, initially illustrated as the last 30 seconds.
- Record timestamped clicks, shortcuts, script changes, and human teaching markers where platform/application capabilities permit.
- Show video and events in a navigable timeline. Select a frame for a screenshot or a range for MP4/GIF.
- Preserve raw media and separate editable annotations, crops, zooms, cuts, speed changes, and timing.
- Support optional microphone and application audio as separate tracks, including narration added later.
- Keep normal capture interaction to shortcuts and a small indicator. Never require naming, annotation, or categorisation during capture.
- Gather more evidence than is published; suggest a smaller teaching sequence during review.
- Replace one bad step without rebuilding the lesson. Agent regeneration uses checkpoints; reused annotations must be checked against replacement content.
- Existing agents operate through documented commands and MCP. The toolkit supplies capabilities, not a mandatory new AI provider.
- Run automation in a separate desktop session or VM, allowing the human to keep using their own desktop.
- First validate Godot while keeping capture application-agnostic and allowing application adapters.
- Consider a separate lesson-authoring toolkit with selective Panoptix reuse.
- Later, use a human demonstration as reference for an agent's cleaner pass. Exact click replay is not assumed reliable.
- Research existing usable/open-source tools before creating equivalent components.
- Design for the internal authoring team first while keeping a future public release possible.
- Initially export organised media and a lesson/slide mapping manifest; automatic insertion into LMS upload files follows reliable capture and review.
- Next priorities are capturing every mouse click and typing/edit operation in the selected capture session, and exporting reusable ScriptWriter-style typing sections. The implementation order and coverage criteria are in the [input capture roadmap](openscreen/LESSON_CAPTURE_ROADMAP.md).

## Human workflow

1. Create or reopen a capture project; optionally associate a lesson and starting application project.
2. Select the application/capture workspace and optional audio sources. Complete any platform-required source selection at session start.
3. Start recording and demonstrate normally. The indicator shows recording/paused/error status without stealing focus.
4. Use remappable shortcuts to mark a teaching step, take a still, preserve recent footage, bracket a clip, or pause/resume. Descriptive labels can wait.
5. Open review during or after the session. Event tracks locate clicks, shortcuts, code revisions, markers, and agent actions where available. Unsupported event types are labelled as unavailable.
6. Select useful moments; group them into steps; trim mistakes and waiting; add annotations, code overlays, zooms, and narration.
7. Export selected PNG/MP4/GIF assets and their lesson mapping while retaining the editable project.

The full-session save-recent command can initially mark a source range without duplicating media. Rolling-buffer mode must preserve the associated event range when committing footage. A saved clip is acknowledged only when its referenced media is durable.

## Agent workflow

1. Read existing lesson content and shot cues. Propose a step/capture plan referencing source lesson, slide, code, assets, and checkpoint.
2. Open a disposable working copy in an isolated application session with consistent size, theme, fonts, and app version recorded.
3. Start capture and the event journal before executing teaching actions.
4. Observe the current application, perform the visible learner action, wait for a relevant state, and capture evidence. Input injection success alone does not mean the action succeeded.
5. Add initial editable callouts and media selections. Check the captured result against the intended lesson step.
6. Retain failed attempts in source history, mark the affected step, and resume from a known checkpoint or request human intervention through the existing agent client.
7. Export a first pass with completed/failed/unverified statuses and source references. Human and agent can continue in the same project.

Preparation through an API must be logged distinctly from visibly demonstrated actions. Deliberate teaching pauses and watchable code entry must remain possible even when automation could execute faster.

## Review and editing

The review screen combines a preview, source/event timeline, lesson step list, and editable properties. Clicking an event seeks to its captured moment. Selecting a step reveals its screenshots, ranges, annotations, and verification status.

Initial editing scope: frame selection; trim and split; pause removal; segment speed changes; crop; static and animated zoom; timed arrows, boxes, labels, click indicators, and shortcut overlays; audio mute/level/timing; narration import. Complex compositing and multi-camera editing stay in external editors.

Keep the original recording separate from all edits. A still retains its exact source frame and annotation objects. A clip retains source ranges and transformations. Changing a source range or speed must also transform event/overlay timing; source timestamps remain intact.

Code capture means timestamped saved file versions/diffs where supported, with optional application adapters for unsaved editor content. It is distinct from keystrokes. Clearly show when a diff reflects a save event rather than each typed character. Shortcut overlays use recorded commands; code overlays use preserved source content.

Typing capture additionally preserves committed text and edit operations, including paste, deletion, selection replacement, cursor movement and input-method composition. Group these into editable typing sections. Export the resulting text/code, a versioned timed sequence, and a controlled playback recipe with adjustable teaching pace; render selected sections to MP4/GIF as needed. File-save diffs and raw key codes alone do not satisfy this requirement. Direct Godot ScriptWriter import compatibility requires a tested adapter.

Complete mouse capture includes button presses and releases, left/right/middle and supported extra buttons, trackpad taps, double-click classification and drag boundaries. Store these events separately from cursor movement and on-screen effects. Validate completeness with a counted scenario on both launch platforms, including menus/dialogs and pause/resume.

## Project and event model — proposed design

Use an ordinary portable project folder with a versioned manifest, raw media, append-only events, code revisions, checkpoints, annotation/edit descriptions, and exports. Keep derived thumbnails/proxies replaceable. Relative paths and bundled media allow transfer between Windows and Linux.

Core relationships:

| Record | Required relationship |
| --- | --- |
| Session | Capture configuration, platform/app versions, clock origin, media segments, capability report |
| Event | Stable ID, source/session timestamp, producer, type, payload, optional step ID |
| Step | Stable ID, source lesson/slide mapping, intended action, checkpoint, verification status |
| Capture | Source media/frame/range, step ID, dimensions, capture geometry, take/version |
| Edit | Source reference, transform/timing, separate annotation objects, schema version |
| Export | Input revision, preset, output path, lesson mapping, verification result |

Use a monotonic session clock mapped explicitly to media presentation timestamps. Define pause/resume, encoder startup, rolling-buffer offsets, segmented files, and dropped-frame handling. Retain both source and edited time so cuts cannot silently detach an event from its frame.

Record coordinates with the capture's geometry and scaling. Test multi-monitor offsets, DPI changes, window resizing, and transient child windows. Store semantic targets when available without assuming they replace visual checks.

Application isolation is not automatically filesystem isolation. A working-copy/checkpoint manager must prevent the agent's demonstration from overwriting the source lesson project. Human takeover and agent control need exclusive input ownership within the automation session.

Upstream editor files can sit alongside this manifest as backend-specific state. Do not make an evolving upstream format the only durable home for lesson identities or original events. Round trips must explicitly report unsupported edits rather than flattening them silently.

## Reuse strategy — provisional architecture

Evaluate existing capture/editor applications first. The research shortlist and evidence are maintained in [reuse-research.md](reuse-research.md).

- Compare existing editors as the main human interface before choosing a custom editor or fork.
- Evaluate an established recorder/replay API as a managed backend where it improves reliability.
- Evaluate an isolated Linux desktop runtime for automated control and capture.
- Reuse the existing shotkit's editable-still model, lesson mappings, briefs, and completed assets.
- Reuse suitable Panoptix platform integrations while designing capture around this authoring workflow.
- Use existing application MCP/plugin surfaces for preparation, inspection, and verification where suitable.

Expected custom work: a common event/lesson model; capture-session coordination; missing platform event adapters; lesson-source import; step replacement/checkpoints; consistent CLI/MCP wrappers; and LMS export mapping. The amount of custom UI depends on the evaluation.

The author should see one coherent workflow. Multiple backends must not mean manually operating multiple tools every session.

## Pilot and launch scope

The first end-to-end slice is RPG Lesson 1's Enemy sequence: Node2D creation, Sprite2D addition, slime asset assignment, scale changes, scene save, script attachment/entry, and property/result inspection. Reuse existing lesson assets and the checkpoint answer key.

Run it manually and agentically. Deliver an editable project, annotated screenshots, a short MP4, and a GIF. Deliberately replace one bad step and reopen the project on the other OS. Include the historically missed rename popup.

This slice validates the workflow, not the entire launch scope. Launch still requires both platforms, full-session and rolling-buffer capture, separate optional audio, event navigation, the agreed editing tools, portable projects, and agent access. Automated Roblox/Blockbench adapters can follow the Godot proof; generic manual capture must already work outside Godot.

Later capabilities: stronger inference from human demonstrations, robust automatic re-demonstration, additional application adapters, and richer external-editor interchange. Direct publishing/upload into the LMS is not yet decided; local media and an explicit mapping manifest are sufficient for the current pilot.

## Acceptance evidence

Confirmed outcomes:

- Human recording controls preserve application focus and do not require per-capture dialogs.
- Both Windows and CachyOS can capture and reopen the same editable project.
- Agent capture visibly demonstrates the required lesson route and leaves reviewable evidence.
- A bad step can be replaced while accepted steps and their media remain intact.
- Events lead to the relevant footage, including across pauses, cuts, and saved replay ranges.
- Final PNG/MP4/GIF files render correctly, while originals and edits remain available.

Proposed numerical targets, awaiting user agreement and a baseline measurement:

| Measure | Initial target |
| --- | --- |
| Tutorial capture | Readable 1920×1080 at 30 fps; optional 60 fps where supported |
| Reliability run | 30 minutes with recoverable media/events and no silent recording failure |
| Event alignment | Within 100 ms of its visible action on the source timeline |
| Control acknowledgement | Within 250 ms, without changing application focus |
| Disk write interruption | Previously completed segments/events remain recoverable; unsaved tail is identified |
| Author effort | Measure against current screenshot/OBS workflow on the same sequence; agree improvement target after baseline |

Also test capture restarts, source window closure/reopen, dialogs, multiple DPI settings, undo/redo, audio separation/sync, migration/version errors, missing media, and take replacement. Automated progress is assessed by verified lesson steps rather than successful tool calls.

## Remaining product decisions

1. Confirm numerical acceptance targets and typical maximum session duration/storage budget.
2. Agree a visual annotation preset using existing lesson branding and readable teaching conventions.
3. Choose any public release/distribution licence later; internal-team-first scope is confirmed.

Prototype findings should determine dependency choices. Record those separately from these product decisions; do not ask the user to guess which capture backend will work.
