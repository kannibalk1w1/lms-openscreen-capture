# Independent review: c233dcc6 "feat: record opt-in project manifests and check drift"

Reviewer: Claude (Opus 5.5), independent; I did not write this code. Base b2cd411a. Reviewed the immutable snapshot `/tmp/manifest-review-c233dcc6` and read-only `git diff b2cd411a c233dcc6`. Date 2026-11-11.

## Verdict: CHANGES REQUESTED

There is one Medium finding. The output-outside-root guard accepts targets inside the project whose first path component starts with `..`. Because of this, gate 6 ("no writer to existing source projects") is not met as written. The fix is one line and I tested it (see M-1). Everything else is Low or Nit.

## Gates

| # | Gate | Disposition |
|---|------|-------------|
| 1 | Dedicated opt-in manifest/drift; paths+sizes+hashes only; no archive/copyback/restore | PASS. The rows are `{path,size,sha256}` and `{path,reason}` only. No code reads content into the output and nothing copies files. |
| 2 | Explicit root and NEW destination; journal grant never authorises; no discovery, upward lookup or reference following | PASS. Absolute `rootPath`/`outputPath` are required, and the tools never consult a scene-journal grant. The walk goes downward only. No resource parsing. |
| 3 | Refuse symlink/reparse and unstable reads; caps; documented exclusions/partialness | PASS with Lows. Links and the root realpath are checked, and the identity check is done before and after the read. Caps exist. L-1, L-2, L-3 and L-4 cover how the caps behave. |
| 4 | Hash locally, no content serialised; paths sensitive | PASS. Hashing is streamed through a 1 MiB buffer. The tool description and the doc say path names are sensitive. |
| 5 | Deterministic; drift distinguishes changed/missing/unobserved/incomplete; no certification | PASS with Low/Nit. The order is sorted and there are no timestamps. Outcomes are `drift-observed`, `partial-no-drift-observed` and `no-drift-observed`. See L-5 and N-1. |
| 6 | No writer to source projects; no overwrite/relink; output-outside-root logic | **FAIL (M-1)**. On top of that, L-6 covers case-insensitive and 8.3-name gaps. `wx` + 0600 is atomic, so there is no TOCTOU overwrite: O_EXCL does not follow a final-component symlink. |
| 7 | HTTP consent before scan and before return; cancellation; stdio authority; fixed codes | PASS with Low. Consent is checked before the operation, on every entry and before returning. Errors are fixed codes. L-4 covers cancellation inside a single large file hash. |

## Findings

### M-1 (Medium): output guard lets a new file be written inside the project folder

`outputOutsideRoot` uses `relative.startsWith("..")`. `path.relative(root, root + "/..m.json")` is `"..m.json"` and `path.relative(root, root + "/..sub/m.json")` is `"..sub/m.json"`. Both pass the guard, so the manifest is written into the selected project.

- **How verified:** I bundled the snapshot module with esbuild and ran it in a disposable scratch folder.
  - `createProjectManifestFile({rootPath: proj, outputPath: proj/..m.json})` succeeded and left `proj/..m.json` in the project.
  - The same happened for `proj/..sub/m.json`.
- **Impact:** an existing file is never overwritten, because of `wx`. But it breaks the "never writes into the project" invariant that the module doc, the MCP description and the slice doc all state. The CLI reaches the same code path.
- **Fix (tested):** `if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw …`.
  - With the fix, both probes are refused with `manifest-output-invalid`.
  - All 13 `projectManifest.test.ts` tests still pass.
- **Tests:** add a regression test for both shapes. The existing "output-outside-root" mutant was killed only by the plain `proj/x` case.

### L-1 (Low): scan rows that exceed `manifestSchema` bounds fail with an untyped ZodError

The scan allows up to `4 × maxFiles` entries, which is 200,000 at maxFiles 50,000. The schema caps `unobserved` at 100,000.

- **How verified:** I ran a probe with 100,001 dangling symlinks and `maxFiles: 50000`.
  - `manifestSchema.parse` threw a `ZodError`, not a `ProjectManifestError`.
  - No output was written.
  - The CLI and MCP would therefore report the generic `lesson-file-operation-failed` / `project-manifest-operation-failed`. This is still a fixed code with no paths, so nothing leaks.
- **Impact:** the whole tree is scanned and then fails, instead of giving `coverage: "limited"` with `limitReason: "entry-limit"`.
- **Fix:** either cap unobserved at `4 × PROJECT_MANIFEST_MAX_FILES`, or stop with entry-limit when the unobserved count reaches the schema cap. The same reasoning applies to relative paths over 4096 characters on Windows with long-path support. That case was not reproduced, because Linux PATH_MAX keeps relative paths under 4096 here.

