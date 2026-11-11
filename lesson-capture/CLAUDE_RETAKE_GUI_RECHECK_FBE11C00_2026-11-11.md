# Recheck of fbe11c00 (follow-up to the aea7f3fa review), 2026-11-11

Verdict: ACCEPTED WITH LOWS. L1-L4 and the nits are fixed; L5 is partly addressed; two new Lows.

## Per item
1. L1, hash over exact bytes: FIXED. Capture review and replacement both read file.arrayBuffer() once, decode with TextDecoder, and hash those same bytes (bytesSha256). Non-fatal decoding (BOM stripped, bad UTF-8 replaced) is deterministic from the hashed bytes.
2. L2, reset on new original: FIXED. The original hash is now a prop (no async or stale state). The effect on originalText resets sequences, replacement, result, error and busy, and its cleanup bumps the epoch. Re-import also remounts via key.
3. L3, policy text: FIXED. It names the root name and says selection, scene path and stop reason are not compared. Matches the library.
4. L4: FIXED. Rows that differ and have unobserved fields show them (differingRowPartial). Connection counts are shown when connections are observed. The truncation note names the shortened lists; all six lesson.retake.list.* keys exist.
5. L5, tests: hash values are now asserted against node createHash for both sides, and a stale-read race test was added. Mutants (scratch copy, applied-check by grep, leaf restored by cp each time):
   - replacement shown with the original's hash: KILLED
   - epoch guard before setReplacement removed: KILLED
   - busy guard in compare() removed: survives (button is already disabled; defence in depth)
   - replacement hash over re-encoded text instead of bytes: survives (fixtures are plain UTF-8)
   - original sequence not reset on new original: survives (no rerender test)
6. Nits: FIXED. Replacement select has an accessible name with the file name; a role=status polite region shows the loading text while busy; .ndjson text matches accept. The result region still mounts together with its content, so announcement depends on the screen reader (untested).
7. Capture review hashes before setJournal: no regression found. Hashing runs only for a raw Godot journal with >=1 checkpoint; non-Godot, normalized and 0-checkpoint captures skip it (sha ""). The size cap precedes the read and the epoch is re-checked after the hash await. Test stubs updated for arrayBuffer.

## Findings
- Low N1: no test for non-UTF-8 or BOM bytes, for reset on a changed originalText, or that ApplicationCaptureReview passes the right hash (the three surviving mutants).
- Low N2: if crypto.subtle.digest throws (for example a non-secure context), the whole capture import shows "invalid", although the generic review would work; previously nothing could fail at that point. A try/catch around the hash would fix it.

## Commands (snapshot /tmp/review-fbe11c00, unmodified)
- vitest src/components/ai-edition/v4/: 30 files, 425 tests passed.
- tsc --noEmit: exit 0. tsc -p tsconfig.test.json --noEmit: exit 0.
- npm run i18n:check: PASSED (1473 keys, 15 locales).
- Mutations ran in /tmp/retake-gui-review-scratch/run-E1wYoo (symlink tree plus two real leaf copies). Left for the coordinator to remove.

Limit: jsdom only; no real browser or screen reader.
