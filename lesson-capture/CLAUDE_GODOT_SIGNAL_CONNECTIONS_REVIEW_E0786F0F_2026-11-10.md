# Independent review: e0786f0f "feat: capture saved Godot signal connections" (parent 6be3ae7f)

Reviewer: Claude (Opus 5.5), independent. Date: 10 Nov 2026.
Source: immutable snapshot /tmp/godot-connections-review-e0786f0f. Mutations and probes ran only in
/tmp/godot-connections-review-e0786f0f-scratch (a copy) and ~/.cache/gcr5 (real probe fixture).

## Verdict: CHANGES REQUESTED

The privacy design holds up. Callables are never invoked, bound values are never recorded,
endpoints are restricted to observed nodes, v1-v4 still import and the real probe passes. Two
Medium findings remain. A valid v5 take can fail import because of a label length (F1), and at
the documented 1,024-connection bound the editor stalls on every poll (F2). Both fixes are small.

## Gate dispositions

| # | Gate | Disposition |
|---|------|-------------|
| 1 | Consent extended | **Met.** plugin.gd start dialog adds "Records saved signal connections between nodes of this scene (signal, source, target and method names, and how many arguments are bound, never their values)". Nit: "saved" also covers CONNECT_PERSIST connections made in-session and not yet saved to disk (the doc explains this, the dialog does not). |
| 2 | Both endpoints observed, PERSIST not sufficient | **Met.** Source must be a valid Node in `allowed`. The target is iterated from `nodes`, and `callable.get_object() == target`. A Resource source fails the `as Node` cast and is counted. The decoder re-checks both endpoints against the state's nodes (mutations M1/M1b/M1c killed). |
| 3 | No Callable invoke / bound values / lambdas / script contents | **Mostly met.** No invoke (verified: a lambda body print never ran). Values are never recorded (BOUND_VALUE_CANARY absent in the real probe). **Exception F3:** a bound, self-capturing *named* lambda whose name matches a declared script method is recorded as a plain method connection. Only names are recorded, so there is no content leak, but the "lambdas excluded" claim is false for this case. |
| 4 | Unsupported/custom handling explicit, no full-coverage claim | **Partly met.** `excludedConnections` counts only persistent *incoming* connections into observed nodes that fail the source/callable/name checks. The doc truthfully says outgoing connections to unobserved targets and non-persistent connections are "not seen". **Exception F4:** `.bind(x).unbind(n)` is recorded as `boundArgs: 1`, while the doc says unbind wrappers are excluded. |
| 5 | Baseline vs sampled differences | **Met.** Header connections are baseline. Added/removed labels say "observed" / "no longer observed". The doc disclaims route, emission and behaviour. |
| 6 | Bounds and limit handling | **Met for correctness, with caveats.** The 1,025th connection sets `_limited` and breaks both loops (verified in Godot: 1,026 made gives 1,024 returned and `limited=true`; exactly 1,024 gives `limited=false`). In `begin()` that gives the existing refusal ("scene exceeds supported bounds"), and in `_sample()` it gives `stop("limit")` with a `coverage: limited` footer. `mark_checkpoint` checks `_limited` after sampling. Names are capped at 100 identifier chars and boundArgs is clamped 0-64. The per-observation payload is about 130 B, well inside 32 KiB. Caveats: F1 (300-char label limit), F2 (cost), N2 (excluded count not bounded by the producer). No per-node cap exists, but the total cap covers it. |
| 7 | Deferred/one-shot, duplicates, identity, teardown | **Met, with a test gap.** Deferred and oneShot are recorded (real probe: the added record has `deferred: true, oneShot: true, boundArgs: 1`). Duplicates: Godot itself refuses a second `bind()` of the same method on the same signal ("already connected"), verified, so the producer cannot emit identical records via bind. The decoder rejects duplicates (M4 killed). Teardown: the real probe asserts `connected_observer_count() == 0` after stop, and the limit, footer-failure and disable probes still pass. Gap: L1. |
| 8 | v1-v4 and normalized v1 preserved; tail validation; no script/resource reads | **Met.** The v1-v4 and history suites pass. Normalized `version: 1`. Every raw state is validated after the observation cap (M9 killed; the tail test exists). `get_script_method_list()` reads the compiled script's method *table* (names and signatures), not source text. It is used only as a boolean for bound custom callables, and nothing beyond the already-recorded method name enters the journal. I judge this acceptable and not "reading script contents". The PRIVATE_CONNECTION_SCRIPT_CANARY stays absent. |

