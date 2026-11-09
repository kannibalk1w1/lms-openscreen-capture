# Shared native-render ownership — 9 November 2026

This prerequisite continues from accepted/pushed623fa85c119484577d3ad0bfcd9bc0f550cd3c89,
following actual [review28](CLAUDE_ROADMAP_REVIEW_28_2026-11-09.md) of897ddceb.
One implementation writer; no other worker or push is launched. The slice adds
shared job ownership/serialization before selected-range MP4 editor integration.
Actual [review29](CLAUDE_ROADMAP_REVIEW_29_2026-11-09.md) accepts6821c776 and
[review30](CLAUDE_ROADMAP_REVIEW_30_2026-11-09.md) accepts follow-up
27136d0f0766621c55a0ac497f58570c08ee165d with no new High/Medium/Low, closing
T29-1/L29-1/N29-1/N29-2. Independent228focused/18, both TS,Vite,lint and real
Electron still/GIF probes pass;18mutants yield17kills. N29-3 and nitN30-1 remain
documented; coordinator owns the private checkpoint push before editor MP4 work.
Main/private-main remain fd2775e2dbc540306b46085eb0301fa06a6a3aaa.

## Inventory and boundary

| Existing route | Compute entry / ownership after this slice |
| --- | --- |
| Editor ExportDialog MP4/GIF | Existing native bridge, existing caller export ID, shared owner registry and native-compute lease |
| CLI export runner / HTTP or stdio MCP exportVideo | Same native bridge via runner; formerly no-ID path now gets a private main-generated operation ID and same owner/lifecycle protection |
| CLI/MCP audio export | Existing small MP4 compositor render uses same lease; subsequent audio extraction keeps its existing separate behavior |
| Lesson still IPC | Same owner registry, main-frame and current saved-project session checks, shared native frame-batch lease; old still-only boolean lock removed |
| MCP getFrames / getFrame before export | Existing media-tools callback through the other CompositorViewService instance; same frame-batch lease |
| Direct internal exportMulti/exportGif/renderFrames | Same process-wide native lease; no new public endpoint or cancellation-by-path surface |
| Preview setScene/readFrame/shared-frame texture/view create/destroy | Unchanged; interactive preview is not put behind long-job ownership |
| Loudness, shader/segmentation probes, seekable remux | Unchanged; these are not timeline compositor export/frame-batch jobs |

The normal main handler and native bridge instantiate separate compositor services;
a per-instance/still-only lock cannot serialize them. Rust N-API exports/frame
batches use asynchronous tasks and independent compositor walks; its live-view
registry mutex is not an application job-owner registry. Existing MP4/GIF opaque
controls operate on one native export. MP4 cancellation is optional on older
addons; frame batches have no interrupt control. No native code changes are made.

`ExportJobs` is reused and extended for logical caller operations, with one shared
`renderOwnerJobs` instance across editor exports and lesson stills. A single
`nativeRenderJobs` lease at the compositor-service boundary covers actual MP4/GIF/
frame computation across every service instance. These are logical-operation and
native-compute scopes, not separate feature locks: after native work settles,
another caller can render while an earlier logical operation finishes CPU-side
validation. Direct internal/MCP frame callers have opaque promise/handle scope
rather than a public WebContents cancellation ID. Independent Electron/CLI host
processes have separate addon state and separate leases; no OS-wide GPU lock is
claimed. App-channel/runner transport and filesystem permission checks are reused.

## Owner, operation and lifecycle contract

A logical operation reserves its owner before invoking start, including synchronous
progress/reentrancy. Cancellation matches the actual WebContents object, operation
ID and fixed channel; numeric window-ID reuse does not grant authority. Export IPC
requires the sender main frame. Its cancel action can name only the export channel,
so it cannot cancel a lesson still. Legacy no-ID exports use private UUIDs, keeping
existing progress payloads and export return shapes while gaining lifecycle ownership.
They use real cancel controls where available; legacy GIF retains an explicit
internal uncancellable fallback for old addons, without weakening ID-based GIF's
existing capability requirement.

Used operation IDs cannot be recycled within a window/channel, preventing delayed
cancel messages from naming a later operation. Retired IDs are bounded at4096per
window; reaching that bound refuses new operations until the window is reopened.
Caller-generated IDs remain1–128safe characters; the normal editor generates a new
UUID each run. A new WebContents has a fresh bounded history. No path, destination,
source selection or permission is inferred from an ID.

Navigation (including hash), renderer loss, destruction and main-frame project
selection/reselection invalidate that owner's operation. Native cancel is requested
where available, progress delivery stops, and no stale completion is certified.
Lesson stills additionally capture/recheck the existing registered-editor/project/
saved-state authority after their asynchronous work. Source confirmation/refresh,
source pins, saved-reader policy and timing guards remain unchanged. No automatic
source confirmation or hash capture during export is introduced.

An accepted user cancel refuses later success even if an inconsistent/late native
completion returns stats. A native cancel that returns false allows a completion
that already won the race; lifecycle invalidation always refuses stale success.
Cancellation handles are fenced to their own live lease, so an old handle cannot
cancel or invalidate the next native job. All success/error/throw paths release
once, and owner event listeners are removed at logical settlement.

