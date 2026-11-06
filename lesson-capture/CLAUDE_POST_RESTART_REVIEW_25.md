# Claude post-restart review 25: slice26 authored source content pins

- **Reviewed commit:** `93518c36916492c67b52f95d783bda19d35e8446` ("feat: pin authored lesson range source content")
- **Parent:** `ec125e0853ff9d053fef5dd18fde6a7eb5608d64`
- **Branch:** `lesson-capture/input-boundaries`
- **Date:** 6 November 2026
- **Reviewer:** Claude (Orca worker, task `task_adf5ddccd1c2`)
- **Checkout state:** `git status` was clean and HEAD was the exact SHA above. This file is the only one I wrote in the checkout.
- **Toolchain:** Node 22.22.1 and npm 10.9.4.
- **Earlier reports are preserved:** the commit changes no `lesson-capture/CLAUDE_*` report.

## Verdict

**Accepted for its bounded Linux backend scope. There are no High or Medium findings and nothing material blocks completion.**

What I confirmed:

- **Capture is explicit only.** Planning, opening, saving, recovery, queries and export never read media.
- **Version 2 records are strict.** Extra fields such as `path` are refused, history is a flat list capped at 8 entries, sizes are capped at 8 GiB, and observation IDs and binding IDs must be unique.
- **Version 1 references are kept as-is.** They survive round trips and are refused for materialization before any document, folder or media access.
- **Stored pins never grant file access.** Paths always come from the saved project; a pin contains no path.
- **A stored pin is never overwritten** by hashes taken during an operation.
- **Changed bytes are refused before any output or native call.** That includes a same-size change, truncation, replacement, a missing file and a symlink.
- **Audio flags stay false.**

There are two new Lows (T26-2 and L26-3) and one nit (N26-5).

## What this review does and does not prove

All evidence is Linux, synthetic and offscreen. A content pin proves the source bytes were equal at each observation. It is **not** a historical, immutable, authenticated or signed attestation. A forged pin that matches the current bytes is accepted (probe P4). The documentation says this.

The following were **not** tested and are **not** claimed: audio, physical capture, Windows, macOS, hardware encoding, a timed player, and any user-facing GUI, IPC, CLI or MCP workflow.

## Commands run and results

I ran everything from a `git archive` snapshot of `93518c36` in my session scratchpad. It had `node_modules` linked one entry at a time and the untracked `electron/native/bin/linux-x64` linked in. Nothing ran inside the checkout itself.

1. **Full suite (unintended).** A shell quoting slip in zsh turned my file list into a single argument, so Vitest ran the whole suite. Result: **5763 passed in 430 files, 0 skipped (50.3 s).** This independently matches the worker's count.
2. **Focused tests.** Command: `npx vitest run electron/lesson/sourceIdentity.test.ts electron/lesson/sourceFiles.test.ts electron/lesson/rangeMedia.test.ts electron/lesson/encodedVideo.integration.test.ts electron/lesson/fileCommands.test.ts electron/lesson/draftStore.test.ts src/lib/lesson/mediaSelection.test.ts`. Result: **89 passed in 7 files.** This matches the worker's count.
3. **Boundary probes.** These were scratch Vitest tests that reuse the shipped fixture, with real temporary files.
   - **P1:** a `refresh-current` with a replacement request for a **different project** (`q`) is **accepted**. The new pin is for `q` and its history keeps the two `p` snapshots. See L26-3.
   - **P2:** a stored identity whose source rows have reordered keys is parsed back into the canonical order (`role,bindings,bytes,sha256`) and still matches. Materialization reaches the render.
   - **P3:** each of these is rejected by `lessonMediaSelectionSchema`:
     - a snapshot that carries its own `previousSelections`
     - 9 history entries
     - a source pin over 8 GiB
     - a pin with an added `path` field
   - **P4:**
     - **Forged pin:** a pin with a forged observation ID but the current hash reaches the render. This is content equality only, as documented.
     - **Wrong hash:** a pin with a wrong hash runs the folder picker once and is refused with `range-media-changed`, with 0 renders and no new folder entries.
   - **P5:** a same-size byte change is refused with `range-media-changed`, and the stored pin is untouched. An explicit refresh records the new hash and keeps the history (2 entries: v1, then v2).
