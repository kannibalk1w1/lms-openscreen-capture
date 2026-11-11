# Focused recheck: b64f5859 (fixes for review of c233dcc6)

Reviewer: Claude (Opus 5.5), independent. Snapshot `/tmp/manifest-review-b64f5859`, plus a read-only diff c233dcc6..b64f5859. Date 2026-11-11.

## Verdict: CHANGES REQUESTED

M-1 is fixed, and L-4, L-5, N-2 and N-3 are fixed. The new schema refinements (N-1), combined with the new walker behaviour, reject output that the producer itself creates in two ordinary limit cases:

- **R-1:** manifest creation fails with an untyped ZodError, so the caller gets the generic failure code.
- **R-2:** a subdirectory bind mount still bypasses the outside-root guard, although the doc now says bind mounts are refused.

## Item dispositions

| # | Item | Result |
|---|------|--------|
| 1 | M-1/L-6 identity walk | **M-1 fixed.**<ul><li>`<root>/..m.json` and `<root>/..sub/m.json` are refused with `manifest-output-invalid`.</li><li>The sibling `<root>..json` is allowed (coverage complete).</li><li>A bind mount of the root itself is refused.</li></ul>**R-2 (Low):** a bind mount of a root *subdirectory* is still accepted and the manifest is written into the project. Output equal to the root now gives `manifest-output-exists` instead of `-invalid` (safe, since `wx` would fail anyway; Nit).<br><br>On Windows, `ino`/`dev` come from the file index and volume serial number. A zero or colliding id (above 2^53 or on ReFS) can only cause a false *refusal*, so it fails closed. I accept the builder's WinBoat run (16/16, including case-variant and 8.3 names) as evidence. I did not re-run it. |
| 2 | L-1 streaming + 4× cap | Streaming works. On the flat small-scale repro (41 dangling links, `maxFiles` 10) the result is `limited` / `entry-limit`.<br><br>**However, the root listing is discarded entirely:** 0 rows were recorded (R-4, Nit/Low).<br><br>**R-1a (Medium):** the overflow still happens when a child directory finishes under budget while the parent still holds names it already admitted. `entries` is no longer checked per processed entry, so the row count can exceed 4 × `maxFiles`, and the new refinement throws a ZodError. |
| 3 | L-2 byte-limit continues | The scan now continues. `byte-limit` alone is consistent: the receipt shows `limited`, `byte-limit`, 2 files and 1 unobserved.<br><br>**R-1b (Medium):** if a file-limit or entry-limit is hit afterwards, it *overwrites* `limitReason`. The byte-limit row then fails the new `byte-limit ⇔ limitReason` refinement and throws a ZodError.<br><br>**R-3 (Low):** a deletion is no longer reported as drift (details below). |
| 4 | L-4 per-chunk check, WeakSet | Fixed. Cancelling partway through a 3 MiB file propagates: an Error is rethrown and no output is written.<br><br>A non-object throw (for example `throw "stop"`, or `AbortSignal.abort("str")` through `throwIfAborted`) *is* downgraded to `unreadable` inside `hashFile`. But the next `current()` call, or the `assertCurrent` before the write or return, throws again, and no output was written in the test. Not harmful (Nit). |
| 5 | L-5 ancestor reason | Fixed. `lib/x.gd` under a symlinked `lib` now reports `symbolic-link`.<br><br>Nit: the loop returns the *outermost* ancestor while the comment says "nearest". This doesn't matter, because producers never nest unobserved paths. |
| 6 | N-1 schema tightening | The sorted, unique, disjoint and exclusions-tuple checks are sound. **But valid producer output is rejected** (R-1a and R-1b). |
| 7 | N-3 write-failed | Fixed. EEXIST maps to `manifest-output-exists`; anything else maps to `manifest-write-failed`. A partial file can remain after ENOSPC (outside the root; Nit, not tested). |
| 8 | Docs | Stale in three places:<ul><li>Module comment line 18 still says "File, byte, depth and entry limits stop the scan".</li><li>Doc line 49 still says "Hitting a limit: the scan stops".</li><li>The review section claims "bind mounts are refused", which is untrue for subdirectories (R-2).</li></ul>The M-1 fix note is otherwise accurate. |

