# Overnight review 1 disposition

Actual [Claude report](CLAUDE_OVERNIGHT_REVIEW_1.md) reviewed `ffc34ca4` plus baseline
`17dd44a8` against `fd2775e2`. It found no High/Medium defect. This disposition is
written by the implementation worker; it does not constitute further Claude
approval of the changes below. The original report is preserved unchanged.

- **N1 (new Low audio tail): fixed in slice 2.** Stop closes audio rings while
  preserving queued samples/pending mix. A real AAC/software-video fixture tests
  accepted pre-stop count, rejected post-stop callback and frame-bounded duration.
- **N2 (click effects): next implementation slice.** Journal projection and cursor
  UTC/pause compaction still differ; no new consumer should join them meanwhile.
- **N3:** docs now state the out-of-order guard is defensive, with no current FIFO
  producer. Kernel overflow has its own raw-reader gap path and never relies on it.
- **N4:** docs specify retained interval identity, `(mediaTimeMs, intervalId,
  sequence)` ordering, and prohibit re-excluding on floored boundary milliseconds.
- **N5:** docs distinguish UTC emit observation from monotonic transition time.
- **N6:** session fixtures are described as pass-through evidence. Actual encoder/
  projection/channel tests are separately identified. Original test results remain.
- **B1:** corrected start-while-paused claim, removed unreachable branch and added
  actual encoder pre-first-frame Pause/Resume coverage. Buffered main-loop path is
  inspected, not claimed as a full portal test.
- **B2/B3:** first slice fixed dispatch projection, historical state and the upstream
  pre-start-pause duration bug; the latter is now explicitly documented.
- **Known baseline open items:** slice 2 adds bounded Stop drain, per-source gap
  evidence and RawDevice SYN_DROPPED handling. Full reader/kernel drain and counted
  physical recovery remain acceptance limits.

Reviewer evidence stays separate: 117 Rust pass/1 ignored, 270 focused Vitest,
full snapshot 5,330 pass + 1 environment skip, both TS configs. Implementation's
checkout milestone was 5,331 pass with its staged FFmpeg real-file test available.
Neither result is rewritten or presented as a desktop acceptance pass.
