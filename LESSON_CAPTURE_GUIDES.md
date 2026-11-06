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
save-dialog overwrite confirmation. Unsaved changes are not automatically recoverable; explicit manual recovery
copies described below restore only the revision actually saved.
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
remain open; content-language/direction and three reading presets are added in slice16 below.

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
provider lacks screenshot/hotkey/focus control. PDF, standalone learner player,
portable video/project dependencies, automatic semantic step recognition, source
relink/re-extraction, recovery/autosave, lesson undo, CLI/MCP endpoints, custom profiles and tutor review
approval workflow remain separate work. Original reports/evidence remain intact.
Exact-SHA Claude review is pending until an actual report is delivered.

Historical next item at slice13 was profiles/review/query. Slice16 below delivers
a bounded subset; safe editable-draft retention and shared agent access follow.
Do not build additional app adapters.

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

## Reading profiles, language and source review (slice16)

A bounded optional `output` block (version1) now travels with an editable lesson.
Older lessons without it retain Standard/en/automatic direction and include their
images/code by default. This build preserves the block on save/reopen; older strict
readers may reject newly added fields rather than silently losing preferences.

Three appearance presets are available: Standard18px/1.6 line height, Large
print24px/1.8, High contrast20px/1.7 with black text/white background. They change
only output presentation, never application integration or capture permission.
Content language uses Intl's canonical language-tag validation; it does not
translate text or guarantee a matching voice/font is installed. Direction can be
automatic, LTR or RTL. English-generated source-review labels explicitly retain
`lang=en`/LTR; user-authored content uses the selected language/direction. Code stays
LTR. Source image pixels are unchanged, with meaningful alternative text still
required when included. Visible captions are aria-hidden to avoid repeating the
image alternative in the accessibility tree.

Separate inclusion switches remove optional code and/or illustrations **from all
derived output dependencies**, not merely CSS visibility. Excluded image refs,
alternative descriptions, image bytes/source metadata and assets are absent;
excluded optional code is absent from HTML, Markdown and the derived manifest.
The original editable lesson keeps its complete content, and Save editable copy
still saves every source step/asset. These switches do not redact the same words
from instructions or other fields. Review included pixels/text before sharing.
Exports and editable copies retain disclosed evidence/parent correlation metadata.
The export receipt records actual output settings and selected source draft/empty
instruction counts, alongside checksummed file inventory and lineage.

The dialog can query source titles (bounded case-insensitive Unicode-normalized
matching), source review label, source evidence kind, or steps with advisory checks.
Checks report draft status, visibly empty title/instructions and missing image
alternatives; they are not tutor approval, achievement or privacy certification.
Step IDs/order/source evidence remain unchanged by filtering. Select matching steps
explicitly replaces export selection. Hidden selected steps block export until the
selection matches visible rows or filters are cleared; filtering cannot quietly
export hidden selections. Clear filters to reorder the full source lesson.

Markdown now distinguishes derived/source revisions (explicit N12-1 assertion).
Leading instruction indentation is emitted as character references, preventing it
from turning into an indented code block. No CommonMark reader is installed:
generated syntax is tested, rendered Markdown-reader acceptance remains open.

Actual file workflow: an existing native-pattern lesson is opened without project
reads or native rendering, output settings are saved/reopened, then four derived
variants are exported and independently reopened. The image/code-excluded variant
has zero images/assets directory and no code/alt/pixel canary in any derived file;
the full source copy retains all content. Artifacts are outsidecheckout in
`lesson-output-profiles-fixture/`, with original/settings copy, four guide folders,
verified receipts, probe summary and browser evidence.

Actual Chromium `file://`, offline=true: **four variants × two widths (1100/360px)**,
zero external requests/scripts/horizontal overflow, correct language/direction and
18/24/20px computed font. Each retained illustration has exactly **one accessible
alternative name** in the CDP accessibility tree; its visible caption is excluded
there. Large-print mobile and Arabic RTL/high-contrast screenshots were inspected.
This is browser semantic/layout proof, not a screen-reader, visible Electron,
physical-input or cross-platform accessibility certification. Synthetic Arabic
fixture text exercises direction/glyph rendering, not translation quality.

