# Independent recheck: F1, F2 and F3 at e65dc4ac

- Rechecked HEAD: `e65dc4acb31e5ec55cfb07d79e86b7ec35258a61`. Previous review: `170eb141`. The fix diff is `170eb141..e65dc4ac`, one commit: "fix: preserve capture draft choices and bounded imports".
- Reviewer: Claude (Opus 5.5), Orca task `task_64c8d2d80d24`. Read-only. I created no files in the repo; every probe ran from `/tmp/claude-recheck-e65dc4ac/` on an esbuild bundle of HEAD source, built from stdin.
- Excluded, as instructed: the untracked `src/lib/applicationIntegrations/association.ts` (another worker's next slice). I did not read it, and I make no claim about whether the tree is clean.

## Verdict: ACCEPT — F1, F2 and F3 are closed; no new findings

### F1: closed
`LessonGuideDialog.tsx:396-404` now calls `author(() => next)`, then on success adds only the new step IDs to `selected` and `pinned`, de-duplicated with `Set`.
- `replaceLesson` is gone from this path, so there is no reset to all steps, no query reset and no `generation` bump. `LessonRangeControls` therefore no longer remounts and in-flight runs are no longer invalidated.
- `author` still calls `stopExport("stale")`. That matches the other append paths and is reasonable after a lesson change.
- The new rows are pinned, so they stay visible under an active title filter. Leaving the filter in place is a sensible change from the other appends, which clear it.
- The rendered regression test (`LessonGuideDialog.test.tsx` "appends imported drafts without resetting filters…") passes. It checks that the filter is kept, the excluded step stays excluded and hidden, step 1 stays included, and the new step 3 is included and visible.

### F2: closed
`godotScene.ts`: once the 10,000-observation cap or the projected normalized size (8 MiB, counted per observation including commas, with 1 KiB headroom for the changed coverage/stopReason) is reached, every later observation is dropped and the result becomes `coverage: "limited"` with `stopReason: "decoder-observation-limit"` or `"decoder-size-limit"`. Every raw record is still fully validated.

My own probes (`p3.cjs`):

| Case | Input | Result |
|---|---|---|
| Original F2 repro | 46 records, 856,367 B | Imports: 10,000 observations, `limited`, `decoder-observation-limit` |
| Prefix shape | — | Ordered by time, from record 1 to the last retained ID `40:9999` |
| Size case (my own, different from root's) | 2,001 records, 7.56 MB, 3 nodes with 1 KB paths moving every sample | 3,467 observations, `decoder-size-limit`; normalized 8,385,341 B (≤ 8 MiB) |
| Ordinary journal | — | Unchanged: `sampled` / `user-stop` |

For the size case, the normalized output re-imports with the same count. A draft made from the last retained observation reopens, and its instructions carry the new "Capture or import limit" wording.

**Corrupt tails after the cap still reject**, all with specific errors:
- sequence gap
- session mismatch
- instance mismatch
- clock going backwards
- root scope change
- node identity reused
- invalid selection
- a lifecycle record in the middle of the stream
- `limit` without `limited`
- missing footer

Raising the shared baseline cap from 2 MiB to the total 8 MiB is still bounded by the whole-capture byte check. The new English text is accurate and does not overclaim.

### F3: closed
`schema.ts` evidence `instanceId` now allows up to 200 characters, which matches the normalized format. My earlier 150-character repro (`p2.cjs`) now appends successfully. The repo test also covers 200 accepted and 201 rejected through reopen.

## Additional checks
- **Focused vitest:** 62 passed across 5 files (`LessonGuideDialog`, `ApplicationCaptureReview`, `godotScene`, `capture`, `sceneDraft`).
- **Earlier real evidence decodes the same as at 170eb141:** this covers WinBoat `Al7OpQ` and Linux `eBCnXy`.
  - scene journal: 11 observations
  - record limit: 4,094 observations
  - byte limit: 55 observations
  - disable journal: decodes
  - footer-failure journal: rejected
  - the normalized output equals a fresh decode, and the lesson's evidence matches.
- **Root's Windows tools:** I ran root's `windows-tools/verify.cjs` with its bundled `decoder.cjs` on Linux against the retained Windows fixture. The output is identical to the retained `windows.stdout.log` (count 10,000 / 2,083,326 B; bytes 1,932 / 8,384,580 B; instanceId round-trip 200). The bundle contains the new limit strings. The stderr log holds only an SSH post-quantum warning.

## Limits
- No full suite, tsc, lint, build or startup smoke; I relied on root's report of 6448/469 passing plus the focused runs above.
- I did not prove the Windows `decoder.cjs` bundle is byte-identical to HEAD source. I checked its behaviour and the presence of the new logic only.
- No WinBoat or VM access and no live Godot. Nothing here amounts to physical Windows, video or audio acceptance.
- Informational only: when the decoder truncates, `durationMs` still reports the whole journal's duration, while observations stop earlier. The `limited` flag and the UI text make that clear, so no change is required.