## Findings

**F1 (Medium): valid v5 journals with long node names fail normalized import.**
`describeConnection` labels can reach 28 + 200 + 1 + 100 + 3 + 200 + 1 + 100 = 633 chars. The
shared capture schema allows labels of at most 300 (`capture.ts` `label: z.string().min(1).max(300)`).
The producer allows node names up to 200 UTF-16 units and identifiers up to 100. So
`parseGodotSceneJournal` succeeds, but `godotSceneCapture()` throws a ZodError and the whole
take becomes unimportable through inspect/import/draft.
Verified with a scratch vitest: node names of 150/151 chars and 60-char signal/method names
produce a ZodError from `godotSceneCapture`.
Labels before this commit stay under 300 (the longest is "Node changed: <200> (fields)", about 280).
Fix: truncate or elide names in the label (the payload already carries the IDs and full record).
Add a test at the maximum lengths.

**F2 (Medium): per-sample cost at the documented bound stalls the editor.**
`_snapshot()` runs on every 250 ms poll, and `_connections` runs inside it each time.
In real Godot 4.7.1 (headless), 512 nodes with 1,024 persistent connections took about
**377-413 ms per call**. Profile of that cost:
- Enumeration alone (`instance_from_id` + `get_incoming_connections` for 512 nodes) is about 1 ms.
- Regex is about 1 µs per check.
- The `sort_custom` comparator is the major cost: `JSON.stringify(a) < JSON.stringify(b)` re-serialises both dictionaries on every comparison. Sorting already-sorted input alone took about 95 ms; dictionary building and the unsorted sort make up the rest.

The editor main thread would be blocked more than 100% of the time at that bound. Fix: build a
key string once per record (or sort by a tuple of fields), or lower the bound. Typical scenes
(tens of connections) cost only milliseconds.

**F3 (Low): a bound, self-capturing named lambda is recorded as a method connection.**
Repro target script: `func f(a = 0, b = 0): pass` and `func mk(): return (func f(x): print(name)).bind(3)`.
`a.renamed.connect(b.mk(), CONNECT_PERSIST)` is recorded as
`{"signal":"renamed","method":"f","boundArgs":1,...}`. The lambda's object is `B` (it captures
self), `get_method()` is `f`, it is custom with a bound count of 1, and the script declares `f`.
The lambda body never ran.
- A lambda that does not capture self has the GDScript as its object and is skipped (verified).
- A persisted lambda cannot be saved to a .tscn, so this only affects in-session state.
- Only names are recorded, so there is no privacy impact. Truthfulness impact only.

**F4 (Low): `bind(x).unbind(n)` is recorded although the doc says unbind wrappers are excluded.**
Verified: `a.tree_exited.connect(b.f.bind(7).unbind(1), PERSIST)` gives `get_bound_arguments_count()=1`
and `get_unbound_arguments_count()=1`, and the record is `method f, boundArgs 1`, which hides the
unbind. Reverse order (`unbind(1).bind(9)`) gives bound=0 and is excluded, as documented.
Fix: in `_method_callable`, also require `callable.get_unbound_arguments_count() == 0`.

**L1 (Low): unit tests do not pin `oneShot` or `boundArgs` in the connection identity.**
Mutations M6 (drop `oneShot` from `connectionKey`) and M6c (drop `boundArgs`) both **survive**
all 133 tests. The test "treats changed flags or bound-argument counts as a different connection"
exercises only `deferred`. Add cases for `oneShot` and `boundArgs`.

