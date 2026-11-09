# Media-preserving derived package reseal — 9 November 2026

Resumed from accepted/pushed `5d73f835257c50144823257caf26ba465331c107`.
Actual [review40](CLAUDE_ROADMAP_REVIEW_40_2026-11-09.md) accepts93a84456 and
closesL39-1 with no new findings. Original reports, earlier evidence and external
user work remain unchanged. This slice awaits coordinator actual exact-SHA Claude
review/fixes/private push; no worker push or next player phase. Main staysfd2775e2.

## Delivered scope and deliberate format limits

The Lesson guide package panel can now explicitly **Edit supported text and order
as a new draft**, then **Save a new package with retained media**. This is separate
from the accepted static editable-copy action, which still refuses video packages.
The input package remains a checked read-only snapshot; editing uses the existing
`LessonManifest`, `reviseLesson`, `moveStep` and title input component. There is no
second lesson model, native project import, original source lookup or playback.

Supported changes: lesson/step titles, instructions, existing code text, image
alt descriptions and the order of the complete original step set. Step IDs,
membership, image IDs/data/source metadata, existing code language/presence,
inclusion settings, original derived pointer and other fields must stay exact in
the submitted draft. New IDs, deletion/exclusion/addition, media reassignment,
asset replacement/addition and policy changes refuse before the destination picker.
Thus reordered steps retain their exact MP4/JPEG bindings by stable ID; code/images
excluded from the original package cannot be resurrected by an imported draft.

Entering edit demotes **every** step to draft. Main validation also requires draft
status rather than trusting the renderer. Edited text/code is not evidence that
retained screenshots/video demonstrate the new instructions: the UI explicitly
requires review and the existing guide renders the draft status. No old approval
is inherited. Reordering changes guide numbering/links deterministically, not video
bytes, frame timing or image associations.

Editing does not replace the independently authored lesson or video project.
Opening another package, static copying and closing its snapshot are disabled
while a draft exists; discard is an explicit action. Closing the surrounding guide
asks before discarding a package draft. Switching video projects invalidates and
discards this session-scoped unsaved draft, with that limit stated in the UI; this
is not autosave. During reseal, editing is frozen and guards reject stale change
handlers. A submitted draft snapshot and generation are kept separate from late
responses. Success clears the saved draft and names the new folder; open that folder
explicitly to continue. Cancel/error/replacement cannot attach a stale completion.

## Shared service, authority and publication

The new `lesson:package-reseal` production handler belongs to the existing package
registration in `registerLessonWorkflow`. It accepts only operation UUID, owner token
and a bounded lesson snapshot. It shares the existing one-operation/one-capability
owner/session registry, main-frame checks, required live dirty provider, lifecycle,
release and owned cancellation. It grants no renderer-selected path or arbitrary
asset/source access. Main only knows the submitted snapshot; it does not pretend
to own unsent renderer edits. UI freezing/current-generation checks complement the
main session/operation/capability checks.

After validating permitted edits in memory, an explicit parented native **existing
directory** picker chooses the destination. Cancel means no source reinspection or
output. The destination cannot be within the source package; canonical parent and
pinned identities reject symlinks/ancestor replacement. Only then does the service
re-assert the open-time identities and run the strict source v1 inspector again:
all known files/checksums, privacy/policy, exact guide projection, JPEGs and actual
stored-sample/full-frame MP4 decode. Original authoring projects, raw media, old
range receipts, recovery stores and native grants are never queried.

`publishLessonPackage` factors the **existing** v1 writer out of the original
CLI/MCP creation service. Both original authored-media packaging and reseal use
this one implementation for safe relative names, size/count/collision bounds,
private UUID directories, no-overwrite writes, descriptor-checked binary copying,
manifest inventory, output readback/decode and receipt-last publication. Existing
explicit-file create/verify transports and retained v1 fixture remain compatible.
No parallel writer, extractor, source-pin refresh or fabricated range receipt.

Reseal derives a fresh lesson ID/revision0 with a direct pointer to the inspected
package lesson/revision and the ordered stable step IDs. It retains the exact
verified scope and known relative MP4 metadata/bytes, plus included JPEG/code,
then regenerates guides/lesson/inventory and completion receipt. Stored frame count,
video duration, byte checksum and full decode are validated again on the **copied
output**, not inferred from metadata or a previous receipt. Both audio flags remain
false. Original association metadata remains an authored claim from the source
package, not proof that new teaching text matches the unchanged demo or a new
source-project attestation. Raw pins/history/evidence/extensions/project paths and
original range receipts remain absent. Image external source identifiers/timing
survive only under the already explicit include-external-provenance policy.

Every material await rechecks authority and original input identity, including
same-byte inode replacements. The final current checks, manifest/payload identity
assertions and synchronous exclusive receipt write share one turn. Native picker
and decoder work are not claimed to be forcibly interruptible: cancellation stops
later publication and waits actual settlement before ownership reuse. No compositor
render occurs, so no parallel native-render lock/job is introduced. Private failed
folders stay inspectable without a completion receipt. Fixed errors disclose no
untrusted paths/stderr; this IPC returns a chosen output path only on current success.
No original file or receipt is overwritten.

## Tests and controls

