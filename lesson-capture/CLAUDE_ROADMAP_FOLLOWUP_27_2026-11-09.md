# Review27 bounded follow-up — 9 November 2026

Coordinator disposition: actual [review28](CLAUDE_ROADMAP_REVIEW_28_2026-11-09.md)
accepts897ddcebabd16c1c572f0d99c3274afb5ac5677d with no new High/Medium/Low.
L27-1/T27-1/N27-1/N27-2 closed; N27-3 remains documented/tested fail-closed.
Independent146focused/12files, both TS, Vite, lint/i18n and real Electron IPC
re-probe pass;24mutants yield21kills and3known survivors. Original worker
account below is preserved; no GUI-click/native-picker/physical acceptance added.

Actual [review27](CLAUDE_ROADMAP_REVIEW_27_2026-11-09.md) accepts exact
1dad5a7ccf62032d0e628806524cae77400a8e32 with no High/Medium. Its original report
is preserved verbatim and included in this checkpoint. This follow-up addresses
L27-1/T27-1 and N27-1/N27-2 within the same source-confirmation scope; N27-3 remains
an explicitly documented fail-closed navigation limit. Exact-SHA follow-up review
and the private feature push belong to the coordinator. No new roadmap phase,
native rendering/export integration or other worker is started.

## L27-1: independent downgrade boundaries

`attachLessonMediaSelection` now returns the current lesson unchanged if a
reference-only version1 selection would replace a current version2 content pin.
The reference-only UI handler independently refuses an already confirmed target
before planning; its disabled button remains a third presentation guard. Explicit
remove remains available. Initial v1 reference attachment and same-project v2
confirmed refresh remain valid. Existing stale request matching still prevents
pre-pin callbacks from replacing a later pin or its history.

A direct helper regression supplies a matching `previous` pin so the new model
check is tested independently of stale matching. The UI test invokes the actual
captured `onAttach` callback despite the disabled button, requires no planner call,
then invokes a pre-pin callback and saves the unchanged v2/history. The test also
asserts the button remains disabled. These controls distinguish model, handler,
button and stale-target behavior rather than relying on Chromium click semantics.

## T27-1: independent checks and contract controls

New tests pin absolute source declarations before approval/resolution, actual
returned document ID before planning, initial standalone service authority before
lesson validation, saved-reader ID before entry to the project queue, and cancel
main-frame refusal while the owner's operation remains active. Existing owner and
operation-ID cancellation tests remain; a new wrong-owner lifecycle case confirms
that another window ending cannot cancel the active owner’s operation. Existing gated-reader checks after async
project reads remain covered.

Two dependency-isolated service contract tests exercise the gated reader with a
foreign backend-requested ID and service authority invalidation as the asynchronous
backend settles. They use an injected backend spy intentionally: the real current
backend always asks for the selected project and repeats a final check. These
controls test the service's independent reusable contract; they do not claim an
observed real-backend race or a foreign-ID path in today's identity implementation.
The saved-reader prequeue test similarly pins rejection order; the lower-level
`fileFor` ID check already prevents a filesystem traversal when that guard alone
is removed. These distinctions explain the formerly redundant mutation survivors.

Post-canonical repeated approval (M3), URL selection versus capture checks (E4),
paired renderer current checks (U1/U7) and the other renderer defence-in-depth
survivors in review27 are not newly claimed as independently killed. The original
review's48mutant account remains unchanged historical evidence.

## N27-1: test the actual registration implementation

The production registration block formerly embedded in `handlers.ts` is extracted
to `registerEditorRangeAuthoring`; `registerIpcHandlers` calls that function with
the same actual DocumentService, process dirty-state callback and existing
`readableApprovedPath` function. The extracted production code owns the saved
reader choice, authority creation, open-project selection, marker ownership and
navigation/crash/destruction listeners. Tests call this same implementation with
real disposable saved documents and sources, exercising saved-versus-open reads,
main-frame selection, dirty/approval callbacks, invalidation/reselect and older
sender cleanup. They do not construct a parallel authority callback.

