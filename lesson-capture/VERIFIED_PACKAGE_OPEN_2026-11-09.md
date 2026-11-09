# Verified package inspection and static editable copy — 9 November 2026

Resumed from reviewed/pushed `b0463121c1b2a8988ee48e717c27375ea01413f9`.
Actual [review38](CLAUDE_ROADMAP_REVIEW_38_2026-11-09.md) accepts17bed4e6,
closes L37-1 and has no new findings. The original review and every previous
report/proof remain preserved. This slice awaits coordinator exact-SHA review
and private push; the worker does not push. Main remainsfd2775e2.

## Deliberately bounded user workflow

Lesson guide now has a separate **Portable lesson package** panel. With a current,
clean registered editor project, choose **Open and check a package folder**. The
native directory picker selects the only permitted root. Cancellation causes no
package reads or output. The strict existing v1 inspector checks the bounded tree,
canonical/no-symlink paths, lesson and JPEG schema, complete inventory/checksums,
policy/privacy projection, exact static guide projection and every MP4 using the
actual stored-sample/full-frame decoder. Linux acceptance remains fail-closed.
No project, source, recovery store, HTML dependency or original receipt is found
or granted implicitly. Copied packages work while original authoring inputs are
unavailable. The package format/schema and existing CLI/MCP commands are unchanged.

Only after verification does the panel receive the validated derived lesson,
opaque owner-bound token and bounded video step/frame/duration metadata. It renders
plain React text/code and validated embedded JPEG data, never packaged HTML,
Markdown HTML, iframes, native projects or executable code. No local-protocol,
recursive filesystem, source or MP4-path grant is made. Videos are inspected and
listed, not played; their bindings remain in the package and are never silently
dropped. The UI calls the view a read-only snapshot checked when opened, explicitly
not a signature, source approval or promise that external files stay unchanged.

For a **static package only**, **Save a new editable text and image copy** opens
an explicit native save dialog. It does not replace current lesson work, even when
that lesson has unsaved edits. It rechecks the original package identity and runs
strict verification again, then parses a new lesson identity with derived-from
provenance. All included steps/code/embedded JPEGs and explicit image-source
provenance survive exactly. No original project/hash capture, refresh or source
lookup occurs. Choose an existing canonical destination outside the package;
existing files are never replaced. Private stage/readback/parse checks precede
exclusive atomic publication, with final current-session/source/destination/stage
checks and no intervening async gap. Errors/cancellation can retain a private
`.partial` file; no completion or package receipt is written for that stage.

The saved file is a new editable lesson, **not a resealed package**. Its immediate
derived-from pointer names the inspected package lesson; the original authoring
provenance chain remains in the unchanged package rather than being copied as history. Use the
existing **Open editable lesson** action explicitly to edit it, then existing
lesson save/export controls; the original package and receipt never change.
Packages with any video refuse this copy action in both service and UI, before
opening a save picker. The UI explains that media-preserving edit/reseal is a
remaining prerequisite. There is no misleading editable native project claim.

## Authority, lifetime and cancellation

`registerLessonWorkflow` binds the new production registration to the existing
required live dirty provider and `editorRangeSessions`. Every start requires the
registered current editor main frame and current selected project/session before
the picker or file inspection. No caller-provided import/destination path is
accepted by these IPC routes. Strict UUID operation and token inputs are bounded.
One operation and one inspected capability are retained per owner; new selection
replaces the old capability. Copy checks its token, original session and unchanged
package identities; wrong owners/tokens/subframes cannot use or revoke it.

Project reselection, dirty state, navigation, crash, destruction, panel cancellation
and unmount invalidate pending results/capabilities. The UI also snapshots project/
document/generation, releases late tokens and never attaches a stale result to the
current authored lesson. Native directory/save dialogs cannot be programmatically
closed: cancellation ignores the eventual result and ownership stays busy until
it settles. Cancellation during decoder work prevents a checked response, but does
not pretend to interrupt FFmpeg; the owned operation remains until actual decoder
settlement. No compositor job is started or parallel render lock introduced.
Fixed error keys expose no imported paths/stderr. Only a successful current explicit
save returns its chosen bounded output filename. No partial-path disclosure occurs.

The verifier now additionally returns an **internal** current-input assertion over
its existing pinned root/metadata/payload identities. Public CLI/MCP summaries do
not expose this function or gain authority. Repeated checks protect later copy
publication against same-byte inode replacement as well as content changes.
The inspector remains bounded local readback under same-user filesystem trust;
it is not an immutable OS snapshot or authenticated manifest.

## Validation and evidence

