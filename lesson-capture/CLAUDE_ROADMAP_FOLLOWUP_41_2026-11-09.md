# M41-1 retained package drafts and explicit recovery — 9 November 2026

Actual [review41](CLAUDE_ROADMAP_REVIEW_41_2026-11-09.md) examines exact
`9479172bc92db76a062224b94816df044a71aa1e` and reproduces MediumM41-1:
routine reseal failures discarded in-progress edits and the main capability.
This fixes that reproduced data-loss behavior before private push. The original
report is preserved verbatim; closure awaits coordinator actual exact-SHA follow-up.
No security/certification defect was found in the parent and none is inferred from
the test harness diagnostics below. Main/private-main and native addon are unchanged.

## Draft lifetime and authority are separate

The panel retains its existing `LessonManifest` draft independently of the live
verification token. Its bounded states are: checked snapshot; local draft/current
capability; local draft/reopen required; and a busy frozen operation over either.
A recoverable failure never clears typed title/instructions/code/order/alt text.
Project/document/dirty changes cancel/release old authority, but keep the original
read-only source snapshot and visible local draft, with a clear reason saving is
blocked. Local editing/discard remain available; dirty/current-project restrictions
still block reseal and reopening authority. There is no automatic re-open, refresh,
source relink, pin capture or rebase.

Only a current successful new publication clears the saved draft. Explicit discard
and the existing confirmed guide-close path also clear it. Errors and cancellation
keep the dirty indication, so close confirmation remains active. While a native
picker/hash/decode operation is settling, the draft stays frozen and main ownership
stays busy. Context/generation checks ignore late results, including a failed old
panel request after a new panel draft exists. This is in-memory recovery, not new
autosave or process-crash durability; original manual recovery behavior is unchanged.

## Retained capabilities do not renew source authority

Only the reseal route opts into failure retention; old static-copy behavior is not
silently widened. Main returns a bounded `capability` disposition alongside its
fixed error code. A recoverable destination/tool/edit refusal can retain the **same**
original capability if its session and original pinned identities still hold.
No replacement snapshot or grant is captured in the failure path. Source or session
changes revoke it and require explicit reopen. The main owner state is located only
after main-frame validation, including refusals that happen during the live dirty
check before an operation starts; clearing dirty cannot resurrect the old token.

During active cancellation, main checks the original session but deliberately does
not re-read files after cancellation/native-picker cancel. It may retain the old
**frozen identity**, not claim a fresh verification. Every explicit retry rechecks
that old identity and re-runs normal source/output validation before publication;
a missing or replaced source still refuses. Plain native picker cancellation returns
before any source reinspection/output as before. Main never releases the operation
until the actual pending work settles; no forced decoder/picker interruption claim.

An expired draft offers **Reopen the same package and keep edits**. This uses the
existing explicit native directory picker and strict package inspector under the
current registered editor/session. Open responses now include an opaque SHA256 of
the canonical validated v1 manifest: lesson/payload hashes, complete media inventory,
scope and timing are all bound. It is a local matching digest, not a signature,
historical source pin or filesystem permission. Public CLI/MCP summaries are unchanged.

The renderer accepts a reopened capability only when that digest exactly matches
the draft's original checked source. A different or tampered inventory never
replaces the original snapshot or rebases edits: its new token is released, the
exact draft remains visible, and saving stays blocked. Restoring/selecting the same
intact package then explicitly reopening can resume. A successful re-open does not
change any draft fields. Every reseal still uses the unchanged strict supported-edit
validator, v1 writer, output sample/full decoder and receipt-last checks.

No original package/project/media/receipt is overwritten, no old receipt certifies
edited bytes, no arbitrary path/media grant is introduced, and all new steps remain
draft. Video/image association and policy constraints from the parent remain intact.

## Production registration and UI tests

Final **219tests/10files pass,0skips**. The core recovery coverage uses the actual
`registerLessonWorkflow`, real handlers, package inspector/copy writer and React
panel. Native directory callbacks are exercised rather than a parallel authority.
The actual codec is replaced only in deterministic fixture/race tests; real video
and app coverage is separate below.

Six React-to-production cases cover successful output plus invalid destination,
tool unavailable, cancellation during pending output decode, tampered source and
dirty-session races. Every refusal preserves exact instructions, code, order and
alt text, with no completed output. Retained cases retry explicitly with the same
capability and exactly equal submitted lesson. Source bytes are restored **by the
disposable test fixture only**, then a required explicit matching reopen permits
retry; the application performs no restore or rebase. A dirty race similarly
requires an explicit fresh open. Output retains the original MP4/JPEG bindings and
source/authored data stay unchanged.