The callback providers and WebContents/IPC emitters remain simulated test seams;
this is not an entire running `registerIpcHandlers`/global-approval-store test.
Review27's real production Electron IPC proof is valuable independent evidence of
the original wiring, including real URL canonicalization and sender events. It is
not repeated here and does not prove GUI clicks, native pickers or physical use.
The original8jsdom tests exercised real registered callbacks/services but rebuilt
their authority; they must not be described as testing the old `handlers.ts`
wiring. The new shared-registration tests strengthen that exact gap.

## N27-2/N27-3: wording and navigation limits

All15catalogs now say a lesson operation is already running, rather than claiming
a still is rendering. The14non-English values remain English placeholders; no
human translation or language acceptance is claimed.

No navigation authority is broadened. `did-start-navigation`, including a hash
change, invalidates confirmation and cancels active work. A hash also differs from
the exact registered URL. Clearing the hash alone does not re-establish the
project session, and selecting a project while still on the changed URL is refused.
Recovery requires restoring the exact registered app URL **and** explicitly
reselecting the project, or reopening the editor on its normal URL. Reloading a
changed hash URL alone is not promised to recover. Today's editor has no hash
routing. The production-registration regression exercises the hash event, failed
reselect, exact URL restoration, continued refusal, then successful explicit reselect.
This remains a theoretical usability limitation, not silent acceptance of a new page.

## Validation and preservation

Final focused validation passes146tests/12files,0skip. Both TypeScript
configurations, production Vite renderer/main/preload build, lint35existing
warnings, docs37files and i18n15locales/7namespaces/1257literal keys pass.
The one material-completion full suite passes5829tests/436files,0skip.
`git diff --check` and108relative Markdown links also pass.

[Unique follow-up evidence](../../openscreen-evaluation/r27-followup-2026-11-09T1205Z/)
contains exact command arrays, logs, exits/toolchain/timing JSON and preservation
inventories. `focused-final` includes the original10focused files plus
`mediaSelection.test.ts` and the actual production-registration test. The final
positive run follows source restoration; all mutation source hashes match exactly.

15selected guard controls are test-assertion kills,0survivors,0timeouts and0load/
transform failures: model downgrade, reference handler, C1disabled button, M4source
absolute path, M15actual project ID, M16reader callback ID, M17initial authority,
M14final authority, cancel owner, D3saved-reader prequeue ID, production saved-reader
choice, production dirty-state callback, production approval callback, I2cancel
main-frame and wrong-owner lifecycle cancellation. `mutations.json` records14;
`owner-lifecycle-cancel.json` records the additional independent owner control.
The callback-ID/final-authority and prequeue controls have the dependency/order
scope explained above; no claim is made that all16review27 survivors now represent
independent runtime bypasses or are closed by these15controls.

The first mutation runner stopped on a non-unique text anchor after6restored
controls; its script/logs are retained under `initial-mutator-run/`. The anchor
was narrowed before the counted14control run; no harness precondition failure is
counted as a kill. The later owner control is separately logged and restored.
No source/test change after the production build affects shipped code.
Pinned Node22.22.1/npm10.9.4 are used. No paid API/auth/configuration changes,
manual reset/stash/discard/new checkout, user-app killing, shared cache purge,
upstream/main/release/Actions/publication or push occurs. The commit uses
process-local `HUSKY=0` after explicit lint checks to avoid lint-staged's automatic
backup stash; repository hook/configuration files remain unchanged.

All original reports, review27,112prior evidence files and the user-owned external
workflow report are preserved:58report/user-report inventory entries match their
hashes, and33original authoring-proof/log files remain retained and inventoried. Main/private-main stay
fd2775e2dbc540306b46085eb0301fa06a6a3aaa. Physical GUI/picker/capture, other platforms,
native rendering/audio and portable-course/timed-player acceptance remain outside
this follow-up. Next prerequisite remains shared native render-job ownership,
then explicit destination/progress/cancellation and accepted materializer/actual
validator integration; coordinator review/fixes/push must precede that work.
