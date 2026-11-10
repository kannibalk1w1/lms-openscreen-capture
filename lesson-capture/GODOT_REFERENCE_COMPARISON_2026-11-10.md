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
partial, row detail, ambiguity and interned-key separator. The [recheck of `eff20dc1`](CLAUDE_GODOT_REFERENCE_COMPARISON_RECHECK_EFF20DC1_2026-11-10.md) **accepts** it with nits R-N1 (legacy candidate side), R-N2 (snapshot sequence) and R-N3 (independent connection-list truncation), all closed with mutation-checked tests in the next commit.

## Library additions for the file tools

- Tolerance now applies **only** to continuous transform properties (`position`,
  `rotation`, `scale`, `position3`, `rotation3`, `scale3`). `numbers` records
  `appliesTo: "continuous-transform-properties"`. Names, types, resource paths, visibility,
  path identity, connection flags and bound-argument counts are always exact. A regression
  test at tolerance 1 shows discrete differences still differ. The guard is currently
  equivalent: every other node field is a string or boolean, and connections use exact keys.
  It is kept so that any future numeric discrete field is not softened.
- `relation: {sameTake, sameCheckpoint}`. Comparing a take with itself, or a checkpoint
  with itself, is allowed, and agreement then is a consistency check of one recording,
  **not independent confirmation**.

## CLI and MCP file tools

```
openscreen lesson compare-godot-reference <reference.jsonl> --reference-record <n> --reference-sha256 <hash>
    --candidate <candidate.jsonl> --candidate-record <n> --candidate-sha256 <hash> [--tolerance <0-1>] [--json]
```

MCP tool: `compareGodotReferenceFile` (read-only, non-destructive, closed-world annotations).
Hashes come from `inspect-godot-checkpoints` / `inspectGodotCheckpointsFile` for each file.

- Both complete descriptors (two absolute paths, two record sequences, two SHA-256 values,
  optional tolerance) are validated before any read. Relative CLI paths resolve against the
  CLI cwd. Unknown, repeated or missing options are refused.
- HTTP MCP refuses without MCP edits before any read and rechecks consent before returning.
  Stdio keeps explicit launch authority. The caller's currency/cancellation check runs
  before the first read, between the two reads and before disclosure.
- Each side is read once as a bounded snapshot (8 MiB). Only those bytes are fingerprinted
  and compared. A mismatch rejects the whole request with `reference-file-changed` or
  `candidate-file-changed`: no refresh, relinking, discovery or resource loading. A
  second-source failure (missing, changed or invalid) returns only a fixed code, with
  nothing from the first source.
- Output: `openscreen-godot-reference-comparison` v1, `sameContent` (identical bytes), and
  the library comparison with each source identity carrying its own `sha256`. All library
  unknown, partial and truncation reasons and bounds are preserved. Paths are never
  echoed; source files are never changed.

Validation:

- `electron/lesson/godotReferenceFile.test.ts` (19 tests) covers:
  - the service on the real Linux and Windows takes, same file, hash binding per side,
    invalid requests, missing files;
  - cancellation before and between reads, second-source failure without disclosure,
    tolerance pass-through;
  - MCP read-only registration, HTTP denial before reads, revocation before return and
    service parity;
  - CLI relative cwd, tolerance syntax, refusals and fixed error codes.
- Mutants killed: read-between currency check, same-checkpoint relation, `sameContent` and
  per-side hash binding.
- Real built Linux Electron run, CLI from the files' own cwd with relative names plus MCP
  stdio, on the retained real takes: 15/15 checks.
  - Agreement, and tolerance 1 still differing on paths.
  - Both wrong-hash codes.
  - CLI/MCP parity, same-file labelling, MCP fixed error, sources unchanged.
- `scripts/smoke-headless-startup.cjs` passes.
- Full suite: 6,639 pass and one fails, the positional tool-list assertion in
  `applicationCaptureMcp.test.ts`, which the new tool shifted. After fixing it, `electron/mcp`
  passes 223/223.

Evidence: `../openscreen-evaluation/godot-reference-comparison-2026-11-10/`.

## File-tool review

[Independent review of `87cc7dac`](CLAUDE_GODOT_REFERENCE_FILE_TOOLS_REVIEW_87CC7DAC_2026-11-10.md):
**accepted with Lows**. All eight coordinator gates are met; there is no false agree, no
read or disclosure without consent, no partial disclosure and no unbound identity. The
follow-up commit addresses:

- L1: tests for the currency checks after the second read and before return.
- L2: the CLI tolerance accepts plain decimal or exponent notation (`1.0`, `1E-3`,
  `1e+0`, `+0.1`, `.5`) and then requires 0–1, with its own message.
- N2: a same-session, different-instance test.
- N3: side-specific codes (`reference-`/`candidate-` `file-unavailable`, `file-changed`,
  `file-invalid`, `checkpoint-invalid`). Each side is hashed immediately after its own
  read, so a stale reference is rejected before the candidate is read.
- N4: CLI help and MCP description wording on tolerance scope and self-comparison.
- N5: a file rewritten after inspection, invalid bytes, and MCP second-source failure
  returning only a fixed code.
- N1 is retained, as documented above.

Mutants M4/M5 (currency checks) and M7 (instance identity) are now killed. Production CLI
(relative cwd) + MCP rerun 15/15 and startup smoke pass. Full suite: 6,647 pass. One
environmental failure was `diskSpaceCheck.test.ts`: `/tmp` (tmpfs) was 98% full from this
run's review snapshots. After removing those, it passes 5/5. The [recheck of `d16220f4`](CLAUDE_GODOT_REFERENCE_FILE_TOOLS_RECHECK_D16220F4_2026-11-10.md)
**accepts** it. Its nits are closed in `6af68314`: R-N1, a non-zero tolerance that underflows
to 0 (`1e-400`), is now refused; R-N2 is a test for the CLI range message, which kills the
range-check mutant.

## Next

Independent review of the file-tool commit; then return to the remaining roadmap (project
checkpoint archive/restore, retakes/handoff, physical acceptance).
