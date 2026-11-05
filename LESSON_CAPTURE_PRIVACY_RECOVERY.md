# Countdown replacement and privacy recovery — overnight slice 7

Historical slice-7 validation. [Slice 8 disposition](lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_7.md)
preserves recovery provenance across legacy migration/reopen and reconciles a timed-out
teardown only on proven exit, with requested diagnostic/ownership regressions.

Actual [Claude review 6](lesson-capture/CLAUDE_OVERNIGHT_REVIEW_6.md) independently
confirmed all review-5 fixes at `d6fd5302`, but reproduced a High countdown lock
regression and Medium optional metadata load failure. This slice fixes those and
addresses recovery, packaging and metadata findings. It supersedes relevant behavior
in [slice 6](LESSON_CAPTURE_PRIVACY_FOLLOWUP.md), preserving its original evidence.

## Prepared helper ownership

A microphone/cursor/audio/policy change during countdown must renegotiate with the
same recording ID. Previously discard sent SIGTERM and immediately launched a new
session, which collided with the old helper's still-owned reservation. Startup now
awaits actual child exit before replacement; cancellation also retains a teardown
barrier for a later prepare/start. Pre-spawn cancellation can release its own lock
because the discarded session cannot subsequently spawn. A five-second timeout
reports failure while leaving uncertain ownership intact. The termination fallback
checks whether the child is still the session's process, rather than treating
`child.killed` (a signal-sent flag) as proof that it exited.

Regressions run actual registered callbacks with actual `LinuxNativeCaptureSession`
instances, the same recording ID, real temporary lock files and fake child processes
whose exit is delayed. Both microphone toggle and policy revocation wait before
spawning a replacement and then complete. Policy denial still suppresses buttons;
video and microphone configuration use the current requested settings. These are
lifecycle tests, not a live portal/countdown acceptance pass.

## Optional metadata cannot disable ordinary media

Asset privacy metadata now has a bounded tolerant preprocessing boundary. Unknown
status, extra fields or an inconsistent optional receipt become an explicit invalid
status for that asset. Video, editing and ordinary project reopening remain usable.
Original project bytes are unchanged by loading; malformed optional fields are not
copied into the returned document or executed. Saving the repaired document retains
the invalid status, not an arbitrary unbounded opaque payload. Tests cover actual
DocumentService disk reopen for all three review cases and a private extra-field
canary. Unsupported core document versions still use the existing validation.

## Interrupted owners and nondestructive recovery

New reservations record versioned capture identity, a machine hash, owner PID/process
birth token and launch phase, then helper PID/birth when available. An owner is only
classified interrupted when it is provably gone on the same machine and no launched
helper can still be alive. A surviving helper, launch window without a known helper,
old lock format, foreign machine or uncertain liveness stays pending. PID birth
comparison uses Linux `/proc` when available; an uncertain result never grants reuse.

Inspection never deletes these files. Old capture identities stay protected; a new
take uses a new identity. A failed/crashed take can be recovered into a fresh media-only
package without clearing its reservation, changing its originals or declaring its
button evidence complete. Tests use an actually exited child PID, a surviving process,
unknown launch phase and an old lock, and assert the lock bytes remain unchanged.
This is not repair of an unfinished MP4 trailer or a guarantee every media file plays.

## Pack video independently of unverified enrichment

Legacy pack now permits generic video/webcam packaging when association is invalid,
pending, interrupted, mismatched, conflicting or unavailable. It omits input journal,
cursor/flag telemetry, receipt and binding in that case and returns an explicit warning
in both human and JSON output. Missing/legacy evidence remains visibly unverified;
bound evidence retains its association. An output directory must be empty so a prior
sidecar cannot silently reattach to recovered video and no existing output is overwritten.
Current-editor multi-asset packaging/manifest remains open.

New receipts use version 3 and store declared scope, whether exclusions were configured,
the start decision and capture identity without application names. Versions 1/2 remain
readable and their source files are preserved. Import/reopen/save minimize their embedded
metadata; pack emits a minimized receipt rather than copying private application lists.
New suppression journal records also retain only a policy summary. The machine/PID lock
metadata is not embedded in projects or copied by pack. Tests scan newly created receipt,
project and packed metadata for private application-name canaries and preserve the original
older receipt. This is metadata minimization, not general redaction of historical journals,
video, captions, imported source text or arbitrary sidecars. Durable user settings still
need their actual configured rules to enforce collection choices.

## Stop and verification latency

Stop waits for helper exit/finalization **and** a full-file SHA-256 before returning the
recording to the editor. Import/reopen may also verify a full file when it is not cached.
A one-run local benchmark on Node v22.22.1 hashed a 134,217,728-byte sparse zero-filled
regular fixture through the actual binder in 260.880691 ms. This is not encoded footage,
a cold-cache/storage benchmark or performance acceptance for long/high-bitrate recordings.
The exact artifact is `../openscreen-evaluation/overnight-2026-11-06/slice-7-hash-benchmark.json`.
No sampled-hash shortcut, invented throughput promise or completed latency UX is claimed.

Cursor-only stdout now distinguishes a malformed envelope from a handler failure using
two fixed diagnostic categories, disclosing neither payload nor exception text.

## Validation and limits

Final validation: **5,395 Vitest tests / 403 files pass**, four workers, 135.82 s.
Focused milestone: 169 tests / 7 files; final document-service canary run: 65 tests /
1 file, overlapping the full count. Both TS configurations, Vite renderer/main/preload,
Biome (35 existing warnings), docs, i18n and diff checks pass. Rust helper suite:
**131 pass / 1 existing live-PipeWire test ignored**; this tests unchanged Rust, not
the new TypeScript lifecycle. Logs: `../openscreen-evaluation/overnight-2026-11-06/slice-7-*`.
Native Rust source and the
staged helpers are unchanged from slice 6 (SHA-256
`2bbb4efb71d532a729da016d67898b69d12e64ef3458255742de7f0b45568081`). The bridge/session,
project schema and packaging changes require their own TypeScript/tests/build validation.
Physical desktop/portal capture, counted buttons/device loss, real countdown gestures,
frame/audio/export pixels, sustained capture and Windows/macOS remain skipped because
the available provider lacks screenshot/hotkey/focus controls. This is no release approval.
Next: exact-SHA Claude re-review, then the minimal optional capability boundary before
live Godot clock/semantic expansion. Broader text/media privacy remains open.
