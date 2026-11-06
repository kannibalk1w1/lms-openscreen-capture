# Disposition of actual Claude overnight review 8 — slice 10

Review 8 separately covers recovery `5d0ccd3c` against `e2f4a68d` and integrations
`3329f58e` against `5d0ccd3c`. Original `CLAUDE_OVERNIGHT_REVIEW_8.md` is unchanged.
No High/Medium finding; all review-7 dispositions accepted. This follow-up awaits
its own exact-SHA review alongside the next clock milestone.

- L8-1: one outer inspection boundary now preserves an existing recovery exclusion
  on **every** result, including reservation, invalid and unavailable paths. Pack
  uses a shared typed decision, excludes enrichment whenever `recoveredFrom` exists
  even if a fresh neighboring receipt later matches, and carries the exclusion.
  Real DocumentService save/reopen + pack canaries cover a temporary lock, invalid
  receipt and actual directory permission failure; restored adjacent journals are
  excluded and original source bytes remain. The permission test runs on non-root
  Unix hosts; this run is Linux UID1000 and exercised it. The UI displays recovery
  history in addition to current association status.
- L9-1: typing-import IPC returns bounded `success/files` or a fixed error code.
  A disabled decoder maps to a specific enable hint, never arbitrary exception or
  payload text. A direct real-dialog regression uses a finished valid raw journal.
  The asynchronous project guard also runs before handling either response branch.
- I-B1: imported integration provenance is visibly labelled an unverified source
  claim, including normalized portable input. It does not attest an application,
  scope, adapter execution or video-clock synchronization.
- I-B2: an explicit successful reenable clears stale optional provider errors; an
  incompatible/missing provider cannot be made available by clearing status.
- Future preferences nit: malformed/future integration settings conservatively
  read disabled. The next explicit v1 save replaces that integration settings
  block with the current supported choice, preserving unrelated settings. Unknown
  fields inside that block are not retained as executable/configuration data.
- N8-1: pack classification is centralized with typed reasons; no status `as` cast.

Validation logs: `../openscreen-evaluation/overnight-2026-11-06/slice-10-*`.
**77 focused tests / 7 files pass** (overlapping earlier67/6 and31/3 runs). Both
TypeScript configurations,Vite renderer/main/preload,Biome35 baseline warnings,
i18n1155literalkeys,docs/diff pass. Native Rust/helpers
are unchanged. Full suite is reserved for the following clock milestone, including
this checkpoint; prior full counts are not new slice-10 proof. Physical/portal,
recovered-media playback, live Godot/clock/OS input and other-platform acceptance
remain skipped. No real lesson project or external account configuration changed.

Review-8 independent evidence: B5428 Vitest pass +1 staged-ffmpeg conditional skip
/407 files (5429 total); A526 focused/19 files; three TS configurations,Vite3bundles,
Biome35,i18n pass. No Rust changes/build or physical acceptance in that review.
Next: read-only native clock samples and separately authorized Godot pairing. File
import permission never enables a live connection or broader text collection.
