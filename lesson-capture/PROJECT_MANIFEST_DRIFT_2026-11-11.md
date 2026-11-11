# Application-project manifest and drift detection — 11 November 2026

Built by Claude (Opus 5.5, lead builder) as roadmap option **B2**, chosen by the coordinator
on the owner's standing authorisation: a dedicated, opt-in, bounded project **manifest** of
relative paths, sizes and SHA-256 hashes, plus a drift check. **No** content archive, copy-back,
restore, relink or writes into a project. Archive/restore (B1) and live-KDE testing (A2) remain
deferred. Application-neutral: it works on any explicitly selected folder (Godot or not), with
all adapters disabled.

## What it does

- `createProjectManifestFile({rootPath, outputPath, maxFiles?, maxBytes?})`:
  - Scans ONE explicitly selected folder and writes a **new** manifest file. The output
    must be outside that folder, in an existing parent with no symlinks; it is created
    exclusively with `wx` and mode 0600.
  - Returns a receipt with the manifest's exact SHA-256, coverage and counts.
- `checkProjectDriftFile({rootPath, manifestPath, manifestSha256})`:
  - Read-only. The manifest is read as one bounded, stable snapshot (32 MiB) and must
    match the given SHA-256; a mismatch gives `manifest-changed` and the manifest's schema
    must validate, or the result is `manifest-invalid`.
  - It then re-scans the explicit folder with the manifest's own limits.
- The existing scene-journal grant never authorises a folder scan. There is no implicit
  discovery, upward lookup or resource-reference following, and the project folder is
  never written to.

## Manifest (v1)

- **Fields:** `scope: "explicit-folder"`, `rootName` (the folder's base name only, never
  the absolute path), the limits, the exclusions, `coverage`, an optional `limitReason`
  and counts.
- **`files`:** `{path, size, sha256}`, sorted in UTF-16 code-unit order (JavaScript string comparison), using `/`-separated
  relative paths on every OS.
- **`unobserved`:** `{path, reason}`.
- **Deterministic:** no timestamps, and two scans of an unchanged folder produce
  byte-identical manifests.
- **Never recorded:** contents, permissions, owners, times, link targets, or names inside
  links or excluded folders.

Path names are still sensitive metadata: review a manifest before sharing it.

## Bounds and exclusions

- **Limits:**
  - Files: 10,000 by default, at most 50,000.
  - Hashed bytes: 2 GiB by default, at most 16 GiB.
  - Directory depth: 32. Entries visited: 4 × the file limit.
  - Output rows: 200 per list and 256 KiB of row JSON in total, as clean prefixes with
    complete counts.
- **Hitting a limit:** file and entry limits **stop** the scan (`limitReason`
  `file-limit`/`entry-limit`; paths not reached are then unknown). A folder whose listing
  is larger than the remaining entry budget is skipped as a whole, so the recorded subset
  never depends on directory order. A file over the remaining byte budget is listed as
  `byte-limit` and the scan continues. Folders beyond the depth limit are listed as
  `depth-limit`. Any limit gives `coverage: "limited"`; only stopping limits turn absent
  paths into `notReached` in a drift check.
- **Unobserved reasons:**
  - `symbolic-link`: symlinks and Windows junctions/reparse points, which are never
    followed.
  - `special-file`: FIFOs, sockets and devices.
  - `unreadable`.
  - `unstable`: the file changed while it was being hashed, detected by comparing
    descriptor and name identity and size/mtime/ctime before and after a single-descriptor
    read with `O_NOFOLLOW`.
  - `excluded-directory`: `.git`, `.godot` and `.import` at the selected root only.
  - `depth-limit`.
  - `byte-limit`: a file larger than the remaining byte budget is listed and skipped, and
    the scan continues (`limitReason: "byte-limit"`, limited coverage). File and entry
    limits still stop the scan.
- **Selected root:** a root with a symlink in any component (checked with `realpath`), a
  non-directory, or an unreadable root is refused.

## Drift results

