# Coordinator review40 disposition

Actual [review40](CLAUDE_ROADMAP_REVIEW_40_2026-11-09.md) accepts exact
93a84456f0bce70bcde666e45049cf66a176c369; L39-1 CLOSED, no new findings.
Independent170focused/9files pass,0skip; R10/R16 singles are redundant and
paired removal fails all5new matching cases. Preservation inventories match.
Original worker evidence below remains its own tests; no new full/build/native
or Electron proof claimed. Coordinator private push precedes next reseal slice.

# Review39 open-time capability tests — 9 November 2026

Actual [review39](CLAUDE_ROADMAP_REVIEW_39_2026-11-09.md) accepts exact
`8ae837666e0d7df64446985e366acf6a5c40eae3` within its bounded verified-open/static-copy
scope, with no High/Medium and Low L39-1: missing regression coverage for a package
capability opened under an earlier project session. The original report is
preserved verbatim. This follow-up changes tests and current status documents only;
production/schema/format/native/error behavior remains unchanged. Coordinator
exact-SHA review/fixes/private push is next; no worker push or reseal/player work.

## Added production-route coverage

Five new tests extend the existing `electron/ipc/lessonPackageOpen.test.ts` fixture.
The fixture calls actual `registerLessonWorkflow`; its Electron `ipcMain.on`
registration is now captured as well as `handle`. Project transitions invoke the
**actual registered** `AI_EDITION_OPEN_PROJECT_CHANNEL` listener, which calls the
real `editorRangeSessions.select` and replaces session identity even for the same
project ID. No alternative authority service or reconstructed listener is supplied.
The existing required live dirty provider is the same production callback.

Four table cases open a real created static package, then perform one transition
**before the first copy attempt**:

- Same-project reselect (`p` to `p`).
- Different project (`p` to `other`).
- Different project and return (`p` to `other` to `p`).
- Close and reopen (`p` to no project to `p`).

Every stale copy returns the fixed invalid response **before any save picker**.
There is no new output or partial file; exact package manifest/receipt/editable/
HTML/Markdown/JPEG bytes and a separate disposable authored lesson file stay
unchanged. Returning to the original project ID cannot revive the old token.
The switch-back case proves this before any failed request has cleared the token;
subsequent old-token retries also refuse. A new valid package open produces a new
token and successfully saves a new editable copy with all included steps/images,
while package/authored bytes remain unchanged. This is a meaningful positive
control; an existing-destination error cannot mask a successful stale copy.

The fifth test opens first, then makes the **live main dirty provider** true before
copy. It refuses without a save picker. Clearing dirty/reselecting cannot reuse
the old token, and fresh open/copy succeeds. Existing real-production owner,
main-frame, lifecycle, stale-picker, cancel/settlement, source identity and UI tests
remain in the focused set. The separate authored-file check is a disposable file
preservation control, not a new claim to inspect renderer-owned unsaved state.

## Exact guard controls and limits

Six control runs are recorded under
`../openscreen-evaluation/review39-followup-2026-11-09T1921Z/`:

| Control | Result |
| --- | --- |
| R10: remove immediate open-time session assertion before service call | Survives; R16 still checks at service entry |
| R16: remove open-time session assertion inside copy authority | Survives; R10 still checks before service call |
| R10+R16: remove both checks together | Assertion kill: native save picker was called once, expected zero |
| S1: remove real registry session-object identity comparison | Independent single-guard assertion kill |
| S2: remove actual production selection listener's session replacement | Independent single-guard assertion kill |
| S3: wire package workflow dirty provider to false | Independent single-guard assertion kill |

Counts: **3 single-guard assertion kills, 1 paired assertion kill, 2 expected
redundant single survivors**. Exact production source bytes restore after every
control and match their before hashes. This is not six independent kills.

The paired mutant still refuses later when the inspector's pinned input assertion
rechecks its original authority **after** the save picker. Therefore this control
pins the independent **before-picker** boundary; it does not claim that removing
these two guards produces a certified copy. The no-picker assertion isolates the
missing regression precisely, rather than accepting an unrelated later refusal.
The registry identity/listener controls fail because stale sessions would otherwise
reach copying. N39-3's reinspection/post-picker redundancies are not churned or
claimed independently covered by these new mutations.

## Validation and existing real evidence

Pinned Node22.22.1/npm10.9.4. Final focused170tests/9files pass,0skips, including
36 production registration/service cases, the existing UI/guide cases, package
privacy forgeries and retained-v1 fixture. Both root and test TypeScript pass;
lint passes with35existing warnings; docs37files pass; diff whitespace is clean.
Filtered control runs intentionally skip unmatched tests and are not counted as
full focused runs. The initial36-case run and all control logs are preserved.

No full suite, build, Electron/native or startup-smoke repeat is warranted for this
test/docs-only follow-up. The prior full6108/453 and build/startup/IPC/native-decode
proof belong to8ae83766. Actual reviewer39 separately built that exact parent and
ran full-app Electron from a foreign directory, including O8 same-ID reselect
refusal and production CLI/SDKstdio startup. Its directory/save dialogs were
stubbed; O8 is real transport behavior, not GUI/native-picker clicks. This follow-up
pins that existing behavior without claiming a newly reproduced defect.

The parent proof remains bounded: safe React text/JPEG inspection, static editable
new copies, video packages read-only with bindings retained, Linux sample/full
video decode, no audio verification or source-project portability. No GUI clicks,
physical capture, Windows/macOS, installer or human translation acceptance added.

## Preservation, nits and next dependency

Imported1485/76, extended1873/78,125earlier follow-up files,267parent-slice files,
review38/user report and original112native evidence (111payloads plus inventory)
are rehashed unchanged. Original review39 has SHA256
`03eca1cdeb7bedb7197972d4a87f1d7093106bcccc15b6941f575fd2d6985bdb`.
The parent inventory already records the authorized b0463121 accepted-review prefix
in the package design document; no additional historical report edits are made.
Addon stays SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`;
main/private-main stay `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.

N39-1 existing-destination partial stages, N39-2 capability drop on failed copy,
N39-3 layered redundancies and N39-4 nonspecific reselect errors remain unchanged
and documented. Coordinator actual exact-SHA Claude follow-up/fixes/private push
precedes a separate media-preserving edit/reseal transaction, then player work.
No format/API change, other worker, push, real lesson edit or process/cache cleanup.