### L-2 (Low, design): one file larger than the remaining byte budget stops the whole scan

**How verified:** I ran a probe with `maxBytes: 50` on a folder holding `a.bin` (100 B), `b.gd` and `c.gd`.

- The result was `coverage: limited` with `limitReason: byte-limit`.
- **0 files** were recorded. The two small files after `a.bin` were never reached.

This matches the doc ("the scan stops"), so it is honest. But a single large asset that sorts early (for example a video) leaves the rest of the project not reached.

**Fix:** consider recording such a file as unobserved, with a new reason such as `byte-limit`, and carrying on. If the current behaviour is kept, document it explicitly.

### L-3 (Low): `readdir` loads every name in a directory before the entry cap applies

`fs.readdir(directory)` followed by `.sort()` holds all names in memory. The `maxEntries` check runs per name after that, so one directory with millions of entries is fully loaded first.

- **How verified:** by reading the code. I did not reproduce it, to spare the tmpfs.
- **Impact:** memory, not correctness. With 50k files the row arrays themselves are small, about tens of MB.

### L-4 (Low): cancellation and consent revocation are not checked inside `hashFile`

`assertCurrent()` runs once per entry. A single file of up to 16 GiB (`PROJECT_MANIFEST_MAX_BYTES`) is hashed with no check between chunks.

- **How verified:** by reading the code.
- **Impact:** the consent recheck before return still blocks the result, so this is latency only and nothing leaks.
- **Fix:** call `assertCurrent` every N chunks.

### L-5 (Low): wrong reason for paths under an unobserved ancestor

`nowUnobserved` / `previouslyUnobserved` use `map.get(file) ?? "unreadable"`.

- **How verified:** I made a manifest of `lib/x.gd`, then replaced `lib` with a symlink.
- **Result:** the drift check reported `nowUnobserved: [{path:"lib/x.gd", reason:"unreadable"}]` when the reason should be `symbolic-link`. The outcome, `partial-no-drift-observed`, was correct.
- **Fix:** have `underUnobserved` return the reason of the matched ancestor.

### L-6 (Low): the outside-root check compares strings, not filesystem identity

- `path.posix.relative("/Users/x/proj", "/Users/x/PROJ/m.json")` returns `"../PROJ/m.json"`.
- `path.win32.relative("C:\\Users\\RUNNER~1\\proj", "C:\\Users\\runneradmin\\proj\\m.json")` returns `"..\\..\\runneradmin\\proj\\m.json"`.

Node's JS `realpathSync` keeps the spelling it was given. So on a macOS or other case-insensitive volume, or on Windows with an 8.3 alias, a differently spelled output inside the root would be accepted. `path.win32.relative` is case-insensitive, so plain case differences on Windows are fine. Bind mounts are not detected either.

- **How verified:** I ran the `path.relative` outputs above in Node. I did **not** reproduce the write on a real case-insensitive volume or on Windows.
- **Fix:** compare `realpathSync.native` of the root against `realpathSync.native` of the output parent. Even better, compare `dev`/`ino` of each ancestor of the output parent against the root's `dev`/`ino`.

### N-1 (Nit): schema soundness gaps in `superRefine`

`unobserved` is not checked for sort order or duplicates.

- **How verified:** a hash-bound tampered manifest with unobserved `[z, z, a]` was accepted.

Also not checked: whether `counts.bytes ≤ limits.maxBytes`, whether `files.length ≤ limits.maxFiles`, and whether `exclusions` equals the constant. Hash binding only proves the caller holds the same bytes, so these gaps only let a caller confuse their own result. The `files` sort/duplicate check is also untested (mutant M8 survives).

### N-2 (Nit): "code-point order" is really UTF-16 code-unit order

JS `<` compares UTF-16 code units. This differs from code-point order for astral characters versus U+E000–U+FFFF. It is still deterministic and consistent with the schema check, so this is a doc wording issue only.

### N-3 (Nit): `wx` failures are always reported as `manifest-output-exists`

EACCES, ENOSPC and a parent removed during the scan are all reported as `manifest-output-exists`, which is misleading. The code is still fixed and pathless.

## Checked and found sound

- **walk() traversal:**
  - The order is deterministic: each directory is sorted, then the walk goes depth-first, and the final code-unit sort produces the output order.
  - A limited prefix is not a sorted prefix (for example `a/b` is visited before `a-c`), but drift never assumes it is. Any path absent under limited coverage is classed as `notReached`.
