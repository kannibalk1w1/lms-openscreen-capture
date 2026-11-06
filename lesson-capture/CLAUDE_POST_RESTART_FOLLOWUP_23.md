# Review23 settlement and provenance follow-up — slice25

Coordinator disposition: actual [review24](CLAUDE_POST_RESTART_REVIEW_24.md)
acceptsfd749b82 with no High/Medium/material completion blocker and closes
L25-1/T25-1. Its independent132focused/4,8real probes and13of14assertion mutation
kills support the scoped verdict. New nitN26-1 remains an unpinned fast-failure
case, still fail-closed. The worker account below is preserved as implementation
evidence. After checkpoint/push, pause until user resumption; source identity is
still plan-only and no new roadmap task begins.

Actual [review23](CLAUDE_POST_RESTART_REVIEW_23.md) accepts361fde51 with no
High/Medium and closes review22 findings within the bounded Linux scope. Its
original report is unchanged. The historical control tally is50assertion kills,
2test-timeout kills and1redundant survivor; those two timeouts are not relabeled
as assertions. This follow-up itself awaits coordinator exact-SHA review.

## Scope and source identity boundary

This is the coherent L25-1/T25-1 prerequisite slice allowed by the task, followed
by the requested pause boundary. It adds no authored source identity capture or
enforcement, schema migration, GUI/API/player entry point or native platform work.
The inspected [source-identity plan](AUTHORED_SOURCE_IDENTITY_PLAN.md) names the
schema/planner/attachment/persistence/recovery/query/static-export seams, bounded
reuse, legacy/missing/changed/relink/refresh semantics, and required real source
edit/revert proof for a distinct resumed slice. None of that future acceptance is
claimed here; current experimental materialization still has per-operation hashes
only and must remain unintegrated with user-facing/timed delivery.

## L25-1 addressed: predictable failure settlement

`runDecoder` now settles its failure promise immediately on deadline, stdout/
stderr cap, child/stream error or failed child exit, independently of `close`.
It clears its timer, sends SIGKILL only to its own direct child, and destroys only
its own stdout/stderr read ends. Kill errors still release the streams and return
a fixed failure. No process search, process-group kill or user-app termination is
introduced. A wrapper's descendants can continue independently; this is not a
process-tree sandbox or a guarantee of terminating a malicious same-user tool.

Successful completion still waits for `close`, requires exit0 and empty stderr,
and consumes all buffered output. It does not accept partial output at `exit`.
If a zero-exit wrapper leaves descendants holding pipes, the unchanged deadline
refuses it and releases our read ends. Version/decode limits remain3s/30s, with
existing16KiB/1MiB stdout and16KiB/64KiB stderr caps. These bound process settlement
subject to event-loop scheduling, not earlier executable hashing or kernel IO;
public validation also closes its owned input descriptor before returning.

New real-process tests use disposable Node wrappers with a tagged8s descendant
inheriting stdout/stderr. Version orphan/slow cases refuse within4.5s against the
3s deadline; version output/error/nonzero-exit and decode output/nonzero-exit
cases refuse within2s. Tests verify the descendant is still present at settlement,
then clean up only its recorded PID after checking a unique `/proc` command-line
marker, and wait up to1s to observe exit (absent/empty command line). The fixture's own8s lifetime is an additional cleanup bound. The new
success test uses a symlinked same-user wrapper; existing real FFmpeg integration
remains the actual decode proof. Mock tests additionally pin owned stream errors,
kill failure, successful buffered output and the30s decode deadline.

## T25-1 addressed: independent provenance guard coverage

- A real symlink and a symlinked real-process tool succeed through canonical path
  resolution and hash the target, while portable evidence contains no tool path.
- Leading/embedded POSIX paths and Windows-style path tokens refuse before decode;
  version output cannot serialize those paths as a claimed tool version.
- The executable size bound is checked before any hash read. A bounded stat/read
  double pins that early-work refusal independently of the read-byte guard; the
  existing sparse oversized-file case still verifies filesystem-level refusal.
- Controlled stat views independently pin read-byte equality, the named executable
  inode check during hashing, and size change during hashing, while later records
  would otherwise compare equal. These are independent guard tests, not a claim
  that the same-user before/after observation defeats every swap between checks.

