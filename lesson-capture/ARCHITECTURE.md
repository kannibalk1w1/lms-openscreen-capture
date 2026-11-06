# Lesson Capture architecture and integration boundaries

Design direction, 5 November 2026. Existing services remain in place. The [first versioned lesson manifest/guide slice](../LESSON_CAPTURE_GUIDES.md) now supplies
bounded editable steps and native illustrations. The broader lesson
manifest, privacy policy and exporters described below are proposed unless linked
to a completed implementation. See [audit](CURRENT_STATE_AUDIT.md) and
[backlog/dependencies](PRODUCT_MAP.md). No major migration is authorized by this
document, and no new external service is required.

**Core invariant:** universal recording, editing and teaching outputs work with
every application integration disabled and Godot absent. The
[application integration contract](APPLICATION_INTEGRATIONS.md) defines three
progressive levels, per-adapter capability subsets, failure isolation, settings,
cross-adapter privacy, durable data and seven required validation scenarios.
Presets never imply adapter enablement or new collection authorization. Establish
this simple internal boundary before expanding Godot semantic capture.

## Existing boundaries to preserve

- Electron recording managers coordinate backend-specific helpers. Linux native
  input evidence lives in `src/native/captureEvents.ts` and
  `electron/recording/captureEventJournal.ts`; `linuxNativeCaptureSession.ts`
  persists helper records. Capture clocks and gaps describe explicit observations,
  not reconstructed physical events.
- `src/lib/typing/` owns validated takes, independent typing clocks, actual text
  replacements, selections/keys, source anchors and portable controlled-buffer
  recipes. `integrations/godot-typing/` is an opt-in single-CodeEdit producer.
- `src/lib/ai-edition/schema/index.ts`, document/store services and timeline mapping
  own current editor state/history. `typingTakes` and source flags are additive
  document fields. Avoid a second set of editor trims, media or annotation state.
- Annotation connectors/SVG/style controls and native `crates/compositor` rendering
  provide editable geometry and shared preview/MP4/GIF behavior. A screenshot guide
  must reuse or explicitly adapt that rendering, not flatten its editable source.
- Existing `electron/cli/`, `electron/mcp/` and document/checkpoint services support
  automation. New lesson commands should wrap the same application-independent
  services used by UI, with identical validation, privacy policy and errors.

## Proposed shared lesson representation

Use a separate, small versioned manifest alongside current editor backend state.
Do not make the unstable `.openscreen` schema the sole home of durable lesson IDs.
An adapter resolves current editor clips/annotations into stable source references;
it must report unsupported/missing state, never silently flatten it. New documents
are additive and existing editor projects keep opening without a lesson manifest.

| Record | Proposed responsibilities |
| --- | --- |
| Lesson/revision | Stable ID, schema version, ordered step IDs, outline/lesson/slide refs, asset catalogue, authoring/review revision |
| Step | Stable ID independent of display number; authored title/instructions; original and clean presentations; evidence refs, source selections, checkpoint refs, review status, optional troubleshooting links |
| Source selection | Asset/session IDs, original frame or source-time range, explicit time basis/interval and precision; optional chosen clip occurrence; no invented range for onset-only anchors |
| Evidence ref | Producer/schema/session/event IDs, observation kind, capability gaps, clock relation and uncertainty; observed, inferred, authored or AI-drafted provenance |
| Application state | Adapter ID/version, scoped project/scene/resource identity, observed state/diff and optional expected checkpoint; separate from achievement |
| Asset | Stable logical ID plus relative path/content hash, type/size/licence, source/provenance, privacy/retention metadata and resolvability |
| Profile | Versioned presentation settings/course defaults with lesson overrides; no mutation of evidence |
| Export | Input lesson revision, profile, included steps/assets, redaction projection, exporter version, checksum/validation result |
| Review finding | Stable ID, source/step/revision link, objective or heuristic, detector/reviewer, severity/status and explicit human decision |

These are design fields, not a shipped schema. Implement a bounded contract with
roundtrip tests before broadening it. Bound sizes and reject unknown major versions.
Preserve supported optional extension data on roundtrip, or explicitly warn/refuse
when an older adapter would lose it. Splitting/merging creates documented identities
and lineage; reordering retains IDs. Numbering is presentation state.

## One source, multiple projections

