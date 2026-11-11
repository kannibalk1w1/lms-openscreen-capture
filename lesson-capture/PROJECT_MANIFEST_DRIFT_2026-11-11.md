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
- **`files`:** `{path, size, sha256}`, sorted in code-point order, using `/`-separated
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
- **Hitting a limit:** the scan stops with `coverage: "limited"` and a `limitReason`;
  depth-limited folders are listed as unobserved.
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

Awaiting an independent Claude review of the immutable source commit.