- **Limits:**
  - `if (limitReason) return` correctly unwinds all levels.
  - Exactly `maxFiles` files gives `complete`.
  - A directory at depth 31 whose children would be at depth 32 is listed as `depth-limit` (31 levels are scanned).
  - Coverage that is limited only by depth is kept consistent by the schema.
- **hashFile:**
  - Without O_NOFOLLOW (on Windows it is 0), a swap to a link is still caught, because the descriptor's dev/ino/size/mtime/ctime are compared with the earlier `lstat`, and `lstat` is checked again afterwards.
  - O_NONBLOCK plus the `isFile` check on the descriptor catches a FIFO swap.
  - Growth during the read is caught by `total > before.size` and by the size/mtime compare.
  - Node on Windows reports a non-zero `ino` on NTFS (the file index). A zero or colliding `ino` would weaken only one of five compared fields.
- **Root:** the `realpath` equality check refuses symlinked or junction roots (the builder confirmed junctions on WinBoat). Output equal to the root is refused (`relative === ""`), and `..` in the output path is normalised by `path.resolve`. Output inside the root through a `..` segment is refused, apart from the M-1 prefix case.
- **Existence check, then `wx`:** the `lstat` is only a fast path. `wx` (O_CREAT|O_EXCL) is the real guard and does not follow a final symlink. Mode 0600 is ignored on Windows, as expected.
- **underUnobserved:** it matches whole path components (`a/bc` is not under `a/b`) and includes an equal path. The counts (`unchanged`, `changed`, `missing`, `added` and the others) add up across the before and after maps.
- **Output bounds:** at most 200 rows per list and 256 KiB of row JSON in total, with exact counts. The manifest file is capped at 32 MiB, and it is read through the bounded, stable `readSelectedFileSnapshot`.
- **MCP `run()`:**
  - HTTP is refused before parse/scan and refused again before return.
  - In the error path, consent is checked before the error is mapped, so a refused-consent result never reveals an error code.
  - Stdio needs no gate.
- **CLI parsing:**
  - `^\d{1,12}$` covers 16 GiB (11 digits), and 0 is rejected by the schema.
  - A duplicated flag, a duplicated `--json` or an unknown flag is rejected.
  - A value starting with `-` is rejected, and `takeValue` rejects `""`.
  - Relative paths resolve against the cwd.

## Commands and results

Toolchain: Node 22.22.1 (as given).

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts electron/mcp electron/cli`:
  - **376/377 tests pass; 30/32 files pass.**
  - Both failures come from the minimal snapshot and are unrelated to this commit:
    - `electron/mcp/effects-contract.test.ts` fails with ENOENT on `crates/compositor/src/shader_fx.rs`, which is not in the snapshot.
    - The `lessonCommands.test.ts` selected-MP4 test gets `range-export-tool-unavailable`: the ffmpeg tool is absent from the snapshot.
  - The two new files on their own pass 26/26.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx tsc --noEmit -p tsconfig.node.json`: exit 0.
- **Probes:** I bundled with esbuild into the scratch folder and ran in disposable scratch folders: M-1 (both shapes), L-1 (100,001 symlinks), L-2, L-5 and N-1. No real projects or home directories were scanned.

## Mutations

Each mutation was applied to a scratch copy of `projectManifest.ts` together with its test, and the copy was restored. `cmp` against the original reported identical.

| Mutant | Result |
|---|---|
| M1 `stable()` ignores ctime | survives (hard to test; acceptable) |
| M2 drop `total > before.size` growth check | **survives** (still covered by the final size/mtime compare, but untested) |
| M3 drop `stable(after, current)` name identity | killed |
| M4 entry limit set to Infinity | **survives** (the entry limit is untested) |
| M5 drop `notReached` branch | killed |
| M6 `underUnobserved` ignores an equal path | killed |
| M7 drop the observed-and-unobserved schema check | **survives** |
| M8 drop the `files` sort/duplicate schema check | **survives** |
| Fix for M-1 (exact `..` / `..${sep}`) | 13/13 pass; both probes refused |

The doc's claim of "schema ... tampering" mutants is only partly backed: the coverage-claim tamper is killed, but the sort and observed/unobserved checks are not.

## Limits of this review

- I ran no Windows or macOS runtime. L-6 and the Windows `ino` remarks are based on code and Node path behaviour only. I relied on the builder's WinBoat 11/11 for junction behaviour.
- I did not re-run the full suite or the GUI/Electron smoke. The builder reports 6680/487.
- I did not reproduce L-3, the memory use on a huge directory.
- My scratch copies have been deleted; only this report remains.