**L2 (Low): the MAX_CONNECTIONS stop path has no automated test.**
I verified it by inspection and the direct Godot call above, but neither the unit suite nor the
real probe drives a take past 1,024 connections to a `limited` footer, or a refused `begin()`.

**N1 (Nit): byte budget.** A state with 1,024 connections is about 132 KB (measured 132,109 B
for the connections array). Every changed sample repeats the full list, so a connection-heavy
take reaches the 8 MiB limit after about 60 changed samples. The limit path handles this
truthfully, but the doc only says "inside the existing 8 MiB budget".

**N2 (Nit): the excluded count is unbounded in the producer.** The producer does not clamp
`excludedConnections`, while the decoder rejects values over 1,000,000. This is not reachable
in practice; clamp it for symmetry.

**N3 (Nit): error message wording.** "Signal connections require exactly scene journal schema
v5 or later" and "…requires exactly … v4 or later" both say "exactly … or later".

**N4 (Nit): ambiguous labels.** `describeConnection` uses node names, which can repeat across
parents, so labels can be ambiguous. The payload carries IDs, so this is cosmetic.

Not a bug (checked): connectionKey/dedupe covers all seven fields; comparison diff is
symmetric (M5/M5b killed); the `v4 = schemaVersion >= 4` gating is correct (M7 killed, and v5
requires history/run); the envelope accepts v5 (M10 killed); `instance_from_id` + `as Node` +
`is_instance_valid` is safe for freed nodes.

## Commands and results

- `npx vitest --run src/lib/applicationIntegrations` (snapshot): **8 files, 133 tests passed**.
- `npx tsc --noEmit`: exit 0. `npx tsc -p tsconfig.test.json --noEmit`: exit 0.
- Real probe from the snapshot: `OPENSCREEN_SCENE_PROBE_TMP=~/.cache/gcr5 GODOT_BIN=/home/kannibalkiwi/.local/bin/godot node scripts/probe-godot-scene.cjs`
  gave **exit 0**, with SCENE_PROBE_PASSED, record/byte/marker-limit footers retained, **CONNECTIONS_PASSED** (3 counted),
  **HISTORY_RUN_PASSED** (7+3), OFFLINE_DECODER_PASSED and PORTABLE_AUTHORING_PASSED.
  - probe.log: 0 SCRIPT ERROR. The 3 lines of `texture_2d_get` "Parameter t is null" are noise from the dummy renderer.
  - No harness spawn error.
  - Fixture retained at ~/.cache/gcr5/godot-scene-probe-F6ljTq.
- Direct GDScript probes of `_connections` (scratch project gdprobe/, headless, Dummy audio, scratch XDG): the F3/F4 repros, the duplicate-bind refusal, the limit, and timing.
- Builder evidence (read-only): Windows stdout shows CONNECTIONS_PASSED and HISTORY_RUN_PASSED. The production report status is "passed". full-suite.log shows 6,585/483. I did not rerun the full suite or the production roundtrip.

## Mutation results (decoder copy, restored and verified with `cmp`: RESTORED_IDENTICAL)

| ID | Mutation | Result |
|----|----------|--------|
| M1 | endpoint check removed | killed (3) |
| M1b | `from` check removed | killed (1) |
| M1c | `to` check removed | killed (2) |
| M2 | connections v5 gating removed | killed (1) |
| M3 | excludedConnections v5 gating removed | killed (1) |
| M4 | duplicate check removed | killed (1) |
| M5 / M5b | comparison added / removed always empty | killed / killed |
| M6 | `oneShot` dropped from key | **survived** |
| M6b | `deferred` dropped from key | killed |
| M6c | `boundArgs` dropped from key | **survived** |
| M7 | `v4 = === 4` | killed (6) |
| M8 | unrecorded-count observation removed | killed |
| M9 | skip state validation after cap | killed (3) |
| M10 | envelope without v5 | killed (7) |

## Limits of this review

- No physical Signals-dock use and no Windows rerun.
- Timings come from a headless editor on this machine.
- The full 6,585-test suite and the production CLI/MCP roundtrip were not rerun; the builder's logs were inspected instead.
