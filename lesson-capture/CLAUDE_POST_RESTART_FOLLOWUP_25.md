# Slice26 bounded review25 follow-up

Coordinator disposition: actual [review26](CLAUDE_POST_RESTART_REVIEW_26.md)
acceptsd017e4b881abb3279d26ee663b46f2f54f11d32f with no findings and closes
L26-3/T26-2/N26-5. Independent97focused/7files pass,0skip;34mutation controls
leave only5known redundant/equivalent survivors, no timeout/load failures.
The original worker validation account below is preserved; the original native
proof and prior evidence remain unchanged. Coordinator owns checkpoint/push.

Actual [Claude review25](CLAUDE_POST_RESTART_REVIEW_25.md) accepts exact
93518c36916492c67b52f95d783bda19d35e8446 againstec125e08 for its bounded
Linux backend scope, with no High/Medium or material completion blocker. The
original report is preserved verbatim. Coordinator requested these bounded
follow-ups before private push; this document records worker disposition and
validation, not a claim of actual follow-up review or approval.

## Findings and resulting behavior

**L26-3:** `refresh-current` now requires `replacement.projectId` to equal the
previous reference's project ID. A different project is refused with fixed
`range-media-unsupported` before any `readDocument` call, for both legacy and
pinned previous references. Explicit same-project refresh and path relink remain
covered by existing passing tests. A cross-project rebind would require a separate
future explicit intent; refresh does not silently acquire that broader meaning.

**T26-2:** independent regressions now pin all six identified gaps:

- Receipt history is exactly empty even when the stored selection has history.
- Materialization refuses both Windows and macOS before project/picker/media access.
- Abort observed immediately after a picker returning null rejects cancellation;
  it cannot return a normal cancelled result or read sources/create output.
- Two individually bounded source rows accept exactly8GiB combined and reject
  8GiB+1, with unique bindings so another schema guard cannot mask this check.
- Imported schema history accepts8flat legacy snapshots and rejects9 independently
  of the capture-time history cap and duplicate-observation rule.
- The selected-source resolver refuses an existing native path with no visible
  asset binding, independently of its source-count and total-binding limits.

**N26-5:** source comments and the implementation document now say deterministic
asset/role binding hashes omit paths and labels but can be recomputed and linked
by anyone knowing the asset IDs. No secrecy or unlinkability is claimed.

## Focused validation and fault controls

Evidence directory:
`../openscreen-evaluation/overnight-2026-11-06/slice-26-review25-followup-20261106/`.
The implementation changes only the project-identity guard and explanatory
comment; no native source/binary, frontend workflow or next phase is changed.

Worker focused checks:97tests/7files pass,0skip; the restored isolated snapshot
positive run also passes97tests/7files,0skip. Both root and test TypeScript pass,
lint passes with35existing warnings, docs37files and82relative links across
seven changed/new lesson documents pass. No build/native rebuild or i18n change
is made, so no new build/i18n result is claimed. The previous5763full/
430result belongs to93518c36, independently reproduced by actual review25. A full
rerun is not claimed for this narrow guard/test/document follow-up; meaningful
focused tests and both TS configurations are used as requested.

`controls.py` creates an immutable-commit archive outside the checkout, overlays
only the follow-up implementation/tests, and symlinks dependencies entry by entry
excluding shared Vite caches. Each mutation changes one guard in that isolated
snapshot. Seven targeted controls are assertion kills: refresh project equality,
receipt history stripping, materialization platform refusal, post-picker abort,
aggregate schema bytes, imported history max8 and empty source bindings.
There are0timeouts and0transform/load failures; snapshot sources are restored.
The restored97test positive run is recorded separately; no checkout code is mutated by
controls. These seven controls do not claim to eliminate review25's documented
mutually redundant/layered/equivalent survivors (I4/I5/I22/I26/I30).

## Preserved proof and scope

All111prior inventoried evidence files and52prior original reports are rehashed
unchanged. Review25 itself is separately pinned at SHA256
`3c93494197969bbd3340969231aa18d0688900b72ace53333e62ac8a64dd5bf4`.
The original slice26 proof JSON remains SHA256
`2fec56c27063db6bb486b1021890252ed73f3a57f9f6594809284bf6ef449a3d`.
That retained real native edit/refusal/revert proof is not rerun or overwritten:
the new guard narrows cross-project refresh and does not change its same-project
capture/materialization behavior. It remains the original45frame synthetic
Linux offscreen encode plus stored-sample/full-frame decode evidence, with audio
flags false and no immutable/authenticated historical attestation.

No app/server/native render process is launched for this follow-up; Vitest and
TypeScript exit after their checks. No user/other process is killed and no shared
cache is purged. Physical capture, platform/hardware/audio acceptance, N24-2,
N26-1, L23-1/L23-W1, user-facing capture/materialization and timed player remain
open. No further roadmap phase starts. The worker commits locally; coordinator
obtains actual exact-SHA follow-up review and owns the private feature push.
