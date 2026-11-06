# Claude overnight review 14 — 6 November 2026

Reviewer: Claude (real, read-only), Orca task `task_2779d63299b3`.
Head reviewed: `13f7d72377eeb0ad14f17d83e8ef1cfeb4d7037c` ("feat: retain explicit local lesson recovery copies").
Base: `bef8b6e9c9046fab6f6ec07fdac42a58bb591ec9` (slice16, reviewed in review 13).
`main` is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`. The checkout was clean, and HEAD was still `13f7d723` when I finished. This report is the only file I wrote in the checkout. Review 13 and Follow-up 13 are preserved unchanged.

All test runs used an immutable `git archive` of `13f7d723`, unpacked in my session scratchpad outside the checkout. `node_modules` was symlinked one entry at a time, with `.vite` and `.vite-temp` left out. I used the pinned Node 22.22.1. My two scratch probe tests ran only in that snapshot, and I deleted them afterwards.

## Verdict

I found **no High or Medium issues**. There is **one new Low** (L17-1, Restore races an in-flight illustration). It is confirmed by a probe and is a small fix. There are also several notes (N17-x) and one baseline item (B17-1). Review-13 items L16-1, N16-1, N16-2 and N16-4 are handled as stated. None of these findings blocks the next authorized item (shared CLI/MCP query/export access over the same validators and services). L17-1 should be fixed in, or before, that slice.

## What I ran (my own counts only)

| Check | Result |
|---|---|
| Focused Vitest: `electron/ipc/lesson.test.ts`, `electron/lesson/` (draftStore, service), `src/lib/lesson/` (frameSource, lesson, output), `LessonGuideDialog.test.tsx`, `LocalLessonDraftControls.test.tsx` | **80 passed / 8 files, 0 skipped**, 4.53 s. The file set is the same as the worker's "focused 80/8", so these counts overlap theirs and should not be added together. |
| `tsc --noEmit -p tsconfig.json` and `-p tsconfig.node.json` | both pass |
| `biome check` on the 9 touched source/test files | clean |
| `node scripts/i18n-check.mjs` | PASSED, 14 locales × 7 namespaces, 1243 literal keys |
| Native/Rust/helper/compositor/clock paths in `git diff --name-only bef8b6e9 13f7d723` | none |
| Scratch probe A (jsdom, real `LessonGuideDialog`): Restore during an in-flight illustration | reproduces L17-1 |
| Scratch probe B (real filesystem, real `LessonDraftStore`, actual Linux tmpfs) | all guards hold; details below |

I did **not** rerun the full suite, the Vite build, Electron, a screen reader, Windows, macOS or any native step. The worker's full 5553/419 run is theirs alone; I did not reproduce it, and none of my counts include it. I judged a full rerun unnecessary because the diff is confined to the lesson dialog, the store/IPC/preload and locale JSON, and both TS projects and all lesson tests pass.

## Review-13 disposition checked

- **L16-1 (fixed).** `update()` now adds the edited id to `pinned`, and the render loop uses `visible = matches ∪ pinned` (restricted to existing steps). An edited row therefore stays mounted when Reviewed→Draft or Draft→Reviewed pushes it out of the active filter. `setQuery` is the only path that changes the query, and it clears pins and the edit notice. Add, Draft, Open and Restore all go through it. `hidden` is now computed against `visible`, so export is blocked only for selected rows the user cannot see. "Select matching steps" still selects only pure matches. Move up/down stay disabled whenever `matches.length !== steps.length`, which pinned non-matches trigger. Native-illustration initiation pins its row before its checks; a failed capture leaves a harmless pin. The busy, notice and edit-notice `role="status"` regions are now mounted empty. The shipped dialog tests cover continued typing/focus in both directions. Accepted. This is DOM-level proof only, as the worker states.
- **N16-1 (documented).** The guide now states plainly that every new derived manifest carries `output` and needs a slice16+ reader, and that old source files round-trip unchanged. Accepted as a documented compatibility boundary.
- **N16-2 (documented + tested).** NFKC + lowercase substring only. ß/İ limits are tested and documented. Accepted.
- **N16-4.** The new `drafts`/`query` strings are English in all 14 locales (17 added `+` lines in `fr/timeline.json` contain "recovery"). The parity check passes. As stated, this is key parity, not translation.

## Slice-17 recovery store checked (`electron/lesson/draftStore.ts`, `readLessonFile.ts`, IPC, preload)

**Location and identity.** The root is fixed at `path.join(app.getPath("userData"), "lesson-recovery-copies")` and built once in `registerLessonHandlers`. The renderer never supplies a path. `read`/`remove` accept only `z.string().uuid()` and join `id + ".openscreen-lesson.json"`; `../x` is rejected by Zod before any filesystem call. Publication names come from `randomUUID()` alone.

**No storage before explicit Save.** `status()`, `list()` and the mount-time status call only `lstat`/`opendir`, and treat ENOENT as empty. `mkdir` exists only inside `save`. The shipped store test asserts that the folder is absent after `status()`.

**Permissions (actual Linux, probe B).**
- New root 0700 and files 0600, also with `process.umask(0)`.
- A pre-existing 0755 folder → `local-draft-unavailable`. The mode is left at 0755 and nothing is written.
- A root symlink to a real directory → status, save, read and remove all return `local-draft-unavailable`, and the target directory stays empty.
- The Windows mode check is skipped by design (`process.platform !== "win32"`). The `0o600` open mode is ignored there too, so Windows privacy rests on the profile ACL. That is unverified, as the guide says.

**Publication.**
- Sequence: `open(".pending-<uuid>", "wx", 0o600)` → `writeFile` → `sync` → `close` → same-directory `link` to a new UUID name. Then `finally` unlinks only its own temporary file.
- The published file has `nlink` 1 after cleanup (probe). `link` cannot overwrite an existing name (EEXIST).
- There is no directory fsync, and the guide makes no power-loss claim. Both statements are correct.
- If cleanup of the temp file fails after a successful link, the inode is counted twice toward the byte quota until the folder is tidied by hand. Documented.

**Admission and serialization.** `serial()` rejects a mutation when 4 are already pending, and it chains through `queue.catch()` so one failure doesn't poison the queue. Probe B ran 6 concurrent saves on a fresh store: 4 ok, 2 `local-draft-unavailable`, 4 files. The quota is computed inside the serialized section, so in-process saves cannot overrun it. The single-instance lock in `electron/main.ts:216` means a second GUI process normally cannot race it. Reads/lists are deliberately not serialized; a read racing a delete just fails.

**Quotas.** 16 MiB on the pretty-printed buffer, then a refusal when `limited || copies >= 20 || bytes + new > 64 MiB`. `bytes` is the sum of `lstat().size` of recognized entries (`*.openscreen-lesson.json` and `.pending-*`), so sparse pending files count by logical size. The scan stops at 4096 directory entries or 21 recognized entries and sets `limited`, which blocks writes. The 16 MiB save cap equals `MAX_LESSON_BYTES`, so anything the store writes is readable by `readLessonFile`.

**Reader.** `readLessonFile` (shared by ordinary Open and recovery read) does `lstat().isFile()` → `open(O_RDONLY|O_NOFOLLOW|O_NONBLOCK)` → `fstat` regular + size ≤ 16 MiB → bounded read with a size+1 buffer and a changed-size check → `parseLesson`. Probe B results:
- A leaf symlink to an outside copy, a FIFO and a directory, all given UUID names, are each refused on read with "Choose a regular lesson file". The FIFO does not block.
- `list()` labels all three `readable: false` with an empty title and no payload. The good copy reads back with its full code (`CANARY`).
- `remove(leafSymlink)` unlinks only the link, and the outside file stays intact.
- `remove(fifo)` unlinks the FIFO name. `remove(directory)` fails EISDIR, which maps to the generic `lesson-operation-failed`.

**IPC error privacy.** `bounded()` returns only `{success:false, code}`: a `LessonOperationError` code, `destination-exists` for EEXIST, or `lesson-operation-failed`. Zod, parse and errno messages never reach the renderer. The UI shows fixed strings only.

**Recovery content scope.** The five `lesson:draft-*` channels are the only consumers, and they are reachable only from the preload bridge. Nothing in the diff exposes recovery copies to CLI, MCP, application integrations or exports. Copies intentionally keep full code/images regardless of `output` exclusions (shipped test with `includeImages/includeCode: false` plus a code canary).

## Slice-17 UI checked (`LocalLessonDraftControls.tsx`, dialog wiring)

- Save stays disabled until `status` (path + quota) has loaded. The path is shown before any write. Save sends the `lesson` prop at click time. The acknowledgement shows that copy's `revision` and path, and the copy says later edits need an explicit save.
- "Show" lists metadata only. "Preview restore" reads one copy, which is validated in main (`parseLesson`) and again in the renderer (`validateLesson`). Restore is a second, separate click inside a visible confirmation group that says it replaces the current unsaved dialog draft and that files stay unchanged. Delete needs its own confirmation click. Unreadable copies keep the Delete button and lose Preview, so corrupt entries can be managed from the UI.
- Async results check an `epoch` object that is replaced on unmount, and `inFlight` blocks overlapping operations inside the component. The component is keyed by `lesson.id`, so opening a different lesson remounts it and drops its list, candidate and pending results.
- Restore resets the query (clearing pins), selects all restored steps, and does not touch any file.

## Findings

### L17-1 (Low, new, confirmed): Restore is not coordinated with the dialog's in-flight illustration, which silently overwrites the restored lesson

`onRestore` (`LessonGuideDialog.tsx`, around line 195) calls `setLesson(valid)` directly. It does not go through the dialog's `run()`/`busyRef`, and it does not replace `epoch.current`. Meanwhile the native-illustration action (around lines 386–425) builds `next` from the `lesson` captured when it was clicked. When the frame arrives, it calls `setLesson(next)` because the epoch is unchanged. Restore's own button is disabled only by the child component's `busy`, not by the dialog's.

**Probe A** (jsdom, real dialog and real child component, mocked IPC):
1. Open a lesson with one step, "Original step".
2. Start "Illustrate from current saved playhead", with `lessonFrame` kept pending.
3. Show copies → Preview → Restore a two-step copy. The step titles become `['Restored A','Restored B']`.
4. Resolve the frame. The titles go back to `['Original step']`, with the new image attached, while "Recovery copy restored into the dialog…" is still shown.

The recovery file is untouched, so the copy can be restored again, and no file data is lost. However, the dialog now shows the pre-restore lesson under a "restored" notice. A following Save, recovery Save or Export would then write the wrong lesson. Open is not affected, because it goes through `run()` and is refused while busy.

Suggested fix (either is enough): disable Preview/Restore while the dialog is `busy` (pass `busy` down), or have restore replace `epoch.current` so the late frame result is dropped. Add a regression test shaped like probe A.

### B17-1 (baseline, pre-existing in `bef8b6e9`): illustration completion also discards edits typed during the capture

The same stale-closure `reviseLesson(lesson, …)` means title or instruction typing during a pending frame capture is lost when the frame lands. Text inputs are not disabled while `busy`. I found this by reading the code; it is the same mechanism as L17-1 and is not new in slice17. A functional update (`setLesson(current => …)` with the new image applied to `current`) would fix both, keeping the `project-changed` checks as they are.

### Notes (no change required to accept)

- **N17-1:** The admission-cap rejection reuses `local-draft-unavailable`, so the UI shows the same "check the visible storage location" text as a non-private or symlinked folder. The cap is only reachable outside the component's `inFlight` guard (for example, several windows), so this affects message accuracy only.
- **N17-2:** `list()` sorts all recognized entries, including `.pending-*`, by mtime and then slices to 20. In a manually overpopulated folder, newer pending entries can push valid copies out of the list. The app alone cannot reach that state (save refuses at 20 entries). Unlike `status()`, `list()` returns no `limited` flag, so the UI shows "inventoryLimited" only after the status refresh. This fits the documented lower-bound inventory.
- **N17-3:** `list()` fully reads and parses every listed copy just to get titles. The app quota bounds this at 64 MiB, but a hand-filled folder could reach 20 × 16 MiB per "Show" click. This is a performance limit only.
- **N17-4:** The full app-data path, which normally contains the OS username, is displayed in the dialog and in the save acknowledgement. In a screen-capture product it could end up in a recording. Ordinary Save already shows paths, so this is not new in kind. It is worth keeping in mind for the CLI/MCP slice, which should not echo it automatically.
- **N17-5:** Cross-platform limits are as documented: Windows has no `O_NOFOLLOW` (lstat-then-open TOCTOU, same-user only) and no POSIX mode enforcement; hard-link semantics on FAT/exFAT/network userData are unverified, and saves would fail rather than fall back. None of this was tested by me or the worker.

## Not verified (by me)

Real Electron/visible desktop, the real screen reader, the actual `app.getPath("userData")` location, Windows, macOS, network or removable filesystems, power loss, sustained or long-running use, Vite/renderer builds, and the full suite. I also did not re-run the worker's real Node file probe or inspect its `slice-17-*` / `lesson-recovery-copies-fixture-final` artifacts. I did not read or modify any real app data or user lessons.

## Next authorized work

There are no blockers. The next slice can go ahead (shared CLI/MCP query/export access over the same validators/services, selected scope only, with no automatic exposure of recovery content and no new app adapters). L17-1 (and B17-1 if convenient) should be fixed first or alongside it. That slice should keep the `lesson:draft-*` store unreachable from CLI/MCP unless separately authorized.
