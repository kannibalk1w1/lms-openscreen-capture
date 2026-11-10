# Application-neutral manual timing primitive — 10 November 2026

The [Claude recheck](CLAUDE_GODOT_CAPTURE_RECHECK_E65DC4AC_2026-11-10.md) accepts
`e65dc4ac` and closes F1/F2/F3, with no new findings. The original review and both
root correction reports remain preserved. The parked player changes are outside
that acceptance. Private push remains deferred.

The next roadmap foundation is implemented in `applicationIntegrations/association.ts`,
with bounded implementation by the cheaper worker and root inspection/integration.
This is a **pure library**, not yet a user-visible calibration workflow, automatic
video placement or live clock bridge. It supports normalized captures from any
application, without importing Godot, lesson, native, filesystem or network code.

## Contract and behavior

- Versioned `openscreen-application-association` v1 plans contain selected capture
  adapter/instance/session/scope identity, recording-control session/clock identity,
  canonical SHA256 fingerprints and up to 128 explicit manual mapping spans.
- Each positive half-open span relates application elapsed milliseconds to selected
  recording-control active milliseconds inside exactly one named pause segment.
  Bounds, order, uniqueness, non-overlap, duration and segment containment are checked.
- Only explicit span interiors map, using manual two-point linear interpolation.
  Pauses/uncovered gaps and right boundaries stay unmapped; nothing extrapolates.
- Canonical fingerprints ignore object-key ordering but preserve data/array order.
  Changed source evidence, scope, instance, take or recording metadata refuses a
  mapping. Fingerprints identify content, not OS attestation or authority to read media.
- Source capture `clock: unmapped` stays unchanged. The separate plan is authored
  calibration. Recording-control metadata is **not** the native/encoder clock;
  no frame accuracy, pause detection or automatic synchronization is claimed.
- `resolveApplicationObservations` validates and fingerprints each input once per
  batch, then resolves requested IDs. Single-point resolution delegates to it.
  Missing IDs return unmapped; malformed plans throw. Caller data is detached before
  asynchronous hashing and is not mutated. No long-lived global cache is created.

## Validation and exact limits

- Worker-focused: seven tests pass, test TypeScript passes and changed-file Biome
  passes. Cases include boundaries/gaps, different identities, changed payload and
  metadata, canonical key order, forged spans, input immutability and batch hashing.
- Root read the module and tests and added indexed observation lookup for batches.
- Full suite: **6,455 tests / 470 files pass**, 160.78 seconds, pinned Node/npm,
  four workers, required process/socket access. Both TypeScript checks and lint
  (35 existing warnings) pass.
- Root bundled the actual production module with esbuild and ran a cheaper worker's
  independent public-API probe on Linux and **WinBoat Windows 11 / Node 22.22.1**.
  Both pass **40 assertions**, including distinct mapping slopes, half-open edges,
  gaps, changed identities/data, JSON plan roundtrip, and a forged cross-segment span
  with retained fingerprints. These probes use synthetic non-Godot observations
  and a synthetic control clock, not a real recording or native clock.
- The library is not wired into Electron/IPC/CLI bootstrap, the lesson schema or
  the capture UI yet. No new Vite/startup, live Godot or physical capture claim is
  made for this library-only slice; the prior checkpoint's production startup proof
  remains separately recorded.

Artifacts: `../openscreen-evaluation/application-association-2026-11-10/` retains
root logs, bundled source, independent probe, both platform outputs and hashes.
Claude review of this new primitive is pending. Next: optional calibration controls
using explicit source/segment and manual bounds, with stale-result guards, then
selected authored timing persistence and review. Ordinary capture/authoring works
without calibration, adapters or recording-clock metadata.
