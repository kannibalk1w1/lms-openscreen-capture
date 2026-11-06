# Editable lessons and offline illustrated guides (overnight slice 13)

The editor's **Lesson guide** button opens a separate application-neutral lesson.
Godot and every integration can be absent/disabled. This first bounded workflow
adds authored steps or neutral drafts from existing recording flags / typing-section
labels; edits titles, instructions and optional plain code; reorders/removes steps;
marks individual steps reviewed; captures a composed still at the saved playhead;
saves/reopens a new editable copy; and exports selected steps as offline HTML and
Markdown with a minimal editable lesson and checksum inventory.

## Separate editable source, explicit selection

The version-1 `openscreen-lesson` contract is independent of the current editor
project schema. Lesson and step UUIDs survive reorder/save/reopen; numbering is a
presentation projection. Revisions increase on authoring changes. Source labels
retain original evidence kind and clock basis. A flag label never becomes a claim
that an application action happened, and its control clock is never equated with
the native media or Godot clock. Drafting does not copy raw keys, text history,
unsaved buffers, original media paths or application-specific runtime objects.

The lesson contains editable text/code and embedded bounded JPEG illustrations,
with their dimensions, SHA256 and explicit source project/ruler/render-input fingerprint.
The original video project retains editable overlays and source media. A captured
illustration is a flattened composed sample; it is not a replacement for that
project or an editable copy of its annotations. The lesson does not duplicate the
editor's trim/annotation state. Other optional application data can remain in
bounded namespaced extension JSON, preserved by editable save/reopen, with unknown
major versions or unsupported top-level fields refused rather than silently lost.

The guide dialog retains its draft while closed in the same project. It is **not
autosaved** to the video project. Save a separate editable copy before switching
projects or exiting. Opening another lesson replaces the dialog draft. Save uses
exclusive new-file creation and refuses an existing path even after a native
save-dialog overwrite confirmation. A lost/unsaved draft is not recoverable yet.
The video project and original capture reports/journals are never modified.

Export inventory shows selected step/image counts. Review text, optional code,
image pixels and alternative descriptions before sharing. Every selected image
requires a description before learner export. Saving an editable copy retains all
steps, images and extensions; export projects **only selected steps**, referenced
images and supported core metadata, omitting unused assets and extension data.
This is explicit inclusion, not automatic sensitive-content detection or redaction.
Review status is an author's editable claim, not verified achievement/approval.

## Native illustration and time semantics

Capture uses the existing compositor `renderFrames`, shared native clip/scene
builders and the exporter's ruler→programme trim/speed projection. It renders one
frame on the 60fps compositor grid (floor), at most 1280px wide; actual source frame
sampling follows the decoder and is not claimed as physical/frame timing proof.
The selected original ruler time, projection precision and versioned render-input
fingerprint are retained. New captures identify `fingerprintKind: render-inputs-v1`;
earlier stills without that field retain their historical full-document JSON hash. Source coordinates are not inferred from UTC or flags.

Dirty/stale projects, changed project identity, missing source, raw ruler gaps and
trimmed positions fail explicitly. A trimmed ruler position cannot silently become
a still from the next kept frame. One render is admitted at a time. Renderer
callbacks are fenced across project switches and recheck the document after a
native render. The main process resolves the source from the saved document;
the renderer supplies no arbitrary media or write path.

## Portable outputs and limits

An explicit parent-folder picker creates a fresh `lesson-<UUID>` directory:

- `index.html`: standalone responsive HTML, embedded JPEGs, no scripts/CDN/server,
  escaped instructions/code and a restrictive CSP. Opens directly under `file://`.
- `lesson.md`: same ordered steps, relative `assets/<UUID>.jpg` illustrations and
  escaped text/code; Markdown-reader behavior beyond the tested HTML is unverified.
- `lesson.openscreen-lesson.json`: selected editable steps with images embedded,
  independently reopenable even without the original video or any adapter.
- `assets/`: only referenced JPEG bytes; source IDs cannot create arbitrary paths.
- `export-report.json`: completion receipt written **last**, listing input lesson
  revision and explicit parent lesson/revision/selection lineage, included step IDs and verified byte sizes/SHA256 of the written files.

Every written payload is read back and checked before the receipt is written.
No receipt means an incomplete export. A failed folder is preserved for inspection;
there is no rollback/deletion of original evidence. Checksums detect corruption,
not malicious authorship or cryptographic source attestation. The receipt does not
hash itself. Files/directories use private POSIX modes where supported; Windows
permission semantics still need acceptance.