Most importantly, cancellation, renderer death, an outer timeout or an abandoned
waiter does **not** free active native work early. Ownership remains until the
actual native promise settles. An uncancellable/stuck native operation can keep
that process busy indefinitely; no hard timeout, AbortSignal interruption or safe
forced release is claimed. This fail-closed behavior is necessary to avoid native
job overlap. No app/process is killed to recover automatically. Existing native
cancellation's own partial-output cleanup policy is unchanged; the TypeScript
owner layer deletes no source or artifact. Invalidation can leave completed output
on disk while refusing success, for inspection rather than certification.

## Delivered coverage and precise next slice

This is a shared ownership prerequisite, not selected MP4 editor delivery. The
accepted range materializer and actual Linux encoded validator are not connected
to new GUI/CLI/MCP actions. No destination authority, new filesystem grant, HTTP
permission, source refresh, portable course, timed player or audio/AV correctness
is added. Generic operation still needs no Godot or enabled adapter.

Next: authorized selected-step MP4 action around `materializeLessonRange`, with
explicit native destination picker before new source observations/render/output,
source-pin/timing checks, bounded progress/cancel/status, stale project/lesson/
step refusal and inspectable incomplete artifacts. Own the entire logical
materialization through the shared registry and use its scoped native handle for
the render; keep actual full-video validation before completion. CLI/MCP parity
remains a separate explicit wrapper task. Do not start it before this review gate.

## Evidence and acceptance limits

Final validation:215focused tests/17files pass,0skip; both root/test TypeScript,
production Vite renderer/main/preload build, lint35baseline warnings, docs37files
and i18n15locales/7namespaces/1257literal keys pass. The completed full-suite retry passes5845tests/438files,0skip.
No installer/package build is claimed.

`run-check.py` retains exact command arrays, logs, exit codes, pinned toolchain and
wall time for `npx vitest --run` (the17named files), `npx tsc --noEmit`,
`npx tsc -p tsconfig.test.json --noEmit`, `npm run lint`, `npm run docs:check`,
`npm run i18n:check`, `npx vite build` and `npm run test`. `npm run lint:fix` was
run explicitly before the final checks; the existing35warnings remain unchanged.

Six targeted controls are assertion kills,0survivors and0timeouts/load failures:
compute-busy guard, premature cancel release, stale-handle fence, lifecycle
certification refusal, operation-ID reuse and cancellation-channel isolation.
Source bytes are restored and hashed before final positive tests/build. The new
bound/reentry/failure/outer-timeout tests distinguish logical ownership from native
settlement; a timed-out waiter never authorizes another native job. Earlier focused
runs caught the intentionally changed destruction/completion expectation and two
TypeScript callback/overload issues, corrected before the counted final checks. Exact commands/logs and
retained proof files live in the [unique evidence directory](../../openscreen-evaluation/native-render-ownership-2026-11-09T1233Z/).
Pinned Node22.22.1/npm10.9.4 are used. Original reports/evidence and the external
user workflow report are preserved; native source/binary bytes are unchanged.

The production registration tests use real ExportJobs/NativeRenderJobs and actual
CompositorViewService instances with fake native-addon methods, exercising cross-
window/channel contention, legacy CLI ownership, main-frame/owner/old-ID refusal,
project switch and native failure/retry. Existing exporter UI/native-client/CLI/
MCP/lesson regressions are included. These tests simulate Electron IPC emitters;
they are not a real Electron IPC or GUI-click acceptance run.

The retained **real Linux Node/N-API proof** uses the production compositor service,
an actual64×32/30fps/2frame MP4 fixture and the existing addon. It masks only cancel
capabilities for one service to simulate an old addon: real native work continues,
a competing frame batch is refused, and lifecycle invalidation refuses success
only after actual completion. A subsequent native export succeeds and the accepted
sample/full-frame decoder validates2frames; an actual frame batch returns a JPEG.
The old scoped handle cannot affect the next job. A real native MP4 cancel returns
true and rejects with `MP4_EXPORT_CANCELLED`. Source bytes and addon SHA256 remain
unchanged. Final proof repeats after the accepted-cancel refinement; initial proof
artifacts are preserved separately. The proof's CJS bundle defines import.meta.url
only for the harness and injects an Electron app-path stub; no real Electron IPC,
GUI picker/click, physical capture or other-platform acceptance is inferred.

Native addon identity:5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca.
The observed GPU is Vulkan/NVIDIA4070Laptop, with software libopenh264 after VAAPI
refusal. Audio is source/synthesized silence and remains unverified. No native
rebuild/Rust test rerun is claimed because native source/binaries are unchanged.
No paid API/auth/configuration, real lesson edit, checkout/reset/stash/discard,
publication/Actions, shared-cache purge or user-app killing occurs. Commit uses
process-local HUSKY=0 after explicit lint to avoid automatic backup stashes.

Preservation checks rehash112distinct prior native evidence files and60original
report/user-report entries. Both earlier authoring-slice evidence directories are
also retained/inventoried (86files). The two native proofs and all new logs/artifacts
remain under this slice's unique directory. No owned GUI app/server is started;
Node/native proof processes exit normally, with no user process killed.

The initial full suite had5844passes and1failure in the unchanged
`LeftPanel.copyMessage.test.tsx` async copy-button wait. That file passed4/4when
rechecked alone, then the complete default suite passed5845/438without source or
timeout changes. Both full logs and the isolated rerun are preserved; the first
failure is not counted as a pass or hidden as a skipped test. The extra full run
was justified by that failure, rather than routine repetition. `git diff --check`
and111relative Markdown links pass. All final production code predates the passing
build/full rerun; later edits only record these results.
