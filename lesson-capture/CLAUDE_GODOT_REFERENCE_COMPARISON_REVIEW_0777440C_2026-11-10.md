# Independent review: Godot reference comparison (0777440c) and label fix (47bc7c0a)

Reviewer: Claude (Opus 5.5), independent. Snapshot: `/tmp/godot-reference-review-0777440c` (not edited).
Scratch copy for probes and mutants: `/tmp/godot-reference-review-0777440c-scratch/copy`. After the run it is identical to the snapshot (`diff -r -q` is clean and every mutant was checked back with `cmp`).

## Verdict: ACCEPTED WITH LOWS

There are no High or Medium findings. Every coordinator gate holds in substance. The Lows are
about how complete the reported evidence is (some rows omit details and one unknown is missing).
None of them can change an outcome to `sampled-fields-agree` when it should not be. The reason:
any source below v5 always adds `connections-unobserved`, so the outcome is already partial.

## (A) 47bc7c0a: label segment shortening

- Worst case: the prefix `Signal connection no longer observed: ` is 38 units. The other parts
  are 48 + 1 + 48 + 3 + 48 + 1 + 48. That totals **235 UTF-16 units, within 300**. Signal and
  method are ASCII identifiers of at most 100 characters. The node-ID fallback is at most 20.
- The cut uses `for…of` over code points, so it never splits a surrogate pair. The new test
  checks for lone high and low surrogates.
- I swapped the `abc342ad` `Array.from` expression into the scratch copy. Both label tests
  fail: the old emoji assertion, and the new worst-case test with "Too big: expected string to
  have <=300 characters". A `> 48` boundary mutant is also killed.
- Ledger entry is accurate. **Disposition: accepted.**

## (B) Gate table

| Gate | Disposition | Evidence |
| --- | --- | --- |
| 1 Advisory, not grading | Met | `kind: "advisory-sampled-state-comparison"`; outcomes are `sampled-fields-agree/differ`, `partial-no-observed-difference`; the doc disclaims verification and grading. |
| 2 Two explicit sources, identity, limits | Met | Each side keeps scene, schemaVersion, session, instance, raw footer coverage, stopReason, and checkpoint seq/label/atMs. Limitations are stated (no hashes yet). Nit N2. |
| 3 Session-local IDs, path keys | Met | IDs are used only inside a take. Key is `JSON.stringify(nameArray)` (M4 slash-join killed). Duplicate paths throw (M3 killed). Root matched at `[]`, with name and type compared as fields (M8 killed). Rename and reparent give unmatched paths, with no relinking. |
| 4 Gaps are unknown, never agree | Met with Lows | v2 vs v3 Node3D goes to `unobservedFields` and `node3d-fields-unobserved` (M1, M14 killed). Below v5, connections are `{status:"unobserved"}` (M11 killed). Excluded connections give partial (M2 killed). Limited footer on either side is flagged (M5 killed). 2D fields and Sprite2D texture are recorded v1+, so no gap there. v1 cannot hold checkpoints. v4 history and run are never compared and add no unknowns. Coverage comes from the raw footer, which is correct: decoder caps do not affect raw snapshots. See L1, L2, L4. |
| 5 Resource identity text only | Met | Strict `===` on the path string; nothing is loaded or read. |
| 6 Connections by endpoint paths | Met | Key is `[{fromPath, signal, toPath, method}, boundArgs, deferred, oneShot]` (M6 killed). See L3. |
| 7 Exact or explicit tolerance | Met | Default is `===` (M13 killed). NaN and Infinity cannot occur (zod `.finite()`). `-0.0` from JSON equals `0` (probe P4; numerically correct). Tolerance NaN, -1, 1.0000001, Infinity and the string "0.1" all throw. `-0` falls back to exact. The cap is enforced (M9 killed). No world-pose, render or runtime claims. |
| 8 Bounded output, memory, time | Met with Low | Rows are capped at 200 per list and 256 KiB total. Worst probe: 512 nodes at depth 64, control-character names, 256+256 connections. Output is **203,601 bytes**, `truncated: true`, counts complete. The result can be at most 256 KiB of rows plus about 3 KB of fixed fields. Path construction is bounded but amplifies heavily; see L5. |
| 9 Within-take comparator unchanged | Met | `git diff 47bc7c0a 0777440c -- godotScene.ts` has 0 removed lines, only the new export and types. The test also asserts that `compareGodotSceneCheckpoints` is unchanged. |

## Findings

- **L1 (Low): when both sides are v1/v2, the Node3D gap is missing from `unknowns`.** `unobservable()` needs the
  *other* side to carry `position3`. With two v2 takes holding `Node3D` and `MeshInstance3D`, both
  sides are `{script:null}`. They compare as equal, and `unknowns` is only `["connections-unobserved"]` (probe P1).
  The outcome is still partial, but only because of connections, so the stated reason is
  incomplete. Fix: when either `schemaVersion < 3`, add a version-level unknown, for example
  `node3d-fields-unobserved` or `node3d-capability-absent`.
