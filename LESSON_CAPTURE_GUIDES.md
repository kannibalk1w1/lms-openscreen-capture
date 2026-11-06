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
with their dimensions, SHA256 and explicit source project/ruler/document fingerprint.
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
The selected original ruler time, projection precision and full saved-document
fingerprint are retained. Source coordinates are not inferred from UTC or flags.

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
  revision, included step IDs and verified byte sizes/SHA256 of the written files.

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
