# Independent review of Opus slices — 10 November 2026

Reviewed exact `51e46e44fc4fea86d63bdce9b7c478f4b908992d` against
`139b90465d18e38ea6af7e278a27aa718d61e2ed`, including implementation commits
`e3701396`, `7636185d`, `90116cae` and the final documentation commit.
Read AGENTS.md, CURRENT_IMPLEMENTATION_HANDOFF.md and the Opus session handoff.
`5a2b0f14` was additional read-only context, not my work.

**Verdict: request changes / coordinator disposition before an unqualified acceptance
or the next player implementation gate.** The entry-time editor authorization,
duplicate-step rejection and dialog parenting pass the focused review. Two Medium
lifetime gaps remain; one reproduces through the actual production Electron app,
real preload and real IPC. These are inherited implementation gaps, not claims that
the new synchronous guards introduced them. The new lifecycle tests explicitly
accept one of the unwanted outcomes. No player code or D3 approval is supplied.

## Medium R1 — an old pending open can grant overwrite authority after navigation

Locations: `electron/ipc/lesson.ts:40`, `:126`, `:137`, `:158`, `:185`.

`editorOnly` checks the page once at entry. After the picker and asynchronous
file read, `remember` creates/obtains state and unconditionally installs a grant;
it does not pin the initiating page generation or recheck editor authority.
The first open does not even install its lifetime listeners until `remember`.
A navigation while the dialog is pending therefore does not prevent the old open
from installing a new grant. `save-current` checks frame identity and the grant,
but never the registered editor's current page.

Independent real-app reproduction, from the production build of the exact SHA:

1. Launch an isolated app under Xvfb from a foreign directory; switch to the actual
   editor through production window creation. No video project is needed.
2. Stub only the native open picker with a deferred promise; call the real preload's
   `lessonOpen()` and leave the picker pending.
3. Change the editor hash to `#foreign-context`. Electron emits an actual
   `did-start-navigation` event with same-document and main-frame flags true.
4. Resolve that old picker with an owned disposable valid lesson file.
5. The old open returns `success:true` and a new file token. A fresh
   `lessonDraftStatus()` on the changed URL correctly returns
   `lesson-operation-failed`, proving the normal page check rejects this context.
6. Call real `lessonSaveCurrent` with the returned token: it returns `saved` and
   replaces the disposable file with `Overwritten after real hash navigation`.

The picker was correctly parented to the real editor, so this is not a reconstructed
handler or missing-parent artifact. The unit probe also reproduces the grant after
changing the URL to an entirely different file page; that different-document case
was not separately driven through the real app.

Required correction: capture a page/operation generation before opening the picker,
install invalidation before awaiting, and check the generation and exact owner/page
before file access, grant installation and return. A stale open must not resurrect
a grant; only a new explicit open in a valid current editor context may restore it.
Also prevent overlapping older opens from replacing a newer operation's grant.

## Medium R2 — revocation does not stop an in-flight replacement or stale success

Locations: `electron/ipc/lesson.ts:119`, `:167`, `:169`, `:170`;
`electron/lesson/lessonFile.ts:60`, `:94`, `:99` (unchanged helper);
`electron/ipc/lesson.test.ts:346`, `:353`, `:362` (new assertions).

The lifecycle listener only clears `state.grant`. An already-running
`replaceLessonFile` retains its local grant and has no owner/current-operation
callback. It can still rename the staged file over the original after revocation,
and the handler returns `status:saved` and a file token unconditionally. The
`state.grant === grant` guard prevents a future reusable grant, but neither the
write nor the stale certification. Validation and staged-file parsing contain
awaits; image validation also uses asynchronous WebCrypto hashing.

Independent production-registration/service probes start a same-file save, then
emit each of `did-start-navigation`, `render-process-gone`, and `destroyed` before
it settles. All three overwrite `Original` with `Stale save` and return
`success:true/status:saved`. Their refusal assertions fail for that actual result,
not a tooling error. These are deterministic lifecycle-event probes, not three
claims of real renderer crashes/navigation during a physical app save.

The new existing test deliberately asserts `saved` and the changed bytes after
the event. Thus the worker's green suite proves subsequent token reuse is refused;
it does not establish the requested no-stale-overwrite/no-stale-certification
property. The roadmap's unconditional permission-ends-on-navigation/crash/close
statement at `LESSON_CAPTURE_ROADMAP.md:107` needs this qualification until fixed.

