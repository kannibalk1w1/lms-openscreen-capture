# Advisory cross-take Godot reference comparison — 10 November 2026

Built by Claude (Opus 5.5, lead builder). This first step is library-only:
`compareGodotCheckpointToReference(referenceText, referenceRecordSequence, candidateText,
candidateRecordSequence, { tolerance? })` in
`src/lib/applicationIntegrations/godotSceneReference.ts`. It is pure and offline: no Godot
connection, no file or resource reads, no UI, CLI or MCP yet.

It compares the sampled scene state at a candidate checkpoint (for example a retake or a
later take) with a reference checkpoint, usually from a different raw journal. It is an
**advisory observed-state comparison**. It is **not** expected-state verification,
completion grading, or evidence of world pose, rendering, runtime behaviour or learning.
The within-take `compareGodotSceneCheckpoints` is unchanged.

## Inputs and identity

- Two explicit raw journals and two explicit checkpoint record sequences. Each journal is
  fully validated (all versions v1–v5, including corrupt tails). The same journal may be
  used for both.
- Each side of the result keeps its source identity: the take's header scene path (a Save
  As during the take is not reflected), raw schema version, session and adapter-instance
  IDs, raw footer coverage and stop reason, and the checkpoint's record sequence, label,
  elapsed time and snapshot sequence. Hashing and binding to inspected
  files are left to the later file tools.

## Matching policy

- Session node IDs are never matched across takes.
- Nodes are matched only by their **root-relative path**: an array of node names. The
  comparison keys each path by interning (parent path identity, name), shared by both
  sides, so a name containing "/" cannot collide with a nested path, and key size does not
  grow with depth. Arrays are expanded only for rows that are kept. Godot
  keeps sibling names unique; a journal with duplicate sibling paths is refused as
  ambiguous.
- Roots are matched by position (path `[]`). Root name and root type are compared as
  ordinary fields (`name`, `type`).
- A renamed or reparented node is reported as `referenceOnly` and `candidateOnly`
  unmatched paths. It is never relinked heuristically, and it is not reported as a
  deletion, rename or any other action.
- Compared fields: `type`, `script`, `texture`, `position`, `rotation`, `scale`, `visible`,
  `position3`, `rotation3`, `scale3`, and the root name. Selection is ignored.
- Resource paths are compared as identity text. No resource is loaded, so asset content
  is not compared.
- Numbers are compared **exactly** by default. An absolute tolerance from 0 to 1 is used
  only when the caller passes one explicitly, and the result records
  `numbers: {mode: "absolute-tolerance", tolerance}`. Node3D values are sampled Euler and
  property values, not world poses.
- Saved signal connections (v5) are compared by endpoint path, signal, method, flags and
  bound-argument count; rows show all of them.

## Unknown and partial evidence

`outcome` is one of `sampled-fields-differ`, `sampled-fields-agree` (no observed
difference and no unknowns), or `partial-no-observed-difference`. `unknowns` lists why
the evidence is partial:

- `reference-coverage-limited` / `candidate-coverage-limited`: the raw take ended with a
  `limited` footer.
- `node3d-fields-unobserved`: a v1/v2 source could not record Node3D transforms or
  visibility. Inheritance is never inferred from type names. Instead, every node in a
  v1/v2 source that has no 2D transform is treated as possibly 3D, so `visible`,
  `position3`, `rotation3` and `scale3` are left uncompared for it. They are listed as
  `unobservedFields`: in `differing` when another field differs, otherwise in
  `partiallyCompared`, which `counts.partiallyCompared` counts separately from `matched`.
- `connections-unobserved`: either source is below v5. `connections` is then
  `{status: "unobserved"}`, not an empty or equal list.
- `connections-partially-recorded`: either source counted excluded connections.

## Bounds

The inputs are bounded by the raw journal limits (8 MiB, 512 nodes, depth 64, 200-character
names). Output row lists are capped at 200 rows each and 256 KiB of row JSON in total.
Once a list is cut, it takes no further rows, so every list is a clean prefix. `truncated`
names the lists that were cut, and counts stay complete. Comparing two maximal
512-node, 64-deep hierarchies of 200-character names takes well under a second; the first
build's re-serialized ancestor keys took 2.4–4.1 s. A deep-path test (64 levels of
200-character names plus 300 siblings) stays under 300 KiB of total output.

## Validation

- `godotSceneReference.test.ts`, 17 tests:
  - across takes: agreement with different IDs, exact versus explicit tolerance;
  - paths: rename and reparent as unmatched paths, slash-collision keys, ambiguous
    duplicate refusal;
  - fields: root name/type, resource identity text, v2→v3 Node3D unobserved fields;
  - partial evidence: limited coverage on each side, connections unobserved, partially
    recorded and flag-sensitive;
  - bounds, an unchanged within-take comparator, and invalid inputs.
- Real retained journals: `scene-v5-linux.jsonl` and `scene-v5-windows.jsonl`. These are
  the same disposable probe scene captured separately by real Godot 4.7.1 on Linux and in
  WinBoat Windows 11, with different session and node IDs. Their "3D baseline"
  checkpoints come out `sampled-fields-agree`, and a later checkpoint differs. The
  retained real v2 `checkpoints.jsonl` against the real v3 `spatial.jsonl` reports
  `connections-unobserved`.
- 13 guard mutants are all killed: ambiguity, slash keys, unobservable fields, both
  coverage flags, excluded and unobserved connections, exact default, connection flags,
  output bound, and root name.

## Review

[Independent review of `0777440c`](CLAUDE_GODOT_REFERENCE_COMPARISON_REVIEW_0777440C_2026-11-10.md)
(also covering the label fix `47bc7c0a`, which it accepts): **accepted with Lows**. None
could yield a false `agree`. The follow-up commit:

- L1/L4: unobservable fields are now decided per node by version and the absence of a 2D
  transform, never by type name.
- L2: `partiallyCompared` rows and count.
- L3: connection rows carry flags and the bound-argument count.
- L5: interned path keys.
- N1: row-count cap, version-gate and prefix tests.
- N2: `snapshotSequence`, the scene-path note and clean-prefix, per-list `truncated`.

Mutants for the new guards are killed: version gate, position gate, prefix, row cap,
partial, row detail, ambiguity and interned-key separator. Awaiting recheck.

## Next

Independent review of this immutable commit, then CLI/MCP file tools. Those tools must
bind **both** explicit sources to inspected SHA-256 hashes and keep the existing
permission-before-read gates.
