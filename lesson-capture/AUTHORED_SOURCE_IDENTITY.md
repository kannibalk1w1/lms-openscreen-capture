# Authored source content pins — slice26

Status: actual [Claude review25](CLAUDE_POST_RESTART_REVIEW_25.md) accepts exact
93518c36916492c67b52f95d783bda19d35e8446 with no High/Medium/material blocker.
Its bounded follow-up is locally in progress, awaiting separate exact-SHA review.
This is a bounded Linux backend prerequisite, without a GUI/IPC/CLI/MCP capture or
materialization entry point. Ordinary application adapters remain optional.

## Explicit observations and legacy behavior

`planLessonRange` remains a pure metadata operation returning strict version1
geometry/render-input references. Planning, parsing, ordinary editable save/open,
recovery, query and static guide export do not read media or infer new identity.
Legacy version1 references retain their original schema and survive round trips;
materialization refuses them with `range-media-unattested` before document,
destination or source access. They require explicit current-content capture.

`captureLessonSourceIdentity` takes explicit `author-current` intent for a version1
reference, or `refresh-current` intent plus a fresh range request for the currently
authorized saved project. Refresh requires the same project ID as the previous
reference and refuses another project before reading it; cross-project rebinding
requires a separate future explicit intent. It resolves only selected sources through shared
visible-segment/native-clip readers and ephemeral cuts. It records strict version2
geometry plus a version1 identity containing a new UUID observation ID, explicit
basis, opaque SHA256 asset/role binding IDs, full-file SHA256 and byte counts.
Identity records contain no source path, filename, label, inode or filesystem time.
Binding hashes are deterministic and recomputable/linkable given asset IDs; they
are not unlinkable or secret identifiers.
No time or UTC-based encoder-clock relationship is inferred.

Capture observes sources twice and revalidates saved project/render geometry
between and after observations. It returns a value for the existing stale-safe
`attachLessonMediaSelection` helper: lesson/step/previous-reference must still
match; newer authored text survives and the step returns to draft. No captured
result is attached implicitly. Refresh creates a new observation and preserves
the previous complete reference as a flat snapshot; earlier snapshots are retained.
At most eight previous snapshots are allowed; a full history is refused rather
than silently pruned. Existing 16MiB editable/recovery limits still apply.

## Materialization and file authority

Materialization verifies exact source-binding coverage and current saved geometry
before choosing a destination. A cancelled valid pinned destination causes no
current media reads. After folder selection it hashes bounded regular sources,
compares them to the stored pin, and revalidates the saved project before creating
any output directory or invoking the native compositor. It never silently replaces
a stored pin with operation-time hashes. Existing post-render source/project and
actual MP4 sample/full-frame decode checks precede the completion receipt.
The receipt copies current opaque pins but omits previous-selection history.
Audio timing/stream-metadata flags remain false.

Unchanged bytes at a replacement inode and an exact byte revert can match again.
This is content equality at observations, not continuous unchanged-file history.
An explicit relink changes the saved render-input fingerprint even with identical
bytes and requires explicit refresh/rebind. Missing, empty, nonregular, unreadable
or symlinked files fail with fixed path-free codes; no directory scan, discovery,
implicit relink or arbitrary path from imported identity records is used.

Limits remain at most eight unique selected sources, 8GiB total file bytes,
32selected spans/clips and 1/30–120programme seconds. Webcam, imported audio,
external images/click sounds/webcam effects and cursor-sidecar dependencies remain
unsupported. Full-file hashes establish byte identity, not valid visual meaning,
metadata duration, correct audio or AV alignment.

The shared reader bounds chunks at1MiB and work by byte budget. It checks regular
named-path and open-descriptor dev/ino/size/mtime/ctime before/after streaming,
uses no-follow/nonblocking open flags, and checks AbortSignal between chunks and
operation boundaries. Cancellation cannot hard-bound a kernel filesystem syscall
or interrupt an already-running native render/decoder; it prevents certification
after cancellation is observed, preserving any incomplete output. Before/after
checks do not make native pathname opens atomic or defeat malicious same-user swaps
between observations. No immutable media snapshot, authenticated human author,
signed history or protected attestation is claimed; editable JSON can be forged.
Linux file authority is the implemented scope; Windows/macOS require acceptance.

## Portability and redaction

Full editable parsing/save/reopen/recovery retains current pins and flat history.
Queries expose only presence and stored status (`content-pinned`, `legacy-unattested`
or null), never hashes, binding IDs, observation IDs or source locations. Stored
status does not assert present availability or verified current content. Static
HTML/Markdown/guide projections strip the entire selection, including history.
Older strict readers may reject version2; there is no silent version1 upgrade.

## Evidence and remaining acceptance

Fresh retained evidence directory:
`../openscreen-evaluation/overnight-2026-11-06/slice-26-source-identity-20261106T1624Z/`.
`proof.cjs` bundles current backend code with only Electron's app-path lookup
stubbed, uses the real DocumentService and unchanged native compositor, and saves
original/project/source hashes and complete decoded evidence in `proof.json`.

The disposable five-second MP4 copy is explicitly pinned, attached, saved/reopened
and recovered with exact identity; legacy recovery is also unchanged. Altered
bytes produce `range-media-changed` with zero native calls and no output folder.
Restoring exact original bytes yields one native render:45frames at30fps/1.5s,
actual stored-sample timing plus full-frame decode before the receipt. Original
source/project bytes, all111inventoried prior files and all52prior Claude reports
remain unchanged. The run used Vulkan/software H.264 with synthesized silent
AAC; this is no microphone/audio alignment or physical capture acceptance.

Automated tests cover current and legacy round trips/recovery, canary redaction,
stale attachment/text preservation, explicit refresh/relink/history capacity,
source rewrites/truncation/replacement/missing/symlink, saved-project changes,
exact opaque coverage, platform refusal, cancellation and descriptor/named-path
identity races. Faithful bounded stat/stream/hash doubles test the 8GiB boundary
without allocating or hashing gigabytes. Final worker validation:5,763tests/430files pass,0skipped (53.13s), plus
89focused tests/7files pass,0skipped. Root TypeScript and renderer/main/preload
production Vite build pass; test TypeScript passes. Lint passes with35existing
warnings, docs37files, i18n1253keys/15locales and77relative links across six lesson
documents pass. No native/Rust source or binary changes or rebuild are made; the
proof uses the unchanged addon SHA256
`5d16ea983672b7cb51cc92f3be0df1ee5cf78823bf86e421911a9ef58c09efca`
and decoder SHA256
`393d9fa40315da9075c6cfc3b8702a16687c181d0881e2d502b36b27e7c4e814`.
The fresh backend bundle passes the retained native proof; no app/server is
started, and its owned Node/native render process exits successfully. No user
process is killed or shared cache purged. Remote private feature was verified at
pre-sliceec125e08, local/private main remainsfd2775e2; worker performs no push.
These are worker checks of93518c36, independently accepted in review25. Its
follow-up tightens refresh project identity and independently pins the six T26-2
guards; follow-up validation/review is recorded separately.

Physical capture/portal/input/device-loss, visible Electron flows, screen-reader,
Windows/macOS, broader dependencies, audio alignment, timed player and user-facing
capture/materialization workflows are not run or delivered by this slice.
