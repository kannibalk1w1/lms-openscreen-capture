# Project manifest output-boundary review — 4520b7fd vs e452ee7c (11 Nov 2026)

Independent reviewer (Claude). This was a targeted review of `assertOutputParentOutsideProject`, `outputOutsideRoot` and `createProjectManifestFile` in `electron/lesson/projectManifest.ts`, of the tests, and of the "Fail-closed output boundary" section of `lesson-capture/PROJECT_MANIFEST_DRIFT_2026-11-11.md`. I worked on the immutable snapshot `/tmp/manifest-boundary-review-4520b7fd`, which I did not edit. I did not touch the real checkout.

## Verdict: CHANGES REQUESTED

The Linux bind-mount boundary works. I confirmed every alias class the coordinator named, in a real unprivileged mount namespace. Two holes remain:

- **Windows mounted folders:** a real alias type that the contract names is not covered (F1, verified on real Windows 11).
- **Overlay aliases:** a Linux alias with a different device/inode passes without being caught (F2).

## Contract disposition

| Contract item | Result | Evidence |
|---|---|---|
| Alias of an excluded-folder descendant (`.godot/imported`) | Refused, nothing written | Linux namespace probe |
| Alias of a folder never reached after `maxFiles:1` | Refused | Linux namespace probe |
| Alias of a depth-limited descendant (35 levels) | Refused | Linux namespace probe |
| Unreadable directory (`.godot/locked`, mode 000) | Fails closed: `manifest-output-unverifiable`, no file | Plain Linux run |
| Alias of the root, a subfolder of the root alias, or a subfolder alias | Refused | Linux namespace probe |
| Bind of a bind | Refused | Linux namespace probe |
| Bind of the project's PARENT, then a path descending into `.git/objects` or 35 levels deep | Refused | Caught already by the pre-scan ancestor-identity check, and by the walk |
| Legitimate outside outputs: parent folder, sibling, bind of a sibling, plain outside, sibling through a parent bind | Accepted | Linux namespace probe |
| Identity-walk entry cap | Fails closed, no file | Bundle copy patched to a cap of 6 |
| Cancellation at each of the 8 `assertCurrent` calls (scan, walk, pre-write) | Caller's error propagates unchanged, no file | Plain Linux run |
| Project file count before and after all probes | 4 / 4 | Linux namespace probe |
| Pre/post file-mutation, exclusion and partialness logic | Intact | The diff only removes the scan's `directories` set |
| Windows `subst` alias of `sub` and of `.godot\imported` | Refused | WinBoat Windows 11, real NTFS |
| Windows mounted-folder alias (C: volume mounted at `outside\cmnt`, path into the project) | Refused | WinBoat Windows 11 |
| **Windows mounted folder INSIDE the project** | **Accepted: not covered** | F1 |
| **Overlay upperdir alias of an overlay-merged project** | **Accepted, and the manifest appears in the project** | F2 |
| Race: mount over the output parent after the walk | Write lands inside the project | F3. This was documented as irreducible. |

## Findings

### F1 — Medium — Windows: the identity walk skips volume mount points that the scan treats as project folders

On Windows, libuv sets the dirent type to "link" for any reparse-point entry. For a volume mount point, `lstat` reports a directory, not a link. The two walks therefore disagree:

- **Scan:** uses `lstat`, so it descends into the mount point.
- **Identity walk:** trusts `entry.isSymbolicLink()` and skips it.

**How I verified it:** on WinBoat Windows 11 with Node 22.22.1, I made owned temp folders and ran `mountvol <proj>\vol <C: volume GUID>`. Results:

- The dirent for `vol` reported `isDirectory=false, isSymbolicLink=true`, while `lstat` reported `isDirectory=true, isSymbolicLink=false`.
- A manifest of `proj` contained 20 `vol/...` file rows (`vol/OEM/...`). The scan treats the mounted volume as project content.
- `createProjectManifestFile` with output `…\outside\legit2.json` was **ACCEPTED**, and the file was written. That folder is reachable as `proj\vol\Users\…\outside`. It is a project directory through a mounted folder.

The equivalent Linux case (a bind of `/` inside the project) is walked, and is refused or fails closed.

**Fix:** in the walk, run `lstat` on symbolic-link dirents too. Descend whenever `lstat` says directory, which is the same rule the scan uses. Alternatively, fail closed on any reparse-point directory. Add a Windows probe for this case. The Windows "16/16" run in the doc has no alias case at all (I read `windows-probe.zip/probe.cjs`). Other non-link reparse directories, such as cloud-file placeholders, probably follow the same path. I did not verify that.

