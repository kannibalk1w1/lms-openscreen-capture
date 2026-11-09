# Portable selected lesson package v1 — 9 November 2026

Actual [review37](CLAUDE_ROADMAP_REVIEW_37_2026-11-09.md) accepts36d30d24
with no High/Medium. [Review38](CLAUDE_ROADMAP_REVIEW_38_2026-11-09.md) accepts
17bed4e69963ac8d78ad3a9d44954c05f1e8bd87 and closesL37-1 with no new findings.
Independent110focused/6files,0skip,8predicate/operand controls and real CLI
forgery/benign verification pass. Production unchanged by follow-up; no fresh
full/build/native acceptance implied. Coordinator owns the private checkpoint
push before verified GUI import/reseal or player dependency work.

Implementation design/scope, resumed from accepted/pushedf0eacc95 after review36
closesM35-1/L35-1. This is a derived static lesson/media directory, not a native
editor project, portable course or timed player. Existing legacy pack rejects
current editor projects; this additive format does not change that behavior.

Explicit CLI/MCP arguments select one saved lesson, step IDs, code inclusion,
image policy, each existing MP4 AND its receipt, and an existing destination.
No recovery/directory search, source-project read, implicit grants, relinking,
refresh, pin upgrade, network asset, rendering or ZIP extraction. A receipt path
never grants its output path: video paths are separately selected arguments.

The existing lesson schema/guide renderer supplies a derived editable file and
HTML/Markdown. Only selected steps remain. Evidence, extensions, media pins and
refresh history are omitted deliberately, with visible format scope; original
lesson ID/revision/step association remains. Image inclusion explicitly opts into
existing external image-source project IDs/hashes/timing needed by that schema;
otherwise images and that metadata are omitted. Code also needs explicit include
and existing output inclusion. Originals remain unchanged. Native source projects,
raw media, journals, fonts, branches and editable native annotations/audio are not
included; source references are marked external/unavailable. Supplied MP4s are
already flattened derived media, never presented as editable source projects.

The package has fixed-name guide/lesson files, safe relative JPEG/MP4 paths,
versioned strict manifest and a receipt written last. Counts/bytes are bounded;
Windows-safe ASCII path rules reject traversal/absolute paths/reserved names,
case collisions and duplicates. No overwrite, no symlink traversal. Checksums and
current identity/readback checks precede completion; incomplete folders stay
private and are disclosed only under current authority. These are bounded local
observations, not authenticated signatures or immutable filesystem snapshots.

Every supplied video receipt must match the selected lesson target/current pin
and actual bytes; stored claims alone do not validate media. The accepted sample
and full-decode validator runs again. Portable media metadata retains only the
relative binding/dimensions/timing and current output checksum, not source pin
history/project hashes or the original receipt. Association is matched authored
metadata, not proof of source visual content or original-project revalidation.
Both audio verification flags remain false. MP4 package acceptance is Linux-only.

Verification reads only the explicit package root, enumerates only its bounded
known tree to refuse hidden/unlisted dependencies, checks all checksums and guide
projection, validates the derived editable lesson/JPEGs and decodes included MP4s.
It never probes original paths. Reopen uses the verified derived editable file
with existing lesson-open/query tools; MP4 bindings stay package metadata, not
native project media selections. GUI package picker/import, native project pack,
automatic repair, timed player and full course portability remain later work.

Delivery commands, exact tests/proof/evidence and remaining limits follow below.

## Delivered command and format contract

```sh
openscreen lesson package /explicit/lesson.json --step STEP_UUID \
  --code exclude --images exclude \
  --media STEP_UUID /explicit/selected.mp4 /explicit/range-export.json \
  --out /explicit/existing-directory --json
openscreen lesson verify-package /explicit/moved-package-directory --json
openscreen lesson query /explicit/moved-package-directory/lesson.openscreen-lesson.json --json
```

Repeat `--step` and the complete three-argument `--media` group when needed.
Code and image policy are mandatory choices. Existing authored output exclusions
still apply. `--images include-external-provenance` deliberately retains original
image-source project identifiers, hashes and timing needed by the existing editable
image schema; it does not fetch that project. `--code include` copies only selected
code permitted by existing output settings. No automatic privacy redaction of
explicitly included text, JPEG metadata or MP4 bytes is claimed.

