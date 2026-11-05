# Overnight review 4 disposition

Actual [review 4](CLAUDE_OVERNIGHT_REVIEW_4.md) reviewed `a58f56d9`. It confirms the
Medium M1 bitmap-delivery issue is resolved, with no Critical/High/Medium finding.
The reviewer mutated its scratch source to restore the bug and the regression
failed. That conclusion covers that SHA, not subsequent privacy code.

- Low L-T1: added direct delivered-A → excluded pending-B → A assertion that pending
  is cleared, plus a fail-once writer proving bitmap retention and successful retry.
- Nit N1: full-screen coordinate rustdoc moved onto its actual test.
- Info I1: unused excluded sprites are not emitted in the shape-cycle regression.
  A retained late historical click still uses the latest dispatch position/sprite,
  which can reference a sprite observed during Pause; a referenced current bitmap
  can therefore be delivered. This is not observation-time appearance reconstruction
  or visual privacy redaction. Button collection and cursor-motion privacy differ.
- Info I2: pre-start gap warning policy uses whether a take has started at dispatch.
  A gap observed before Start but queued until after it can conservatively warn.
  The parent privacy gate also rejects pre-start input warnings. Neither test result
  implies exact physical boundary membership for a gap.

Reviewer evidence: 126 Rust pass/1 ignored, two scratch mutation checks and staged
hash match; no independent TS/Vitest/build/probe or physical/pixel pass. Original
report remains unchanged. New privacy source/controls require their own review.
