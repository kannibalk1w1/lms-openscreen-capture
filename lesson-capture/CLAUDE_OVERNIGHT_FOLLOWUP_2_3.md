# Overnight reviews 2 and 3 disposition

These are implementation dispositions, not Claude approval of later code. Preserve
[review 2](CLAUDE_OVERNIGHT_REVIEW_2.md) (`249a09da` vs `ffc34ca4`) and
[review 3](CLAUDE_OVERNIGHT_REVIEW_3.md) (`43c2f91d` vs `249a09da`) unchanged.

- Review 3 **M1 Medium**: fixed by acknowledging sprite delivery only after a
  successful emitted sample, retaining only the current undelivered bitmap.
  Excluded A→B→C→B regression checks references and no suppressed metadata emission.
- Review 3 **L1/L2**: strengthened paused left press, nonzero resumed click and
  normal current-interval fixture; production normal and queued input share one
  handler. Full portal `run()` control ordering remains inspected, not simulated
  as a physical test.
- Review 3 **L3**: moved sample rustdoc back onto its function.
- Review 2 **R1 Low**: reason-specific warning codes; pre-start historical gaps
  do not latch live take warnings. Current availability status remains visible.
- Review 2 **R2**: timing evidence contract now lists admitted Stop-drain edges as
  `late`, including the current interval.
- Review 2 **R3**: post-stop audio push exceeds ring capacity; shared production
  handler/status arm now directly exercised. Budget/fence tests and TS journal
  pass-through are still distinct from complete `run()`/desktop acceptance.
- Review 2 **R4**: conservative post-gap unmatched releases remain deliberate.

Exact implementation coverage: [slice 4](../LESSON_CAPTURE_CURSOR_RECOVERY.md).
Review 2 independently ran 124 Rust pass/1 ignored, 80 focused Vitest/7 files and
both TS configs. Review 3 independently ran 124 Rust pass/1 ignored and checked
staged hashes; it did not rerun TS/Vitest/builds or physical/pixel acceptance.
Do not count these as an independent review of subsequent privacy changes.
