# Privacy lifecycle and source association — overnight slice 6

This slice follows actual Claude review 5 of `9f59c4d4`. The original review is
preserved in `lesson-capture/CLAUDE_OVERNIGHT_REVIEW_5.md`; the disposition is
`lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_5.md`. Its findings changed behavior,
not just documentation. This document supersedes the slice-5 startup, collision,
post-revocation metadata and reopen claims in `LESSON_CAPTURE_PRIVACY.md`.

## Consent through asynchronous startup

The actual Linux prepare/start/cancel IPC callbacks now live in
`electron/ipc/linuxCaptureStartup.ts`, instantiated by the main-process handlers.
They read canonical durable policy after directory creation, register the candidate
and recheck current consent without an intervening await before starting it.
Revocation also records a process-local denial, including if the durable Off write
fails; a later successful explicit authorization permits a fresh take but never
reenables an already suppressed session. Actual registered callbacks have deferred
mkdir, prepare/start, cancellation and failed-save race regressions. Preference
IPC tests independently exercise a failed real disk write and immediate revocation.
No fixture test drives physical input or the portal.

Once revoked, the native dispatcher and parent reject later reader status and
activity-derived drain counters. Earlier authorized evidence and its explicit
suppression marker remain. Capture clock/control boundaries continue with no
held-button identities; no physical releases are invented. Cursor-only malformed
stdout uses a fixed diagnostic marker and checks warning envelopes. The HUD shows
disabled scope rather than desktop collection scope when policy denies collection;
unrelated preference notifications preserve unsaved application-rule drafts.

## Immutable destination and completed-media binding

Explicit-policy sessions reserve their destination before the capability probe or
helper spawn. Existing media, receipts, binding, journal, cursor or flag sidecars
cause rejection; prior files are preserved. An exclusive owner-checked lock prevents
concurrent app sessions from claiming the same new path. This is application-level
collision prevention, not protection against a hostile external process replacing
files while recording. A new collision no longer continues video at the old path.

The initial private receipt is version 2, with a random capture identity and the
same declared policy/start decision. The receipt remains immutable. After the
helper exits and finishes media, a separate immutable binding records its identity,
full SHA-256 and byte length. Hashing streams the complete file and rejects a source
that changes during the read; a bounded cache keys results by file identity and
size/mtime/ctime. Full verification can add import/reopen latency for large or
remote media; there is no sampled-hash shortcut or performance acceptance claim.
Binding failure preserves the video and leaves evidence unverified.
It is neither a cryptographic consent signature nor proof of physical completeness.
Legacy version-1 receipts remain readable but explicitly unbound.

## Real import, reopen, inspection and legacy pack

Document-service video import and disk reopen now inspect sidecars and store bounded
policy/binding metadata on the asset. Embedded metadata can verify the same bytes
after moving media without sidecars. A changed source, conflicting capture identity,
malformed/oversized/linked receipt, incomplete binding or denied policy beside a
journal yields an explicit unverified status. The editor's media details display
that status, declared start scope and limits. Status is recomputed on reopen;
prior serialized `bound` alone is never sufficient. Imported journal contents are
not loaded or copied into these metadata fields. Missing metadata stays unverified.

Legacy CLI pack validates association before copying evidence. Invalid, incomplete,
mismatched, conflicting or unavailable association rejects packaging; existing
legacy/unreceipted evidence remains byte-for-byte with an unverified warning.
Binding travels with new receipts. Current-editor multi-asset packaging remains a
separate open roadmap item; this does not claim to implement its manifest.

## Remaining limits

Button policy still covers Linux native button collection only. Video, audio,
ordinary cursor motion, typing, captions, thumbnails/caches and previously retained
evidence require separate privacy controls. No generic text producer, semantic
Godot producer or additional adapter is enabled. Receipt association does not
sanitize footage or sidecars. Full locale translation review remains open.

## Validation — 5 November 2026

- Final full Vitest: **5,384 tests / 403 files pass**, four workers, 120.83 s.
  The first full run had one obsolete source-layout routing assertion fail
  (5,383 pass); its update and the actual callback regressions passed 11 focused
  tests before the final full rerun. No production fix was needed for that failure.
- Focused milestone: 171 tests / 10 files pass. Final additional assertions for
  disabled HUD scope and actual session/media binding pass 50 tests / 2 files;
  these overlap the full count and are not added to it.
- Linux helper Rust: **131 pass / 1 existing live-PipeWire test ignored**.
- Both TypeScript configs, native release build, renderer/main/preload build,
  i18n, docs, diff and Biome pass (35 existing warnings). Node version evidence
  explicitly records **v22.22.1**. Build warnings remain visible in logs.
- Both staged helper copies SHA-256:
  `2bbb4efb71d532a729da016d67898b69d12e64ef3458255742de7f0b45568081`.
  Build probe and explicit hidden/no-button probe report privacy version 1 and
  PipeWire 1.6.10. These exit before portal Start and are not device-count tests.
- Logs/artifacts: `../openscreen-evaluation/overnight-2026-11-06/slice-6-*`,
  notably `vitest-full-final`, `focused-final`, `final-assertions`, `routing-recheck`,
  `rust`, `native-build`, `vite`, `tsc-*-final`, `lint-final`, `helper-sha256`,
  `hidden-privacy-probe` and `node-version` (each with its recorded extension).

**Skipped:** hardware,
portal, physical device loss, pixel alignment/export and Windows/macOS acceptance
remain skipped because the available desktop provider lacks the required controls.
Next: exact-SHA Claude re-review, then minimal optional capability/session isolation
and disabled/failure/reopen behavior before live Godot clock bridging.