- **L2 (Low): `unobservedFields` are dropped when no other field differs.** A v2 Node3D against a
  v3 Node3D with no other difference gives `differing: []` and `counts.matched: 2`. Only the global unknown
  is set (probe P2). The doc says "These fields are listed as `unobservedFields`", but the
  per-node list is lost and the node counts as `matched`. Fix: emit the row, or a separate
  `unobserved` list and count.
- **L3 (Low): connection rows omit flags and bound-argument count.** A connection that differs only by
  `deferred` shows identical `{from, signal, to, method}` rows in both `referenceOnly` and
  `candidateOnly` (probe P3). Nothing tells the reader what differs. Fix: include `boundArgs`,
  `deferred` and `oneShot` in `ConnectionRow`.
- **L4 (Low/Nit): a spurious unknown when the type changes across versions.** Take a v2 `Node2D` against a v3 `Node3D`
  at the same path. `position3/rotation3/scale3` are listed as `unobservedFields` and
  `node3d-fields-unobserved` is added, although a Node2D genuinely has no 3D fields (probe P8).
  The outcome is still `differ`, via `type` and the 2D fields. Fix: count a field as unobservable
  only when the v1/v2 node has no 2D transform, or when the types are equal.
- **L5 (Low): path keys amplify memory and CPU.** Every node and connection key re-serialises the full
  ancestor name chain. Names allow control characters (`name: z.string().max(200)`), and these
  escape to 6 bytes each. With 512 nodes at depth 64, keys are about 36 MB per side, plus about 38 MB per
  side for connection keys, which hold two paths each. A self-compare takes **2.4 s** against 21 ms to decode,
  and the full worst case takes 4.1 s (probes P5–P7). This is bounded by the input caps, so it is not
  unbounded, but it is far larger than needed. Fix: key each node as
  `${parentOrdinal}\u0000${JSON.stringify(name)}`, using the parent's index rather than the parent's key.
  Build output paths only for rows that are kept.
- **N1 (Nit/test gap):** the row-count cap (M15) and the `version >= 3` short-circuit in
  `unobservable` (M16) both survive. The deep-path test always hits the byte cap first, and no
  test covers a v3-vs-v3 type change between Node2D and Node3D. The
  `record.event !== "scene-checkpoint"` guard (M10) also survives, but behaviour is equivalent:
  a non-checkpoint record still throws "missing scene snapshot".
- **N2 (Nit):** the source identity uses the header `scene`, not a later Save-As path, and drops
  `snapshotSequence`. After truncation, lists are not prefixes: once a large row exceeds the byte
  budget, later smaller rows are still kept. `truncated` does not say which list was cut.

## Commands and results (snapshot)

- `npx vitest --run src/lib/applicationIntegrations`: 9 files, **158/158 passed**.
- `npx tsc --noEmit`: exit 0. `npx tsc -p tsconfig.test.json --noEmit`: exit 0.
- Probes P1–P8 (`/tmp/godot-reference-review-0777440c-scratch/zzprobe.test.ts.saved`) ran in the scratch copy and were then removed.

## Mutation results (scratch copy; each restored and checked with `cmp`)

| Mutant | Result |
| --- | --- |
| M1 drop visible-on-Node3D unobservable | killed |
| M2 excluded connections not partial | killed |
| M3 no duplicate-path refusal | killed |
| M4 `path.join("/")` key | killed |
| M5 footer coverage forced to sampled | killed |
| M6 flags dropped from connection identity | killed |
| M7 byte bound removed | killed |
| M8 root name not compared | killed |
| M9 tolerance cap removed | killed |
| M10 checkpoint event check removed | survived (equivalent behaviour, throws anyway) |
| M11 below-v5 connections treated as empty | killed |
| M12b unknowns ignored in outcome | killed |
| M13 default tolerance 1e-6 | killed |
| M14 unobserved fields counted as differing | killed |
| M15 row-count cap removed | **survived** (N1) |
| M16 `version >= 3` short-circuit removed | **survived** (N1) |
| M17 root name included in path key | killed |
| (A) `abc342ad` shortName expression | killed (2 tests) |
| (A) `> 47` changed to `> 48` | killed |

(The first M12 form was a syntax-breaking mutant, so it was replaced by M12b.)

## Limits

- No Godot run. The real v5 Linux and Windows fixtures were checked only through the shipped tests.
- Not checked: whether a journal name containing an input lone surrogate (valid in JSON) passes
  the shared label validator. Any such surrogate would come from the input, not from the new truncation.
- I did not measure peak heap directly. The memory figures in L5 are computed from key sizes, and the times were measured.
