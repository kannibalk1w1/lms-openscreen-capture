# Independent review: application calibration — eefec646 vs 12474796

- Reviewed HEAD: `eefec646f2152f2024d2c3bcf8b7eeb00c208d3d`. Base: accepted `12474796`.
- Reviewer: Claude (Opus 5.5), Orca task `task_2997c8dded82`. Read-only; `git status` was clean.
- Scope reviewed:
  - `ApplicationAssociationControls.tsx` (new)
  - the `ApplicationCaptureReview.tsx` and `LessonGuideDialog.tsx` integration
  - `timingBinding.ts` (new)
  - the L1/L2 changes in `association.ts`
  - `schema.ts` `manualTiming` and its cross-checks
  - `applicationDraft.ts`, the tests and `APPLICATION_CALIBRATION_2026-11-10.md`
- Probes ran from `/tmp/claude-calib-eefec646/` on an esbuild bundle of HEAD built from stdin. I did not look at the `/tmp` checkpoint prototype.

## Verdict: ACCEPT

No blocking or Low findings. L1 and L2 from my 12474796 review are closed. Four informational notes follow.

### L1 closed (deliberately unmapped, with an explicit reason)
`association.ts` now returns `{unmapped, "end-of-capture"}` for `atMs === durationMs`; probe case 1 shows `[1000, 1666, "unmapped-gap", "end-of-capture", "observation-missing"]`. The UI scope text says such an observation "stays unmapped for manual media review". The drafts message mentions "terminal observations". `createApplicationTimingBindings` treats both gap and end-of-capture as a normal skip, not as source drift.

### L2 closed (whole milliseconds, never on the boundary)
`mediaTimeMs = min(recordingEndMs - 1, floor(...))`. The previously bad edge (span 0–86.4M onto 86399999–86400000, observation at 86399999) now gives exactly `86399999`. The binding schema recomputes the same expression and rejects anything else: a forged `mediaTimeMs + 1` is rejected, both at schema level and on lesson reopen.

## Checked and sound
- **Binding contents:** the selected observation's `applicationTimeMs` (the raw `atMs`), the integer `mediaTimeMs`, and only the one span used (its ID matches the plan's span). Also kept: source identity, both fingerprints, the recording session, the control clock and `sourceAssetId`. The binding schema is strict: an extra `mediaSelection` key and a reversed span are rejected.
- **Draft persistence:** evidence `clock` stays `"unmapped"`, `atMs` stays raw (333) and payload is unchanged. No step gains a `mediaSelection`. The lesson saves and reopens byte-equal.
- **Gaps and limits:** gap observations get no timing. More than 200 IDs, a missing ID, or a changed capture throw `ApplicationTimingSourceChangedError`, which the UI shows as its "stale" message.
- **Cross-references on lesson reopen:** a binding is rejected if its evidence `sessionId`, `atMs`, `scope` or `instanceId` (including a missing one) no longer matches, if the evidence clock is changed to mapped, or if the media time is forged (cases 7–7f). Changing the kind to authored is rejected by the existing evidence rule (7g). `appendApplicationDrafts` with a binding from another capture session is rejected (case 8).
- **Hashing per batch, not per row:**
  - each Add range hashes once (`createApplicationAssociation`);
  - Add drafts hashes once through one `resolveApplicationObservations` call for all selected IDs (at most 200);
  - `appendApplicationDrafts` validates without hashing;
  - no per-row hashing in renders.
- **Stale async handling:**
  - Controls: a generation counter plus a capture/source-context key (content key `JSON.stringify([id, clock])`, so re-memoised document objects do not reset it) cover source change, clear, remove, unmount and capture replacement. A late plan is dropped (tested: "ignores a late plan when the capture is replaced during hashing").
  - Review: `append()` snapshots lesson, selection, journal, calibration and the source context, then rechecks all of them after the await and shows "stale" without appending. The epoch is bumped by load, forget and unmount. Tests cover a lesson change and forget/close during resolution.
  - The Controls sit inside a fieldset disabled while appending. A range save that completes during an append changes `calibration`, so the append is refused as stale.
- **Range preservation:** an invalid or overlapping range keeps the existing plan (tested). Remove recomputes, and removing the last range clears.
- **Media authority:** sources are only project `video` assets that already carry `recordingClock`. Nothing reads media, grants file access or creates `mediaSelection`. "Remove manual timing link" strips only `manualTiming`, through the normal `update`, which demotes the step to draft like any other edit.
- **Windows harness evidence:**
  - `frontend-2.stdout.log` reports win32, Edge 156.0.4314.58, 12/12 checks, and correctly describes itself as synthetic with only the save IPC stubbed.
  - Both saved lessons reopen with HEAD's `parseLesson`. `first-lesson.json` maps 200→1200 ms in segment-a and 700→5600 ms in segment-b. 500 (gap) and 1000 (terminal) have no timing.
  - `second-lesson.json` shows the 200 timing removed and 700 kept. All evidence clocks are `unmapped` and there is no `mediaSelection`.

## Informational
- **I1. Fingerprints are recorded, not re-verified when drafting:** `appendApplicationDrafts` does not check `binding.applicationFingerprint` against the capture it is drafting from. In probe case 8b, a binding for the same identity with different capture content is accepted. The UI path cannot hit this, because it creates bindings from the same `journal` object it then drafts in one guarded operation, and reopen cannot re-verify without the capture. The docs and later consumers should treat the fingerprints as recorded provenance, not proof checked at save time.
- **I2. Bindings do not name their observation:** a binding carries no observation or event ID, so in probe case 8c it can be attached to another observation with the same `atMs`. The result is identical and correct (mapping is a pure function of `atMs` and the span), and Godot samples often produce several observations at one `atMs`. Worth noting only if a later slice keys anything on the binding alone.
- **I3. Recording-control time is stored under the name `mediaTimeMs`:** the persisted field and the UI label ("Manually associated recording time … Review the footage before attaching media") refer to recording-control active time, not encoder or video time. The UI wording is careful. Later seek or export code must not treat it as video PTS without the native clock relation (the docs already say this).
- **I4. Screenshot shows only the top of the dialog:** `application-timing-review.png` shows the top of the test-shell dialog, not the calibration controls. The CDP checks and saved JSON are the real evidence, and the doc already says the screenshot is not visual acceptance.

## Checks run
- Focused vitest: **97 passed / 9 files**. Covers `src/lib/applicationIntegrations/*` (association, timingBinding, capture, godotScene, importCapture), `sceneDraft`, `ApplicationAssociationControls`, `ApplicationCaptureReview` and `LessonGuideDialog`.
- My own probes:
  - `p.cjs`: resolution reasons, the L2 edge, binding creation and staleness, binding schema forgeries, lesson persistence and cross-reference corruptions, cross-capture bindings.
  - `p2.cjs`: reopened the retained Windows first and second lesson JSON with HEAD's schema.
- Read the retained Edge harness output log and the screenshot.

## Limits
- No full suite, tsc, Vite, lint, i18n or startup rerun; I relied on root's 6465/472 report plus the focused runs. The CLI/MCP bootstrap is not touched by this diff.
- No VM or Edge run of my own. The Windows evidence is a headless real-Edge component harness with synthetic clocks and a stubbed save IPC. It is not a packaged Electron app, native picker, real media or physical capture, and none of those is claimed.
- I did not render-test my own interleavings (for example, a source clock change during append). That path is checked by reading the code and by the existing tests for lesson change, forget and capture replacement.
