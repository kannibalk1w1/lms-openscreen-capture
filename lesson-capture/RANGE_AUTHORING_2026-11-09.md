# Explicit editor source confirmation — 9 November 2026

This coherent prerequisite resumes the roadmap from `7b6f4a73f6e3c700d968114ba3f891f8c1ed2a07`
on `lesson-capture/input-boundaries`. Source identity is already delivered and
accepted through actual review26 at d017e4b8 within bounded Linux content-equality
observations. Actual [review27](CLAUDE_ROADMAP_REVIEW_27_2026-11-09.md) accepts
1dad5a7c and [review28](CLAUDE_ROADMAP_REVIEW_28_2026-11-09.md) accepts follow-up
897ddcebabd16c1c572f0d99c3274afb5ac5677d with no new High/Medium/Low findings.
The follow-up closes the downgrade/guard/wiring/wording findings; hash navigation
retains its tested fail-closed limitation. Coordinator owns the private checkpoint
push. Main stays fd2775e2dbc540306b46085eb0301fa06a6a3aaa.

## Delivered workflow

In Lesson guide, add/include a step, save the video project, choose start/end on
the editor ruler, then explicitly **Confirm current source and attach range**.
This observes source contents through the accepted identity backend and attaches
version2 to the same lesson/step using the existing stale-target merge helper.
**Refresh range and current source** explicitly replaces an existing selection
within the same video project and retains its flat history, including version1.
Open/save/recovery/reference-only planning never automatically confirms content.
A confirmed selection cannot be downgraded by the reference-only button; explicit
remove remains available. Save a new editable or recovery copy to keep the result.

The form shows the supported subset, unconfirmed/previously confirmed status,
indeterminate reading progress, cancel/cancelling and actionable fixed failures.
Cancellation discards late results, changes no lesson range and writes no source,
render or output. Cancellation checks reuse bounded source reads; a filesystem
syscall cannot be interrupted. Native rendering is never called by confirmation.
The new strings exist in all15locale catalogs; new non-English strings currently
use English wording and still need human translation/localization acceptance.

## Shared service, authority and lifecycle

`RangeAuthoringService` validates strict request/UUID/range/intent input, validates
the existing bounded lesson schema and requires its selected step. Only one
confirmation runs at a time; owner plus operation UUID gates cancellation, with
busy state released on success/error/cancellation. It accepts explicit authority,
not paths or destinations from a lesson/import/request. Every document read and
the final result recheck the captured editor/project generation and cancellation.

Only a BrowserWindow created as an editor and still on its exact app page can
establish a project session. Main-frame IPC requires that session and a currently
saved project. Selection changes, including same-ID reopen, navigation/crash and
window destruction invalidate work. Renderer checks additionally bind document
object, project ID, dirty state, lesson replacement/unmount and previous step
selection before attachment. Payload step selection is validated against the
supplied lesson snapshot; main does not keep a parallel authoritative lesson model.
The existing merge helper refuses removed/replaced/changed targets and preserves
unrelated later authored text while marking attached material draft.

`DocumentService.getSavedProject` shares the existing per-project save/read queue
but parses only current saved document bytes. Unlike normal project open, it does
not migrate, relink/discover media, inspect privacy sidecars, call the approval
callback or write anything. This distinction is required: normal `getProject`
automatically relinks and approves declared paths. New confirmation uses the saved
reader and independently checks existing picker/project/recording media grants
before filesystem resolution, then requires the canonical source path to equal
the declared absolute path and remain approved. Symlink ancestors fail closed.
No arbitrary imported source path can create a grant through this operation.

The accepted backend remains Linux-only, with1/30–120programme seconds,32spans,
8sources and8GiB total, source coverage/before-and-after observations, unchanged
render-input timing guards and at most8history snapshots. Missing/unapproved media,
foreign project/target, unsupported dependencies/platforms and source changes fail
closed. Content pins establish equality at observations, not immutable/authenticated
history, visual correctness, audio correctness or a sandbox against the same user.
Canonical checks are observations, not atomic path resolution against adversarial
ancestor swaps. Normal generic operation still needs no Godot or enabled adapter.

## Exact remaining integration / parity gaps

Selected MP4 export remains backend-only. This slice deliberately stops before
native rendering: the current still-only service lock is not a shared native job
owner across editor/CLI/MCP exports. Next introduce reusable renderer serialization
and owned cancellation/lifecycle, then invoke accepted `materializeLessonRange`
and its actual Linux sample/full-decode validator through authorized selected-step
IPC, an explicit native destination picker, progress/cancel/status and preserved
incomplete-artifact reporting. Do not bypass source pins, capture hashes during
export or implicitly refresh source. Picker cancellation must precede new reads/
render/output changes as the accepted materializer requires.

