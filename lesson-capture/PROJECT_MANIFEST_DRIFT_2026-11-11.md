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
  - `unsupported-name`: a name that is not valid Unicode (on Linux such names decode
    with U+FFFD and could collide); listed once, not hashed or entered.
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
  short names are refused. Bind mounts are covered by the scan-identity check below. Regression tests cover both `..` forms and a
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

The [second recheck of `d4de449f`](CLAUDE_PROJECT_MANIFEST_RECHECK2_D4DE449F_2026-11-11.md)
**accepts it with Lows**. Both are closed in the next commit:

- **S-1:** a bind mount of a folder the scan does not enter (an excluded `.godot`, a
  depth-limited or an unreadable folder) slipped through. Now every folder the scan
  meets, including skipped ones, is in the identity set. A real `unshare
  --map-root-user --mount` probe refuses both a bind-mounted subfolder and a bind-mounted
  excluded `.godot`, and writes nothing into the project.

  **Superseded by the fail-closed output boundary below.**
- **S-2:** undecodable names are listed once as `unsupported-name`, with a Linux
  regression test.
- **S-3:** the `manifest-scan-inconsistent` code has no direct test, because valid scans no
  longer reach it; it remains a defensive fixed code.

## Fail-closed output boundary (coordinator follow-up)

The coordinator rejected the residual above. `wx` prevents overwriting, but it does **not**
prevent creating a new file inside the selected project through an alias, so "outside the
project" must be proven or the write refused.

The scan's own directory set is therefore replaced with a dedicated **identity-only walk**,
run after the scan and before the write:

- It covers every directory under the selected root, including excluded (`.git`, `.godot`,
  `.import`), depth-limited and unreadable-by-the-scan subtrees, and folders never reached
  after a file or entry limit stopped the scan.
- It reads no files and never follows links: directory types come from the directory
  entries, and anything else is checked with `lstat`.
- If the output's parent has the device/inode of **any** such directory, the request is
  refused with `manifest-output-invalid`.
- If the walk cannot be completed, the request fails closed with
  `manifest-output-unverifiable` and nothing is written. That covers an unreadable
  directory, more than 256 levels, or more than 1,000,000 entries.

The pre-scan checks are unchanged: the output's real parent has no links, and no ancestor
identity matches the root.

Real alias evidence, from an unprivileged `unshare --map-root-user --mount` namespace on
owned scratch folders:

- bind mount of a **descendant** of the excluded `.godot` (`.godot/imported`): refused;
- bind mount of a folder **never reached** after `maxFiles: 1` stopped the scan: refused;
- bind mount of a **descendant of a depth-limited** folder (35 levels deep): refused;
- a genuinely outside folder: accepted.

The project's file count was unchanged (3 before, 3 after). Unit tests cover the fail-closed
cases: an unreadable `.godot/locked` gives `manifest-output-unverifiable` and no output file,
and a tree deeper than 256 levels under `.godot` gives `manifest-output-unverifiable`.
Revalidation:

- WinBoat Windows 11: 16/16 (NTFS directory identities).
- Production Linux CLI/MCP: 14/14. Startup smoke passes.
- Full suite: 6,694 tests in 487 files.

**Remaining, irreducible:** the walk and the write are not atomic. A mount, rename or bind
created inside the project *between* the walk and the `wx` write is not detected; closing
that gap would need OS-level locking that a user-space tool cannot impose. Within that
window, the guarantee is that the output's parent was not any project directory at the
moment of the check. A project with any unreadable directory, or one beyond the walk caps,
cannot be manifested at all, by design.

## Boundary review of `4520b7fd`

[Targeted boundary review](CLAUDE_PROJECT_MANIFEST_BOUNDARY_REVIEW_4520B7FD_2026-11-11.md):
**changes requested**. On Linux it confirmed the same-identity alias cases (a–g, i). The gaps:

- **F1 (Medium, Windows):** a volume mounted inside the project (`mountvol`) is a directory
  entry of link type that `lstat` reports as a directory. The identity walk skipped it,
  while the scan descended into it, so an output on that volume was accepted.
- **F2:** overlay upper-layer and FUSE aliases carry *different* identities.
- **F3 (Low):** a mount over the output parent between the check and the write.
- **F4–F6 (Nits):** cancellation inside one huge listing, Number inodes on Windows, and a
  vanishing folder failing closed.

Fixed in the next commit:

- **F1:**
  - Both the scan and the walk now track directory entries reported as links. The scan
    lists such a reparse/mount point as `symbolic-link` and does not follow it.
  - The walk **fails closed** (`manifest-output-unverifiable`) for any project containing
    one.
  - A real WinBoat Windows 11 probe mounted the C: volume at `proj\vol` (cleanup in
    `finally`, with removal verified afterwards). The ordinary output and the output on
    the mounted volume were both refused as `manifest-output-unverifiable`, and nothing was
    written. An earlier probe attempt was invalid: PowerShell 5.1 quoting of a trailing
    backslash made `mountvol` print its usage, so nothing was mounted. That run is not
    counted.
- **F2:** on Linux, if `statfs` shows overlayfs, FUSE, NFS, SMB/CIFS, 9p, Ceph or AFS for the
  root, the output parent or any nested mount inside the project, the request fails
  closed. A real unprivileged overlay probe (`mount -t overlay` in `unshare
  --map-root-user --mount`) with the project in the merged view refused both the
  upper-layer output and an ordinary outside output. Projects on such filesystems cannot be
  manifested. On Windows and macOS, filesystem-type checks are not performed; their
  same-identity and mount-point rules above apply.