Required correction: carry a revocable operation/current-page assertion into the
replacement, recheck immediately before the atomic rename and before reporting
success, and retain the author's unsaved draft on refusal. An operation already
committed before invalidation needs honest separate handling; these probes revoke
before replacement. Keep conflict, regular-file, symlink, private staging and
atomic replacement protections.

## Player plan — review only; D3 remains pending

The plan correctly separates explicit owner-bound read-only playback/inspection
from existing project-bound create/copy/reseal. It retains package-v1 compatibility,
full initial verification, Linux gates, media caps and no automatic authoring
recovery. Slice 0 explicitly depends on owner decision D3(b); silence is not approval.

Two concrete design details need tightening before implementation:

- **Low P1, plan lines 76–86:** the example fixed partition `lesson-player` conflicts
  with multiple player windows and the stated inability to identify the requesting
  frame. Use a distinct ephemeral partition per owner (or explicitly enforce one
  player window), prohibit other windows/frames/navigation from sharing its session,
  and test a second player as well as an editor/HUD. The plan's risks paragraph
  acknowledges exclusivity but does not specify its enforcement.
- **Low P2, plan lines 88–93:** an initial `fstat` followed by reading/streaming leaves
  an in-place mutation interval, and 8 MiB per response does not bound concurrent
  requests. Specify a bounded buffered read with final identity/current-capability
  checks before returning bytes, abort/close owned in-flight resources on revocation,
  and an aggregate concurrency/byte budget. Exercise mutation during the read and
  navigation/release while a range is pending. These are design gaps, not findings
  against implemented playback; no playback implementation exists here.

The roadmap's next-work list skips slice 0 when it says slice 1 next; the linked
plan provides the dependency. Coordinator should preserve the D3/slice-0 gate.

## What passes within scope

- The nine older guide IPC routes reject absent senders, non-main frames and foreign
  windows before recovery-store operations, pickers or project reads. Production
  wiring uses `editorRangeSessions.isEditorPage`; authorization hooks are required,
  not optional. Headless bootstrap still supplies its fail-closed dirty provider.
- Editor identity is a WeakMap object identity, not a numeric ID or renderer URL.
  My independent matrix rejects a foreign object with the same ID/URL, changed
  hash/query/path/origin, malformed URL and destroyed owner; the intended `%20`/`+`
  query-space normalization remains accepted. Main-frame rejection is independently
  pinned by assertions. The defect in R1 is asynchronous authority resurrection,
  not an equality bypass in `isEditorPage` itself.
- GUI package creation rejects repeated UUID step IDs before opening a picker,
  retaining strict input parsing and the same unique-selection rule as headless.
- Save/open/export attach to `BrowserWindow.fromWebContents(event.sender)`.
  Picker cancellations preserve early-return behavior; new editable saves retain
  `wx`, same-file updates retain conflict/symlink checks, and imports do not call
  arbitrary media/source path-grant helpers. No dirty-project claims were widened.
- Existing guide component tests cover retained unsaved marks while hidden and
  legitimate clearing on unmount. Reviewed actual main-window registration/close
  wiring and its separate lesson-work flag; the project-dirty provider stays separate.
  Reload/crash loss remains disclosed L42-2; this is not automatic recovery acceptance.
- Additional-context `5a2b0f14`: visible labels prefix repeated step button names;
  package/lesson/step headings are h3/h4/h5, and the resume instruction precedes
  its button. Component tests pass. The corrected save wording describes new-copy
  and same-file actions separately in all 15 catalogues (English fallback, not
  completed translation). No screen-reader acceptance is inferred.
- Both historical snapshots are byte-for-byte equal to their complete files at
  `90116cae`: roadmap 22,296 bytes; product map 41,252 bytes. The roadmap evidence
  ledger remains verbatim. Original reviews and evidence are not rewritten, and
  the docs correctly label the Opus implementation self-tested at authorship.

## Independent execution and evidence

All commands used Node **22.22.1** and npm **10.9.4** by prepending:
`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`.
Execution used a temporary `git archive` snapshot of the exact SHA, not a checkout
or worktree. Only `node_modules` was linked from the original. No paid/provider/auth
operation, source edit, commit, push, reset/stash or extra worker was used.

Owned scratch/evidence directory: `/tmp/opus-independent-review-35j18ugx/`.
It is retained for coordinator inspection and is temporary storage, not a durable
publication. Commands below ran inside its `snapshot/` unless stated otherwise.

