# Disposition of actual Claude overnight review 6

Reviewed `d6fd53023b3564e665d0302af6affaef857007d3` against `9f59c4d4`. Original
`CLAUDE_OVERNIGHT_REVIEW_6.md` is unchanged. Review 6 independently confirms every
review-5 finding fixed, but finds a new High and Medium regression. Slice 7 fixes
them and awaits its own exact-SHA review; this is not independent approval.

- **H1:** wait for actual prepared-helper exit before same-ID replacement. Real
  session + actual callback regressions delay SIGTERM exit for microphone change
  and policy revocation; the earlier fake-only test did not model reservation.
  No active/uncertain reservation is blindly unlocked. Cancellation keeps a barrier.
- **M1:** tolerate unsupported optional asset metadata before strict core parsing;
  real reopen tests cover unknown status, extra fields and inconsistent receipt.
  Return explicit invalid enrichment while generic footage opens; loading preserves
  original bytes and does not embed unknown/private payloads.
- **L1:** versioned PID/birth/launch/helper ownership distinguishes provably interrupted
  capture from pending/unknown/surviving-helper state; locks remain untouched. Media-only
  recovery works without reusing an old capture identity or clearing ownership.
- **L2:** pack retains media with explicit human/JSON warning while excluding unverified
  input/cursor/flag/policy/binding enrichment. Empty destination prevents stale sidecars.
- **L3:** Stop-to-editor full-hash latency explicitly documented. Actual binder benchmark:
  128 MiB sparse fixture, 260.880691 ms, Node22; no production performance claim.
- **L4:** new v3 receipts, embedded project metadata and exported receipts omit app names.
  Old versions remain readable with originals preserved; new suppression records also
  use a policy summary. Historical journal/source-content redaction is separate.
- **N1:** fixed diagnostic categories distinguish parse/envelope and handler faults,
  without logging exception messages or raw records that could contain private data.

Independent review-6 evidence remains 5383 Vitest pass/1 environment-conditional skip
(missing staged ffmpeg in archive) /403 files,131 Rust/1 ignored,bothTS,Biome35,
exact Node22 and hash/probe. It did not reproduce builds or desktop acceptance.
The earlier slice-6 worker had 5384 Vitest pass; do not combine those counts.
See `LESSON_CAPTURE_PRIVACY_RECOVERY.md` for slice-7 validation and exact limits.

Slice-7 worker validation: 5395 Vitest/403 files,131 Rust/1 ignored,bothTS,Vite,
Biome35,docs/i18n/diff pass. Rust/binaries are unchanged; new bridge behavior is
covered by the actual-class/callback tests, not physical acceptance. Review pending.
