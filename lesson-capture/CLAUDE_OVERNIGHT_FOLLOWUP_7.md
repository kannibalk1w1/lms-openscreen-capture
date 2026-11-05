# Disposition of actual Claude overnight review 7 — slice 8

Review 7 covers `e2f4a68d7b72bf3276c5aaab208f2f6df2338208` against `d6fd5302`.
The original report is unchanged. It finds no High/Medium issue and independently
confirms review-6 fixes. This follow-up awaits a subsequent exact-SHA review.

- L7-1: media-only packages retain explicit `recoveredFrom` provenance. Inspection
  preserves the interrupted/pending/invalid/mismatch/conflict/unavailable warning
  without inventing a policy receipt or consent. The legacy→current and reverse
  project migration also carries this optional metadata. A real pack→migration→
  DocumentService save/reopen regression covers source preservation and warning.
- L7-2: track retiring sessions, not a cached rejected promise. Each new attempt
  asks the actual session to prove exit; timeouts retain the ownership fence.
  A later real exit permits another recording. Cancellation IPC returns a bounded
  failure response instead of rejecting ignored renderer promises. The actual
  class/callback regression covers timeout, protected lock, late exit and new ID.
- N7-1: distinct fixed parse/envelope and handler-fault diagnostics have a regression
  with private payload, malformed-line and exception-text canaries.
- N7-2: same actual-class test proves SIGKILL at 500 ms while `child.killed` is true;
  ownership tests cover provably dead and Linux birth-mismatched helper identities.
- Info error-event: a failed signal on a spawned child no longer releases its
  reservation or counts as exit. Spawn failure without a PID is distinct. A direct
  actual-session error/wait/exit test proves the lock stays until actual exit.

Validation: 146 focused tests / 6 files pass, including project migration and actual
file/service recovery; the final session recheck passes 51 tests, overlapping that
count. Both TS configs, Vite renderer/main/preload, Biome (35 baseline warnings),
docs and diff checks pass. Native Rust/helpers are unchanged; no native rebuild or
new physical acceptance is claimed. Full suite will run at the next integration
milestone; slice-7's 5395 full passes are historical, not this slice's result.
Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-8-*`.

Review-7 independent evidence stays 5394 Vitest pass/1 staged-ffmpeg conditional
skip /403 files,131 Rust/1 ignored,bothTS,Biome35,Vite three bundles,8 canaries.
No physical/portal/recovered-media playback acceptance. Generic media still needs
playback/trailer verification after a crash; recovery provenance is not a repair.
Next: minimal optional capability/session boundary and real controls, keeping
ordinary recording and stored lesson evidence usable with every adapter disabled.
