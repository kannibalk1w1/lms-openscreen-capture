# Selected-step MP4 CLI/MCP export — 9 November 2026

Resumption base: accepted/pushed `8a5074f0bfdecbb01b707799c90a428cf05301e3`,
feature `lesson-capture/input-boundaries`; main/private-main remain `fd2775e2`.
Actual [review34](CLAUDE_ROADMAP_REVIEW_34_2026-11-09.md) accepts `f9dcd8df`,
closing L33-1. Confirmation/new-copy persistence and the bootstrap fix are delivered
and pushed. This slice adds actual selected-step MP4 export through CLI and MCP;
Actual [review35](CLAUDE_ROADMAP_REVIEW_35_2026-11-09.md) identified M35-1/L35-1.
[Review36](CLAUDE_ROADMAP_REVIEW_36_2026-11-09.md) accepts follow-up
e45e4b34e649e800a54074690b78178a41e23769 and closes both. Independent real
non-root CLI/stdio exports and foreign-cwd startup smoke pass;305focused/16files,
both TS/i18n/lint pass. Original worker evidence below remains; no broader
platform/physical acceptance inferred. Coordinator owns the private checkpoint push.

## Commands and authority

```sh
openscreen lesson confirm-range /explicit/original.json \
  --project /explicit/current.openscreen --project-id PROJECT --step UUID \
  --start 0.5 --end 4 --source /explicit/source.mp4 \
  --intent author-current --out /explicit/confirmed.json --json
openscreen lesson export-range /explicit/confirmed.json \
  --project /explicit/current.openscreen --project-id PROJECT --step UUID \
  --source /explicit/source.mp4 --out /explicit/existing-directory --json
```

MCP `exportLessonRangeFile` takes strict explicit absolute `manifestPath`,
`projectPath`, `projectId`, `stepId`, `includedStepIds: [stepId]`, exact
`sourcePaths` grants and existing `outputDirectory`. It selects exactly one step;
there is no full-project fallback or hidden picker. CLI resolves explicit relative
arguments against its launch directory; duplicate/unknown selectors are refused.
The existing explicit confirmation/refresh command is separate. Export never
captures/refreshes pins, upgrades legacy references, relinks sources, writes the
lesson/project/source, discovers files or searches application/recovery storage.

Headless authority is the explicit launch/file arguments on CLI/stdio, and the
existing authenticated HTTP endpoint plus live MCP-edits permission on HTTP.
Read/export permission uses that existing contract; no additional filesystem grant
is inferred from imported lesson/project paths. HTTP export checks permission
before directory/metadata/media inspection and repeatedly before publication.
The current-schema saved project must have the supplied project ID. Editor
registration, main-frame/session/dirty checks and source grants remain intact;
no editor window, WebContents or renderer session is manufactured for headless use.
Main holds selected file snapshots, not a claim that renderer-owned lessons are
main authoritative.

Confirmation and export share `openSelectedLessonContext` and the accepted
no-follow bounded selected-file reader. Each observation rechecks exact bytes and
file identity, including identical-byte inode replacement. Canonical lesson,
project, source and destination paths must match their explicit lexical names;
source approval occurs before source canonical resolution. An equally approved
symlink target does not approve the alias. The chosen existing output directory's
identity is retained and rechecked. These are bounded filesystem observations,
not immutable snapshots or protection against all external OS races.

Export delegates to the accepted `LessonRangeExportService`,
`materializeLessonRange`, source-pin checks and real encoded-video validator.
No parallel range model/render/receipt implementation was added. Existing cut and
speed timing, same-project refresh history, receipts, raw/source bytes, static/query
redaction and default-off adapters remain. Generic fixtures have no Godot data.

## Ownership, progress and cancellation