Bounds: 16MiB manifest; 200 steps; 40 images, each at most 1MiB decoded JPEG;
4096px dimension / 8Mi pixels; 12,000 instruction and 40,000 code characters per
step. Image digest and JPEG header dimensions are verified before a browser decoder
sees them. SVG/arbitrary data URLs, traversal-shaped IDs, duplicate IDs, missing
image refs and unsupported versions fail validation. Open reads only a regular,
non-symlink selected file with an actual byte bound. Unknown JSON is never executable.
The first UI strings use English fallback across locale files; translated wording
and output language/profile selection remain open.

## Exact validation and artifacts

Pinned Node22.22.1 on CachyOS. Focused service/contract/IPC/jsdom checks cover stable
identities, revision/reorder, extension roundtrip, selected dependency/canary
exclusion, HTML/Markdown escaping, image integrity, source fingerprint and raw
ruler cut mapping, new-file collision preservation, real filesystem reopen/output
checksums, bounded IPC failures and project-switch response fencing. Full milestone: **5,495 passed / 415 files**, 137.11 seconds, including slice12.
Final focused: **22 tests / four files**, overlapping the full count. Both
TypeScript configurations and Vite renderer/main/preload builds pass; Biome has
only the 35 existing warnings, docs/diff pass, and i18n validates1,197 literal keys.
Rust source/helpers remain unchanged from slice11's134pass/one ignored; no new Rust
coverage is claimed. Staged compositor SHA256:
`a66dbe748a1d8129292e6099cd34ed875bf5ef17eddad5cf082541831e72f446`.

A real **Vulkan NVIDIA RTX4070 Laptop GPU compositor** rendered a **640×366** JPEG
from a disposable 3s MPEG4 test pattern at ruler1.25s. The real LessonService saved
and reopened its editable lesson, then exported one selected step/image with
verified inventory. Source video and fixture originals remain outside the checkout.
No application adapter was installed or enabled. This reuses the staged compositor;
no Rust/native source change or compositor rebuild is claimed for this slice.

Actual Chromium headless opened the final guide from `file://` with **offline=true**:
one step/image decoded, **zero external requests, zero script elements**, omitted
step canary absent. A full-page screenshot was inspected for text/illustration layout.
This is portable-output/browser proof, **not visible Electron/desktop input**.

Artifacts: `../openscreen-evaluation/overnight-2026-11-06/slice-13-*.log`,
`slice-13-compositor-sha256.txt`, and `lesson-guide-native-fixture-final/` containing
source fixture, full editable original, selected guide, completion receipt,
`probe-result.json`, `browser-validation.json` and `offline-guide.png`.
Earlier failed probes are preserved: premature module invocation and unavailable
`libx264` encoder; MPEG4 fixture succeeded. An initial raw-vs-compressed visibility
regression test failed, then passed after the raw ruler/clip-specific trim check.

**Skipped/open:** visible Electron/Godot/OS keyboard/focus/a11y, physical portal/input,
real footage privacy review, physical/native encoder synchronization, Windows/macOS,
sustained/large guide performance and remaining desktop checklist. The computer
provider lacks screenshot/hotkey/focus control. PDF, learner player/profiles,
portable video/project dependencies, automatic semantic step recognition, source
relink/re-extraction, recovery/autosave, lesson undo, CLI/MCP endpoints and review
approval workflow remain separate work. Original reports/evidence remain intact.
Exact-SHA Claude review is pending until an actual report is delivered.

Next: resolve actual review findings, then a bounded accessible output/profile and
review/query workflow over this same contract; do not build additional app adapters.

## Review10 corrections (slice14)

Actual [review10](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_10.md) accepted slice12
and found one Medium in slice13: hashing full document JSON failed for saved
recovered projects because main-process privacy inspection reconstructs fields
and can change after load. Slice14 uses the shared canonical **render-inputs-v1**
fingerprint: actual native scene/clips, project identity, raw clip geometry, trims
and speed projection. It deliberately excludes derived privacy inspection and save
timestamps; it is not an attestation/hash of source media bytes or the whole project.
The renderer still rejects dirty/changed project state; actual render/source edits
still reject old fingerprints. Existing stills retain their original hash meaning.