| Actual command/check | Result |
| --- | --- |
| `npx vitest --run electron/ipc/lesson.test.ts electron/ipc/lesson.authority.test.ts electron/ipc/lessonPackageOpen.test.ts electron/ipc/editorRangeAuthoring.test.ts electron/ipc/nativeBridge.renderOwnership.test.ts src/components/ai-edition/v4/LessonGuideDialog.test.tsx src/components/ai-edition/v4/LessonPackagePanel.test.tsx` | 170 passed / 7 files, 0 skipped; `focused.log` |
| `npx vitest --run electron/ipc/independent-page.test.ts` | Own authority matrix: 1 passed / 1 file, 0 skipped; `independent-page.log` |
| `npx vitest --run electron/ipc/independent-lifetime.test.ts` | Own required-refusal regressions: 4 assertion failures / 1 file, 0 skipped, reproducing R1/R2; `independent-lifetime.log` |
| `npx vite build` | Pass; new production Electron/renderer/preload artifacts; `vite.log` |
| `npx tsc --noEmit` | Pass; `tsc-app.log` |
| `npx tsc -p tsconfig.test.json --noEmit` | Pass for the original pinned test tree; `tsc-test.log` |
| From scratch root: `node snapshot/scripts/smoke-headless-startup.cjs --evidence-dir /tmp/opus-independent-review-35j18ugx/startup` | Pass: real production SDK stdio initialize/listTools and normal CLI export registration/renderer bootstrap; expected missing disposable input, no input/output created |
| From scratch root: `xvfb-run -a node real-lifetime.cjs /tmp/opus-independent-review-35j18ugx/snapshot /tmp/opus-independent-review-35j18ugx/real-lifetime` | Pass as a bug reproduction through actual app/preload/IPC; `real-lifetime/result.json`, `real-lifetime.log` |
| From scratch root: `python mutations.py` | 4/4 independent mutants killed by assertions, 0 tooling kills; individual `mutant-*.log` and `mutations.json` |

Own mutants: remove exact-page comparison (own matrix fails); remove older-route
main-frame condition (draft-status served to subframe); replace production editor
predicate with `true` (foreign caller served); remove unique-step refinement (two
pickers reached for duplicate IDs). Each mutation was made only in scratch and
restored byte-for-byte. The two own supplemental test sources are retained under
`probes/` outside the snapshot after their runs, so the reported original-tree TS
checks do not silently include uncommitted reviewer tests.

Required startup smoke fingerprints the real entry and both main chunks in
`startup/startup-smoke.json`; no reconstructed registration was substituted.
SDK initialize/listTools succeeds. CLI exits 1 for the intentional absent project
only after registration and renderer startup. This is startup coverage, not real
render/capture/export acceptance. The real-app probe uses isolated profiles and
stubbed native dialogs; no user app was stopped.

I inspected the original worker full log: **6298 passed / 460 files, 0 skipped at
90116cae**. That is attributed worker evidence, not my independent full run.
I did not repeat the full suite, physical input, native capture/export, real
pickers, screen reader, Windows/macOS or audio acceptance. The four independent
failures are not hidden by the green focused/full counts. The writer's 15/16
mutation result is distinct from my four assertion kills.

## Preservation and cleanup

The original checkout was clean at exact `51e46e44` before review. SHA-256
comparison of **2488 original tracked files** before/after execution found no
change. An additional 172-file manifest covers the Opus evidence tree, external
LMS workflow report and native addon, with no changes in its later comparison;
that extra manifest was collected after execution, not falsely presented as a
pre-execution baseline. All writes and disposable fixtures were confined to owned
scratch until this unique report was added. No original report, raw media or
external workflow file was opened for writing or removed.

Original main remains `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.
Addon SHA-256 remains
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
External LMS workflow report SHA-256:
`f87c9eb7bffbd5e4bd55375f20541b3f0822420d6c74e1bce317ab7dbb5196a7`.

Scratch restoration matches the original source/test/config/doc bytes. Three
unrelated documentation images are absent from `git archive` because their
`export-ignore` attribute is set; they remain present and unchanged in the original.
All per-test disposable lesson directories were removed by owned test cleanup.
The real-app probe closes its own app in `finally`; startup transports/CLI settle.
Final process inspection found no owned scratch Electron/Xvfb/probe process left.
Retained scratch logs, scripts and disposable real-app fixture are intentional
review evidence. No shared cache purge or user-process termination occurred.

Coordinator owns finding disposition and the private review/push gate. Resolve or
explicitly disposition R1/R2, independently review any correction, and preserve
the pending D3 decision before beginning player slice 0 or slice 1.
