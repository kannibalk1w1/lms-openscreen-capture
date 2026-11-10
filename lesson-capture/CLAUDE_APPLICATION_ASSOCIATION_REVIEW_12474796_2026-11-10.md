# Independent review: application association — 12474796 vs e65dc4ac

- Reviewed HEAD: `124747966449ede910e4d03c5afac933a6e52015`. Base: accepted `e65dc4ac`.
- Scope: `src/lib/applicationIntegrations/association.ts` and `association.test.ts`, plus the new documents (`APPLICATION_ASSOCIATION_2026-11-10.md`, the preserved recheck report, and the handoff note).
- Excluded, as instructed: the concurrent worker's `ApplicationAssociationControls.tsx` and its tests, and the `lesson.association` locale keys.
- Reviewer: Claude (Opus 5.5), Orca task `task_1da1d6d23404`. Read-only; nothing was written to the repo. All probes ran from `/tmp/claude-assoc-12474796/` on an esbuild bundle of HEAD built from stdin.

## Verdict: ACCEPT, with two Low follow-ups

Neither follow-up blocks this library-only slice. Both should be settled before the calibration and persistence slice relies on the library.

The integrity, bounds, mismatch handling, gap handling, protection of caller data and batch behaviour all hold under my own probes. The documentation states its limits accurately: synthetic clocks, no encoder synchronisation, not wired into the UI or IPC.

## Findings

### L1 — Low — Observations at exactly `durationMs` can never be mapped, and real Godot journals contain them
Spans must satisfy `applicationEndMs ≤ capture.durationMs` (`association.ts:120`), and resolution uses half-open intervals (`:209-212`). An observation whose `atMs === durationMs` therefore always resolves to `unmapped-gap`, whatever plan is used.

Repro (`p.cjs` case 3): a span covering 0–1000 on a capture with `durationMs` 1000 resolves an observation at 1000 ms to `{"status":"unmapped","reason":"unmapped-gap"}`. A span ending at 1001 is rejected.

Real evidence (`p3.cjs`, decoding with the accepted e65dc4ac decoder): the retained record-limit journals contain observations at exactly `durationMs`:

| Journal | Observations at `durationMs` |
|---|---:|
| Linux `godot-scene-observations` | 14 |
| Linux probe `eBCnXy` | 8 |
| WinBoat `Al7OpQ` | 3 |

These are the final samples written in the same millisecond as the footer, and the Godot producer's final "stop" sample can land the same way. So the last observed change of a take can be impossible to map.

Options:
- allow a span ending at `durationMs` to include its closed right edge;
- or document this explicitly as an "end-of-capture" unmapped reason, rather than a generic gap.

### L2 — Low — `mediaTimeMs` is fractional, and normal rounding can land on the span's end or pause boundary
Interpolation returns a raw float (`:222`). In my float probe (`p.cjs` case 4), no result reached `recordingEndMs`, so the library's own half-open contract holds. However, values such as `86399999.99999999` (span 0–86.4M onto 86399999–86400000) and `86399999.99998842` come out, and `Math.round` turns them into `recordingEndMs`. When the span ends at the segment's `endMs`, that is the pause boundary, which belongs to the next segment.

Every downstream consumer that needs whole milliseconds (lesson evidence `atMs` is an integer, and seeking) needs one agreed rule: floor, or clamp to `recordingEndMs - 1`. Without it, a mapped point can be persisted or seeked into the wrong segment.

Recommendation: return an integer from the library (floor), or document the rule in the contract before the persistence slice.

## Informational (no change required)
- **I1. Batch versus single calls:** each call validates and hashes the whole capture. A 7.76 MB capture with 10,000 observations takes about 262 ms to create and about 207 ms to batch-resolve all 10,000 IDs (8,064 mapped). Twenty single `resolveApplicationObservation` calls took 3.9 s in total. The calibration UI should use the batch API, or memoise per loaded capture, never call per row. The documentation already describes the batch API.
- **I2. Fingerprints bind the sources, not the spans:** a plan whose spans were edited in-bounds, while keeping the original fingerprints, still resolves (case 5b maps to 1000 ms). That fits the design, because the plan is authored calibration and anyone can create a new one through the public API. Invalid forgeries are rejected: an unknown or cross-segment span throws (case 5), and an extra top-level key throws (case 9b). The documentation should not describe plans as tamper-evident.
- **I3. What the fingerprint covers:** it covers the zod-validated view of each input, not the raw bytes.
  - Unknown recording-clock keys are stripped, so they are not fingerprinted (case 6c maps).
  - Zod drops `__proto__` keys inside JSON payloads or the baseline entirely, so two captures differing only there hash the same (case 2, and `p2.cjs` shows the parsed baseline is `{}`). That data never enters the app, so it is not an integrity gap. This behaviour already existed in `capture.ts`.
  - `-0` and `0` hash the same.
- **I4. Protection of caller data confirmed:** I mutated the capture payload and the clock segment `endMs` immediately after calling `createApplicationAssociation`, before awaiting it. The plan still reflects the original data and resolves against an untouched copy (case 1). All parsing happens synchronously before the first `await`, and zod returns detached objects.

## Verified as sound
- **Plan schema:** strict, version and format literals, at most 128 spans, UUID span IDs, non-overlapping and ordered on both axes, positive ranges, integer milliseconds up to 86.4M.
- **Re-validation at resolve time:** spans are checked again against the current capture duration and the clock segments (containment within the named segment). A retained-fingerprint plan with a forged segment throws.
- **Mismatch handling:** returns `unmapped` with a specific reason. Changed segments give `recording-metadata-changed` and a changed baseline gives `evidence-changed` (case 6). The adapter, instance, session, scope and recording-session order is correct. A malformed plan throws.
- **Boundaries:** the right application edge and gaps are unmapped, nothing is extrapolated, and the result stays below `recordingEndMs` in my edge cases (case 4).
- **Source clock untouched:** the capture keeps `clock: "unmapped"`, and the plan is a separate object.
- **JSON round trip:** a plan written to and re-read from JSON still resolves (case 9).

## Checks run
- Focused vitest: `association.test.ts`, **7 of 7 pass**.
- My own probes `p.cjs`, `p2.cjs` and `p3.cjs` on a HEAD bundle with pinned Node 22.22.1 (cases 1–9 above).
- Root's retained 40-assertion `probe.cjs` passes on Linux against both root's `platform/association.cjs` and my own HEAD bundle. The retained `windows.stdout.log` records the same 40/40 on win32 with Node v22.22.1.
- `git status` was clean at review time and HEAD was `12474796`. I did not inspect the concurrent worker's files.

## Skipped or limits
- No full suite, tsc or lint rerun; I relied on root's 6455/470 report. This pure library does not touch startup, IPC or Vite.
- No WinBoat or VM access; I only read root's retained output. No real recording, encoder or native clock. Like root's, my probes use synthetic captures and clocks, except the L1 evidence scan, which reads real retained Godot journals.