Full milestone: **5,537 tests / 417 files**,135.91s; focused63/5 overlap. BothTS,
Vite renderer/main/preload,Biome35existing warnings,i18n1220,docs/diff pass.
No Rust/native/helper rebuild
or new physical-capture evidence is claimed; native sources/binaries are unchanged.
Full UI translations, custom course/profile library, PDF, standalone interactive
player, lesson autosave/recovery/undo, CLI/MCP parity and tutor review workflow
remain open. Next: actual review findings, then safe editable-draft retention and
shared review/query/export access as a bounded next slice.

## Filter continuity and explicit local recovery (slice17)

Actual [review13](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_13.md) found no High or
Medium. Its LowL16-1 is fixed: editing a reviewed row can mark it draft without
unmounting the row or losing focus/continued typing. Edited rows remain visible
until the filters change, with a mounted live status explaining the source-label
change. Draft→Reviewed under the Draft filter is covered too. Pure query matches
remain distinct from these pinned visible rows; export can include a selected
pinned row because its current content is visible. Changing filters clears pins.
Busy/save/demotion status regions remain mounted empty before updates. This is
DOM-level proof; real screen-reader/visible Electron acceptance stays open.

Compatibility note N16-1: **every new derived guide manifest contains resolved
output settings, even if its old source lesson has no `output` block**. All such
new guide-manifest exports therefore require a slice16-or-newer strict reader.
Old source files still open and roundtrip unchanged. HTML/Markdown outputs do not
require the editor. Title matching is exactly NFKC normalization plus default
lowercase substring matching, not full Unicode case folding or locale-specific
search: `STRASSE` does not match `Straße`, and `istanbul` does not match `İstanbul`.
Those cases are tested. UI additions remain English fallback in all locale files;
key parity is not translation or linguistic acceptance.

**Local recovery copies are manual snapshots, not autosave.** The dialog displays
its app-data location and quota before Save is enabled. Only an explicit **Save
recovery copy** retains a full source lesson: all steps, images, code and metadata,
regardless of guide exclusions. Acknowledgements identify the copied revision;
later edits still need an explicit save. Merely opening the dialog, viewing status
or editing the lesson creates no recovery folder or file.

Storage is fixed under `app.getPath('userData')/lesson-recovery-copies`. New folders
are mode0700 and files0600 on tested POSIX; nonprivate existing folders refuse new
writes without changing their permissions. UUID filenames cannot select arbitrary
paths. The store admits at most four pending mutations and serializes saves/deletes.
Each copy is validated and bounded to16MiB; total retention is20 recognized entries
or64MiB of logical file sizes. Interrupted `.pending-*` entries count too. Directory
inspection is bounded (21 recognized entries /4096 scanned directory entries);
truncation is explicitly reported as a lower-bound inventory and prevents writes.
There is no automatic purge or expiry. Review/delete unwanted copies explicitly;
unpublished interrupted entries may require managing the displayed folder.

Publication writes a new private temporary file, flushes it, then atomically adds
a new hard-link name in the same folder. It cannot overwrite a prior copy; failed
publication leaves existing copies intact and cleans only its own temporary file
when possible. A crash/cleanup failure may leave private temporary entries. No
power-loss/backup guarantee or directory-metadata fsync claim is made. Source video,
projects, externally saved lessons, original capture evidence and earlier reports
are never modified. Filesystem hard-link/permission semantics on Windows/macOS and
network/removable filesystems remain unverified.

**Show local recovery copies** reads bounded inventory/validated titles. Corrupt
copies are labelled unreadable without returning raw payload in errors. Full
content is read only for an explicit preview; Restore then requires a second,
visible confirmation that it replaces the current unsaved dialog draft. Save the
current draft first if needed. The recovery file itself remains unchanged. Delete
has its own permanent-deletion confirmation and targets only a validated UUID file
in the recovery folder. Source lessons/other copies remain intact. Root/file
symlinks and nonregular/oversized lesson files are refused; deletion unlinks a
selected leaf symlink without following it. These are filesystem guards, not an
OS sandbox against another process with the same user's authority.

