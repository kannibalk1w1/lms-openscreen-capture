# Advisory retake comparison in the Lesson guide — 11 November 2026

Built by Claude (Opus 5.5, lead builder). This is the first retake slice, and it is
**read-only and advisory**. It adds a GUI over the accepted cross-take
[reference comparison](GODOT_REFERENCE_COMPARISON_2026-11-10.md). There is no step or media
replacement, no lesson or timeline edit, no grading, no completion claim and no restore. Any
later replacement or persistence action must be a separate, explicit and reviewable slice.

## Author workflow

1. In **Lesson guide → Application capture observations**, import the ORIGINAL raw Godot
   journal (v2 or later, with at least one authored checkpoint). The existing within-take
   comparison still needs two checkpoints.
2. Expand **Compare with a retake (advisory)**:
   1. Choose the original checkpoint.
   2. Choose a REPLACEMENT raw journal file (`.jsonl`, 8 MiB at most, at least one
      checkpoint), then its checkpoint.
   3. Press **Compare original and replacement**.
3. The result shows:
   - the outcome: sampled fields agree, differ, or no observed difference with partial
     evidence;
   - the exact field policy;
   - the unknown or partial reasons (limited coverage, Node3D fields an older journal could
     not record, connections unobserved or partially recorded);
   - a same-take warning when both checkpoints come from one recording;
   - each source's identity: checkpoint label, scene, journal version, take suffix,
     coverage and a SHA-256 prefix computed from the loaded bytes;
   - complete counts, then bounded lists of differing paths and fields, original-only and
     replacement-only paths, partially compared paths, and differing saved connections;
   - a note when lists were shortened.

Changing the original checkpoint, the replacement file or the replacement checkpoint clears
the result. Importing another original journal resets the panel, and pending file reads are
discarded. Nodes are matched by root-relative path, never by session IDs, and renamed or
moved nodes appear as unmatched paths.

## Implementation

- `src/components/ai-edition/v4/GodotRetakeComparison.tsx`: the new component. It uses the
  accepted `compareGodotCheckpointToReference` library with exact numbers and no tolerance.
  Hashes are computed with Web Crypto.
- `ApplicationCaptureReview.tsx` mounts it whenever the raw original has one or more
  checkpoints, keyed by the import so that it resets.
- `lesson.retake.*` strings are added to all 15 locales, as English fallback under the
  owner's earlier option D5(a). `i18n:check` passes.

## Validation

- `GodotRetakeComparison.test.tsx` (jsdom, 4 tests) uses the **real retained Linux and
  WinBoat v5 takes**. It covers:
  - disabled Compare until all choices are made;
  - a matching checkpoint pair that agrees, with the policy shown, two hash identities and
    no same-take note;
  - a differing pair showing replacement-only paths;
  - the result cleared on original-checkpoint, replacement-checkpoint and replacement-file
    changes;
  - the same-take warning;
  - an invalid replacement refused.
- Mutants removing either clear-on-change call or the same-take note are killed.
- Existing v4 component tests (29 files, 420 tests), both `tsc` configs, lint, `vite
  build`, i18n and docs pass. The full suite passes with 6,700 tests in 488 files, run with
  this slice and the manifest boundary follow-up together.

These are jsdom component tests. No real-browser or real-Electron GUI run, screen-reader or
physical input pass has been done for this panel yet.

## Review

[Independent review of `aea7f3fa`](CLAUDE_RETAKE_GUI_REVIEW_AEA7F3FA_2026-11-11.md):
**accepted with Lows**, no High or Medium; all coordinator gates pass. Addressed in the
follow-up commit:

- **L1:** each SHA-256 is now of the exact **file bytes** (what `sha256sum` reports). The
  journal is read once with `arrayBuffer()`, and the compared text is the deterministic
  UTF-8 decoding of those same bytes, for both the original (hashed in the capture review)
  and the replacement.
- **L2:** a different original resets every selection, the result and the busy state.
- **L3:** the policy text now states that the root name is compared and that selection, the
  scene path and the stop reason are not.
- **L4:**
  - differing rows show fields one journal could not record;
  - saved-connection counts are shown;
  - the truncation note names the shortened lists.
- **L5:** tests now check both hash values against `sha256` of the fixture bytes, and race a
  slower earlier replacement read against a newer file. Both mutants (shared hash; no
  stale-read guard) are killed. Compare is also refused while a read is busy.
- **Nits:**
  - the replacement select's accessible name includes the file name;
  - a busy status line;
  - the help text mentions `.ndjson`.
- **Hashing order:** the capture review now hashes before showing the journal, so the
  journal and its checkpoint panels appear together. This removes a load-dependent ordering
  that made one existing test flaky. The existing capture-review and Lesson-guide tests now
  stub the single `arrayBuffer()` read.

Validation:

- 5 retake tests.
- The combined capture-review, Lesson-guide and retake tests: 42/42, three times in a row.
- i18n, lint and both `tsc` configs pass.
- Full suite: 6,702 tests in 488 files.

These are still jsdom-only tests.

## Recheck of `fbe11c00`

[Recheck](CLAUDE_RETAKE_GUI_RECHECK_FBE11C00_2026-11-11.md): **accepted with Lows**. L1–L4 and
the nits are fixed; L5 is partly fixed. Closed in the next commit:

- **N1:** three mutants survived because some behaviour was untested. New tests cover:
  - a BOM-prefixed original: the shown identity is the SHA-256 of the stored bytes, not of
    the decoded text. Tested through the real capture review with the real Linux/Windows
    takes, so the review must pass the right hash;
  - a changed original resetting every selection and the result.

  Both mutants (re-encoded-text hash; no original reset) are killed. The busy-guard mutant
  in `compare()` stays equivalent, because the button is already disabled while busy.
- **N2:** if Web Crypto hashing fails, only the retake panel is hidden, because its
  identities must be bound. The generic review and the within-take comparison still work,
  and a test covers this.

Full suite after these changes: 6,706 tests in 489 files.