The existing owner registry now accepts the small emitter/liveness surface of
both real windows and real transport lifetimes. Object identity supplies the
owner; generated UUID plus a dedicated channel supplies the operation. Callers
cannot select another owner's native handle or operation ID. The logical lease
covers metadata, source observation, native work, validation and receipt. Native
compute still uses the existing process-wide lease across compositor instances,
normal exports, lesson stills and these exports; no separate feature lock exists.
This does not claim an interprocess GPU mutex between independent applications.

CLI installs SIGINT/SIGTERM and stdout disconnect handlers before file work.
Stdio combines SDK request cancellation with its connection lifetime; stdin or
stdout closure invalidates that actual caller, cancels its job and drains tracked
work before exit. HTTP gives each authenticated request its own lifetime; response
closure aborts it, and server shutdown waits for tracked native/file settlement.
Wrong owner/channel/old-ID cancellation is refused. Cancellation requests the
actual MP4 handle where supported. An old addon without controls computes to
actual completion; cancellation still suppresses validation/certification and
ownership is retained until native settles. AbortSignal does not interrupt native
work by itself. Source hash/decode cancellation cannot publish a receipt.

CLI emits phase records and known frame counts; stdio uses SDK progress messages
containing the same operation UUID/phase/counts, never an invented percentage.
The inherited `choosing-destination` phase means checking the explicit argument
here, not a GUI dialog. HTTP uses the existing stateless JSON-response transport:
clients must abort/close the active HTTP request to cancel. A standalone SDK
`notifications/cancelled` POST is a different request and cannot safely identify
another caller's job; it is **not** a supported HTTP cancellation mechanism.
SDK call timeout/signal alone therefore is insufficient on HTTP unless the client
also aborts that request's fetch. No cross-request cancellation authority/session
was added. HTTP progress notifications are not promised by this JSON transport.

Fixed errors omit imported payloads, raw OS errors, pins and source paths. An
unfinished output folder is disclosed only while caller, selected file and
output-directory authority remain current. Disconnect/stale inputs/revocation
suppress that path. Each export creates a fresh private UUID folder with exclusive
receipt publication; failure/cancel preserves incomplete artifacts for inspection.
Before-start cancellation creates no output. Receipt publication and its final
current check remain synchronous in one JS turn; cancellation arriving after
successful publication does not retract an already-completed result. Abrupt OS
process termination cannot be drained by the application and may leave partials.

## Actual transport/native proof

Unique evidence directory (outside checkout, preserved):
`../openscreen-evaluation/headless-mp4-2026-11-09T1613Z/`.

- `native-final/transport-proof.cjs` / `native-final/transport-proof.json`
  (and preserved initial root proof): **actual production Electron**
  CLI confirmation, saved-file reopen, CLI selected export, SDK stdio registration,
  query redaction, selected export, missing-grant refusal, SDK cancellation,
  post-cancel export, CLI SIGINT and stdio disconnect. No direct-service call is
  described as transport proof. Source/lesson/project/confirmed-lesson hashes
  remain unchanged. Three cancelled/disconnected output folders retain incomplete
  artifacts without receipts.
- Synthetic five-second source, cut 1–2 seconds, speed 2–4 at 2×, explicit ruler
  range 0.5–4 seconds: CLI and stdio each produce **45 frames / 1.5 seconds**.
  Stored programme/source pins and each actual receipt retain sample timing,
  full decoded frame checks and hashes. A subsequent export on the same stdio
  connection succeeds after cancellation settles.
- `http-retry/http-native-proof.json`: actual authenticated SDK HTTP transport,
  production server registration, real compositor/materializer/validator in a
  disposable Electron harness. Controlled live edits provider first refuses,
  then exports the same 45-frame range. This is not the full GUI app/settings UI.
- Initial optional HTTP harness failed to resolve external `zod` from the evidence
  directory and never opened its port. Its initial script/logs remain; only its
  positively identified disposable child was terminated. The separate retry
  bundles dependencies and passes; this was harness setup, not a product defect.
