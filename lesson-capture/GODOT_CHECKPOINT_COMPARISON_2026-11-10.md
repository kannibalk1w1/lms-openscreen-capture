# Godot authored checkpoint comparison

10 November 2026. Locally validated; independent Claude review pending.

## Author workflow

Import the original raw Godot scene journal in **Lesson guide → Application capture
observations**. With at least two authored markers, expand **Compare scene
checkpoints**, explicitly choose **From checkpoint** and **To checkpoint**, then
choose **Compare checkpoints**. Duplicate labels remain separate choices through
record number and independent source time. No choices are selected automatically;
the same record cannot be selected twice. Reverse comparisons are supported.

The read-only result shows added/removed node identities, changed node names and
allowlisted field names, aggregate counts and changed selection IDs. It excludes
resource values and full snapshots. Changing either choice clears the old result;
reimporting or closing journal review clears the raw source, choices and result.
Ordinary observation selection, calibration and draft/save remain independent.
Comparison controls are disabled while the parent is busy. Result updates use an
accessible labelled live region and bounded scroll area.

This compares two sampled endpoints referenced by authored labels within one take.
Edits made and reverted between those points do not appear. It does not establish
an action route, correct configuration, save durability, completion, runtime result
or video synchronization, and does not restore/archive/run anything. The raw
clock stays unmapped. Imported labels and state claims remain unverified.

Normalized captures and selected draft evidence do not retain the original raw
snapshot records. This view requires the original journal rather than reconstructing
state from selected evidence. Legacy v1 journals still import but
have no authored markers. Node/resource names remain potentially private; compare
only a journal whose captured names may be shown. No new live collection or file
access is started.

## Implementation and bounds

The existing Godot decoder now has one private validation path returning its
validated records and normalized journal. Public `parseGodotSceneJournal` behavior
stays unchanged. `listGodotSceneCheckpoints` returns bounded raw marker metadata;
`compareGodotSceneCheckpoints` resolves two explicit distinct record sequences
(0–4095) against their exact referenced snapshots. It does not choose markers by
label or assume normalized observation IDs identify raw records.

The entire raw source is validated before listing/comparing, including tails after
the normalized 10,000-observation/8-MiB prefix limit. A valid raw take may therefore
compare snapshots that the bounded normalized review cannot retain. This does not
recover missing intermediate events. Producer bounds remain 8 MiB, 4,096 records,
512 nodes and depth64. Comparison examines only validated allowlisted fields and
selection; arbitrary properties/resource contents are neither read nor returned.
Missing properties remain distinct from present false/null values.

The frontend retains one raw string only for a successfully imported raw Godot
journal with two or more validated markers. Normalized/non-Godot review stays
usable. Each import gets a new keyed comparison component; load/forget clear it.
No raw source or comparison result is persisted into the lesson. English fallback
keys are present in all15 locale catalogs; field names remain Godot property names.

## Validation

- Full regression: **6,512 tests / 478 files pass**. Final focused library/UI/draft
  checks: **61 tests / six files pass**. Tests cover duplicate labels, baseline
  snapshot0, reverse/same/invalid choices, additions/removals/renames/reparenting,
  properties/selection, unchanged snapshots, and malformed semantic tails after
  normalized truncation. UI tests cover explicit choices, fixed error text,
  clearing, raw-only gating and normalized/non-Godot fallback.
- Both TypeScript configs, final Vite production build, lint (35 baseline warnings,
  no fixes), i18n15 and docs37 pass. During integration, a mock-reset hook returned
  its mock function as a Vitest cleanup callback; fixing the hook to return void
  retained and passed the error regression. The initial `Object.hasOwn` spelling
  exceeded the repo's TypeScript library target; the final validated-JSON presence
  check uses an equivalent ES2020-compatible expression. Final focused checks,
  TypeScript, build and runtime probes cover that expression; the full suite was
  not repeated solely for this equivalent spelling change. Failed logs are retained.
- Real Linux and WinBoat Windows Node22.22.1 each pass **20 checks** against retained
  real Godot4.7.1 Linux/Windows journals: exact marker lists, known additions/removals,
  unchanged snapshots, explicit reverse direction, resource-value omission,
  normalized refusal and malformed-tail refusal.
- Real Windows Edge156.0.4314.58 passes **16 frontend checks** using actual
  LessonGuideDialog/store/I18n/components and a disposable Godot journal. Tests cover
  comparison counts/direction, no defaults, same-record refusal, clearing on choice
  and source changes, normalized refusal, selected draft/save and forget. The saved
  lesson retains the selected authored marker/unmapped clock with no mediaSelection.
  Only final save IPC is stubbed. The screenshot shows the comparison output with
  harness styling; it is not production visual-layout acceptance.
- The final built Linux Electron passes real MCP initialize/listTools and normal
  CLI production startup before the deliberately missing-project error. No native
  recording, physical input, packaged Windows Electron or game-run claim.

Evidence lives outside Git at
`../openscreen-evaluation/godot-checkpoint-comparison-2026-11-10/`. It includes source
hashes, original journals, comparisons, final Windows browser screenshot/lesson,
build/test/startup logs and cleanup verification. CDP disconnect left disposable
Edge processes alive; their exact owned profile command lines were verified before
stopping them. The test server and SSH tunnel were stopped. No unrelated browser or
user application was stopped.

## Continuation

[CLI/MCP capture parity is accepted](CLAUDE_APPLICATION_CAPTURE_PARITY_REVIEW_BDA9F8D2_2026-11-10.md).
Next: expose original-file marker listing and fingerprint-bound comparisons through
read-only CLI/MCP tools, so an agent can inspect the same states as the author.
Project checkpoints/restore, retake handoff, broader Godot semantics and physical
acceptance remain outstanding. The learner player stays parked.