Evidence: `../openscreen-evaluation/package-reseal-2026-11-09T1933Z/`.
Pinned Node22.22.1/npm10.9.4. Final focused206tests/10files pass,0skip: actual
production registration/service66, package panel12, actual React-to-production
registration integration1, guide dialog17 and prior package/privacy/CLI/MCP/schema/
output110. Coverage includes reorder/text/code/alt with video/JPEG/no loss; unsupported
IDs/step removal/addition/pins/evidence/extensions/assets/policy/approval/code;
excluded code/image resurrection; wrong owner/token/subframe/session/dirty provider;
picker cancel, release/lifecycle/project/asset races; decode cancellation holding
busy; same-byte source replacement; corrupt copied output and decoder refusal;
source/destination symlinks; stale draft completion, explicit discard and close.

Seven selected controls all assertion-kill with exact production source restore:

| Control | Boundary pinned |
| --- | --- |
| E1 single | Exact supported-field comparison; changed image provenance cannot pass |
| E2 single | Complete step membership before picker (later format guards also refuse empty output) |
| E3 single | Draft status mandatory; old approval cannot pass |
| E4 paired | Both reseal open-time session checks removed; no-picker assertion kills before deeper source authority refuses |
| E5 single | Actual output decoder invocation; successful input inspection alone is insufficient |
| E6 single | Final output readback identity after decode; raced output cannot receive a receipt |
| E7 single | Destination outside source package; no nested derivative may alter its inventory |

Count is6single plus1paired assertion kill, not8independent kills. Existing layered
session/source checks are retained and not overclaimed as individually necessary.
Filtered control skips are not ordinary focused-test skips. Original v1 byte fixture
and coherent re-signed privacy forgeries pass unchanged.

Both TypeScript checks, production Vite, lint/docs/i18n and the material-completion
full suite are recorded in the completion account below. New catalogue wording is
English fallback in all14 non-English catalogues; human translation is unperformed.
Initial UI test relay returned synchronous cancel/release values unlike real IPC;
its log remains and the relay now returns promises. Initial test-only invalid
`ByRoleOptions.exact` typing is fixed with a name regex. During implementation a
cancelled draft could have left a hidden draft blocking reopen; the new regression
pins discard/reopen recovery before completion. No accepted parent defect inferred.

## Actual disposable transport and video proof

`transport-proof.cjs` runs final production Electron CLI packaging from a foreign
working directory with no FFmpeg/APP_ROOT hint, selecting synthetic lesson/two steps,
one actual selected MP4 plus explicit original receipt, existing JPEG and code.
It copies the package to a fresh location and moves all selected inputs/initial
package directories offline. A real BrowserWindow and built preload submit edited
instructions/code/alt and reversed order through the production workflow and reseal
service. Dialogs are stubbed; no GUI/native-picker clicks are claimed.

The new folder then verifies through a **fresh production CLI process and actual
SDKstdio transport**, and its editable lesson reopens through query. Stored/video
full decode verifies45samples/45frames/1.5s, two reordered steps, one JPEG, edited
code, all statuses draft and both audio flagsfalse. Original package and selected
lesson/video/receipt hashes remain unchanged; zero source grants are requested.
Missing JPEG, coherently re-signed invalid MP4 and coherent excluded-code policy
forgeries all refuse with fixed invalid errors. Real IPC destination cancellation
and dirty/foreign ownership refusal pass; cancellation during pending output decode
is separately a production-route mocked-decoder race test, not a real process-kill
or physical test.

Final Vite/UI cancellation/close polish is followed by the REQUIRED actual production
CLI runner and SDKstdio initialize/listTools startup smoke. Main bundle/entry hashes
match those used by the successful transport proof; UI-only polish does not replace
or expand its transport evidence. This is not full-app GUI clicking, physical capture,
installer, Windows/macOS, native project portability or audio acceptance. Native
addon remains unchanged; no native rebuild/test or new media render is claimed.

## Remaining scope and next item

The shared service is transport-neutral, but **CLI/MCP reseal commands are not added**
in this GUI slice. Existing create/verify/query tools inspect/reopen the new v1 output.
No source-project editability, new step/assets, policy expansion, media replacement,
audio/annotation/font editing, full course format or player is introduced.
N39 existing-destination partial/capability-drop/nonspecific-reselect nits remain
on the old static-copy path; the new package action writes unique folders. Older
N31/N29/N27 limits remain documented. Next after coordinator exact-SHA review/fixes/
private push is bounded verified media access/player dependency work (or explicit
headless reseal authority parity), retaining these readback and draft-review limits.

## Completion account

Final206focused/10files and6149full/454files pass,0skips; root/testTS, final Vite,
lint35baseline, docs37 and i18n15/1301 pass. REQUIRED final real CLI/MCP startup
passes with unchanged main hashes after UI polish; six single and one paired
assertion kills restore exactly. Exact preservation identities are in
`validation-summary.json` and `preservation-final.json`. Original reports, native evidence and inventories,
external LMS workflow report, addon and main/private-main remain preserved.
No worker push, other worker, real lesson edit, user-app termination, cache purge,
new checkout, reset or manual stash/discard. Stop for coordinator independent review.
