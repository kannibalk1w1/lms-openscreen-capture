# Button-evidence collection privacy — overnight slice 5

Historical slice-5 behavior and validation below. [Slice 6](LESSON_CAPTURE_PRIVACY_FOLLOWUP.md)
supersedes startup races, collision handling, post-revocation metadata and reopen
claims following actual Claude review 5; preserve these original test boundaries.

This is a bounded Linux button-evidence collection gate. It does **not** deliver
complete application privacy, text/media redaction, retention exclusions or a
pre-export inspection workflow. Video, audio, ordinary source cursor motion,
captions, typing, imported evidence and existing projects have separate behavior.
Nothing here enables cloud processing, AI, file monitoring or an application adapter.
Ordinary recording remains independent of Godot and other application integrations.

## Behavior change and scope

New and old settings default button evidence to **Off**. Explicit **Global pointer
buttons** consent permits the existing global evdev or optional KWin driver;
selecting a video window does not restrict this global input. Application allowlists
and exclusions are stored as bounded opaque IDs, but these native drivers cannot
attest the active application. Therefore application-restricted mode, or global
mode with exclusions that cannot be enforced, suppresses button collection.
The UI states that limitation. It never reports unknown context as verified scope.

The policy is version 1, with Off/global/applications scope and bounded allow/exclude
lists (32 IDs per list, 256 characters per ID). Missing, corrupt, oversized, future
or unsupported settings fail closed. Explicit policy decisions are shared by the
main process, durable preferences, recording request and receipt. Exclusions win
when an attesting source is available; current native context is always unknown.
Tests of a known identity prove the pure policy evaluator, not OS app attestation.

The main process takes its canonical policy from durable settings; a renderer's
recording request cannot substitute a broader policy. Prepared countdown sessions
are compared with that snapshot and are discarded on a mismatch. A policy reduction
also suppresses any existing/prepared take. Appearance presets do not authorize
collection. There is no adapter registry or plugin prerequisite in this path.

## Producer, session and storage gates

The helper requires explicit `capturePointerButtons: true` before opening evdev
readers or connecting KWin. Missing/false consent starts neither. The opt-out
`OPENSCREEN_DISABLE_CLICK_CAPTURE` still takes precedence over consent. Cursor-only
sessions explicitly request false, retain ordinary motion, and reject unexpected
button-click samples and their bitmap in their accumulator.

Native recording now requires `buttonPrivacyVersion: 1`. A bounded, noninteractive
probe (`probeOnly`, hidden cursor, no button consent) checks that capability before
a real session is launched. The existing helper probe path exits before portal
Start or reader creation. Unsupported helpers are rejected with a rebuild message;
a second Ready check handles a changed binary between probe and launch. This does
not certify an arbitrary malicious replacement executable. Existing saved projects,
old journals and old cursor sidecars remain readable without a live helper.

During a take, **Stop button evidence for this take** immediately closes the
parent's retention gate and sends one-way `suppress-input`. The helper's stdin
thread closes an atomic forwarding gate before queueing its main-loop status;
normal input dispatch and Stop draining check it again. Reader/watch threads stop
forwarding/exit as they observe the gate. A blocked evdev read/socket may remain
open until its next event or process teardown; this is not instantaneous OS-handle
closure or permission revocation. Already in-flight helper lines are rejected by
the parent. Reenabling requires a fresh authorized take. Video recording continues.

Suppression does not delete earlier authorized evidence. An existing journal adds
`input-policy-suppressed` in append order; that is a control-boundary marker without
an invented encoder/Godot timestamp. Later capture boundaries retain clock metadata
but mark `buttonStateObservation: "suppressed"` with no held-button identities.
No synthetic up/down is appended. Post-suppression pointer records, click samples,
input discontinuities and input warnings are excluded from retained paths; status
and drain metadata are limited to their declared fields. The host also excludes
these private source lines from saved helper diagnostics. Unknown event types and
malformed stdout are not copied verbatim; malformed records yield a fixed diagnostic
marker. Structured native errors and stderr remain diagnostic paths and are not a
general-purpose secret redactor.

## Persistence and reopening

Preferences use the existing recording-settings store and survive a new store/app
instance. Explicit application recording calls also create
`<video>.capture-policy.json`, mode 0600 on Unix, without overwriting an earlier
receipt. It records the requested policy, unavailable application identity and
whether collection was permitted/suppressed at Start. This is a declared policy
receipt, not proof of physical completeness or of every device's behavior.

