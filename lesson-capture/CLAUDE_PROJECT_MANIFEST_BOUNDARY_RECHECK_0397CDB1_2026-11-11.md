# Project manifest output-boundary recheck — 0397cdb1 (11 Nov 2026)

Independent reviewer (Claude). This is a focused recheck of the fixes for F1–F5 from the 4520b7fd review. I worked on the immutable snapshot `/tmp/manifest-boundary-review-0397cdb1`, which I did not edit.

## Verdict: CHANGES REQUESTED

F1, F2 and F5 are fixed, and I verified them on real Linux and real Windows. The new F3 post-write cleanup has a race in which it can delete a pre-existing project file (R1, Medium). The F4 cancellation check inside a directory listing reports cancellation as the wrong error (R2, Low).

## Fix disposition

| Item | Result | How verified |
|---|---|---|
| F1: Windows volume mount point in the project | Fixed. An ordinary outside output gives `manifest-output-unverifiable`. The output on the mounted volume gives `manifest-output-invalid`. Nothing is written. | WinBoat Windows 11, `mountvol` of C: at `proj\vol` (attributes checked as ReparsePoint before the run, plain Directory after unmount, then cleaned) |
| Windows aliases into the project (`subst` of `sub`, C: volume mounted outside then a path into the project) | Still refused (`invalid`) | WinBoat Windows 11 |
| Windows junction inside the project | Still accepted for genuine outside output, including the junction's own target (by design: links are not followed) | WinBoat Windows 11 |
| F2: overlay root with output in the upper layer | `unverifiable`, nothing written, nothing in the merged view | Kernel overlay in `unshare --map-root-user --mount` |
| F2: overlay mounted inside the project, output in its upper layer or ordinary outside | Both `unverifiable` (the nested-mount check by device change works) | Same namespace |
| F2: output parent on FUSE (fuse-overlayfs) | `unverifiable` | Same namespace |
| F2: magic list | All entries correct: overlay `0x794c7630`, FUSE `0x65735546` (also covers virtiofs, mergerfs, bindfs), NFS `0x6969`, SMB `0x517b`, CIFS `0xff534d42`, SMB2 `0xfe534d42`, 9p `0x01021997`, Ceph `0x00c36400`, AFS `0x5346414f` | Code reading against Linux `magic.h` values. Missing entries are R3. |
| F2: Windows/macOS | The doc states that no filesystem-type check is done there. Network shares and macOS smbfs/nfs/macFUSE are therefore still unproven. | Doc reading. This limit is documented, as accepted. |
| F3: mount over the output parent at the final pre-write check | Refused, and the file written into `.godot` is removed | Namespace probe |
| F3: removal limited to the just-written file | **Not guaranteed (R1)** | Namespace probe with an injected race |
| F4: periodic cancellation | Runs every 1,024 entries, but the code is wrong (R2) | Plain Linux probe |
| F5: BigInt identities | Used in the walk and the target stat. `outputOutsideRoot` ancestor stats are still Number (Nit R4, fail-closed direction only). | Code reading |
| Regression: earlier alias classes a, b, c, e, f, g | All still refused (`invalid`) | Namespace probe |
| Regression: genuine outside outputs (parent, sibling, sibling via parent bind, bind of sibling, plain) | All accepted | Namespace probe |
| Tests | vitest 42/42; `tsc --noEmit` exit 0 | Ran both |

## Findings

### R1 — Medium — The post-write cleanup takes the "written" identity by path, so it can delete a pre-existing project file

The cleanup does `written = statSync(target, { bigint: true })` after `fs.writeFile(..., "wx")` resolves. This stat goes by path and follows the path at that moment; it does not use the descriptor that was written. Suppose a mount over the output parent lands between the write and that stat (the very race F3 targets), and the project directory now mounted there already contains a file with the same basename. Then `written` is that project file. The re-proof fails, `now` matches `written`, and `fs.unlink(target)` deletes the project's own file.

**How I verified it:**

- Inside an unprivileged mount namespace, I wrapped `fs.statSync`. On the first BigInt stat of the target, it ran `mount --bind proj/keep out/r2`. `proj/keep/m.json` already existed.
- Result: REFUSED `manifest-output-invalid`, `proj/keep/m.json` deleted, and the project file count went from 5 to 4.
- The injection fixes the timing deterministically. The real window is small but has the same shape.

The manifest this call wrote is then left behind, under the now-shadowed directory.

**Fix:** open with `wx` through `fs.open`, write through the handle, and take `handle.stat({ bigint: true })` before closing. Unlink only when the path's current `lstat` identity matches that descriptor identity, which means the file is ours.

### R2 — Low — Cancellation inside a listing is reported as `manifest-output-unverifiable`

The new `if (entries % 1024 === 0) assertCurrent()` sits inside the `for await` try. Its catch turns any non-`ProjectManifestError` into `unverifiable`, and the `cancelled` set is not checked there.

**How I verified it:** I used a project with 3,000 files in `.godot/big` and cancelled at each of the 10 `assertCurrent` calls. Calls 8 and 9 (the in-listing checks) gave `manifest-output-unverifiable` instead of the caller's error. The other 8 calls propagated the caller's error. No file was written in any case.

**Fix:** rethrow when `cancelled.has(error)`, or call `assertCurrent` outside the try.

### R3 — Low — Gaps in the alias-unsafe magic list

The list is missing:

- **Stacking or union filesystems that pass through to a lower directory:** aufs `0x61756673`, ecryptfs `0xf15f`, shiftfs `0x6a656a62`.
- **Host/guest or shared filesystems:** vboxsf `0x786f4256`, kAFS `0x6b414653`, Lustre `0x0bd00bd0`, GPFS `0x47504653`, OrangeFS `0x20030528`.

Two ways to fix it: add these, or invert the rule to an allow-list of local disk filesystems (ext2/3/4, xfs, btrfs, tmpfs, f2fs, vfat/exfat/ntfs3, zfs). An allow-list fails closed on anything unknown, which fits the contract better. This is from code reading; I did not test it.

### R4 — Nit — `outputOutsideRoot` still compares Number dev/ino

Precision loss here can only cause false refusals, but it is inconsistent with the BigInt walk.

### Note (no finding)

Windows directories with a non-link reparse tag, such as OneDrive cloud placeholders, are now listed as `symbolic-link` and make the whole project unverifiable. That is fail-closed and consistent with the new design, but it could block projects stored in OneDrive. I could not verify this: OneDrive is not signed in on the VM.

## Commands

- `npx vitest --run electron/lesson/projectManifest.test.ts electron/lesson/projectManifestTools.test.ts`: 42 passed.
- `npx tsc --noEmit`: exit 0.
- Bundle built with esbuild from the snapshot.
- Linux namespace: `unshare --map-root-user --mount sh -c 'mount --bind "$1/a" "$1/b" && "$2" "$1/../../run.cjs"' probe <dir> <node>`, with bind, kernel overlay and fuse-overlayfs mounts done inside it.
- Windows: WinBoat over SSH (encoded PowerShell) with the VM's Node 22.22.1, in owned folders under `%TEMP%\mbr-recheck-0397`. Used `mountvol`, `subst` and `mklink /J`. Mounts were removed in `finally`, their removal was verified, and the folders were deleted.

## Limits

- I did not test NFS, SMB, bindfs, aufs or ecryptfs on Linux, any network-share alias on Windows, OneDrive placeholders, or macOS.
- The R1 race was made deterministic by wrapping `fs.statSync`. It was not reproduced with a real concurrent process.
