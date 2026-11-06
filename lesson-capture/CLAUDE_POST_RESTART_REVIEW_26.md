# Claude post-restart review 26: follow-up to review 25

- **Reviewed commit:** `d017e4b881abb3279d26ee663b46f2f54f11d32f` ("fix: constrain lesson source refresh to its project")
- **Parent:** `93518c36916492c67b52f95d783bda19d35e8446` (accepted in review 25)
- **Branch:** `lesson-capture/input-boundaries`
- **Date:** 6 November 2026
- **Reviewer:** Claude (Orca worker, task `task_2f1f14c9ba14`)
- **Checkout state:** `git status` was clean and HEAD was the exact SHA above. This file is the only one I wrote in the checkout.
- **Toolchain:** Node 22.22.1 and npm 10.9.4.
- **Review 25 is preserved:** it is committed verbatim, SHA256 `3c93494197969bbd3340969231aa18d0688900b72ace53333e62ac8a64dd5bf4`.

## Verdict

**Accepted. There are no High, Medium or Low findings and nothing material blocks completion.**

Status of the review 25 findings:

- **L26-3 is CLOSED.** A refresh now has to stay in the same project.
- **T26-2 is CLOSED.** All six guards now fail tests when removed.
- **N26-5 is CLOSED.** The wording about recomputable binding IDs is honest.

The only runtime change is one guard in `electron/lesson/sourceIdentity.ts`:

```ts
if (replacement && replacement.projectId !== previous.projectId)
	throw new RangeMediaError("range-media-unsupported");
```

It sits before `readDocument`, and it applies to both legacy (version 1) and pinned (version 2) previous selections. The other code change is an explanatory comment in `electron/lesson/sourceFiles.ts`.

I found no regression in authority, schema, cancellation or receipt handling.

## What this review does and does not prove

All evidence is Linux, synthetic and offscreen. A content pin proves the source bytes were equal at each observation. It is not a historical, immutable, authenticated or signed attestation.

The following were **not** tested and are **not** claimed: audio, physical capture, Windows, macOS, hardware encoding, a timed player, and any user-facing entry point.

## Commands run and results

I ran everything from a `git archive` snapshot of `d017e4b8` in my session scratchpad. It had `node_modules` linked one entry at a time and the untracked `electron/native/bin/linux-x64` linked in. Nothing ran inside the checkout itself.

1. **Focused tests.** Command: `npx vitest run electron/lesson/sourceIdentity.test.ts electron/lesson/sourceFiles.test.ts electron/lesson/rangeMedia.test.ts electron/lesson/encodedVideo.integration.test.ts electron/lesson/fileCommands.test.ts electron/lesson/draftStore.test.ts src/lib/lesson/mediaSelection.test.ts`. Result: **97 passed in 7 files, 0 skipped.** This matches the worker's count.
2. **Mutations.** I ran 34 mutants against the same 7 files: the 30-mutant set from review 25 again, plus 4 new ones on the project guard (J1–J4).
   - **J1–J4 all killed:**
     - J1 removes the guard.
     - J2 moves it after `readDocument`. This is caught by the "before any project read" assertion.
     - J3 applies it only to pinned selections.
     - J4 applies it only to legacy selections.
   - **All six T26-2 guards are now killed:** I6 receipt history strip, I13 materialization platform gate, I14 cancel after the picker, I17 combined schema bytes, I18 schema history max 8, and I29 empty bindings. In review 25 all six survived.
   - **Kill details:** every kill failed 1–5 of the 97 tests. There were 0 test timeouts and 0 load or transform failures.
   - **The same 5 survivors as review 25 remain:** I4 and I5 are mutually redundant, I22 and I26 are layered redundancies, and I30 is an equivalent mutant. The follow-up names these honestly and does not claim to remove them.
3. **Review 25 probes, rerun.** My `zzR25` scratch test ran in the snapshot and was deleted afterwards.
   - **P1:** cross-project refresh is now **refused** with `range-media-unsupported`.
   - **P2–P5 behave exactly as in review 25:**
     - Reordered identity keys still match.
     - Nested history, 9 history entries, a pin over 8 GiB and a pin with a path field are all rejected.
     - A forged pin that matches the current bytes reaches the render. That is content equality only.
     - A wrong-hash pin runs the picker but gives 0 renders and no output.
     - A same-size byte change is refused.
     - An explicit same-project refresh keeps the history (2 entries).
4. **The worker's evidence, checked** (`slice-26-review25-followup-20261106/`).
   - **`controls.json`:** 7 controls, each `assertionKilled: true`, and `restored: true`.
   - **The 7 logs:** each shows 1–2 failed assertions in `-t`-filtered runs, with **0 timeout, transform or load failures**.
   - **`positive-controls.log`:** 97 passed in 7 files.
   - **Preservation records:** `preservation-before.json` and `preservation-after.json` are identical.
   - **Re-hashing:** I re-hashed all 52 report hashes listed there (0 mismatches) and the 111 earlier evidence files (0 mismatches). The original `proof.json` SHA256 is still `2fec56c2…a3d`.

## How each finding was closed

- **L26-3:** refusal before any read is pinned for both legacy and pinned previous selections, and same-project refresh and relink still pass. A cross-project rebind is described as a possible future, separate explicit intent.
- **T26-2:** each of the six new tests checks one guard on its own, and the mutations confirm that each test depends on its guard:
  - **Receipt history:** the test asserts that the source selection has history and that the receipt's `previousSelections` is `[]`.
  - **Platform:** materialization on darwin and on win32 is refused before any project read, picker or render.
  - **Cancel after picker:** an abort while the picker returns null rejects with `range-media-cancelled`, with no `fs.open`, no render and no `lesson-range-*` folder.
  - **Combined bytes:** exactly 8 GiB across two uniquely bound rows is accepted, and 8 GiB + 1 is refused.
  - **History cap:** 8 flat legacy snapshots are accepted and 9 are refused.
  - **Empty bindings:** a native path with no visible asset binding is refused.
- **N26-5:** the comment in `sourceFiles.ts` and `AUTHORED_SOURCE_IDENTITY.md` now say that binding hashes omit paths and labels but can be recomputed and linked by anyone who knows the asset IDs.

## Cleanup and remaining limits

**Cleanup:** no `identity-*` or `source-files*` temporary folders remain in `/tmp`. My probe test file was deleted from the scratch snapshot. I launched no app or native process and killed nothing.

**Still open:**

- N24-2 (fail-closed timeout on slower hosts) and N26-1 (stderr fast-fail at exit untested)
- L23-1 and L23-W1
- audio and audio/video alignment
- physical capture, Windows, macOS, hardware encoding and the timed player
- user-facing capture and materialization entry points
- authenticated or immutable source history (not implemented; pins prove content equality only)

**Next step:** the coordinator can push this commit. No further roadmap phase started during this review.