A receipt write/collision failure suppresses button evidence while video continues.
Global-consent journals retain the later suppression marker; an off/restricted take
creates no input journal. Legacy internal callers missing policy fail closed and
may lack a receipt; current application handlers supply an explicit canonical policy.
The reader validates version, size, shape and decision consistency on reopen.
Legacy CLI packing carries an existing receipt byte-for-byte with its source.
This does not fix the separate current-editor packaging/manifest gap or sanitize
arbitrary imported sidecars. Cancellation removes the newly created receipt along
with the recording's existing sidecars through the normal discard path.

## Controls and limits

The Linux recording HUD offers a real durable policy choice before recording,
editable application rules, unknown-scope messaging and one-way live suppression.
IPC/read/save failures do not show an unverified collection success. New label keys
exist in every locale resource; their initial wording is English and full translation
review remains open. Browser-fallback/no-native-session health is explicitly unknown,
not an application-scoped success. Windows/macOS button collection has not been
integrated with this first Linux policy path.

**Not covered:** password/sensitive-field detection, generic text suppression,
Godot semantic capture, raw video/audio/caption redaction, removal of earlier
journal/code baselines/deltas, cache/thumbnail/library-wide retention projections,
all export dependencies or a pre-export review UI. Blur and lesson trims do not
remove those originals. This slice must not be described as complete privacy.
The new application-capability boundary must apply stronger policy before broader
text/semantic collection; unsupported restricted context must remain suppressed.

## Validation — 5 November 2026

- Native helper tests exercise absent/malformed/explicit consent, disabled evdev
  reader creation, disabled KWin connection/forwarding, one-way gate behavior,
  existing reader-time/Stop/recovery checks and sprite retry/pending-clear cases.
- Actual temporary-file preference write/new-store reopen and receipt write/read,
  private permissions, size/version/consistency/collision behavior are covered.
  Legacy pack preserves receipt bytes. These are actual disk tests, not OS capture.
- Session canaries cover off, unknown allowlist, unknown exclusion and a legacy
  journal flag without consent. Additional canaries arrive after live revocation,
  in click bitmap/device/gap/warning/boundary/extension metadata, unknown events and
  malformed stdout. Tests scan created disk files, cursor data/assets, saved helper
  diagnostics and captured console output. Earlier authorized evidence remains;
  session-end/video fixture completion still succeeds. Receipt collision also
  leaves existing evidence untouched and suppresses new button evidence.
- React/jsdom tests exercise explicit opt-in, durable settings, unsupported scope,
  failed save, stale initial-read races, live suppression and existing HUD controls.
  Fake protocol tests prove retention and lifecycle, not real desktop delivery.
- Fresh helper capability/probe and actual recording startup remain distinct from
  synthetic helper/session tests. Final counts/build hash are recorded below.

Final validation: **5,355 Vitest tests / 401 files pass**, four workers, 133.70
seconds. **131 Rust tests pass / 1 existing live-PipeWire test ignored**. Both TS
configs, renderer/main/preload build, native release build, Biome (35 existing
warnings), docs, i18n and diff checks pass. A prior 5,351-test run preceded the
capability/probe refinements; it is not combined with this final count.

Both staged helpers hash-match:
`97d5f349445d9c0d61d96ebc1d458cd0dbef58fa88dad250623f6bce09146a6b`.
The release build probe reports privacy version 1/PipeWire 1.6.10; an additional
real hidden-cursor probe uses the exact app-side probe arguments and also passes.
Those probes do not call portal Start or count devices. Relevant final logs:
`slice-5-vitest-full-final.log`, `slice-5-rust-final.log`, `slice-5-vite-final.log`,
`slice-5-native-build-final.log`, `slice-5-hidden-privacy-probe.ndjson` and
`slice-5-helper-sha256.txt`. Focused iterations include 184 tests/nine files;
final session-specific checks cover 47 tests and UI-specific checks six tests,
all overlapping the full count.

Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-5-*`.

**Skipped:** actual portal/desktop recording and counted devices on this helper,
physical focus/app identity, touchpad/held-button/kernel-loss trials, OS HUD gestures,
frame/audio alignment, native preview/export pixel checks, sustained capture,
Windows/macOS policy/runtime and remaining manual checklist. Orca's provider lacks
screenshot/hotkey/focus support. No real lesson project was modified.

Next concrete item: minimal optional capability/session isolation and offline
reopen contract before live Godot bridging, followed by shared versioned lesson
steps/manifest and an adapter-free offline guide slice. Privacy lifecycle/redaction
and cross-platform acceptance remain critical parallel backlog, not completed here.
