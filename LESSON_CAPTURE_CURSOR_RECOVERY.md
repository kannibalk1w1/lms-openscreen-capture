# Cursor asset delivery and review fixes — overnight slice 4

Claude's actual [review 3](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_3.md) found a
Medium bug in `43c2f91d`: excluded samples could mark a cursor bitmap known before
it reached Electron, then overwrite its pending slot. Resuming on that cursor
could reference a bitmap missing from the cursor recording's asset table.

The helper now owns delivered IDs separately from the single current undelivered
bitmap. Observing a shape does not mark it delivered; only successful sample
emission does. Excluded A→B→C→B changes emit no sample or standalone bitmap. On
Resume the current B bitmap accompanies its first emitted reference. An excluded
unused C in this regression is not exported. A retained late click can still use
the latest dispatch sprite/position, including a current sprite observed during
Pause; a referenced bitmap can then be emitted. This is not appearance-time
reconstruction or visual privacy redaction. Returning to a delivered shape clears an obsolete
pending bitmap. Retention does not grow with excluded shape history.

Normal recording input and Stop draining now call one production message handler,
shared by the native fixture. Its gate remains the encoder projection. The
stronger fixture admits 21 drained edges and excludes four, including a left
press mid-Pause; it compares three drained clicks with journal timestamps and
checks a resumed interval-1 click at at least 10 ms. A separate normal-dispatch
pair through the same handler verifies a non-late interval-1 click at >=20 ms.
The original 19-edge/two-click fixture counts remain historical slice evidence.

Review 2's Low warning-label finding is also fixed: unplug, kernel overflow and
KWin stream loss have reason-specific `click-capture-*` codes. Before a take
starts, a historical gap does not latch a recording warning or create journal
evidence; independent current availability status still applies. Debug-enabled
runs can report the pre-start gap. Actual input gaps after Start retain both
explicit discontinuity evidence and live/journal warning.

The Stop audio test now pushes three seconds beyond a two-second ring after Stop,
so its zero-drop assertion can detect admitted overflow; queued pre-stop sample
and AAC/video duration checks remain. The main Stop handler's status arm is now
exercised by the fixture. Full `run()` ordering, budget warning emission and the
physical portal lifecycle still have code inspection and narrower component tests,
not a desktop end-to-end proof. The `late` contract now includes Stop drain.

## Validation — 5 November 2026

- Rust helper: **126 passed / 1 existing live-PipeWire test ignored**. New tests
  cover excluded shape cycles with every emitted asset reference resolvable, no
  unused excluded bitmap emission, and reason-specific warnings/pre-start policy.
  Existing fixture is strengthened as described above; actual software video/AAC
  codecs and the shared handler are exercised, not physical device input.
- No TypeScript production behavior changed in this slice. Previous full milestone
  was 5,336 pass/398 files at the cursor slice; do not present it as a new full run.
- Both TypeScript configs and **88 focused Electron tests / 8 files pass**.
  Native release build/startup probe and Biome (35 existing warnings) pass.
  Both staged helpers match SHA-256
  `245453509678c6c07c81fc84d7877abe818a16e25da0151c1f677c5364218f8a`.
  PipeWire 1.6.10 metadata readiness is only a startup probe. Renderer/main/preload
  source is unchanged from the last successful build; it was not rebuilt here.
- Original review reports 2 and 3 are preserved verbatim. Their independent results
  remain separate from implementation checks. Actual [review 4](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_4.md) confirms M1 is resolved
  at `a58f56d9`; its [minor follow-up](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_4.md)
  is incorporated separately. This does not review later privacy code.

Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-4-*`.

**Skipped:** actual desktop/portal/device count, physical pause/sprite/unplug/kernel
recovery, native cursor visual preview/export, frame/audio timing, sustained and
Windows/macOS/manual-checklist acceptance. No new physical or production claim.

Next concrete item: bounded button-evidence privacy policy at producer/storage,
truthful unsupported scope suppression, durable reopen receipt and canary tests;
then a small optional application-capability boundary before live Godot bridging.