MCP tools `createLessonPackage` and `verifyLessonPackage` expose the same shared
service/strict contracts. HTTP requires existing authenticated MCP-edits permission
for both arbitrary-file export and verification before selected-file inspection.
Stdio keeps explicit-launch rights. No editor WebContents/session/grant is
manufactured, and no editor IPC permission is weakened. Tool results are bounded
summaries/relative links, never instructions, code or source pins. Caller-provided
explicit media/receipt paths authorize those files only; imported receipt paths
never supply authority. Native rendering is not invoked by packaging, so existing
process-wide compute/export ownership is unchanged.

The private UUID folder contains `index.html`, `lesson.md`, the existing-schema
`lesson.openscreen-lesson.json`, optional `assets/<uuid>.jpg`, optional
`media/<step-uuid>.mp4`, `lesson-package.json` and last-written
`package-receipt.json`. Guides link included videos directly and display scope
limits; those links are ordinary file navigation, not a timed player. The strict
manifest declares `format: openscreen-portable-lesson`, version1 and
`guideContract: openscreen-static-guide-portable-v1`, exact payload inventory and
relative media bindings. Completion binds the actual manifest bytes/hash. No
original receipt, native `.openscreen` project, raw journal or pin history is copied.

Bounds:32 selected steps,4 MP4s,128MiB per MP4,256MiB aggregate payload,64 payload
files,64KiB manifest/receipt,16MiB source/editable lesson,32MiB per static payload.
JPEG bounds remain the existing lesson schema's1MiB decoded bytes/pixel checks.
Only fixed directories and lowercase safe ASCII relative names are accepted;
traversal, absolute/drive/backslash names, Windows device names, trailing dots/spaces,
case collisions, duplicates, symlinks and unlisted files/directories are refused.
Known-tree enumeration is bounded and restricted to the explicit package root,
not original-source discovery. Originals are selected with accepted no-follow
readers; binary copying checks the opened descriptor's selected inode before any
content read, bounds/hash checks throughout and current identity afterward.

The v1 guide rendering contract is retained by the committed public byte fixture
under `electron/lesson/__fixtures__/portable-lesson-v1/*.fixture`. Tests materialize
only five known files, not an archive/extractor. Future guide/style changes must
retain v1 verification or introduce a new explicit contract/version; do not silently
regenerate that fixture to bless a compatibility break. Its initial normal `.json`
fixture was changed by the formatter and correctly refused by integrity tests;
those initial bytes/logs remain in evidence. Opaque `.fixture` suffixes preserve
exact bytes without changing formatter configuration.

## Integrity, stale work and cancellation

A supplied range receipt must be bounded/current, match the selected original
lesson ID/revision/step and current v2 source-pin claims, and match the explicitly
selected video's current bytes/hash. Frame expectations use accepted programme
arithmetic; native diagnostic duration uses the existing1e-6 tolerance and never
substitutes for stored samples/full decode. Both source input and copied MP4 are
validated. Reopening checks checksums plus canonical static/JPEG projection and
re-decodes included video; re-signing checksums around a script-bearing guide or
corrupt H.264 data does not certify it. Valid alternative authored content can be
re-signed by its owner: this is local integrity, not origin authentication.

Final checks cover original metadata/receipt/media identities, copied output
identities, exact tree, directory authority and live caller permission. Identical
bytes on a replaced inode are stale during an operation. Completion is synchronous
and exclusive in one JS turn after final checks; later cancellation does not revoke
an already completed operation. These are bounded same-user filesystem observations,
not kernel snapshots or authenticated/immutable history. Errors are fixed and
bounded; stale caller/input/destination scope receives no artifact path. Otherwise
unfinished private files remain inspectable, without a completed receipt.

CLI signal/stdout lifetime and actual SDK request/connection lifetime are reused.
HTTP disconnect and server shutdown drain actual pending work; cancellation cannot
pretend to interrupt the existing decoder's unsupported AbortSignal path. Its
actual bounded subprocess settles before the tracked package operation settles.
Parallel package operations have distinct UUID folders and independent cancellation.
No separate native compute lock or render authority was introduced. Stdio SDK
cancellation has no response for its cancelled request; stateless HTTP cancellation
still requires aborting its active request rather than a separate notification.
Terminal results are supported; a package-specific progress UI is not delivered.

## Actual proof and validation

Unique preserved evidence:
`../openscreen-evaluation/portable-package-2026-11-09T1724Z/`.