Tests cover real concurrent admission/quota, interrupted sparse-file byte accounting,
private modes, failed publication/retry, corrupt/traversal/symlink/root handling,
real IPC fixed errors and full source roundtrip, explicit UI save/preview/restore/
delete/limit flow, and filter focus/continued typing. Ordinary editable-open and
recovery use the same bounded O_NOFOLLOW/O_NONBLOCK reader with post-open regular
file and byte checks. Pending async UI results are ignored after unmount; recovery
is explicit and never installs a late result into another project automatically.

A real disposable file probe starts with no storage, explicitly saves two complete
source copies with guide images/code excluded, reconstructs full code+image in a
fresh store, exports the restored lesson respecting exclusions, deletes only the
selected second copy, and verifies the source/first copy bytes unchanged. The
removed synthetic copy is preserved separately as test evidence. Final artifacts:
`slice-17-*` and `lesson-recovery-copies-fixture-final/`. No project read/native
render is used by this portable recovery→export workflow.

Full milestone: **5,553 tests / 419 files**,137.20s; focused80/8 overlap. BothTS,
finalVite renderer/main/preload,Biome35existing warnings,i18n1243,docs/diff pass.
The final full run followed the revision-acknowledgement/root-guard changes. Native capture/helper/
compositor sources and binaries are unchanged. Shared CLI/MCP query/export access,
autosave/crash recovery of unsaved edits, lesson undo, full UI translations, real
screen readers, physical/visible desktop, Windows/macOS and sustained acceptance
remain open. Next: actual review findings, then bounded shared query/export access
using these same validators/services without new application collection.

Slice18 addresses actual review14 LowL17-1 and baselineB17-1. A pending illustration
cannot replace a restored lesson, including restoration with the same UUID.
Replacement invalidates the generation of pending UI operations; valid frames
attach to the latest authored step without replacing later text/title edits.
Project/document/source guards still apply. Tests deliberately inject callbacks
while rendering is pending; they establish state handling, not physical input.
Actual review14 found no High/Medium at13f7d723 and ran80focused/8 independently,
root/node TypeScript, touched Biome/i18n and two snapshot probes. It did not run
a new full suite, test TypeScript, Vite/native or desktop acceptance. Review15 is
required for this follow-up. Recovery store discovery remains outside CLI/MCP.

Slice18 final validation:85 tests/8files pass,0skipped (62/5 narrower overlap);
both root/test TypeScript, final Vite renderer/main/preload, lint35 existing
warnings, i18n1243 and docs/diff pass. Full5,553/419 is the previous13f7d723
milestone, not proof of this follow-up; the narrow renderer/schema fix uses the
focused suite. No Rust/native source or staged binary changed and no native,
visible desktop, OS input, accessibility or platform acceptance was rerun.
Evidence is `slice-18-*` under the preserved overnight evaluation directory.
Next concrete item: explicit-source-file lesson query and selected guide export
through shared CLI/MCP validators/services, without recovery store access.


Actual review15 at414823d6 found no High/Medium and closed the state races in code.
It also corrected review14 reachability: Chromium151's disabled fieldset already
blocks real Restore/typing while busy; these guards are defence in depth. The
original reports stay unchanged. LowT18-1 identified a vacuous async Restore
assertion; slice19 waits for busy drain and mutation-confirms that the same-ID
regression fails without the generation fence. [Disposition](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_15.md).
[Explicit-file CLI/MCP query/export](LESSON_CAPTURE_COMMANDS.md) now shares this
reader/review/export workflow; it exposes no recovery-store discovery or mutation.


## Slice20: offline reading navigation and print flow

