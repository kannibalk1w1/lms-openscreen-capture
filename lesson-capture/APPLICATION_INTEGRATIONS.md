# Universal capture and optional application integrations

Architectural requirement, 5 November 2026. [Slice 9](../LESSON_CAPTURE_INTEGRATIONS.md)
implements a bounded first subset: optional selected-file Godot decoder, real durable
control, instance/session/capability isolation and adapter-free normalized evidence
reopen. [Slice 11](../LESSON_CAPTURE_CLOCK_BRIDGE.md) adds a separate explicit project-scoped, read-only native clock capability and portable sample inspection. The [bounded scene journal](../LESSON_CAPTURE_GODOT_SCENES.md) adds explicit current-scene sampling and offline selected evidence review. Continuous text/media alignment and the broader application-scope manager below remain planned. Godot is the first deep integration,
not a required installation, runtime or core data model. This is the proposed
adapter boundary, not a shipped integration manager. See the [product map](PRODUCT_MAP.md),
[architecture](ARCHITECTURE.md) and [refactor audit](CURRENT_STATE_AUDIT.md#application-agnostic-follow-up-audit).

## Three levels

| Level | Evidence and tools | Degradation rule |
| --- | --- | --- |
| 1 Universal capture | Screen/window/audio, permitted mouse/keyboard evidence, flags, screenshots/clips/GIF, cursor/annotations/numbered steps, timeline, narration/captions and ordinary teaching outputs | No application adapter required. OS/privacy limits remain visible; missing input cannot block permitted video, editing or export. |
| 2 Generic enhanced capture | Supported application/window/accessibility context, authorized document/file observations and generic text edits | Capability-specific permissions and scope checks; raw keys or saved-file differences never imply full typing reconstruction. |
| 3 Application intelligence | Explicit adapter capabilities for semantic actions, unsaved buffers, object/hierarchy state, project inspection/checkpoints and diagnostics | Optional, disabled until opted in. Missing/incompatible/crashing adapters remove enrichment, not levels 1 or permitted level 2. |

The rule includes automatic guides, interactive lessons, accessible outputs,
AI-assisted editing, scripts/checklists, libraries and packaging. None may require
Godot or another demonstrated application. Optional AI has separate explicit
configuration/privacy permission; useful deterministic offline operation remains.
Unity, Unreal Engine, Blockbench, MCreator, Roblox Studio, coding tools, arbitrary
desktop applications and web tools are valid generic capture subjects today;
that does not imply their semantic adapters or full platform acceptance exist.

## Simple capability contract before deep Godot expansion

Start with an internal interface and bounded versioned messages, not a marketplace,
executable plugin loader or extension framework. No additional application adapters
are requested now. Adapt current Godot typing import/bridge to this boundary.

- A descriptor declares stable adapter ID, adapter/contract versions, supported
  application versions and individual capabilities. Illustrative names:
  `text.edits`, `document.state`, `scene.hierarchy`, `object.properties`,
  `resource.assignment`, `project.checkpoints`, `application.diagnostics`.
  These are design candidates, not a published API. Adapters implement any subset;
  model geometry/texture observations need no Godot node/scene abstraction.
- A connection has adapter **instance ID**, session, selected application/project
  scope, permission state and health. Distinguish declared support, connected/
  verified availability and interval completeness. Route/validate each instance
  independently; reject stale/wrong-session/scope/capability events.
- Events have envelope/schema version, adapter/instance/session/sequence identities,
  capability/type, original clock + explicit media relation/uncertainty, scope,
  observed/inferred provenance and bounded namespaced payload. Keep application
  payloads out of mandatory generic lesson fields. Do not fake other producers
  through the Linux-only journal enum; use a documented compatible boundary or a
  versioned normalized lesson-evidence layer retaining raw originals.
- Bounded queues/timeouts and error boundaries isolate crashes/disconnects. Expose
  a capability gap; never propagate optional producer failure into recorder life
  cycle or label missing observations complete. Apply privacy before ingestion/
  storage and stop watchers/connections on disable/revoke.

## Application integrations settings — Planned; M

Provide persistent individual enable/disable, supported application/capability
lists and actionable disabled/connecting/connected/unavailable/incompatible/error
status. Show partial capability health. Recording selection offers a desired
enabled integration **or ordinary screen capture**. Planned adapters must not look
connected. Selection/presets do not install software or grant collection scope.

Integrations default disabled. Plugin installation, file monitoring, project
inspection and permissions require explicit authorization. Godot plugin setup is
a separately explicit project action. Disabling stops new collection but never
prevents existing projects reopening/editing/exporting from embedded evidence.

Dependencies: capability boundary, privacy policy, persistent settings and session
selection. Risks: stale health, connected-but-incapable producers, leaked watchers.
Acceptance: real functional controls, restart/revoke/error handling, truthful status
and keyboard operation; no decorative toggles. Test configuration, lifecycle and UI.

## Durable projects, generic guides and separate presets

Store normalized captured text/state with original producer provenance; replay and
render old evidence with core services, without launching a live adapter. Preserve
unknown optional payloads safely/opaquely within bounds or report unsupported data
explicitly; generic media/steps remain usable. Never execute imported payloads.
Reject unknown major formats helpfully; do not silently reinterpret or lose data.
Keep existing `godot-codeedit` takes/recipes readable through compatible schema
evolution and tests. No blanket producer-string replacement or weakened validation.

Generic guide generation works with every adapter disabled, using video/source
frames, available clicks, markers, narration/captions and authored outline. It
suggests editable steps offline; neutral wording/manual review replaces unavailable
semantics. A click alone cannot prove an object was created. Verified adapter
evidence can improve specificity; inferred/AI drafts remain labelled and reviewable.

Application presets are independent appearance/export profiles: Godot lesson,
Blockbench modelling, Unity, Unreal Engine, MCreator, Roblox Studio and Generic
desktop tutorial. Extend existing style/profile services. Presets can configure
cursor, screenshot dimensions, code display, annotations and export defaults;
they never enable adapters, monitor projects or grant input permission. A Godot
preset works with Godot absent. Code display needs language metadata and plain-text
fallback; bundled GDScript highlighting does not require the Godot engine.

## Mandatory architecture validation

| Scenario | Required proof |
| --- | --- |
| All adapters disabled / Godot absent | Empty registry supports core recording/edit/export and generic guide fixtures; actual native/offline Windows/KDE trials separately |
| Explicit Godot enablement | Disposable actual plugin/bridge capability probe after opt-in; scope/clock and disable/revoke tests |
| Missing/incompatible/crashing adapter | Inject startup/runtime/disconnect/queue faults; recording continues and unavailable capability is visible |
| Project reopen without adapter | Save evidence, remove registry entry, reopen/edit/export offline with no process launch, substitution or evidence loss |
| Generic guides | Video/markers/caption-only fixture yields reviewable HTML/Markdown/screenshots without semantic claims or Godot data |
| Multiple adapters | Two fake instances, including same application type, collide on local IDs/sequences without mixing sessions, scopes or state; test selection and stale events |
| Cross-adapter privacy | Allow/deny/unknown scope, suppression and revocation canaries absent from producer queues/storage/caches/exports; unknown context never authorizes restricted capture |

These are requirements, **not newly passed tests**. Fake adapters prove isolation,
not physical application behavior. Establish the minimal interface and regressions
before deep semantic expansion. Future-adapter recipe: descriptor/subset → explicit
setup/permissions → scoped connection → validated observations/clock relation →
stored evidence → teardown/failure tests. Prove Godot first; do not build every adapter.

## Current-scene journal subset — 10 November 2026

The first semantic slice is an explicit file workflow, not a new live connection
or registry provider. The addon asks permission per current-scene take; it never
starts from a window choice, typing-import setting or clock grant. Each bounded
record has a random instance/take identity, sequence and independent elapsed time.
The strict decoder rejects mixed instance/session/root state and unauthorized
property/path shapes, and derives observed before/after changes without claiming
every action or media alignment. Only explicitly selected observations become
generic optional `application-observation` evidence on lesson steps. They reopen
offline without an adapter. No new application-specific requirement is placed
on ordinary capture/edit/export or the mandatory lesson fields.

This file workflow does not implement a general live semantic permission manager,
continuous clock mapping, checkpoint comparison or semantic CLI/MCP commands. Those
remain follow-ups. The real disposable Godot editor probe and strict malformed
import/offline regressions cover this subset; they do not replace the broader
physical/privacy acceptance matrix above.

## Shared offline capture boundary — 10 November follow-up

[The implemented neutral format and adapter recipe](APPLICATION_CAPTURE_CONTRACT.md)
now separate Godot decoding from review and draft authoring. Synthetic non-Godot
evidence uses those same controls without an application installation. Godot
sampling now also responds to bounded editor signals; observers connect only
during explicitly started takes. [WinBoat Windows 11 and Linux validation](GODOT_CAPTURE_WINDOWS_REUSE_2026-11-10.md)
exercise real editor APIs and offline authoring, not physical UI or video capture.