## New findings

### R-1a (Medium): entry overflow after a child directory produces a ZodError

**Repro:** `maxFiles: 1` (so `maxEntries` is 4). The root contains `a/` (holding 3 dangling links) plus `b1`, `b2` and `b3` (dangling links).

- The root admits 4 names, since 0+3 is below 4.
- Child `a` admits 3 names (from 1+0 up to 1+2).
- `entries` reaches 4 after processing the child, and the root then continues with b1–b3.
- The result is 6 unobserved rows against a cap of 4. `createProjectManifestFile` threw `ZodError "Manifest exceeds its own limits"`.

**Fix:**
- Restore a per-processed-entry check in the processing loop: `if (++entries > maxEntries) { limitReason = "entry-limit"; return; }`.
- Or count admitted-but-unprocessed names from all levels.

### R-1b (Medium): byte-limit followed by file-limit or entry-limit produces a ZodError

**Repro:** `a.bin` (100 B), `b.gd` and `c.gd` with `maxFiles: 1, maxBytes: 50`.

- `a.bin` is listed as `byte-limit`.
- `b.gd` is hashed.
- `c.gd` sets `limitReason = "file-limit"`, overwriting `byte-limit`.
- The refinement fails, and `createProjectManifestFile` threw a ZodError.

A project with one oversized asset and more than `maxFiles` files cannot be manifested at all.

**Fix:** either drop that equivalence in the refinement and replace it with "a byte-limit row implies coverage limited", or make `limitReason` an array.

**Also:** `manifestSchema.parse` in the producer should map a ZodError to a fixed `ProjectManifestError`, so that a future mismatch fails with a typed code.

### R-2 (Low): a bind mount of a root subdirectory bypasses the outside-root guard

**Repro:** `unshare -rm`, then `mount --bind proj/sub mnt-sub`. Output `mnt-sub/m.json` was accepted, and `proj/sub/m.json` was created.

The ancestors of `mnt-sub` are `/…/b` and `/`, and none of them has the root's dev+ino. This needs an unusual mount, and it never overwrites (`wx`), but the doc claims bind mounts are refused.

**Fix:** record the dev+ino of every directory visited during the scan, and refuse the write if the output parent's identity is in that set. The scan lstats each directory anyway. Otherwise, correct the doc.

### R-3 (Low): byte-limit coverage turns a real deletion into "notReached"

**Repro:**
1. Make a manifest with `maxBytes: 50` (`a.bin` is listed as byte-limit; `b.gd` and `c.gd` are hashed).
2. Delete `c.gd`.
3. Run the drift check. The outcome is `partial-no-drift-observed`, with `notReached: ["c.gd"]` and `missing: []`.

Now that a byte limit no longer stops the scan, `coverage: limited` caused by byte-limit or depth-limit rows alone should not stop missing/added from being reported. Those rows are already handled path by path through `underUnobserved`. Only file-limit and entry-limit truly mean "not reached".

### R-4 (Nit/Low): an over-budget directory listing is discarded whole

If a directory's listing exceeds the remaining entry budget, none of its names are processed. 41 links with `maxFiles` 10 gives 0 rows.

This is deterministic, and it avoids depending on `opendir` order, so it is acceptable. It should be documented ("a directory over the entry budget is not reached").

## Commands and results

Toolchain: Node 22.22.1.

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts electron/mcp electron/cli`:
  - 385/386 tests passed; 30/32 files passed.
  - The same two snapshot-only failures as before: `effects-contract` needs `crates/`, and the selected-MP4 test reports `range-export-tool-unavailable`. Both are unrelated to this commit.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx tsc --noEmit -p tsconfig.node.json`: exit 0.
- **Probes:** I bundled the module with esbuild and ran it in disposable scratch folders (repros R1–R5 above). The bind-mount test used `unshare -rm`.
- No real projects or home directories were scanned. Scratch copies have been deleted; only the reports remain.

## Limits

- No Windows runtime of my own; I relied on the builder's 16/16 log.
- No mutation run this round.
- I did not run the full suite.
