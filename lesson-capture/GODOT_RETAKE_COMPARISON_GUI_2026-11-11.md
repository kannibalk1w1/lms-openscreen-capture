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

Awaiting an independent review of the immutable commit.
