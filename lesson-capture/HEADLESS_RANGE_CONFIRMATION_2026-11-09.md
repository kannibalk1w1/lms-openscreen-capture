# Explicit CLI/MCP source confirmation prerequisite — 9 November 2026

Coordinator disposition: actual [review33](CLAUDE_ROADMAP_REVIEW_33_2026-11-09.md)
accepts00bdbc77 with no new High/Medium. [Review34](CLAUDE_ROADMAP_REVIEW_34_2026-11-09.md)
acceptsf9dcd8df01531f26322237bb01c449fbefb18f96 and closesL33-1. Independent
289focused/16files, test TS/lint and real startup smoke pass; smoke also detects
the prior pushed035c8313 startup regression fixed by00bdbc77. Original account
below remains; headless selected-MP4 is still the next prerequisite, not delivered.

Base: accepted/pushed `035c8313d05c41e68612b80717ff036731d3fafb`, following
actual [review32](CLAUDE_ROADMAP_REVIEW_32_2026-11-09.md), which accepts bde9a618
with no new findings and closes L31-1/N31-2. One writer; no push or helper worker.
Main/private-main remain `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`.

## Delivered scope and why this is a prerequisite

This is usable **explicit-file source confirmation/refresh parity**, not complete
selected-MP4 transport parity. The inventory found two prerequisites: existing
lesson-file commands had no stale-safe source-confirm/save transaction, and the
stdio bootstrap omitted the dirty-provider argument now required by production
lesson registration. HTTP creates a new MCP server per request, so new operations
also need a request-scoped disconnect lifetime; stdio must drain actual pending
file work before exiting. These are delivered together before adding native jobs.

The existing native owner registry is tied to window/channel/operation identity;
this slice does not manufacture a renderer or weaken editor registration to call
its IPC. No new native rendering route, lock, lesson model or native source change.
Normal exports/stills/preview and existing shared native compute ownership remain.
The next reviewed slice must bind actual headless caller/channel/job ownership to
that same registry and materializer, keeping native settlement and validation
inside the transport lifetime. No selected-MP4 CLI/MCP delivery is claimed here.

## Commands and authority

```sh
openscreen lesson confirm-range /chosen/lesson.json \
  --project /chosen/current.openscreen --project-id project_id \
  --step STEP_UUID --start 0.5 --end 4 \
  --source /chosen/source.mp4 \
  --intent author-current --out /chosen/new-lesson.json --json
```

Use `--intent refresh-current` with an existing reference/pin to explicitly refresh
within the same project. Repeat `--source` for each selected source file (at most8).
Every source grant is explicit; a path declared in an imported project/lesson
never grants file access. CLI paths resolve relative to its working directory;
MCP paths must be absolute. Output is one **new** editable file, never an overwrite.
No directory/recovery discovery, relinking, automatic capture/refresh or legacy
project upgrade. Only the current saved project schema is accepted; older projects
must be opened/reviewed/saved through an existing supported workflow first.

MCP tool: **confirmLessonRangeFile**, with `manifestPath`, `projectPath`, `projectId`,
`stepId`, `startSec`, `endSec`, `sourcePaths`, `intent` and `outputPath`. HTTP requires
the existing authenticated bearer/host/origin boundary plus live **MCP edits**
permission before filesystem inspection. Stdio retains its explicit-launch user
rights and existing editsAllowed=true policy. This tool does not add authentication,
server enablement, file discovery or access to app/recovery storage.

The headless authority is the explicitly selected **saved file**, its project ID,
file identity and exact bytes, not the live editor or unsaved edits. Reads use a
bounded regular-file/no-follow/canonical-path reader and pure current-schema
validation. They never call getProject, migrate, relink or approveDocumentMedia.
Inputs are at most16MiB each; lesson validation also enforces its existing16MiB cap.
Source confirmation reuses `RangeAuthoringService`, its Linux supported subset,
source identity/history, source approval/canonical checks and cancellation. The
supported subset is Linux video-only, 1/30–120 programme seconds, up to32kept spans,
8source files/8GiB, without webcam/added audio/image dependencies. Bounded adjacent
cursor-sidecar presence checks remain the accepted unsupported-dependency guard,
not a directory search. It
computes the saved render fingerprint only from the selected current file.

A new copy uses the existing stale-safe attachment helper, preserves all lesson
content/history and demotes the selected step to draft with a new revision. It
never mutates the original lesson, project, source or previous confirmed copy.
Query results remain redacted: IDs, titles and advisory states only, with no pin
hashes/source paths/instructions/code. Successful confirmation results return only
bounded IDs/revision, status and the explicitly authorized new-copy path.

## Persistence, cancellation and limits

The reader checks regular-file identity/size/timestamps during reads. Exact input
bytes and identities are checked across awaits, before/after source observation
and just before publication; replacing a file with identical bytes is stale too.
The staged new copy is private0600, read back, byte-compared and schema validated.
An atomic hard-link publication refuses an existing destination, including one
created after the initial check. Filesystems without hard-link support fail closed;
there is no unsafe overwrite fallback. Failed/cancelled stages are retained and
reported only while authority remains current. Successful publication removes its
redundant stage when possible. Input files are never overwritten or rolled back.

