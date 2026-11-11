# Project manifest output-boundary second recheck — 955519d5 (11 Nov 2026)

Independent reviewer (Claude). This is a focused recheck of the fixes for R1–R4 from the 0397cdb1 recheck. I worked on the snapshot `/tmp/review-fbe11c00` and only read it. The unrelated GUI commit fbe11c00 was not reviewed.

## Verdict: ACCEPTED WITH LOWS

R1–R4 are fixed and verified. No new false negatives were found. One Low remains, about the write-failure cleanup.

## Disposition

### Regression checks

| Check | Result | How |
|---|---|---|
| Alias classes a, b, c, e, f, g (bind mounts in an unprivileged namespace) | All refused as `manifest-output-invalid`, nothing written | Namespace probe |
| Genuine outside outputs (sibling via parent bind, plain outside) | Accepted | Namespace probe |
| Project file count before and after | 4 / 4 | Namespace probe |
| Tests | vitest 43/43; `tsc --noEmit` exit 0 | Ran both |

### R1 — post-write cleanup: fixed

I wrapped `fs.promises.open` so that, for the target path only, it bind-mounts a project folder over the output parent. The probe ran in an unprivileged mount namespace.

| Probe | Result |
|---|---|
| Mount `proj/keep` (has `m.json`) BEFORE open | `O_EXCL` refuses: `manifest-output-exists`. The project file is intact. |
| Mount `proj/sub` BEFORE open | File created through the alias, then the re-proof fails. It is removed (handle identity matches). `sub/m.json` is absent afterwards. |
| Mount `proj/keep` AFTER open, before the re-proof | `invalid`. `lstat` of the path is the project's file, whose identity differs, so it is **not** removed. `keep/m.json` still reads "PROJECT DATA". |
| Mount `proj/sub` AFTER open | `invalid`, and nothing is left in `sub`. |

The 0397cdb1 data-loss repro no longer applies, because identity now comes from the handle. `removeIfSame` also requires `isFile()` and a matching BigInt dev/ino.

### R2 — cancellation inside a listing: fixed

I used a project with 3,000 files in `.godot/big` and cancelled at each of the 10 `assertCurrent` calls. All 10 returned the caller's error, and none left a file.

### R3 — allow-list of filesystem types: fixed

Each magic number was checked against Linux `magic.h` and the filesystem sources. All are correct:

| Filesystem | Magic |
|---|---|
| ext2/3/4 | `0xef53` |
| XFS | `0x58465342` |
| Btrfs | `0x9123683e` |
| tmpfs | `0x01021994` |
| F2FS | `0xf2f52010` |
| ZFS | `0x2fc12fc1` |
| bcachefs | `0xca451a4e` |
| JFS | `0x3153464a` |
| ReiserFS | `0x52654973` |
| NILFS | `0x3434` |
| FAT | `0x4d44` |
| exFAT | `0x2011bab0` |
| ntfs3 | `0x7366746e` |
| legacy ntfs | `0x5346544e` |
| HFS+ | `0x482b` |
| ISO 9660 | `0x9660` |
| SquashFS | `0x73717368` |
| EROFS | `0xe0f5e1e2` |

None of these is a stacking or network filesystem.

Real mounts in the namespace:

| Output parent or root on | Result |
|---|---|
| ramfs | `unverifiable` (not listed; a false positive, but fail-closed) |
| tmpfs | Accepted |
| overlay root (output in the upper layer) | `unverifiable` |
| Output inside the overlay merged view | `unverifiable` |
| fuse-overlayfs | `unverifiable` |

These fail closed by being absent from the list (code reading): fuseblk / ntfs-3g (FUSE magic), aufs, ecryptfs, shiftfs, vboxsf, 9p, NFS, SMB/CIFS, Ceph and AFS.

The host's own filesystems, btrfs (`/`, home) and tmpfs (`/tmp`), are on the list.

### R4 — ancestor check uses BigInt: fixed

`outputOutsideRoot` now uses BigInt `statSync` for the root and every ancestor (code reading).

## Findings

### L1 — Low — A failed write leaves a partial manifest behind

`removeIfSame(target, undefined)` returns at once. If `handle.writeFile` fails after `written = handle.stat()` succeeded, the partial file stays. In that path `written` is already assigned and could be passed instead.

**How I verified it:** I mounted a 4 KiB tmpfs as the output folder, in the namespace, and manifested a project with 300 files.

- The result was `manifest-write-failed`.
- A 4,096-byte truncated `m.json` was left behind.

Effects:

- A retry with the same path then fails with `manifest-output-exists`.
- The re-proof is skipped on this path. If an alias had raced over the parent, the partial file would stay inside the project. That needs a mount race plus a write error at the same moment.
- The partial file is not valid JSON and never gets a receipt. A drift check refuses it because it is bound to the SHA-256.

**Fix:** declare `written` before the try and call `removeIfSame(target, written)` in the catch. When `stat` itself failed, a no-op is fine.

### Note — usability (no finding)

With the allow-list, projects or output folders on NFS or SMB home directories, sshfs, or ntfs-3g external drives cannot be manifested (`unverifiable`). This matters if learner machines use network homes. It is fail-closed and consistent with the contract, so it only needs a sentence in the user-facing docs and error text.

## Commands

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts`: 43 passed.
- `npx tsc --noEmit`: exit 0.
- Bundle built with esbuild from the snapshot into scratch.
- Namespace: `unshare --map-root-user --mount sh -c 'mount --bind "$1/a" "$1/b" && "$2" "$1/../../run.cjs"' probe <dir> <node>`. Bind, tmpfs (4 KiB), ramfs, kernel overlay and fuse-overlayfs mounts were done inside it. The open hook wrapped `fs.promises.open`, which the bundle calls through `require("node:fs").promises`.

## Limits

- I did not re-test on Windows. The F1 code is unchanged from 0397cdb1, which I verified on WinBoat.
- I did not mount aufs, ecryptfs, shiftfs, vboxsf, NFS, SMB or 9p; their status is from code reading only.
- The R1 races were made deterministic by hooks, not by real concurrent processes.