4. **Guard mutations.** I ran 30 single-guard mutants and 2 combined mutants against the 7 focused files. No mutant timed out and none failed to load; every kill failed 1–5 tests on assertions.
   - **18 single-guard mutants killed:**
     - I1 legacy refusal
     - I2 coverage check before the picker
     - I3 pin compared with the pre-render observation
     - I7 capture before/after equality
     - I8 capture history cap
     - I9 author-current requires v1
     - I10 refresh requires a replacement request
     - I11 the final revalidation during capture
     - I12 the capture platform gate
     - I15 duplicate observation IDs
     - I16 duplicate bindings
     - I19 query status mapping
     - I20 ctime check
     - I21 inode check
     - I23 named path matches the descriptor before reading
     - I24 named path after reading
     - I25 the remaining byte budget
     - I27 the cursor-sidecar refusal
     - I28 binding coverage
   - **Combined mutants killed:** removing both post-render source comparisons (I4 and I5), and removing the post-render observation entirely.
   - **11 survived:**
     - I4 and I5 each survive alone. They are mutually redundant, because the pre-render observation already equals the pin.
     - I30 is an equivalent mutant.
     - I22 and I26 are layered redundancies.
     - I6, I13, I14, I17, I18 and I29 are test gaps. See T26-2.
5. **Retained native proof.** I checked `slice-26-source-identity-20261106T1624Z/proof.json`, `proof.cjs` and the output folder.
   - The proof records pin, attach, save, reopen and recovery passing, and legacy recovery unchanged.
   - The changed-bytes run (the driver appends bytes) is refused with `range-media-changed`, with **0 native calls** and no new folder.
   - After an exact revert there is **1 render**: 45 frames at 30 fps, 1.5 s. It has stored-sample timing and full-frame decode evidence.
   - The receipt carries an empty `previousSelections`, both video flags true and both audio flags false.
   - `source-copy.mp4` hashes back to the original (`bff4fdc2…`). The output `range.mp4` is `32e1f8f3…`, byte-identical to the earlier deterministic outputs.
   - All 111 earlier evidence files re-hash identically. `lesson-capture` holds 52 `CLAUDE_*.md` reports.
6. **Cleanup.** No `identity-*` temporary folders are left in `/tmp`. I started no app or native process outside Vitest, and I killed nothing.

## Findings

### T26-2 — Low, new: six slice26 guards are not pinned by tests

Each of these survives the shipped tests when removed alone:

- **`rangeMedia.ts`, receipt `selection: { ...selection, previousSelections: [] }`:** the receipt would carry the full history. That history holds earlier hashes and observation IDs, not paths. This contradicts the documented "receipt omits previous-selection history", and no test notices.
- **`rangeMedia.ts`, the materialization Linux platform gate:** only the capture gate has darwin/win32 tests.
- **`rangeMedia.ts`, the cancellation check straight after `pickDirectory`.**
- **`mediaSelection.ts`, the total-byte refine:** a pin whose sources together exceed 8 GiB while each is under the limit is untested.
- **`mediaSelection.ts`, `previousSelections.max(8)` in the schema:** only the capture-time cap is tested. Probe P3 shows the schema behaviour is correct.
- **`sourceFiles.ts`, the empty-bindings refusal in `resolveRangeSources`.**

The fix is one assertion for each. The most important is a receipt test that checks `previousSelections` is empty.

### L26-3 — Low, new: refresh does not bind the replacement to the previous project or lesson source

**Where:** `captureLessonSourceIdentity` uses `replacement.projectId`, with no comparison to `previous.projectId` (`sourceIdentity.ts:47`). `attachLessonMediaSelection` checks only the lesson, step, revision and the previous reference.

**What happens (probe P1):** an explicit refresh can move a step's pin from project `p` to project `q`. The history keeps the `p` snapshots. Nothing is lost, and every read still goes through the caller's `readDocument` authority.

**Why it matters:** this is broader than the document's "a fresh range request for the currently authorized saved project". Callers must not take a refresh to mean the same project.

**Fix:** either require `replacement.projectId === previous.projectId` (if cross-project rebinding is wanted, make it a separate explicit intent), or document that refresh may rebind to another project.

### N26-5 — nit: "opaque" binding IDs can be recomputed from asset IDs

A binding is `sha256(JSON.stringify(["screen", assetId]))` (`sourceFiles.ts:35`). Anyone who knows the asset ID can compute it, and asset IDs are already in the project. Bindings contain no path or label, as the test checks, but "opaque" means a hidden asset ID, not unlinkable.

## Status of earlier findings and limits

- **Source identity:** the historical authored source identity prerequisite now has a bounded **content-equality** implementation. Authenticated, immutable and signed history remain not implemented, as documented.
- **Still open:** N24-2, N26-1, L23-1, L23-W1, audio, physical capture, other platforms, hardware encoding, the timed player and user-facing entry points.
- **Legacy references:** materialization now refuses version 1 references (`range-media-unattested`). This is intended, and older strict readers may reject version 2.
- **No further roadmap phase started during this review.** The coordinator owns any fixes and the private push.