The pre-open media lstat remains a previously documented redundant guard under
`O_NOFOLLOW`/fstat. The hash initial-size and actual-read-byte caps also provide
layered work bounds; this follow-up does not claim every redundant expression is
independently necessary. Same-user decoder identity still does not attest loaded
libraries, delegated tools or runtime environment. Audio, physical/platform/
hardware, N24-2 slower-host refusal, L23-1 and L23-W1 remain outside acceptance.

## Validation and evidence

Unique evidence directory:
`../openscreen-evaluation/overnight-2026-11-06/slice-25-process-settlement-20261106T125015Z/`.
Pinned Node22.22.1/npm10.9.4; disk inspection found13GiB free on `/tmp` and555GiB
on `/home`. Native source/binaries unchanged: no Rust/native/renderer/package
rebuild, physical capture, visible Electron, Windows/macOS or player run claimed.
No source originals, prior reports/evidence, auth/config, main/upstream/release /
publication or real lessons are changed; no push is performed by the worker.

Final validation:

- Focused159tests/6files pass,0skip; the direct validator/process/integration set
  contains102passes, including8real-process regression cases (7descendant cases
  and1successful symlinked wrapper). Actual FFmpeg coverage remains in the existing
  integration file; a wrapper's supplied listing is not called real frame decode.
- One full suite run, justified by material runtime process settlement changes:
 5731tests/428files pass,0skip,120.30s. No repeat full run was needed.
- Root/test TypeScript pass; lint:fix and final lint pass with35existing warnings;
  docs37files, i18n1253keys/15locales and92relative links across6changed lesson
  documents pass, as do diff checks.
- Fresh `final-controls/`:12mutants killed on assertions,0test-timeout kills,
  no transform/load failures, source restored byte-for-byte with matching SHA256.
  They pin canonical resolution, path-token exclusion, initial executable size,
  read-byte equality, named inode and post-hash size, immediate rejection, each
  owned stream's destruction, version/decode deadlines and failed-child exit.
  The earlier provisional12-control run is explicitly excluded below.
- Fresh backend bundle/runtime readback accepts all4retained rebuilt outputs and
  refuses historical zero-last video, while its real rounded decoded listing
  still passes. All111inventoried prior evidence files remain SHA256-identical;
  original review22/review23/follow-up22 bytes match accepted f3311e8e exactly.
- Native source/binaries unchanged; decoder SHA256
  `393d9fa40315da9075c6cfc3b8702a16687c181d0881e2d502b36b27e7c4e814`,
  version `n8.1.2-34-g9b6c8969e0-20260731`; addon SHA256
  `5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`.

Owned temporary-process cleanup: each real fixture checks its unique marker
before signalling only that descendant PID, then observes exit/empty command line
within1s or confirms it has already exited; its private temporary directory is
removed. All such cleanup assertions pass in the focused/full runs. Mutation
controls also use only those bounded fixtures. No app/server/native render process
was launched, no user app was killed, and no shared cache was purged. The caller's
subprocess streams and direct child are released on failure; unrelated or malicious
wrapper descendants are not searched for or globally killed by production code.

Evidence: `final-controls/mutation-results.json` plus12logs and baseline source;
`runtime-results.json`, bundled validator/stub, `runtime-evidence.log`, retained
zero-last listing, `original-report-identities.json`; initial/final test/type/lint/
docs/i18n/link logs and completion identity record. All provisional logs remain.
An initial new assertion checked public rejection before asynchronous descriptor
close completed; its provisional control run is not counted. The corrected test
allows bounded owned descriptor cleanup before asserting settlement. Initial test
TypeScript diagnostics in stat/read overload doubles are recorded and corrected
before final checks; final outcomes will distinguish assertion/timeouts honestly.


## Restart-safe task disposition

L25-1 and T25-1 are addressed pending independent exact-SHA review. There is no
unresolved implementation/test blocker for this slice. Historical authored source
identity/availability is deliberately deferred under the task's explicit split
option; the inspected plan is concrete but not implemented, and its real source
edit/revert proof has not been performed or claimed. It remains the next backend
prerequisite before user-facing materialization/timed delivery. N24-2, L23-1,
L23-W1 and audio/physical/platform/hardware acceptance remain open.

The user requests pause after this current task. Worker stops after local commit
and completion receipt; coordinator obtains exact-SHA review, completes only
material findings needed for this task, pushes the accepted checkpoint under
existing authority, then explicitly pauses. Do not begin the planned identity
slice or another roadmap item until resumption. Main remains fd2775e2; worker does
not push. Existing authority and original revoked time cutoffs remain unchanged.
