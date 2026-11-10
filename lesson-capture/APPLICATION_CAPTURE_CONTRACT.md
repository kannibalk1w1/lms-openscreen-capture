# Reusable offline application capture contract

10 November 2026. Godot is the first real producer. MCreator, Roblox Studio and
other applications are future adapters; none is installed or claimed supported.

The implemented boundary is deliberately small:

```text
Application-specific observer and permission controls
  → bounded source journal
  → strict application-specific decoder
  → openscreen-application-capture v1
  → shared offline review, explicit selected drafts, lesson evidence/save/reopen
```

`src/lib/applicationIntegrations/capture.ts` owns the application-neutral format.
`godotScene.ts` owns Godot node/property/path rules and converts its existing JSONL
journals. `importCapture.ts` accepts either a normalized JSON capture or a Godot
journal, without loading executable providers. `ApplicationCaptureReview.tsx` and
`lesson/applicationDraft.ts` consume the neutral format. The generic authoring
module imports no Godot implementation. Existing Godot-only callers can use the
small `sceneDraft.ts` adapter convenience function.

## Version 1 fields

| Field | Meaning |
| --- | --- |
| `format`, `version` | `openscreen-application-capture`, `1`; unknown versions rejected |
| `adapterId` | Bounded lowercase producer namespace, for example `godot-scene` |
| `instanceId`, `sessionId` | Distinguish application instances and explicitly started takes |
| `scope` | Human-readable selected document/project identity; never executed/opened |
| `clock` | Only `unmapped` is currently accepted; no implicit conversion to video time |
| `coverage` | `sampled` or `limited`; neither means complete action history |
| `pollIntervalMs` | Producer's fallback sampling interval; event signals may sample sooner |
| `stopReason`, `durationMs` | Closure reason and independent elapsed duration |
| `baseline` | Bounded application-specific JSON context; not automatically made into steps |
| `observations` | Unique local IDs, elapsed time, producer-specific type, summary label and bounded JSON payload |

8 MiB total, 2 MiB baseline, 10,000 observations, 32 KiB payload per observation,
24-hour duration, ordered times and unique IDs per take. The decoder rejects
unknown envelope fields and malformed/unsupported evidence. Baseline/payload data
is opaque to shared authoring: an adapter can describe a block/workspace/resource
without pretending it is a Godot scene node. Object type names stay in payloads.

Normalized files are unverified imported producer claims. Explicitly choosing a
file grants that file's offline read, not application monitoring, installation,
project scanning or a live transport. No provider ID in a file enables a plugin.
Plain data, labels and resource names are escaped when rendered and never executed.
Only selected observation payloads enter draft lesson steps; unselected events and
baseline context do not get copied silently. The selected instance/session/event
identity and `unmapped` clock survive offline lesson save/reopen.

A live provider still needs the existing integration-host capability/permission,
isolation and revocation contract. This offline format does not replace those
checks or permit arbitrary scripts/plugins to be loaded from imported files.

## Adding another program later

1. Identify its supported editor/plugin API and choose an explicit document scope.
   Write its own allowlist, privacy and stop/revoke behavior before collecting data.
2. Write a bounded producer and strict decoder. Preserve original evidence and
   mark gaps/partial sampling; never infer commands from pointer activity alone.
3. Convert its observations to this format. Reuse the existing review/draft and
   generic lesson-evidence path. Add live integration-host registration only if a
   live connection is needed, with its own explicit capability permission.
4. Test its real application, unknown/denied scope, disable/close/failure, overlapping
   instances, missing adapters and offline reopen. Keep OS/input acceptance separate.

The tests use a **synthetic `fixture-editor`**, with non-Godot object-property data,
to prove the shared import/review/draft path. That is architectural coverage, not
an MCreator or Roblox Studio compatibility claim.

Next timing work belongs in an application-neutral association service with explicit
clock relation, capture/interval identity and pause/gap handling. Godot-specific
sampling signals must not define that common media contract.