HTML guides now include a contents list, a skip-to-first-step link, Previous/Next
links and a return-to-contents link. Targets use validated stable step UUIDs,
remaining stable when a selected subset is renumbered. Only selected steps appear;
the original lesson, source order and derived lineage stay unchanged. Empty
source titles get a neutral numbered navigation label without rewriting the
source. English system navigation is marked en/ltr; authored link text retains
the chosen language/direction. Focus targets are headings with tabindex=-1, links
have visible focus and at least44px height, and there is no animated scrolling.

These are ordinary local fragment links with the existing restrictive no-script
CSP. There are no scripts, network requests, storage/progress or accounts. This
is a reading guide, not timed video playback, an auto-pausing player, a competence
assessment or a substitute for source review. Markdown and the manifest contract
remain unchanged. A source title/profile language remains the author's choice;
the exporter does not translate or simplify content.

Print hides navigation/skip links, retains profile font sizes, uses16mm page
margins, permits long instructions/code/sections to flow across pages and keeps
headings/figures together where possible. The browser owns pagination; other
browsers/printer drivers, physical printing and screen-reader acceptance remain
open. Print-to-PDF proof is bounded to tested Chromium, not a PDF export feature.

A disposable offline file:// probe uses a copy of an earlier synthetic1280px
native illustration,3 selected steps plus1 excluded source step,80 code lines,
long instructions/CJK title and four profiles (standard, large-print,
high-contrast and RTL). At1100/360px all8 cases support native browser Tab/Enter
skip, Next, Previous and contents navigation with focus reaching the intended
heading. All links are at least44px tall; no horizontal overflow, scripts or
HTTP requests occur. Reduced-motion context keeps scrolling auto. Accessibility
snapshots and screenshots are preserved; they are not screen-reader proof.

Four print PDFs retain all three selected-content canaries and the last code
line, omit navigation and excluded-step canaries, and preserve the chosen font
sizes: standard5pages, high-contrast6, large-print/RTL8 each in the initial run.
Final artifact rerun follows the contents-link display adjustment found during
visual inspection. The mobile and first printed large-text page were inspected.
Evidence: `slice-20-*`, `lesson-navigation-fixture/` and final
`lesson-navigation-fixture-final/` in the preserved overnight evaluation tree.
The initially missing Playwright-default browser was not installed; these tests
use the already installed Chromium151 binary explicitly and record its version.
No Electron/native recording, physical OS input or actual printer was tested.

Slice20 also addresses actual review16 LowL19-1: HTTP lesson-file queries require
MCP edits before filesystem access. Existing CLI/stdio/app-channel authority stays;
no recovery inventory/location/store APIs are exposed. Settings/tool guidance
match this conservative boundary. [Commands](LESSON_CAPTURE_COMMANDS.md) and
[review16 disposition](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_16.md) carry details.

Slice20 validation:full **5,580tests/423files,0skipped**,133.19s; final focused
69/4 overlap. The full run started before the final contents-link display-only
adjustment; final focused tests, offline8-case browser/4-PDF rerun and final Vite
build cover that adjustment. Root/test TypeScript, final renderer/main/preload,
whole lint35 existing warnings, i18n1244 and docs/diff pass. Final PDFs retain the
same5/6/8/8 page counts, selected content and last code line; inspected final
mobile contents alignment is corrected. Browser version151.0.7922.34 is recorded.
HTTP query fixed-versus-read-before-gate mutation logs preserve1 selected test
and its intentional deselections; these are not a second full run.
No Rust/native source/binary changed or native/physical acceptance was rerun.
Actual review17 must assess the committed SHA. Next: remaining explicit step/media
package prerequisites; timed player, captions/progress, autosave and physical/
platform acceptance remain open.


[Slice21 range references](LESSON_CAPTURE_RANGES.md) retain explicit author-selected
saved-project intervals in the full lesson only. Static guides strip unresolved
range metadata because they contain no video. Existing image/code inclusion and
selected-step/lineage behavior remain. Empty source titles now get the same neutral
English StepN label in heading and contents, without changing source or Markdown.
Actual review17 accepted d0949f9f with no High/Medium and closed the HTTP authority
finding; its separate propagation/fallback nits are addressed in slice21. Its
approval does not cover the new range slice.