The final input/permission check and exclusive publication have no intervening
JS await. This is bounded observation and no-overwrite publication, not a filesystem
transaction locking arbitrary external writers, immutable/authenticated history,
or crash-proof fsync durability. Synchronous bounded metadata checks can block
until filesystem calls return; no hard deadline or cancellation of those calls is
claimed. A later cancellation can lose to a completed publication.

New CLI confirmation alone handles SIGINT/SIGTERM and closed output pipes, then
waits for actual file work to settle; legacy query/guide command behavior remains.
The headless app bootstrap supplies a conservative dirty=true provider, while
unregistered CLI runners still have no editor-only source authority. HTTP request
closure/SDK cancellation and stdio connection closure abort only the appropriate
new confirmation lifetime. Stdio drains tracked confirmation promises before exit;
no AbortSignal claims to interrupt unsupported native work. This is not new
lifecycle acceptance for existing normal media jobs or a native job-owner bridge.

Progress is completion/error status for confirmation, with no fabricated percentage
or hidden native dialog. Full render progress/cancel/artifact and source/project/
sample/full-decode receipt guarantees belong to the next selected-MP4 slice.
N31-3/N31-4/N29-3/N27-3 remain documented and unchanged. No timed player, portable
course, audio/physical/Windows/macOS acceptance or additional adapter is delivered.

## Validation and proof

Unique retained evidence:
`../openscreen-evaluation/headless-confirmation-2026-11-09T1456Z/`.
Pinned Node22.22.1/npm10.9.4; exact commands/exits/counts in run-check.py and logs.
Production registered HTTP tests use the real authenticated SDK transport, real
selected files, actual shared authoring and file transaction. Native rendering is
not mocked into acceptance: it is absent from this prerequisite. Stdio lifecycle
wiring has a focused protocol-double test plus the actual transport proof below.

Tests cover explicit CLI parsing/registration, permission before async and sync
filesystem access, revocation, disconnect settlement, isolated caller lifetimes,
source grants/missing/symlink paths, stale lesson/project and identical-byte
replacement, explicit history refresh, tampered staging, cancellation, late
collision/no overwrite and bounded errors/query redaction. Guard mutations test
actual service/registration/publication/lifecycle boundaries and restore originals.
Final results: **282 focused tests/16files** and **5941 full tests/444files**, zero
skips; one full run at material completion (52.79s Vitest /53.41s command). There
are34new tests, including26file-transaction cases,4actual-HTTP cases,1stdio lifetime
wiring case and3CLI additions. Both TS configurations pass; production Vite passes
(34.27s), Biome35baseline warnings/0errors, docs37files and i18n15catalogs/1265literal
keys and154local/site links pass. **12 independent guard mutations all assertion-kill**, zero survivors,
timeouts or load/compile kills; each source is restored byte-for-byte and checked
again after final tests. Initial fixture assertions/tool-list expectations and an
unbound filesystem spy were corrected, with logs retained; the full suite passes
on its first run. Final rebuilt CLI/stdio proof is in `final-transport/`, preserving
the initial successful proof too.

Preservation verifies112original native files,521prior authoring/export/follow-up
evidence files and68original report/user-report entries. Addon SHA256 remains
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.
No native source rebuild or new sample/decode receipt is claimed. All source/
project/original-lesson hashes in both actual transport proofs remain unchanged.

**Actual production Electron CLI and SDK stdio subprocess proof:** copied real
five-second MP4 source, explicit saved project and lesson, source confirmation,
new editable copy, redacted reopen/query, explicit same-project refresh preserving
history, plus the actual CLI confirm-range command. Source/project/original lesson
hashes remain unchanged. Isolated profiles and DO_NOT_TRACK=1; no user auth/config
or real lessons touched. This reads real source content for pins; it does **not**
render an MP4 or run the sample/full-decode validator. The accepted editor/native
proofs remain historical evidence, not new headless native-export acceptance.
No native picker, GUI clicks or physical capture is claimed.

Original reports/proofs/initial logs/inventories and external user report remain.
The imported inventory now also has a stale selected-step summary hash: coordinator
035c8313 updated that summary before this task. Its current base bytes are verified
against git; imported inventory and original pre-coordinator bytes are retained
separately. The earlier ownership-summary explanation is preserved too, with an
archival copy of its original bytes. No original review report is edited here.

## Review gate and exact next slice

Commit this coherent prerequisite, then coordinator actual Claude exact-SHA
review/fixes/private push. Next: explicitly selected-step **MP4** CLI/MCP export
using these file/source authorities and the accepted LessonRangeExportService /
materializeLessonRange / actual validator. Define real transport caller/channel/
operation ownership, connect disconnect/cancel to owned native control and wait
for actual settlement, authorize explicit output-directory arguments before new
media reads, retain incomplete artifacts, recheck input snapshots around native/
decode/publication and prove it through actual stdio/HTTP transport. Reuse the
existing shared compute lease; do not call editor IPC or infer source grants.
Packaging still requires transitive dependency/course/resource contracts; timed
player still requires controls/captions/progress and separate platform/audio/
physical acceptance. Neither starts before this prerequisite's review checkpoint.
