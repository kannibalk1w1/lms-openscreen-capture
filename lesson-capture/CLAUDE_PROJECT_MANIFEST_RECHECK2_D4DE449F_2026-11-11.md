# Second focused recheck: d4de449f (parent b64f5859)

Reviewer: Claude (Opus 5.5), independent. I worked from the snapshot `/tmp/manifest-review-d4de449f` and a read-only diff of b64f5859..d4de449f. Date 2026-11-11.

## Verdict: ACCEPTED WITH LOWS

R-1a, R-1b, R-3 and R-4 are fixed and the nits are addressed. R-2 is fixed for every folder the scan *enters*. One residual Low remains (S-1), and S-2 and S-3 are minor.

## Item dispositions

### 1. R-1a: per-entry check plus streamed budget — FIXED

Each processed entry adds at most one row, and `++entries > maxEntries` stops the scan before the cap is passed, so rows can never exceed 4 × maxFiles.

| Repro | Result |
|---|---|
| Nested (`a/` with 3 links, then b1–b3; maxFiles 1) | `limited`, `entry-limit`, 3 rows, cap 4 |
| Deeper nesting (maxFiles 2) | 5 rows, cap 8 |
| Five empty directories plus a link | `entry-limit`, 0 rows |
| Exact budget (4 links) | `complete`, 4 rows |
| Generated fuzz: 60 trees of links, files and nested directories, with varying maxFiles and maxBytes | No failures; the most rows any tree produced was 0.5 × the cap |

### 2. R-1b: limit precedence and the `manifest-scan-inconsistent` code — FIXED

Repro: `a.bin` (100 B), `b.gd` and `c.gd`, with maxFiles 1 and maxBytes 50. Result: `limited`, `file-limit`, files 1, unobserved 1 (the `a.bin` byte-limit row), and the manifest was written.

The fixed `manifest-scan-inconsistent` code is reached in practice by S-2. The commit has no test for it (Nit).

### 3. R-2: post-scan identity set — FIXED for folders the scan entered

Real `unshare --map-root-user --mount` probes:

- A bind mount of `proj/sub` was refused.
- A bind mount of the root was refused.

This matches the builder's `bind-mount-probe-result.json`. The residual gap is S-1.

### 4. R-3: only file and entry limits produce `notReached` — FIXED

Repro: a manifest with a byte-limit row; then delete `c.gd` and add `d.gd`.

Result: `drift-observed`, with `missing: [c.gd]`, `added: [d.gd]` and `notReached: []`.

The `added` side now keys on the manifest's `limitReason` (file-limit or entry-limit). Coverage that is limited only by depth now reports missing and added files outside the depth-limit rows, which is correct.

### 5. R-4 doc and nits — DONE

- The module comment, doc line 49ff (including that a folder over the entry budget is skipped whole) and the "outermost" comment are corrected.
- Doc line 168, in the earlier fix note, still says "bind mounts are refused" without qualification. See S-1.

## New findings

### S-1 (Low): a bind mount of a folder the scan did not enter is still accepted

The identity set holds only the folders that `walk()` entered. Folders the scan does not enter are missing from it:

- the excluded `.git`, `.godot` and `.import`;
- `depth-limit` folders;
- unreadable folders;
- folders not reached after a file-limit or entry-limit stop.

All of these are still inside the project.

**Verified:** under `unshare --map-root-user --mount`, I ran `mount --bind proj/.godot m2` and created a manifest with output `m2/m.json`. It was **accepted**, and `proj/.godot/m.json` was created. The subfolder and root bind mounts were refused in the same run.

**Severity:** Low. It needs a deliberate bind mount, `wx` never overwrites, and it applies to Linux bind mounts, or to Windows volume mounted folders I have not tested.

**Fixes:**
- Add the `lstat` dev/ino of every directory row that is not entered (excluded, depth-limit) to the identity set. Those directories are already lstat'd. For a stopped scan, either refuse when coverage is stopped and the output's device equals the root's, or document the gap.
- Qualify doc line 168.

### S-2 (Low/Nit): two invalid-UTF-8 names in one folder make the project impossible to manifest

On Linux, `opendir` decodes the names `\xff` and `\xfe` both to U+FFFD. `lstat` on that name fails, so two identical `unreadable` rows are produced. The uniqueness refinement then rejects the manifest with `manifest-scan-inconsistent`.

**Verified:** two such files gave `manifest-scan-inconsistent`, and the error code is fixed and pathless. A single such file gave one `unreadable` row and the manifest was created.

**Fix:** de-duplicate unobserved rows before building the manifest, or read names as Buffers. This is rare, so documenting it is acceptable.

### S-3 (Nit): `manifest-scan-inconsistent` has no test

The mapping is untested. S-2 is a ready-made regression case on Linux.

## Commands and results

Toolchain: Node 22.22.1.

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts electron/mcp electron/cli`:
  - 388/389 tests pass; 30/32 files pass.
  - The two failures are the same snapshot-only ones as before and are unrelated to this commit: `effects-contract` needs `crates/`, and the MP4 test gets `range-export-tool-unavailable`.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx tsc --noEmit -p tsconfig.node.json`: exit 0.
- Probes: I bundled the module with esbuild and ran it in disposable scratch folders. The bind-mount probes used `unshare --map-root-user --mount`.
- No real projects or home directories were scanned. Scratch copies are deleted; only the reports remain.

## Limits

- I did not run Windows myself; I relied on the builder's 16/16.
- I did no mutation testing this round.
- I did not run the full suite.