All mounts were removed, the removal was checked (no ReparsePoint attribute left), and the temp folders were deleted.

### F2 — Low/Medium (scope decision for the coordinator) — aliases with a different identity (overlay/FUSE) are accepted silently

Device/inode identity cannot detect an alias that reports a different device. In a namespace, I mounted kernel overlayfs with lowerdir, upperdir and merged directories. The project was `merged/proj`, which has a copied-up `proj` in the upper layer. Output went to `upper/proj/m.json`.

- **Result:** ACCEPTED, and `merged/proj/m.json` then existed. The manifest is visible inside the selected project.
- **Device numbers:** merged dev 77, upper dev 53.
- **fuse-overlayfs:** also ACCEPTED. The file did not show up in the merged view in my run, probably because of FUSE caching, so that result is inconclusive.

bindfs, NFS/SMB loopback and similar mounts belong to the same class. I did not test them.

Under the contract wording ("any alias … must fail closed when it cannot be established"), this is a breach. The code cannot tell that it is in this case.

**Suggested fix:** fail closed (or at least warn) when `fs.statfs` of the root, of any walked directory, or of the output parent reports a stacking or network filesystem:

- overlay `0x794c7630`
- FUSE `0x65735546`
- NFS `0x6969`
- SMB2 `0xfe534d42` and CIFS `0xff534d42`
- 9p `0x01021997`

In any case, the doc should state that the proof covers only aliases that keep the same identity (bind mounts, subst, mounted folders).

### F3 — Low — Race between the walk and the write (documented residual, confirmed)

I mounted a bind of `proj/.godot` over the output parent at the final pre-write `assertCurrent`. The write was ACCEPTED, and `proj/.godot/m.json` existed.

This matches the doc's "irreducible" note. It can be narrowed so that no file persists: after the `wx` write, `fstat` the handle, then repeat the parent-identity walk (or `lstat` the path). If the parent is now a project directory, unlink the file and fail. I did not implement this.

### F4 — Nit — No cancellation inside a single directory listing

`assertCurrent` runs once per child directory, not once per entry. A single directory with about 1M files is iterated to the cap without a cancellation check. This is from reading the code: the loop at `visit`'s `for await`.

### F5 — Nit — Windows inode precision

`Stats.ino` is a Number. The NTFS file reference puts the sequence number in its top 16 bits, so values pass 2^53 once the sequence number is 32 or more. Low bits are then lost, and collisions can only cause false refusals (fail-closed direction). On the VM, the observed inos were about 8.4e14, which is exact (bigint check `exact: true`). Using `{ bigint: true }` for both `statSync` and `lstat` keys would remove this.

### F6 — Nit — The walk refuses on churn

If a subdirectory or an unknown-type entry disappears between `readdir` and `lstat`, the walk throws `manifest-output-unverifiable`. An open Godot editor rewriting `.godot` could cause a spurious refusal. This is from reading the code and was not reproduced. It is fail-closed, and the error message should say "retry".

## Commands and results

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts`: 2 files, 40/40 passed.
- `npx tsc --noEmit`: exit 0.
- Bundle built with esbuild from the snapshot (cjs), as instructed.
- Linux alias probe: `unshare --map-root-user --mount sh -c 'mount --bind "$1/a" "$1/b" && "$2" "$1/../../run.cjs"' probe <dir> <node>`. Mounts were done inside the namespace with `mount --bind` and `mount -t overlay`. All results are in the disposition table.
- Unreadable, cancellation and entry-cap probe: plain node, outside the namespace. Inside a userns, mapped root bypasses mode 000.
- Windows: WinBoat over SSH (encoded PowerShell), using the existing Node 22.22.1 binary in the VM. Owned folders under `%TEMP%\mbr-review-4520` (deleted afterwards). Used `subst X:/Y:` and `mountvol` of the C: volume. Mounts were removed and verified before deletion.

## Limits

- I did not test bindfs, NFS/SMB loopback, Windows `\\localhost` shares, OneDrive or cloud placeholders, or macOS.
- I did not test real-world project sizes against the 1M cap or the 256-depth cap. The depth cap is covered by the builder's unit test and by code reading.
- I wrote no code fixes. The snapshot is unchanged.