Additional real main-route tests pin unsupported-edit refusal before picker with
corrected retry; source identity failure cannot be revived merely by restoring
bytes; dirty failure cannot be revived merely by clearing dirty; active picker
cancellation performs no late source inspection, and a later retry still refuses
its missing frozen source. Unit tests pin mismatched reopened inventory rejection,
matching reopen recovery, exact retained code/text, no implicit re-open, explicit
discard, cancellation busy state and old-request isolation. Prior privacy forgeries,
retained-v1 fixture and source/timing/owner/lifecycle suites stay in the focused set.

## Seven independent assertion controls

Evidence: `../openscreen-evaluation/review41-followup-2026-11-09T2004Z/`.
All7single-guard controls assertion-kill with exact source restoration:

| Control | Deciding assertion |
| --- | --- |
| C1 discard draft on error | Production/UI destination refusal must retain two edited step controls |
| C2 disable main capability retention | Recoverable destination refusal must retain authority for explicit retry |
| C3 discard on context change | Production/UI dirty race must preserve every draft control |
| C4 discard on cancellation | Pending decoder cancellation must keep the draft while remaining busy |
| C5 bypass exact reopened inventory match | Different inventory must keep saving blocked, without replacing the draft |
| C6 omit original pinned identity check on non-cancel failure | Tampered source must require explicit reopen |
| C7 omit pre-authorize owner lookup | Dirty refusal must revoke the old main token rather than revive after dirty clears |

No compile failure, tool timeout, filtered skip or expected redundant survivor is
counted as an assertion kill. N41-1's existing reinspection/re-pin redundancies and
older layered checks are retained; this follow-up does not churn them.

## Full production Electron reproduction and actual video verification

`full-app-verified/full-app-proof.cjs` launches the **full final production app**
from a foreign cwd with neither decoder nor APP_ROOT override. It creates a disposable
project through the real native bridge, opens the actual editor through production
`switch-to-editor`, and opens Lesson guide/package UI using Playwright Electron/CDP.
The source is a copied two-step video/JPEG/code package whose original authoring
inputs are already offline. No editor session is manufactured by the harness.

CDP fills visible draft instruction/code/alt controls and reverses step order. Main's
native directory dialog is stubbed to choose the source package as destination.
The real route refuses it, the output destination remains empty, and every visible
value is byte-equal to the typed values (screenshot retained). The same UI explicitly
retries a valid destination and succeeds. A fresh CLI verifies the new package:
45stored samples,45decoded frames,1.5s, MP4/JPEG bindings retained, all steps draft,
audio flagsfalse. All source-package payload/manifest/receipt hashes and the
independent authored project data stay unchanged; picker count3 (open/fail/retry).

This is real renderer/main production registration and CDP DOM interaction, not
physical OS input or native-picker acceptance. Dialogs are stubbed; no capture,
new native render, audio, Windows/macOS, installer or headless reseal acceptance.
The required foreign-cwd production CLI runner and SDKstdio initialize/listTools
startup smoke also passes with hints cleared. No new paid/auth/provider operation.

All initial driver logs are preserved: HUD-close handoff rejected a pending renderer
promise; a strict textarea label selector did not match the live control; comparing
whole bridge packets included intentionally different request IDs/timestamps. The
final driver awaits the real editor window, uses stable label prefixes, and compares
project **data**, not transport envelope metadata. These are harness corrections,
not reproduced application defects. The successful final proof alone is counted.

## Validation, preservation and disposition

Pinned Node22.22.1/npm10.9.4. One material-completion full suite:
**6162tests/454files pass,0skips** (`npm run test -- --maxWorkers=4`). Both root/test
TypeScript, final production Vite, lint35baseline warnings, docs37 and i18n15/1305
pass. New strings remain English fallback in14non-English catalogues; no human
translation claim. Exact commands/results,7controls and actual proof are retained.
No native source/addon change, rebuild or native regression acceptance is claimed.

Imported1485/76, extended1873/78,125follow-up,267prior-slice and32prior-review39
inventories,77additional reports, original112native evidence and the external user
LMS report are preserved. The entire preceding reseal evidence directory is pinned
separately. Original review41 is included verbatim. Addon stays SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`;
main/private-main stay`fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.

M41-1 is addressed and awaits actual exact-SHA independent review. N41-1/N41-2 and
older nits remain outside this correction; static-copy destination-exists behavior
is unchanged. No CLI/MCP reseal command/player/new schema or format is added.
Stop at this validated local checkpoint for coordinator review/private push and
the requested full-review handoff decision; no next slice/writer is started.
No supported subscription availability/reset signal was encountered, and no model,
provider, credentials or quota assumptions were made.