- `startup-smoke-final/` (and original `startup-smoke/`): committed real headless startup smoke after Vite passes:
  SDK stdio initialize/listTools and ordinary CLI registration/renderer bootstrap,
  expected absent-project failure, no media output from that smoke. Its chunk list
  still contains stale build files (N34-2), not an exact reachable-build identity. The separate `reachable-build-hashes.json`
  fingerprints the final entry and its four reachable JS chunks without deleting
  any stale build artifacts.

The actual native addon is unchanged, SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
These are Linux synthetic/offscreen Vulkan rendering and software H.264 encoding
proofs under Xvfb, not GUI clicks, a native picker, physical capture, Windows/macOS
acceptance, audio timing, course portability or timed-player readiness. Both audio
verification flags remain false. The existing Linux-only bounded video subset
fails closed elsewhere; unsupported editor/media states remain refused.

## Validation and guard controls

Pinned Node22.22.1/npm10.9.4; exact commands/results are retained in evidence logs.
Final results: **5980 tests /446 files,0skips** (one full suite); focused final
**195/12,0skips**; both root/test TypeScript pass; lint passes with35baseline
warnings; docs37files and i18n15locales/1265literal keys pass. Production Vite
build passes (existing bundle-size/Browserslist warnings); committed real startup
smoke passes after the final build,61MCPtools, expected absent-project CLI failure.
No packaging build, native rebuild, GUI/physical/platform/audio acceptance run.
Catalogs are unchanged; no new human-translation claim. The final test-label-only
rename is checked separately:1pass/21name-filtered skips (all22 previously pass in
the full run). Mutation runs likewise intentionally filter cases; logs retain
those counts and the initial ordinary-work failures/corrections. Focused production-route tests
exercise authenticated HTTP permission-before-FS, lexical/canonical grants,
strict selection, changed/missing/legacy sources, file and destination replacement
during decode, failure, cancellation/old controls, wrong caller/channel/ID,
concurrent native access, stdout/stdin lifecycle and server shutdown. CLI tests use
the actual parser/command and an actual validator rejection of invalid mock MP4
bytes. Native/decoder doubles in unit tests are control evidence only; actual
video acceptance is the separate subprocess proof above.

Five initial single-guard mutants are assertion-killed: owned cancellation,
source-grant callback, project identity, lesson identity and destination identity.
The top MCP permission guard alone survives because mandatory service entry
`assertCurrent` independently refuses before FS; removing both guards is killed.
Initial shutdown mutation exposed a weak timing observation in the test, not a
product failure. The strengthened test gives actual socket closure a turn and
assertion-kills removal of native draining. Initial logs/controls remain, and all
mutated source bytes are restored. No independent closure is claimed for the
redundant top guard.

Preservation manifests cover the original112 native evidence files,860 prior
evidence files and72 original reports/user work. The imported report inventory is
preserved; one pre-existing coordinator change to HEADLESS_RANGE_CONFIRMATION's
summary is recorded separately and verified byte-equal to accepted8a5074f0.
No original report or user LMS workflow report is edited by this slice.

## Remaining dependencies and historical limits

Next: coordinator exact-SHA actual Claude review/fixes/private push, including
required real headless startup smoke. Then plan a bounded selected-media portable
package prerequisite: safe relative dependencies, exclusion/redaction, manifest
and receipt verification, reopen/relink rules and current-editor pack support.
The timed offline player additionally needs accessible selected-step navigation,
media loading/timing and learner progress; native MP4 stats alone do not supply it.
No timed player, full course package or audio certification is delivered here.

N31-3/N31-4 (lifecycle wording/native picker dismissal), N29-3 (4096 operation
IDs per owner; a long-lived stdio connection must reconnect), N27-3 (hash navigation reselect) and N34-1/2/3 (smoke failure
summary/stale fingerprint/legacy CLI trace) remain bounded documented limits.
The pushed035c8313 startup regression was introduced byedb74a00, missed by
reviews31/32, fixed by00bdbc77 and independently detected by the real smoke in
reviews33/34. That parent is not described as generally functional.
