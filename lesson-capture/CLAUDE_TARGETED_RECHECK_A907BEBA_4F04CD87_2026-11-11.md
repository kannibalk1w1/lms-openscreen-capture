# Targeted recheck a907beba / 4f04cd87 (2026-11-11)
Verdict: ACCEPTED WITH LOWS.
Runs (snapshot /tmp/targeted-recheck-4f04cd87): 4 test files, 45/45 pass; tsc --noEmit and tsc -p tsconfig.test.json clean.

## A. a907beba
- Cleanup passes `written` (BigIntStats from handle.stat on the O_EXCL-created handle) to removeIfSame; that unlinks only when lstat is a regular file with the same dev+ino. Verified in code. Identity is taken before writeFile, so a partial write is covered. If handle.stat itself fails, written is undefined and nothing is removed (leftover possible, see L1). R1 path (post-write re-proof) and fail-closed codes unchanged.
- Mutant (cleanup replaced by `void written`) in scratch: new test "removes its own partial file..." FAILS (30 pass / 1 fail). Test mock writes "{ partial" then throws ENOSPC, so it is a real partial file.
- Doc: L1 addendum accurate. The earlier section states the walk-to-write TOCTOU as "remaining, irreducible" and says wx prevents overwriting but NOT creation inside the project via an alias; wx is never equated with "no project writes".
- L1 (Low): if handle.stat() throws after O_EXCL create, the empty file stays (no identity). Extremely unlikely; doc claim "removes the partial file by its handle identity" is slightly broader. Optional: fstat failure fallback or doc note.

## B. 4f04cd87
- Digest failure: try/catch sets sourceSha256="" ; render gate is `checkpointSource?.sha256 &&`, so only the retake panel is hidden; the within-take "Compare scene checkpoints" block (gated separately on checkpoints.length>=2) and the generic review still render. No identity is displayed without a hash (panel not rendered at all).
- BOM test: file = EF BB BF + fixture; TextDecoder strips the BOM so decoded-text hashing would differ. Test asserts the shown 12-char hash equals sha(withBom) and not sha(linux), through the real ApplicationCaptureReview with real fixtures and real webcrypto. Mutant hashing TextEncoder(sourceText) FAILS the test. Valid.
- Digest-failure test: webcrypto.subtle.digest rejected; asserts within-take block shown and retake summary absent. Mutant removing `?.sha256` gate FAILS it (summary present). Valid.
- Reset test in GodotRetakeComparison.test: selects original, replacement, runs compare, rerenders with changed originalText, asserts select reset, result and replacement select gone. Valid (not mutated).
- L2 (Low): the digest-failure test only asserts the retake panel absence + one within-take heading; it does not assert the journal/generic review rows still render or that no error banner appears. Guard still proven by mutant.
- Nit: the test mocks digest for all calls; replacement-file digest failure inside GodotRetakeComparison is not covered by the new tests (not part of this diff).

## Electron probe (evidence dir openscreen-evaluation/retake-gui-electron-2026-11-11)
Claims accurate: probe.cjs launches production dist-electron/main.js (README pins source 4f04cd87 and main.js sha256); only files are supplied via Playwright setInputFiles; no stubs of hashing, decoder, comparator or read ordering. Harness shortcuts that do not touch the logic under test: calling ipcMain._invokeHandlers "switch-to-editor" (private Electron API) to open the editor, and window.confirm=true at teardown.
- L3 (Low): R6 stale-read check relies on a 7 MiB invalid file being slower than a small one plus a 3 s wait; ordering is not forced, so the run does not prove the slow read finished last (unit test in GodotRetakeComparison.test covers it deterministically).
- Probe does not exercise the digest-failure path (unit-covered only).