The production Electron CLI creates a package with the existing static guide and
an actual selected cut/speed MP4. The proof copies that folder to a fresh location,
moves all selected original inputs away, then uses a fresh SDK stdio process to
verify and reopen/query the derived lesson. Actual shipped verification checks
45 stored samples,45 decoded frames and1.5seconds; both audio flags remain false.
Missing asset, changed manifest and checksum-re-signed corrupt bitstream probes
are refused, then restored content verifies again. Stdio also creates a derived
static package from the reopened lesson. Original inputs' hashes stay unchanged;
excluded code/evidence/journal/pin-history canaries are absent from selected output.

The final-build proof is in `final-native/`; the initial draft proof remains at the
evidence root, with its earlier build/format fingerprint. The initial startup
launch was rejected before execution because its concurrently created foreign cwd
was not ready; that tooling log is retained. The committed real startup smoke is
run after the production build from a confirmed foreign cwd, with isolated profiles
and no decoder/APP_ROOT environment hint. No user app is terminated or cache purged.

Production service tests cover code/image policy and transitive assets, moved-source
reopen, exact inventory, bounds/Windows-safe names/case collisions, receipt/pin/target
and byte matching, symlink ancestry, source/destination/output replacement, forced
write errors, no false completion, actual validator refusal, lifetime/parallel
cancellation and privacy canaries. Authenticated SDK HTTP tests exercise actual
registered permission-before-FS, redaction, revocation and pending-decode draining.
Actual CLI parser/command tests cover mandatory choices and explicit media tuples.
Mocks isolate authority/control only; they are not native media acceptance.

There are13 distinct assertion-killed controls:12 single barriers and one paired
initial/late canonical-directory check. They pin current pin/target/hash, generated
guide bytes, final output/manifest/completion identity, late tree observation,
pre-read descriptor identity, stale artifact suppression, duplicate inventory and
fresh decode. Both canonical checks enforce the same invariant, so no independent
single-guard closure is claimed for that pair. Controls are repeated after the
final guide contract change; original rounds/logs remain, source bytes restored.

The first broad run passed6058tests and missed one unrelated chat clipboard button
while its session loaded. The untouched4-test file passes alone and beside package
tests; no unrelated application/test code is changed. Its initial full log remains,
and final validation below distinguishes the follow-up run rather than hiding it.
Final **6060tests/450files,0skips** pass with `npm run test -- --maxWorkers=4`
(126.22s); the earlier default-worker full run is retained separately
(6058pass/1unrelated clipboard timing miss). Focused **220/10,0skips** pass, plus
the unchanged clipboard file **4/1** and package-adjacent **72/4** rechecks. Both
root/test TypeScript, lint35baseline warnings, docs37 and i18n15locales/1265literal
keys pass. Production Vite and committed non-root real startup smoke pass:63MCPtools,
normal CLI registration/runner reached, expected absent-project validation error.
Final built transport/video/link proof matches the reachable build fingerprint.
No installer/native rebuild or physical/platform pass is claimed. Two broad runs
are recorded (initial transient and final material-completion run), not one clean
default-worker run.

Preservation extends original112 native artifacts,1485 prior evidence files and76
reports/user work. Imported inventories remain; the coordinator's pre-existing
HEADLESS_SELECTED_MP4 summary change at acceptedf0eacc95 is separately recorded and
verified against git. No original report or external LMS workflow report is edited.
Native source/addon stay unchanged at SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

## Scope gaps and next dependency

This is CLI/MCP packaging and verification, with existing explicit derived-file
reopen. A dedicated GUI package picker/import/export flow is not added. Opening the
derived JSON directly in the existing editor does not automatically verify the
surrounding package; verify first. Its text/code/JPEGs are editable, while MP4
bindings remain package metadata and no native mediaSelection is invented. Editing
that file does not reseal a package; native-source re-export still requires original
confirmed authoring inputs/receipts. An unchanged package can be copied and verified
without those inputs. Re-sealing edited portable media is a separate future slice.

No native project packaging/repair, full course packaging, timed player, caption/
learner-progress integration, GUI clicks/picker, physical capture, installer or
other-platform runtime acceptance is claimed. Included MP4 may retain embedded
source/silence audio; its streams/timing remain unverified. Static guide navigation
is inherited. Optional integrations remain off and fixtures work without Godot.

After coordinator exact-SHA Claude review/fixes/private push, the next bounded
choice is verified GUI package import/reseal support before accessible timed-player
navigation/media loading and learner progress. Full native-project/course packaging
remains separate. Existing review36 resolver nits, N31-3/N31-4/N29-3/N27-3 and N34
smoke/trace limits remain; startup regression and earlier failed proof history are
preserved. No next phase or implementation-worker push before review.