Capture writes immutable evidence and media through the authorized collection
policy. Review builds editable steps referencing that evidence. Original and clean
views, differentiated profiles, guides, worksheets, videos, typing recipes and
interactive packages are derived projections. They share steps/assets/export
validation, without copying raw evidence into every output unnecessarily.

Generated descriptions carry the exact observations supporting them. A coordinate
click supports a click statement; it cannot establish node creation or a successful
test. Godot state differences can improve wording, but observation vs inferred
cause must remain visible. AI is optional, explicitly configured and reviewable;
offline deterministic drafts remain available.

Native source→edited time projection stays authoritative for footage selection.
Keep helper reader time, encoder stage time, control-clock flags and Godot active
time separate. A saved manual cue anchors onset only. Live bridges require an
explicit handshake/session relation and measured bounds, including pause/resume
and disconnect. Event order uses producer sequence/interval semantics; rounded
milliseconds alone cannot safely reclassify half-open boundary membership.

## Privacy architecture: suppress first, redact derived outputs carefully

This is a proposed stronger policy, not an assertion that current global drivers
already enforce application scope. Before broadening capture, explain and implement
these behavior changes incrementally with actual producer/storage tests:

1. Check authorized application/window/field scope before collecting or retaining
   data where available. Unknown identity is a reported limitation; restricted
   scope must suppress unsupported collection. A chosen video window does not
   automatically scope a global input driver. Stop/suppression status must be
   visible and immediate, independent of video recording controls.
2. Retention exclusions and redaction are distinct from non-destructive timeline
   trims or blur. Apply an explicit export projection to all dependencies, including
   code baseline/deltas, journals, caches, thumbnails, captions, logs, guide drafts
   and exported projects. Reconstruct a safe baseline when redacting text history;
   do not merely omit a delta and leak the same content in the next snapshot.
3. Preserve originals unless the user explicitly requests sensitive-data deletion.
   Clearly show what remains stored and what only becomes absent in an export;
   explain backup/shared-library implications. Append-only raw journals are not
   edited in place by ordinary lesson cuts. A retained sanitized copy gets a new
   identity/provenance and explicitly declared evidence gaps.
4. Pre-export inspection inventories included data, scope gaps and redaction status.
   Automatic detection is assistive; never claim perfect password/sensitive-field
   detection. No telemetry, cloud uploads or third-party AI processing by default.
   Existing upstream network/model/update/AI behavior needs an explicit audit;
   local-first does not imply the current app never makes network requests.

## Export and offline delivery

Implement exporter interfaces over a validated lesson revision, profile and safe
asset resolver. HTML/Markdown guide outputs share source extraction and relative
assets; PDF uses an explicitly tested offline print/render path. Native MP4/GIF
and screenshots reuse compositor/export services where appropriate. The standalone
player reads a minimized safe manifest and local assets; no Electron/editor,
account, CDN or runtime server requirement. Escape arbitrary instructions/code,
validate resource types and paths, and test file:// behavior on target browsers.

Checksummed packages must enumerate transitive dependencies before writing and
verify after writing. Treat symlinks, absolute paths, `..`, drive/case collisions,
oversized media and malformed manifests as explicit errors. Existing legacy pack
is useful reuse, not proof of current editor-document portability. Content-addressed
library blobs are an optional later storage implementation behind asset resolution;
never delete shared sources until reference/retention policy is established.

## Recovery, adapters and acceptance

Every capture producer reports capabilities, scope, time basis, gaps and stop
semantics. Godot semantics remain an opt-in application adapter; other apps use
the same envelope without Godot-specific assumptions in core steps/exporters.
Prefer supported APIs and bounded snapshots, not invasive global hooks. Missing
information stays unavailable, not converted into complete evidence.

Keep committed source media/segments recoverable after interruption, report missing
tails, and retain take lineage through retakes. Application checkpoints use
disposable copies and differ from editor undo checkpoints. No automatic replacement
may overwrite a real lesson project. Human and agent use the same validated actions
and handoff metadata; visible learner routes require actual UI demonstrations.

Acceptance combines schema/transformation tests, actual disk save/reopen, malformed
inputs/privacy canaries, accessible UI interactions, offline export/re-import,
native render/record trials and Windows/KDE physical testing. Synthetic, headless
and browser evidence must be labelled separately. Real Enemy lesson production,
deliberate retake and cross-OS transfer remain product acceptance targets.