Two real DocumentService → renderer schema parse/save → reinspection regressions
cover recovery metadata key order and changed receipt inspection. A source-range
edit is rejected in both. A real saved recovered project then reached the actual
Vulkan compositor and produced a **1280×733** still, with editable/derived save and
reopen. The probe aliases only unrelated Electron app-path lookup in disposable
Node tooling; the project service, disk inspection and compositor are real. No
visible Electron capture action or physical recording was exercised.

Markdown now preserves apostrophes, escapes literal setext markers and emits hard
line breaks matching HTML. No CommonMark renderer is installed, so this is tested
as exact generated syntax; reader-specific rendering remains open. Subset exports
receive fresh lesson UUID/revision0 plus immediate parent id/revision/selected-step
lineage. Reopen/edit/re-export keeps distinct identities and original step IDs.
The receipt records the child and parent lineage. Correlation metadata (selected
evidence IDs, project/render fingerprints, parent lesson IDs) is retained for
traceability and explicitly disclosed in the UI inventory.

Raw visibility now reuses `keptRawSpans`, matching source extent and export
projection even when clip geometry overhangs. Optional evidence IDs admit the
producer's full220-character section limit. Title inputs allow clear/retype and
commit on blur; invalid authoring mutations show a bounded error. IPC distinguishes
stale/unsaved project, no kept frame, busy render and existing destination without
exposing exceptions. Open adds O_NONBLOCK and checks the opened file is regular
after O_NOFOLLOW, guarding replacement with a FIFO.

The clock client's limit footer **and final journal state/signal** remain `limit`
after disconnect (real Godot4.7.1 assertion). Original review reports are preserved.
Validation: **118 focused tests / seven files**, bothTS,Vite,Biome35,i18n/docs/diff.
Full5495 remains the prior milestone; no new full-suite claim for this fix. Native
Rust/helper/compositor sources and binaries are unchanged. Recovered guide opens
under Chromium `file://` offline: one image/step, zero external requests/scripts.
Artifacts: `slice-14-*`, `lesson-guide-recovered-fixture/` (real projects, native
still, original lesson, derived guide, receipt/browser summary/screenshot).
All prior physical/visible-UI/platform/performance skips and unsaved-draft/undo/
recovery debt remain open. Fixes await actual exact-SHA rereview. Next: accessible
profiles and focused lesson review/query controls after that review.

## Review11 deterministic fragments (slice15)

Actual [review11](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_11.md) found a new Medium:
scene projection allocates random IDs for extra region fragments across cuts or
clips. A canonical serialization cannot make those values stable. Slice15 injects
a deterministic fragment allocator only into lesson scene creation, shared by the
fingerprint and actual native still render. Original preview/export allocation,
authored IDs and all pixel payload/order remain unchanged. Reserved authored IDs
prevent collisions with generated ephemeral identities. Native scene/Rust ABI is
unchanged; no native rebuild is claimed.

177 focused tests/3files pass, including all seven projection families across
trims/two clips, real saved-project captures on both sides, collision and stale
zoom-edit checks. Two-clip layouts are already materialized per clip and therefore
need no extra-fragment allocation; the test checks that distinction explicitly.
A real saved recovered project with a zoom crossing a trim renders **two Vulkan
stills at0.5s/2s**, first1280×733, then saves/reopens a derived guide. Artifacts:
`slice-15-*` and `lesson-guide-crossing-fragment-fixture/`. Pixel input is a
disposable MPEG4 pattern; no live desktop capture or physical timing is implied.

UI disclosure now explicitly covers **exports and editable copies**. Markdown
labels derived and source revisions separately. Leading whitespace in Markdown
can still be interpreted as an indented code block; format debt is deferred to
profiles, with no injection found. Title rejection/same-tick authoring notes from
review11 remain unproven/unreachable current UI paths, not transactional guarantees.

Full milestone: **5,519 tests / 416 files**,134.66s; focused177/3 overlap. BothTS,
Vite renderer/main/preload, Biome35existing warnings, i18n1196, docs/diff pass.
Native Rust/helpers/compositor binaries unchanged. Exact-SHA rereview is
pending. The original time cutoffs were revoked by the user; work continues under
the [updated authorization](lesson-capture/OVERNIGHT_PLAN.md) and
[current handoff](lesson-capture/CURRENT_IMPLEMENTATION_HANDOFF.md).