- **F3:** after the `wx` write the boundary is proven again. If it fails, only the file
  this call just created (matching device/inode) is removed and the request fails. The
  remaining window is between that second proof and the caller using the receipt.
- **F4:** the caller's currency check runs every 1,024 entries inside a listing.
- **F5:** the walk uses BigInt device/inode.
- **F6:** a folder vanishing during the walk stays fail-closed, by design.

Unit tests (Linux) cover a mocked overlay root type (refused, no file) and a post-write proof
failure (the single written file is removed). The earlier bind-mount alias probes still
refuse all three alias kinds and accept a genuine outside folder. Production Linux CLI/MCP
14/14, startup smoke and the full suite (6,700 tests in 487+1 files) pass.

## Boundary recheck of `0397cdb1`

[Recheck](CLAUDE_PROJECT_MANIFEST_BOUNDARY_RECHECK_0397CDB1_2026-11-11.md): **changes
requested**. It confirmed F1 (real WinBoat `mountvol`), F2 (overlay root, nested overlay and
FUSE output, all in a namespace) and F5.

- **R1 (Medium):** the F3 cleanup took the written file's identity *by path* after the write.
  A mount over the output folder in that gap, holding a same-named project file, made the
  cleanup delete that file. This was reproduced with a forced hook.
- **R2 (Low):** a cancellation during a listing was reported as `unverifiable`.
- **R3 (Low):** the deny-list of alias-unsafe filesystems was incomplete.
- **R4 (Nit):** the pre-scan check compared identities as Number.

Fixed in the next commit:

- **R1:** the manifest is written through one handle opened with
  `O_CREAT|O_EXCL|O_NOFOLLOW` (mode 0600). The new file's identity comes from that handle
  (`handle.stat`), never from the path. Cleanup removes the path only while it is still a
  regular file with exactly that identity. A regression test swaps a different "project"
  file into the output path after creation and forces the re-proof to fail: that file
  survives. The test fails on the previous path-based identity.
- **R2:** caller cancellation errors propagate unchanged through the listing.
- **R3:** the Linux check is now an **allow-list** of local disk filesystems. Anything else,
  including any unknown type, fails closed. The list covers:
  - ext2/3/4, XFS, Btrfs, F2FS, ZFS, bcachefs, JFS, ReiserFS, NILFS;
  - tmpfs;
  - FAT, exFAT, kernel NTFS;
  - HFS+, ISO 9660, SquashFS, EROFS.

  As a result, fuseblk (ntfs-3g), overlay, network and stacked filesystems all fail closed.
- **R4:** BigInt identities in the pre-scan ancestor check.

Noted, not changed: on Windows, any non-link reparse folder inside a project (for example
OneDrive placeholders, untested because there is no signed-in OneDrive) makes the project
unverifiable. That is a fail-closed false refusal, never a write.

Revalidation: real WinBoat Windows 11 16/16 (handle-based write); production Linux CLI/MCP
14/14; startup smoke; full suite 6,702 tests in 488 files (run together with the retake GUI
follow-up).

## Second boundary recheck of `955519d5`

[Second recheck](CLAUDE_PROJECT_MANIFEST_BOUNDARY_RECHECK2_955519D5_2026-11-11.md): **accepted
with Lows**. R1 is fixed under forced mounts before and after open, and a project file is
never removed. R2 is fixed at all 10 cancellation points. R3 is fixed: the 18 allow-list
codes are correct, tmpfs is accepted, and ramfs, overlay and fuse-overlayfs are refused in
real mounts. R4 is fixed.

- **L1 (Low), fixed in the next commit:** a failed write (for example ENOSPC) left a partial
  file, so a retry then reported `manifest-output-exists`. The write-failure path now
  removes the partial file by its handle identity. A test forces a partial write followed by
  a failure and finds no file left; the test fails without the cleanup.
- **Note:** a project or output on NFS/SMB home folders, sshfs or ntfs-3g (fuseblk) cannot be
  manifested. The request fails closed with `manifest-output-unverifiable`. This is by
  design: choose a project and an output folder on a local disk filesystem.

## Targeted recheck of `a907beba` (with `4f04cd87`)

[Targeted recheck](CLAUDE_TARGETED_RECHECK_A907BEBA_4F04CD87_2026-11-11.md): **accepted with
Lows**. The partial-file cleanup removes only a regular file whose dev/ino matches the
creating handle, and the no-cleanup mutant is killed.

**L1, documented:** if `handle.stat()` itself fails immediately after `O_EXCL` creation, the
new file's identity is unknown. The (possibly empty) file is then left in place rather than
risk removing anything else, and the request reports `manifest-write-failed`.

**Final statement of the output boundary:**

- The manifest is created only by an exclusive create (`wx`/`O_EXCL`), which never
  overwrites anything.
- Before the write, every project directory is identity-checked against the output's
  parent; the write fails closed if that cannot be established.
- The boundary is re-proven after the write. If that fails, only the file this call created
  is removed.
- This is **not** an atomic containment or isolation guarantee. A mount, bind or rename
  inside the project between the identity walk and the create (or between the re-proof and
  later use) is not detected.
- `wx` alone does not mean "no project writes"; that property rests on the identity proof
  and its limits above.
