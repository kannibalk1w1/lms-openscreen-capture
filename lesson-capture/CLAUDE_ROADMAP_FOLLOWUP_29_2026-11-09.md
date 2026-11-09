# Review29 authority and legacy-GIF follow-up — 9 November 2026

Actual [review29](CLAUDE_ROADMAP_REVIEW_29_2026-11-09.md) accepts exact
6821c77602731723f2fe1fa3f98c9035f5510440 with no High/Medium. The original report is
preserved verbatim and included in this checkpoint. This bounded follow-up
addresses T29-1/L29-1 before coordinator exact-SHA Claude review/fixes/private push;
no selected-MP4 integration or other roadmap phase starts here.

## T29-1: mandatory production frame authorization

`registerLessonHandlers` now requires its authorizer in TypeScript and refuses a
missing/non-function authorizer at runtime before installing any IPC handler.
There is no optional call, optional authority guard or optional post-render check.
Generic static save/open/recovery/planning contracts remain unchanged; tests now
supply explicit authority when constructing the complete handler registration.
The internal LessonService still accepts an injected reader/renderer as before;
this change closes the production IPC registration omission, not a new public
service or filesystem API.

Production main now calls `registerEditorLessonHandlers`. That shared production
registration function requires the process dirty-state provider and always binds
frame authority to the existing registered-editor/current-project session. Tests
exercise this exact function, not a reconstructed authority callback: unregistered
callers, live dirty-state changes and valid generic editor frames. The main
callsite cannot compile if its required provider is omitted. Runtime omissions
also fail before any handler is installed. No preview/global state is refactored.

Independent controls cover still main-frame refusal before service invocation,
request-project versus session-project refusal before service invocation,
post-render session reselect/dirty checks without relying on owner-registry
invalidation, and NativeRenderInvalidatedError-to-project-changed mapping while
session authority remains current. The post-render cases are service/registration
contract tests using a deferred image result; they do not claim observation of a
physical/native renderer race. Both checks remain relevant: dirty changes do not
need a project-selection event. Production source/destination permissions and
source confirmation/pin semantics are unchanged.

## L29-1: caller-ID capability and legacy GIF settlement

The actual native-bridge registration and actual compositor service are tested
with a native-addon seam lacking GIF controls. A caller-ID GIF must refuse before
any native GIF call (B5). A legacy no-ID GIF is allowed through the documented
uncancellable fallback, but owns the shared compute lease: lifecycle invalidation
cannot free it, a competing frame batch and MP4 cannot start before settlement,
its late native completion is refused as CANCELLED, and the next operation starts
only afterwards (C6). No capability fallback or product behavior is weakened.

A retained real Linux Node/N-API proof masks only the GIF control API of the
existing addon, while running its actual GIF encoder. The ordinary capability
path refuses before compute; the legacy path returns cancel:false, continues
native work after invalidation and blocks frames/MP4 until actual settlement.
Its completed2frame GIF remains inspectable while certification is refused; the
shipped FFmpeg fully decodes2frames. A subsequent controlled GIF completes2frames.
Source and addon bytes are unchanged. This is a masked-capability proof, not a
run of an old binary, real Electron IPC, GUI clicks or physical capture.

## Nits and the first-run observation

N29-1: independent production exportMulti/exportGif subframe refusals are tested.
N29-2: new controls pin handle re-invalidation after a synchronous start callback
invalidates its owner, and progress suppression after invalidation independently
of active/destruction checks. The existing reservation-before-start, cancellation,
settlement, identity and reentry tests remain.

N29-3 remains the documented bounded usability limit: private main-generated IDs
for stills and legacy exports still consume the4096per-window allowance. They do
not need renderer replay protection, but changing accounting/global ownership is
outside this narrow follow-up. No claim is made that this nit is fixed. Equivalent
N3/N6/N7/J11 guards retain the review's redundant classification.

The review's very first Electron observation remains **unreproduced**, with a
response-parsing bug and no main-process logging. Its original report and retained
scratchpad evidence are not rewritten, discarded or relabeled as a defect. Five
subsequent logged reviewer runs refused all contenders; this follow-up found no
deterministic cause. The source still reserves synchronously before start and
holds native ownership through settlement. New deterministic synchronous-
invalidation/progress tests exercise the identifiable gaps, not the unexplained
observation. No new real-Electron probe or physical acceptance is claimed here;
review29's logged real IPC/native results remain independent historical evidence.

## Validation, preservation and next scope

Final focused validation passes228tests/18files,0skip. Both root/test TypeScript,
production Vite renderer/main/preload, lint35baseline warnings, docs37files and
i18n15locales/7namespaces/1257literal keys pass. The one full suite, warranted by the
production registration contract change, passes5858tests/439files,0skip.
No installer/package/native rebuild is claimed.

`run-check.py` retains exact command arrays, logs, exit codes and pinned toolchain
versions for the18focused files, both TypeScript configurations, lint/docs/i18n,
Vite and full suite. Explicit `npm run lint:fix` precedes final validation.

13single-guard controls yield12test-assertion kills and1required-contract compile
kill,0survivors/0timeouts/0load failures. The assertion controls are the required
runtime authorizer, still L1/L2/L3/L4, actual production editor-authority hook,
B5caller-ID GIF capability, C6legacy GIF lease, B1/B2export main frame, J7start
re-invalidation and J9progress suppression. Omitting the actual main callsite's
required dirty-state provider (H1) produces TS2554 at `handlers.ts`; it is counted
as a compile-contract control, not a test assertion or transform/load failure.
`mutations.json` records each outcome and restored production source hashes before
the final positive tests/build. This is not a claim that review29's equivalent
lease guards become independent checks.
Pinned Node22.22.1/npm10.9.4 are used. Unique logs, commands, source restore hashes
and GIF proof artifacts live in the [follow-up evidence directory](../../openscreen-evaluation/review29-followup-2026-11-09T1320Z/).

Preserve all prior reports/inventories/evidence and the external LMS workflow
report. No paid API/auth/config changes, push, worker, reset/stash/new checkout,
user-app killing, shared cache purge, native source/binary edit or real lesson edit
occurs. Commit uses process-local HUSKY=0 after explicit lint to avoid automatic
backup stashes. Main/private-main stay fd2775e2dbc540306b46085eb0301fa06a6a3aaa.

Next remains the authorized selected-step MP4 GUI action: explicit native picker
before new source observation/render, source-pin/timing checks, scoped progress/
cancel/status, stale lesson/step/project refusal, preserved incomplete artifacts
and actual full-video validation before completion. Coordinator review/fixes/push
must precede that slice. CLI/MCP parity, portable courses, timed player, verified
audio and physical/other-platform readiness remain open.

The real proof uses the unchanged addon at SHA256
5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca, Vulkan/NVIDIA4070Laptop
and its GIF encoder; source/old source copies are unchanged. Its CJS harness only
injects app-path constants and an import.meta.url definition for bundling the
production service. No native source/binary edit or Rust-test rerun is claimed.
Preservation inventories verify112prior native-evidence files and62original
report/user-report entries, including the verbatim review29 and original ownership
report. The three prior authoring-slice evidence directories are retained and
inventoried (141files). Reviewer scratchpad artifacts are not edited or purported
rehashed here. No owned GUI app/server is launched; the Node/N-API proof exits
normally, with retained output and logs and no user process killed.

Final `git diff --check` and117relative Markdown links pass. No production code
changes follow the successful checks/build/full suite; final edits only record
these results. T29-1/L29-1 are implemented and independently controlled as described,
awaiting coordinator exact-SHA follow-up review rather than self-claimed approval.