Evidence directory: `../openscreen-evaluation/package-open-2026-11-09T1900Z/`.
Pinned Node22.22.1/npm10.9.4 throughout. Production tests call actual
`registerLessonWorkflow`, the real package inspector and copy transaction, not a
parallel registration. Electron dialog/native decoder doubles isolate race tests;
real decoder/transport coverage is separate below.

- Focused165tests/9files pass,0skips: production route/service31, panel8,
  existing guide-dialog16 and prior package/privacy/CLI/MCP/schema/output110.
- Both root and test TypeScript pass after explicit typing of UI mock functions.
  Initial test-only mock inference errors/logs remain; no production type defect.
- Lint passes with35existing warnings; i18n passes15catalogs/1283literal keys.
  New package strings use explicit English fallback in all14 non-English catalogs;
  human translation has not been performed. Catalog parity is not translation QA.
- Production Vite build passes; mandatory real production headless CLI runner and
  SDKstdio initialize/listTools startup smoke passes using the final build.
- Full suite:6108tests/453files pass,0skips, one material-completion run with
  `npm run test -- --maxWorkers=4`. Docs check37files passes; diff whitespace clean.

Seven independent single-guard controls (`mutation-results.json`) assertion-kill:
main-frame gate, actual workflow dirty-provider wiring, same-owner token equality,
owned cancel operation ID, service video-copy refusal, destination outside selected
package, and exclusive no-overwrite publication. Source bytes restore exactly.
No redundant checks are counted as independent kills. The initial mutator stopped
before K2 because its first search string matched two call sites; the corrected
control mutates only the package production wiring. Initial logs/script remain;
only the seven final controls count. Existing review37 privacy forgeries and retained
v1 byte fixture pass unchanged; this slice does not alter the guide contract.

Real Electron proof (`electron-proof-final.json`, driver `electron-proof-complete.cjs`)
uses a real BrowserWindow, final built production preload and bundled production
workflow/services with an isolated saved project. Directory/save dialogs are stubbed.
It copies static and previously actually rendered45-frame packages to a fresh
location with original selected authoring inputs already offline; opens/checks/query,
saves/reopens a static copy, preserves its original lesson/receipt bytes, verifies
video timing/full decode (45samples/45decoded frames/1.5s), retains video bindings,
refuses video copy, refuses tampering and dirty/foreign callers, and makes zero
source-grant calls. Supplementary internal inspector evidence records actual decoder
results; direct service evidence is not substituted for the real IPC route proof.

This is a transport harness, not full-app GUI clicks or native picker acceptance.
No physical capture, new render, audio verification, installer, Windows/macOS or
full-course acceptance is claimed. Initial harness failures occurred before route
execution because an external scratch bundle could not resolve dependencies;
rebundling dependencies fixes the harness. Both initial logs remain; no product
bug is inferred. The mandatory startup smoke separately exercises full production
main registration and real headless runner, not just the lesson seam.

Preservation rehashes imported1485/76 and extended1873/78 inventories,125previous
follow-up files, review38, the external user LMS report and original native evidence.
The package design doc already had a coordinator-added accepted-review prefix at
b0463121; its old report-inventory hash is rebased only after comparing exact Git
checkpoint bytes, with both hashes/reason retained. Historical report body stays
unchanged. Native addon remains SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
No other worker, process termination, cache purge or unauthorized branch/action.

## Remaining dependency and acceptance gaps

Next after coordinator exact-SHA Claude review/fixes/private push: a separate
media-preserving editor/reseal transaction for video-bearing derived packages,
retaining explicit relative bindings/policies and fresh full verification without
source-project paths/old receipts; then bounded media access/player dependencies.
Static new-copy functionality is complete within this deliberately narrower subset.
Full portable native projects/course packaging, editable source annotations/fonts/
audio/branches, player controls/captions/progress and audio timing remain open.
CLI/MCP new-copy parity is not added; existing package/verify/query/open operations
remain accepted. N37 opaque-error/equivalent-guard and N31-3/N31-4/N29-3/N27-3
limits remain documented; no unsupported picker-control or navigation grants added.

## Completed validation account

Final focused165/9 and full6108/453,0skips; root/test TS, Vite, lint35baseline,
docs37 and i18n15/1283 pass. Seven final single-guard assertion kills and exact
source restoration; real Electron IPC static-copy/video verification proof and
required production CLI/SDKstdio startup smoke pass. No native rebuild/tests are
claimed because native source/addon bytes did not change. All original report and
evidence inventories pass their documented rehashes. This coherent prerequisite
is locally committed for independent coordinator review; no next phase or push.
