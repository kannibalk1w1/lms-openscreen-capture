# Independent review: aea7f3fa (GodotRetakeComparison), 2026-11-11

Verdict: ACCEPTED WITH LOWS. No High or Medium findings.

## Gate table
| Gate | Result |
|---|---|
| Advisory, read-only | Pass. No lesson, step, media or timeline calls; only the library compare. |
| Explicit original/replacement journals and checkpoints | Pass. Compare is disabled until original checkpoint, replacement file and replacement checkpoint are all chosen; compare() re-checks. |
| Hash bound to compared bytes | Pass with Low (L1, L2). Replacement: the digest and the compared text are the same string from one file.text() call. Original: the digest is of the same originalText prop passed to compare. |
| Unknown/partial/truncated reasons, field policy | Pass with Lows (L3, L4). All five unknown reasons plus truncation note are rendered; policy text matches the library except root name (L3). |
| Clear on source/step/selection change | Pass. Original select, replacement select, new replacement file (clear() + setReplacement(null) + epoch++), original journal re-import (parent key = import id, and load() nulls checkpointSource first, so unmount), unmount (epoch++), stale reads (epoch guard before setReplacement; busy only reset by the newest). Error from a previous file is cleared. |
| No auto replacement / no grade, completion, restore claims | Pass. The only such wording is negation in lesson.retake.scope and sameTake ("not independent confirmation"). |
| ApplicationCaptureReview change | Pass. Retake mounts at >=1 checkpoint; within-take comparison still gated on >=2; key=import id so it resets; inside the busy fieldset. |
| i18n | Pass. 33 leaf keys identical in all 15 locales; every t() key (incl. dynamic outcome.*, unknown.*, connection.*) exists in en; variables match (label/scene/version/session/coverage/sha; matched/partial/differing/originalOnly/replacementOnly; path/fields; from/signal/to/method; name). lesson.checkpoints.choose exists. |
| React keys | Pass. Option keys by recordSequence; rows keyed by JSON path (unique, the library refuses duplicate paths); connections keyed side+row (library de-duplicates by map). Duplicate labels do not matter. |
| Size guard / errors | Pass. file.size checked against MAX_SCENE_JOURNAL_BYTES before reading; read/parse/no-checkpoint errors give role=alert; compare() throw gives "failed". |

## Findings
- Low L1: the SHA-256 is of the decoded JS string re-encoded as UTF-8 (TextEncoder on file.text()), not of the raw file bytes. A BOM is stripped and invalid UTF-8 is replaced, so the hash can differ from sha256sum of the file. It is consistent with the compared text, but the claim "computed from the loaded bytes" in the doc and UI is slightly strong. Fix: hash arrayBuffer(), or say "of the decoded text".
- Low L2: originalSha starts "" and is not reset when originalText changes; a result requested before the digest resolves, or after a prop change, would show an empty or stale prefix (the source line renders "SHA-256 …"). Not reachable in the app (digest takes microseconds, remount on re-import) but the component is unsafe as a standalone. Related: the effect cleanup runs epoch++ on an originalText change, which would discard an in-flight replacement read and leave busy=true forever (file input stuck disabled). Also only reachable if the prop changes without a remount.
- Low L3: policy text omits that the root node's name is also compared (library compares "name" for the root), and that the header scene path and stop reason are not compared. The wording is otherwise accurate (selection ignored, exact numbers, connection flags and bound-arg count).
- Low L4: rows where a path differs AND has unobserved fields drop the unobservedFields (not displayed, and not counted as partial); connection counts (connectionsReferenceOnly/CandidateOnly) are not shown although the truncation note says "the counts are complete". Truncated lists are not named.
- Low L5: tests do not verify the hash values. Mutant "replacement source line uses the original's hash" passes 4/4 (the test only counts two hash placeholders). Mutant removing the stale-read epoch guard before setReplacement also passes (no racing-read test). Mutant removing the compare() selection guard passes (button disabled covers it). Killed: removing the policy line, removing the unknowns list. The docs claim of clear-on-change mutants is plausible but I did not re-run those.
- Nit: the replacement select has both a wrapping label (with file name) and aria-label that overrides it, so the file name is not in the accessible name. The aria-live attribute is on a region that is mounted together with its content, so many screen readers will not announce it; busy has no status text. File input accepts .ndjson but UI text says .jsonl. No browser or screen-reader pass was done (authors say so too).

## Commands (snapshot, node v22.22.1)
- `npx vitest --run src/components/ai-edition/v4/`: 30 files, 424 tests passed (including the 4 new).
- `npx tsc --noEmit`: clean. `npx tsc -p tsconfig.test.json --noEmit`: clean.
- `npm run i18n:check`: PASSED (the snapshot lacked electron-builder.json5; I copied it from the checkout temporarily and removed it afterwards).
- Mutations: done in place on the snapshot component (the scratch dir did not exist at first, so one early batch ran without a backup); the file was restored from `git show aea7f3fa:` and verified byte-identical with cmp; scratch copy deleted. The snapshot component is identical to the commit.

## Limits
jsdom only; no real browser/Electron, screen reader or physical input. Library not re-reviewed. The stuck-busy and stale-hash cases in L2 are from code reading, not executed.
