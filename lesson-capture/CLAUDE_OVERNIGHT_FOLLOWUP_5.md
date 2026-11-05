# Disposition of actual Claude overnight review 5

Reviewed SHA: `9f59c4d4aadb7e489931becadc9d669202a5ddd1`. The original report
is unchanged. It found no Critical/High issue and two Medium findings; that is not
approval of subsequent changes. Slice 6 addresses the findings below and awaits
its own exact-SHA review.

- **M1:** actual prepare/start callbacks re-read policy after mkdir, register and
  recheck candidate consent before helper startup; volatile revocation covers a
  failed durable save. Tests invoke the actual registered callbacks with suspended
  directory creation for both prepare/start, plus cancel and reauthorization.
- **M2:** real document import/reopen and legacy pack consume validated receipts;
  the media details UI displays association status and limits. Version-2 receipts
  bind to complete finished media, with embedded metadata for sidecar-free reopen.
- **L1/L2:** native status/drain output and parent retention reject post-revocation
  status/counters. Parent canaries assert disabled health and no leaked counters or
  later partial status after the suppression marker.
- **L3:** reserve before probe/spawn and reject all known prior media/evidence
  collisions. Preserve originals; don't record a new video at a stale evidence path.
  Tests cover every known suffix, concurrent reservations and lock ownership.
- **L4:** the preference IPC applies denial before persistence; a failed real disk
  save does not publish a new durable snapshot but still suppresses collection.
- **N1/N2:** cursor-only malformed stdout is omitted with fixed diagnostics; warning
  envelopes are guarded. Disabled HUD scope does not claim desktop collection.
- **UX draft observation:** repeated unchanged privacy policy in an unrelated
  preference broadcast no longer resets unsaved application rules.

Review-5 evidence scope remains its reported 131 Rust pass/1 ignored and 97 focused
Vitest tests. Its Node 26.13.0 tests did not use the pinned toolchain; its claim that
the pinned Node was not installed is incorrect: the coordinator verified
`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin/node`
as v22.22.1. Preserve that distinction rather than editing the original report.
New validation and the next review must include explicit `node --version` evidence.
Physical native acceptance remains skipped; fake sessions and disk tests do not
prove portal recording, device counts, hardware loss or pixel/audio alignment.

Slice-6 local validation: 5,384 Vitest / 403 files; 131 Rust / 1 ignored; both TS
configs, builds, lint (35 existing warnings), docs/i18n/diff pass. Final targeted
assertions pass 50 tests, overlapping the full count. Staged helper
`2bbb4efb…568081`; exact hash/logs/skips in `LESSON_CAPTURE_PRIVACY_FOLLOWUP.md`.
Independent exact-SHA re-review remains pending.