- **Outcome:**
  - `drift-observed` when anything is changed, missing or added;
  - `partial-no-drift-observed` when there is no observed difference but there are
    unknowns: limited coverage on either side, or unobserved paths on either side;
  - `no-drift-observed` only when both scans are complete and nothing was unobserved.
- **Lists:**
  - `changed`: size and/or SHA-256 fields.
  - `missing`, which requires a complete current scan.
  - `added`, which requires a complete manifest.
  - `nowUnobserved` and `previouslyUnobserved`: a path under, or equal to, an unobserved
    path on the other side.
  - `notReached`: absent only because a limited scan stopped.
- **Root name:** `rootNameMatches` flags a different folder name without failing.

It reports observations only. It never certifies that a project is correct, complete,
runnable or restorable.

## CLI and MCP

```
openscreen lesson manifest-project <project-folder> --out <new-manifest.json> [--max-files <n>] [--max-bytes <n>] [--json]
openscreen lesson check-project-drift <project-folder> --manifest <manifest.json> --sha256 <hash> [--json]
```

- **MCP tools:**
  - `createProjectManifestFile` (writes a new file: `readOnlyHint: false`,
    `destructiveHint: false`).
  - `checkProjectDriftFile` (read-only).
- **Consent:** HTTP requires MCP edits before any scan and rechecks before returning.
  Stdio keeps explicit launch authority.
- **Cancellation:** the caller's currency check runs before reading and between every
  scanned entry.
- **Errors and paths:** relative CLI paths resolve against the CLI cwd, and errors are
  fixed codes with no paths.

## Validation

- **`electron/lesson/projectManifest.test.ts` (13 tests):**
  - recorded fields and exclusions, contents absent, 0600 mode;
  - determinism, with the project untouched;
  - links not followed, plus a FIFO on Linux;
  - an unstable file (mocked identity change);
  - file, byte and depth limits;
  - unsafe roots, including a symlinked parent component, and unsafe outputs;
  - cancellation before scanning;
  - drift: partial, changed/missing/added, clean no-drift, link replacement, not-reached
    under a limited scan, hash binding, schema and coverage-claim tampering, root rename.
- **`electron/lesson/projectManifestTools.test.ts` (13 tests):**
  - MCP annotations, HTTP denial before any `readdir`/`lstat`, stdio round trip, fixed
    codes, and the consent recheck before return;
  - CLI relative cwd, refusals and fixed failure codes.
- **Mutants killed:** symlink, exclusion, output-outside-root, output-parent-link,
  root-link, stability, not-reached, under-unobserved, manifest hash, depth and coverage
  refinement.
- **Real WinBoat Windows 11** (NT 10.0.26200, portable Node 22.22.1, bundled service, owned
  disposable folder in the guest temp root): 11/11 checks.
  - Sorted POSIX relative paths.
  - A **junction** is reported as `symbolic-link` and not followed.
  - `.godot` is excluded; no contents, outside names or absolute paths appear.
  - Receipt hash, partial no-drift, and changed/added/missing.
  - Output inside the root, a junction root and an existing output are each refused; the
    outside folder is untouched.
- **Real built Linux Electron** CLI (relative cwd) plus MCP stdio on a disposable folder:
  14/14 checks.
  - Receipt, no contents and no absolute paths, clean no-drift.
  - Existing and inside-root outputs refused, the project untouched.
  - CLI/MCP drift parity after a change, and MCP create.
- **Other checks:** `scripts/smoke-headless-startup.cjs` passes. The full suite passes with
  6,680 tests in 487 files, as do both `tsc` configs and lint (35 existing warnings).

Evidence: `../openscreen-evaluation/project-manifest-drift-2026-11-11/`. No real lesson project
was scanned. No GUI is added in this slice.

## Review

[Independent review of `c233dcc6`](CLAUDE_PROJECT_MANIFEST_REVIEW_C233DCC6_2026-11-11.md):
**changes requested**.

