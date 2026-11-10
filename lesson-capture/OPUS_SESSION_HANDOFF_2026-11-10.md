# Opus sole-writer session handoff (10 November 2026)

**Writer:** the parent Claude session, running as Claude Opus 5.5 (`claude-opus-5-5`). It was
the sole implementation writer for this slice; no other agent wrote code.

**Review status:** everything below is **self-tested, not independently reviewed**.

**Coordinator task:** `task_28ff7ca312f6`, dispatch `ctx_73a3c661661f`.

## Repository state

| Item | Value |
| --- | --- |
| Base | `139b9046` (coordinator handoff, pushed to the private feature branch) |
| Main | `fd2775e2`, unchanged |
| Push | none (the coordinator owns push and review) |
| Addon `compositor_view.node` | SHA256 `5d16ea98…`, unchanged |
| External user workflow report | unchanged, not opened for writing |

## Commits, oldest first

| Commit | What it does |
| --- | --- |
| `e3701396` | The Lesson guide routes (draft-status, draft-save, draft-list, draft-read, draft-remove, plan-range, save, open, export) serve only the main frame of a registered editor window still on its own page, before any dialog, recovery-copy access or project read. GUI `lesson:package-create` refuses repeated `stepIds`, matching CLI/MCP. |
| `7636185d` | Lifecycle regression tests: a window's same-file permission ends on destroy, renderer crash or navigation, including a save still being written. Hiding the guide keeps the unsaved-work mark; unmounting clears it. Also fixes the stale "saving never replaces an existing file" wording, in all 15 locales, which carry the English text. |
| `90116cae` | The Lesson guide save, open and export dialogs attach to the asking editor window, as the package and range-export pickers already did. |
| the docs commit after `90116cae` | Present-tense roadmap status, product map status header, verbatim snapshots of both, the offline player plan, and this handoff. |

## What changed for the user

- **Fewer windows can use Lesson guide routes.** A second app window, or an embedded frame,
  can no longer list, read or delete recovery copies, open the lesson pickers, or plan ranges.
  The editor itself is unaffected.
  - Production check: `editorRangeSessions.isEditorPage`, a registered editor still on its
    exact page. It makes no project or saved-state claim, so the guide still works with no
    project selected.
- **The same-file save is unchanged.**
  - Main still holds the grant, and still checks for conflicts, symlinks and the atomic
    replace.
  - `lesson:save-current` keeps its main-frame and grant check. A grant can now only come from
    the editor-only save and open routes.
- **Dialogs stay in front.** The Lesson guide's dialogs can no longer open behind the editor.
- **Accurate save wording.** The guide now explains both save actions correctly.
- **No new automatic writes.** Reload or crash still loses unsaved guide work (L42-2), by
  decision.

## Inventory of lesson IPC sender checks after this slice

| Route | Check |
| --- | --- |
| `lesson:draft-*`, `plan-range`, `save`, `open`, `export` | Main frame of a registered editor still on its page (new) |
| `lesson:save-current` | Main frame plus the window's main-held grant (grant only from the routes above) |
| `lesson:frame` | Main frame plus current project session and dirty provider (unchanged) |
| `lesson:confirm-range`, `cancel-range`, `range-export`, `range-export-cancel` | Main frame plus session or owned operation (unchanged) |
| `lesson:package-*` | Main frame plus session, owner, token and dirty state (unchanged) |
| `set-lesson-unsaved-work` | Current editor window only (unchanged) |

Headless CLI/MCP explicit-file paths and the arbitrary-grant policy are untouched.

## Verification of `5a2b0f14` (Fable's accessibility and wording commit)

I did not write `5a2b0f14`.

- **Step buttons.** Every repeated step button's accessible name starts with its visible label,
  then "step N, title". The real DOM was checked in the production app (probe G10).
- **Package panel.** The headings are h3 (package), h4 (lesson), h5 (step).
- **Package wording.** It is plain, and "use the button below" is accurate: the resume button
  follows the text.

Findings:
- **Fixed in `7636185d`.** The "unsaved" paragraph, older than `5a2b0f14`, still said saving
  never replaces a file. That contradicts the same-file save.
- **Nit (not fixed).** When a package draft needs reopening, the "authority lost" text appears
  twice: in the status line and beside the resume button.
- **Not applicable.** Adding `createDirectory` to destination pickers only has an effect on
  macOS, and lesson media is Linux-only.

## Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc` configurations | pass at each commit |
| Biome on changed files, `npm run i18n:check` | clean / pass |
| Focused sets | `electron/ipc/lesson.test.ts` (10), `lesson.authority` (8), `nativeBridge.renderOwnership`, `LessonRangeAuthoring.integration`, `editorRangeAuthoring`, `lessonPackageOpen` (89), `LessonGuideDialog` (24), `src/components/ai-edition/v4` (400): all pass |
| Full suite at `90116cae` | **6,298 / 460 files pass, 0 skipped** |
| Vite build | pass at `7636185d` and `90116cae` |
| Required startup smoke, foreign working directory, no decoder or `APP_ROOT` hint | `success: true` at `7636185d` and at `90116cae` |

An earlier full run at `7636185d` overlapped an in-progress edit and failed only on that
half-written test. It is kept as a log and is not a claim.

### My mutants (restored exactly each time)

**15 killed by assertion failures, 1 survived.**

- **Editor-only routes, 5 of 5 killed:** the editor check removed; the main-frame check removed;
  the page-URL check removed; the destroyed check removed; production wiring replaced by
  `() => true`.
- **Package create, 1 of 1 killed:** the unique-`stepIds` refine removed.
- **Grant lifecycle, 4 of 5 killed:**
  - Killed: the in-flight re-grant guard removed; each of the three lifecycle events removed.
  - **Survived:** removing the "only if still current" guard on a failed save's revocation.
    That direction only over-revokes a newer grant, which fails safe, so it is recorded and
    not pinned.
- **Dialog lifecycle, 2 of 2 killed:** the flag cleared while hidden; the unmount cleanup
  removed.
- **Dialog parenting, 2 of 2 killed:** the open dialog unparented; the save dialog unparented.

### Full-app probe (production build, Xvfb, stubbed dialogs, foreign working directory)

Steps G1 to G10 were driven through the real Lesson guide DOM, with lesson files made by the
real CLI.

| Probe | Result at `90116cae` |
| --- | --- |
| G2 to G4: open, edit, save changes to the same file | saved; revision 2; mode 0644 → 0600; inode replaced; no staged leftovers; one picker only |
| G5: close the editor with unsaved lesson work, refuse | window stays; one lesson prompt; edit kept |
| G6: file changed elsewhere, then save | refused; outside bytes kept; edit kept; same-file save disabled; plain alert text |
| G7: a second, unregistered window with the real preload calls draft-status, draft-list, open, save and export | all `lesson-operation-failed`; no picker opened; the editor itself still served |
| G8: reload with unsaved work | reload proceeds; work lost (L42-2); no automatic recovery copy written |
| G9: close after reload | closes with no lesson prompt |
| G10: step-button names and the explanation text | as above |

**Control on the parent `139b9046`, same probe.** G7 was served on the parent:

- draft status returned the recovery-copy folder path;
- the open and save pickers opened.

So the probe tells the parent and the fix apart.

## Not covered

- A real picker or physical input.
- A screen reader.
- Windows or macOS.
- Audio.
- Same-file save on Windows.
- An embedded subframe in the real app (subframes are covered in unit tests only).
- A renderer crash in the real app (covered by unit tests on the lifecycle events).

## Evidence

Location: `../openscreen-evaluation/opus-sole-writer-2026-11-10/`.

- **Probe results:**
  - `probe-head-e3701396/` is the first passing probe.
  - `probe-head-7636185d/` and `probe-final-90116cae/` add G10.
  - `probe-parent-139b9046-control/`.
- **Smokes:** `smoke-7636185d/` and `smoke-90116cae/`.
- **Tools:** the probe script and the mutation scripts.
- **Logs:** full-suite logs and Vite logs.

The first probe attempt stopped at G7, because a test window was built without the editor's
web preferences. It is not kept as evidence, and its fixtures were rebuilt for the passing runs.

## Documentation in this slice

- **Roadmap.** `LESSON_CAPTURE_ROADMAP.md` now has one present-tense "Status on 10 November
  2026" section, covering:
  - repository and review state;
  - what an author can do;
  - open user value;
  - next work;
  - owner decisions D1 to D7, as compact options.

  The evidence ledger and delivery rules are unchanged.
- **Snapshots.** The replaced text is kept word for word in
  `LESSON_CAPTURE_ROADMAP_HISTORY_2026-11-10.md` and
  `lesson-capture/PRODUCT_MAP_HISTORY_2026-11-10.md`. Both are exact copies of the files at
  `90116cae`.
- **Product map.** Its status header now points to the roadmap. The stale "pending review"
  lines are corrected, and the D row and P3.1 link the plan.
- **Player plan.** `lesson-capture/OFFLINE_LEARNER_PLAYER_PLAN_2026-11-10.md` is a plan only.
- **Unchanged.** Every review, follow-up and evidence report is untouched.

## Next

1. A coordinator or independent review of `e3701396`, `7636185d` and `90116cae` and the docs
   commit, then a decision on a private push.
2. Owner decisions D1 to D7 (roadmap).
3. Only after the gate: player slice 0, then slice 1 (bounded media access).
