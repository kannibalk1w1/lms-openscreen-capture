# Optional application boundary — overnight slice 9

Historical slice-9 validation. [Review-8 follow-up](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_8.md)
adds bounded disabled-import feedback, visible unverified provenance and explicit
provider-status reset; it also preserves recovery exclusions across every inspection path.

This is the first working subset of the [integration design](lesson-capture/APPLICATION_INTEGRATIONS.md).
It adapts the existing Godot typing **file importer**, with an optional internal
capability/session boundary and real persistent controls. It does not connect to
Godot, install a plugin, monitor files, inspect projects or enable live text capture.
No second real adapter or executable plugin loader is introduced. Ordinary recording,
the capture pad, portable typing files and saved projects remain independent.

## Current user workflow

In **Typing capture → Application integrations**, explicitly enable **Godot typing
journal import**, then choose the finished raw journal. Default is disabled, including
missing/malformed/future settings. The control saves locally through the existing
settings store, updates other application windows and shows disabled, selected-file
availability, unavailable, incompatible, active-import or error status. It never
claims an editor connection. The decoder supports journal schema 1, previously tested
with Godot 4.7.1; this is not a probe of the installed Godot or version attestation.
Initial new locale strings are English across all 15 resources; translation review
remains open. The native checkbox is keyboard accessible; desktop acceptance is open.

Main-process IPC uses the same application service as the tests. A renderer cannot
supply a broader enabled policy with its import request. Disabling closes optional
sessions before persistence and still applies in that process if the save fails;
a restart uses the last durable choice. Enabling takes effect only after a successful
save. Durable reductions are rechecked before each raw import. Ordinary recording
preferences are preserved by integration writes, and integration preferences survive
ordinary preference writes through the existing shared atomic settings store.

Portable/normalized JSON remains core evidence and is usable when every adapter is
disabled, including older Godot takes. Raw Godot JSONL requires the optional decoder.
Browser runtimes lacking the main API retain portable JSON support and report the
optional integration unavailable. File selection explicitly supplies existing source
content; this opt-in is not an application allowlist or authorization to collect new
OS/editor text. Video selection never attests application identity or project scope.

## Bounded internal contract

`src/lib/applicationIntegrations/` owns an application-neutral internal host. A
validated descriptor has ID, version, contract version, capabilities, supported/tested
application versions and a collection mode. The only current capability is
`typing.journal-import`; the only scope/mode is an explicitly selected file. Missing
providers show unavailable; an incompatible provider is isolated without failing the
host. Empty registry and all-disabled operation require no Godot executable.

Session and observation envelopes retain adapter ID, instance ID, session ID, selected
artifact scope, capability, sequence, type, observed/inferred provenance, original
clock ID/tick and an explicitly **unmapped** media relation. Independent UTC timestamps
are never equated. Host routing rejects wrong instance, session, adapter, capability,
scope, sequence or clock identity/order and drops that connection's pending content.
It does not fabricate physical events or substitute inference for observations.

Bounds are 16 sessions, 64 pending observations per session, and 8 MiB + 64 KiB pending
serialized bytes; source and normalized typing retain their existing 8 MiB/50,000-event
limits. Startup has a five-second timeout. Late startup completion is torn down;
disable/error clears queued content and stops callbacks. Revoked callbacks reject
before touching a late payload. Optional producer faults do not call recorder lifecycle.
These are internal in-process contracts, not a sandbox or a framed external transport.
Future live sources need their own scope attestation and collection permission before
any producer/watch connection starts; they cannot use selected-file permission.

## Existing importer, durable identity and reopening

The actual Godot decoder runs behind this host. Imported normalized takes keep the
original Godot producer and text/key semantics. Each import instance gets a unique
core take ID, so two journals sharing a producer-local session ID cannot replace each
other when saved. Original clock/session identity is retained in optional provenance,
along with adapter/version/instance/session/artifact/capability and unmapped relation.
Local event IDs remain scoped by their take/instance rather than globally renamed.

Normalized evidence stays in existing `typingTakes`; no live adapter is needed to
reopen, replay, edit or export it. Unknown optional provenance becomes an explicit
unsupported marker rather than making the project unopenable; the UI warns while
validated content remains usable. Unknown raw fields are not executed or embedded
unboundedly. Core typing/event validation remains strict. Project switching during
file read or IPC response is checked again before accepting a draft into the UI.

## Validation and limits

Focused milestone: 100 tests / 14 files pass, covering the host/service, actual IPC
callbacks, settings, UI controls/dialog and typing regressions. Final identity checks
add stronger assertions to the existing seven service tests; counts overlap. Tests
cover default-off/restart/failure, two fake same-type instances and distinct fake
adapters with colliding local identities, wrong/stale envelopes, unknown/denied scope,
revoked private payload getters, queue/byte limits, missing/incompatible/crashing/
timed-out providers, late teardown and actual disk reopen without the integration.
Private canaries are absent from disabled storage, health/broadcast metadata and
unsupported provenance. These are fixtures, not live Godot/OS observation tests.

Final full milestone: **5,428 Vitest tests / 407 files pass**, four workers,
133.21 s. A final focused run passes **19 tests / 2 files**, including one additional
project-switch-during-IPC-response regression added after the full run began; it is
not included in the 5,428 count. Settings-preservation and distinct durable identity
assertions are strengthened there too. Both TS configs, Vite renderer/main/preload,
Biome (35 existing warnings), i18n, docs and diff checks pass. New literal i18n key
coverage is 1,153. Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-9-*`.
Native Rust source and
helpers are unchanged (last staged helper `2bbb4efb…568081`); no native rebuild or
new physical capture acceptance is claimed. The milestone also runs the full suite
for slice 8 (`5d0ccd3c`) after its focused recovery checks.

**Open:** verified live application/project scope, live capability probing, streaming
semantic capture, explicit Godot/encoder clock bridge and pause awareness, commands
for integration settings/import through CLI/MCP, real desktop accessibility, other
platform/app versions, generic text/media redaction and historical retention. This
slice must not be called a complete integration manager or complete privacy. No real
lesson project, user plugin installation, auth configuration or cloud service changed.
Next: exact-SHA review of slices 8/9, then an explicit clock bridge with separate
permission/scope and pause/gap evidence; shared lesson manifest/offline guide follows.