CLI/MCP can reuse the shared confirmation service but have no confirmation/refresh
or selected MP4 export commands yet; their existing query/static redaction remains.
No complete portable course, timed player, audio/AV alignment, physical capture,
Windows/macOS/hardware acceptance or broader backlog completion is claimed.
N24-2/N26-1/L23-1/L23-W1 remain tracked in earlier reports. Stop here for coordinator
review/fixes/push before starting that next slice.

## Validation and evidence

Pinned toolchain: Node22.22.1 / npm10.9.4. Final validation:

| Command | Result |
| --- | --- |
| `npx vitest --run` with the10paths in `run-check.py focused` |128tests /10files pass,0skip |
| `npm run test` (one final full run) |5814tests /435files pass,0skip |
| `npx tsc --noEmit` |Pass |
| `npx tsc -p tsconfig.test.json --noEmit` |Pass |
| `npm run lint:fix`, then `npm run lint` |Pass;35existing warnings, no new warning |
| `npm run docs:check` |Pass,37configured files |
| `npm run i18n:check` |Pass,15locales /7namespaces /1257literal source keys |
| `npx vite build` |Pass: production renderer, main and preload; no installer/package/native rebuild |
| `git diff --check` and relative links in changed Markdown |Pass |

Exact command arrays, exits, toolchain versions, logs and timing live in the
[unique evidence directory](../../openscreen-evaluation/range-authoring-2026-11-09T1133Z/).
The10focused files cover saved-reader side effects/serialization, production
window registration and IPC handlers, session authority/reopen/lifetime, source
confirmation concurrency/intent/paths/cancellation, original pin/export guards,
existing lesson IPC/dialog behavior and the integrated editor flow. No Rust/native
source changes or native tests/export runs are included in this slice.

A retained additional Node service proof (`proof.ts`, `proof.cjs`, `proof.json`,
`proof.log`, `workflow-proof/`) uses the actual saved-project service, authority,
confirmation backend, stale-safe attach and editable save/reopen. A real64×32,
30fps,2frame fixture is probed locally and ruler0–1/30s selected. It confirms,
saves/reopens without confirmation, explicitly refreshes changed fixture bytes,
retains2previous selections, refuses stale attachment/cancelled completion and
verifies unchanged project/first-lesson bytes with0native calls. Its editor owner
and destination callbacks are simulated; it is not Electron/GUI/physical evidence.
The first standalone proof build used an incorrect `schema.ts` import, corrected
to `schema/index.ts`; its failed Node load is retained in
`proof-initial-import-failure.log`. Early focused test/TS diagnostics (test import,
revised UI copy, prematurely selected empty alert, Electron event overload) were
corrected before the counted final checks.
Disposable integrated proof uses the real React component, production IPC callbacks,
session authority, shared confirmation service, saved DocumentService reader,
source hashes and real editable save/open files. The IPC sender and dialogs are
simulated and React runs in jsdom; this is not real Electron transport, a native
picker, CDP, native export or physical acceptance. A real MP4 fixture is read,
its current content is confirmed, a saved lesson is reopened without re-observation,
and explicit changed-byte refresh retains prior identity; original project/first
lesson bytes remain unchanged and native rendering is never invoked.

Computer-use skills were read and Linux capabilities checked: screenshot, hotkey,
native-dialog and focus support are unavailable. Physical GUI/native picker and
Windows/macOS checks are skipped; no user app is launched, killed or restarted.
Temporary test roots clean up in finally/afterEach. No shared cache purge, paid API,
auth/configuration, real lesson edit, manual reset/stash/discard/new checkout, other worker,
push/release/Actions/publication or original report/evidence overwrite occurs.

Preservation: all112distinct prior evidence files from the two retained hash
inventories are unchanged (including the existing111file inventory). All56tracked
Claude/review/report files selected by the final report inventory match base HEAD,
and the user-owned external `LMS content and media workflow report.md` matches its
recorded hash;57items total. Final inventories and comparisons are retained beside
the logs. These are preservation checks, not repeats of earlier native acceptance.
No GUI app/server/native-render process was started by this slice; finished test/build
processes and the Node proof exit normally. Disposable test roots are removed;
the newly retained proof files remain for review. Coordinator owns review/push.

Commit-hook note: the repository's standard lint-staged hook automatically created
and removed its temporary backup stash; no manual stash/reset/discard was used and
no user work was moved. That hook inherited system Node26.13.0/npm12.2.1 and ran
only a passing Biome check, with no code changes. All counted validation above used
Node22.22.1/npm10.9.4. The documentation-only final amendment uses the pinned PATH
and process-local `HUSKY=0` to avoid another automatic temporary stash; repository
hook/configuration files are unchanged.
