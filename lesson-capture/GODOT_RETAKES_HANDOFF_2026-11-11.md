# Retakes, manual run checks and handoff — 11 November 2026

The owner authorized Codex to finish the remaining Godot sprint work while Claude is
at its weekly limit. The scheduled Claude continuation was disabled to preserve one
implementation writer. These authoring features also work without Godot or any adapter.

## Author workflow

1. Capture the replacement demonstration, import its chosen application observations
   into a lesson, author its teaching text and save an editable lesson copy.
2. Open the original lesson's **Retakes, run checks and handoff** panel. Choose the
   target step, import that replacement lesson file, choose its replacement step and
   enter a reason. **Apply replacement take** asks for confirmation.
3. The target keeps its stable ID, place and LMS slide reference. Its teaching content,
   evidence, optional illustration and media selection come from the chosen replacement.
   Other steps retain their content and review status. The replaced step becomes a draft;
   its earlier content, evidence, media selection and illustration remain in history.
4. Review replacement illustrations and source timing; no old target illustration,
   manual timing or run-check pass is attached automatically. The replacement's own
   selected evidence/timing belongs to that replacement; ordinary source-content and
   project-fingerprint checks still apply before media export. This does not edit or
   rebind arrows, crops or clips in a video project. Review those in the replacement
   project before selecting/exporting its range.
5. Run the project yourself and record **expected result**, **observed result/errors**
   and **passed / failed / unavailable**. These are explicitly author-reported manual
   checks, separate from review status and Godot's running/stopped observations. A check
   does not automatically review a step or prove achievement.
6. Record who hands over to whom (human, tutor or agent), instructions, known issues
   and the selected next step. Save the editable lesson and give that file to the next
   person/agent. This records a handoff; it sends no external messages or agent commands.
7. The recipient opens the same file. Earlier takes can be restored as another draft
   revision; the intervening version is retained too. Save/open and local recovery use
   the ordinary validated lesson pipeline.

## Persistence and limits

Optional bounded fields extend the editable lesson v1: per-step `retakes` and
`verification`, plus lesson `handoffs`. Retake snapshots are flat, never recursive.
Limits: eight changes per step, sixteen handoffs, forty embedded images and the existing
16 MiB lesson limit. Overflow refuses the operation without silently deleting history.
Import validates historical image dependencies; colliding replacement image IDs are
remapped. Illustration changes and removal of unrelated steps retain images needed by
surviving retake history.

Manual checks bind a SHA-256 of the current step content, evidence, media references and
image digest. Content/source-reference changes make the displayed check stale; review
and LMS slide-label changes do not. This does **not** detect external project changes
that are absent from the lesson's evidence/references: it is not project attestation,
resource-content verification or automatic error capture. Recheck the actual project.
Handoffs identify their lesson revision and are labelled stale after further revisions.

Selected learner guides strip retake history, manual checks, handoff notes and historical
images. Full editable lesson files retain them for the explicitly shared authoring flow.
The original Godot projects, raw journals, recordings and lesson source files are not
overwritten by CLI/MCP actions.

## CLI and MCP

`applyLessonWorkflowFile` accepts `manifestPath`, `outputPath`, `expectedRevision` and
one discriminated `change`:

```json
{"operation":"replace","stepId":"TARGET_UUID","sourcePath":"/absolute/replacement.json","sourceStepId":"SOURCE_UUID","reason":"Fix movement"}
{"operation":"restore","stepId":"TARGET_UUID","retakeId":"HISTORY_UUID","reason":"Use earlier take"}
{"operation":"verify","stepId":"TARGET_UUID","check":{"expected":"Enemy moves right","observed":"Movement checked in Godot","outcome":"passed"}}
{"operation":"handoff","handoff":{"from":"agent","to":"human","note":"Review movement and recording","nextStepId":"TARGET_UUID"}}
```

CLI: `openscreen lesson workflow lesson.json --revision 3 --out next.json --change '<JSON>' --json`.
Relative paths resolve against CLI cwd. The inspected revision must match. All request
fields are validated before file reads; output is a new private file (`wx`, mode 0600).
MCP edits permission and cancellation are checked before/between reads, before writing
and before returning a result; lifecycle tracks actual operation settlement. Already
started writes cannot be atomically revoked and can leave a file without a success
response. Errors do not echo imported file contents or raw change JSON.

## Validation and acceptance limits

- Full suite: 6,771 passed / 495 files before the final explicit dropdown-label and CLI
  error-redaction follow-ups. Those final follow-ups have focused regression coverage.
- Both TypeScript configurations, production Vite build, i18n/docs checks and lint with
  the existing 35-warning baseline pass; exact logs are retained outside Git.
- Production CLI/MCP/Electron probe: 12/12, including replacement, preservation of the
  reviewed unrelated step, history, manual check, handoff, restoration, real GUI save
  and unchanged source file. The probe supplies file-picker destinations and confirmation
  responses, and drives renderer controls through CDP; authoring/validation/filesystem
  logic is real. Earlier failed attempts and screenshots are retained.
- Production startup smoke passes. Evidence:
  `../openscreen-evaluation/godot-workflow-completion-2026-11-11/`.

The sprite-review Low L-SPRITE-1 is fixed: animated-sprite imports now reject swapped
transform dimensions and incomplete 2D tuples. Negative regression cases pass.
These new workflow changes were implemented and tested by Codex; they have not received
a fresh independent Claude review because the provider's weekly limit remains active.

Physical-style WinBoat acceptance still requires a visible logged-in VM desktop; Orca
reported no apps available at the start of this task. B1 project archive/restore, live
KDE acceptance, automatic video-clock synchronization and the learner player stay
deferred. Automatic Godot error/output collection and arbitrary expected-state grading
are not implemented by these manual checks.


## Final review and actual demo follow-up

The later full regression run passes **6,772 tests / 495 files**. A separate read-only
Codex review found the concurrent-illustration race, reproduced it and accepted the
existing-generation guard correction; the final correction passes 30 GUI tests.
See [review and actual recorded demo](CODEX_GODOT_WORKFLOW_REVIEW_2026-11-11.md) for exact
coverage, X11 restoration follow-up, recording methodology and remaining access limits.
The finished demo's editable lesson records a targeted visual-motion check with the
observed Godot editor warning explicitly retained, followed by an agent-to-human handoff.