- **M-1 (Medium):** an output named `<root>/..m.json` or `<root>/..sub/m.json` passed the
  outside-root string check and was written inside the project. Nothing was overwritten,
  because of `wx`.
- **Lows L-1 to L-6:**
  - L-1: an entry-limit overflow produced a schema error instead of limited coverage;
  - L-2: one oversized file stopped the whole scan;
  - L-3: `readdir` loaded a whole directory into memory;
  - L-4: no cancellation inside a large file;
  - L-5: a generic reason was given under an unobserved ancestor;
  - L-6: the outside-root check compared path spellings.
- **Nits N-1 to N-3.**

Fixed in the follow-up commit:

- M-1/L-6: the output's real parent and every ancestor are compared with the selected root
  by device and inode identity, so `..`-prefixed names, case-insensitive spellings, 8.3
  short names and bind mounts are refused. Regression tests cover both `..` forms and a
  sibling `<root>..json`, which is allowed.
- L-1: entries are counted while streaming; the schema caps unobserved rows at 4 × the
  file limit; limited coverage is reported as `entry-limit`.
- L-2: the `byte-limit` reason above.
- L-3: `opendir` streaming, bounded by the entry budget.
- L-4: a currency check on every 1 MiB hashing chunk. Cancellation errors propagate and
  are never downgraded to `unreadable`.
- L-5: the reason of the nearest unobserved ancestor is reported.
- N-1: `unobserved` must be sorted, unique and disjoint from `files`; `exclusions` must
  equal the fixed list; files, entries and bytes must be within the manifest's own limits;
  `byte-limit` reasons must match `limitReason`.
- N-2: the sort wording.
- N-3: `manifest-write-failed` is now distinct from `manifest-output-exists`.
- Stability: a ctime-only change is now tested.

Mutants killed: identity walk, per-chunk currency, unobserved order, file-limit refinement,
ctime, ancestor reason and EEXIST mapping. The early file-growth check stays as an
optimisation; the final size check covers it.

Revalidation:

- Real WinBoat Windows 11: 16/16 checks. These add the `..`-prefixed, **case-variant** and
  **8.3 short-name** outputs inside the root (all refused), an oversized file listed while
  the scan continued, and nothing written into the project.
- Production Linux CLI/MCP: 14/14. Startup smoke passes.
- Full suite: 6,689 tests in 487 files.

The [recheck of `b64f5859`](CLAUDE_PROJECT_MANIFEST_RECHECK_B64F5859_2026-11-11.md)
**requested changes**:

- **R-1a (Medium):** a nested entry overflow still produced a schema error.
- **R-1b (Medium):** a byte-limit row followed by a file limit failed the new schema rule.
- **R-2 (Low):** a bind mount of a *subfolder* passed the check.
- **R-3 (Low):** a byte-limit-only manifest reported deleted files as not reached.
- **R-4 (Low):** skipped oversized listings were undocumented.
- **Nits:** wording.

Fixed in the next commit:

- R-1a: a per-entry `++entries > maxEntries` check, in addition to the streamed listing
  budget.
- R-1b: a later stopping limit takes precedence, and any byte-limit row needs some
  `limitReason`. A schema failure of the tool's own output is reported as the fixed
  `manifest-scan-inconsistent` code, never as a raw error.
- R-2: after scanning, the output's parent is refused if its device/inode is any folder
  the scan entered. A real unprivileged user-and-mount-namespace probe, `unshare
  --map-root-user --mount`, bind-mounted the project's subfolder and the root
  elsewhere; both outputs were refused (`manifest-output-invalid`) and nothing was
  written into the project.
- R-3: only file and entry limits produce `notReached`.
- R-4: documented above.
- Nits: the module and doc wording, and the "outermost" comment.

Regression tests for R-1a, R-1b and R-3 fail on the previous code. Revalidation:

- WinBoat Windows 11: 16/16.
- Production Linux CLI/MCP: 14/14. Startup smoke passes.
- Full suite: 6,692 tests in 487 files.

Awaiting a second recheck.
