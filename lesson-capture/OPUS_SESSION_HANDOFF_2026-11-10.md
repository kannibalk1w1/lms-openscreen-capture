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

## Follow-up: the R1/R2 lifetime fix (10 November 2026, later)

**Status:** self-tested, **not independently reviewed**. The same reviewer rechecks the exact fix
before acceptance or a private push.

**Coordinator task:** `task_ee920747221a`, dispatch `ctx_8d1db20d474c`.

**Why:**
- The [independent review of `51e46e44`](OPUS_INDEPENDENT_REVIEW_2026-11-10.md) requested
  changes for two Medium lifetime defects, both reproduced. The report is committed unchanged
  (SHA256 `ae4fdef9…`).
- R1: a pending open could grant overwrite permission after a navigation.
- R2: a same-file save already in flight still replaced the file and reported `saved` after its
  permission was revoked.
- My earlier lifecycle test had asserted that bad outcome. It now requires the refusal.

**Commits:** `0c73895b` (the fix), then this documentation commit.

### What changed

- **Opens and new-copy saves (R1):**
  - The window's file state and its navigation, crash and close listeners are created before
    the picker is awaited.
  - Each operation pins an epoch (bumped by every lifecycle event) and an operation generation
    (bumped by every new open or new-copy save).
  - It rechecks those and the registered editor page after the picker, after the read and hash,
    and before installing a grant or returning.
  - A stale or superseded open reads nothing, writes nothing and grants nothing. The service's
    read is counted in tests. An older open can neither replace nor revoke a newer permission.
- **Same-file saves (R2):**
  - `save-current` requires the editor page at entry.
  - It passes `replaceLessonFile` a revocable check: same page, same epoch, same grant.
  - The helper consults that check at entry, before staging, and in the rename's own
    synchronous turn.
  - An invalidation before the commit leaves the original bytes and the renderer's unsaved
    draft intact, with `lesson-file-unavailable` and no partial file left behind.
- **Honest committed outcome.** A save that had already committed when the context ended is
  reported as `saved` with no `file`, and no further permission exists. The dialog shows it as
  saved and disables same-file saving until a fresh open. The same holds for a new copy written
  just before the context ended.
- **Unchanged:**
  - Conflict, regular-file, symlink, private 0600 staging and atomic-replace checks.
  - `wx` new-copy saves.
  - Headless explicit-file paths and the arbitrary-grant policy.
  - Renderers still never name a path to grant.

### Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc`; lint (35 baseline warnings); `i18n:check` | pass |
| Focused: `electron/ipc`, `electron/lesson`, `LessonGuideDialog` | 716 pass |
| New `electron/ipc/lesson.lifetime.test.ts` (production `registerEditorLessonHandlers`, real service and file helpers, gated only) | 18 pass |
| Vite build; required foreign-directory startup smoke | pass; `success: true` |
| Full suite at `0c73895b` | **6,321 / 461 files pass, 0 skipped** |

The lifetime tests cover:
- each of hash navigation, document navigation, renderer crash and destroy, with the picker
  pending, the read and hash pending, and the save not yet committed;
- a page change with no lifecycle event;
- overlapping opens;
- a save overtaken by a newer completed open;
- a save committed just before the context ended;
- a new copy refused during its picker, and one written just before the context ended;
- fresh-open positive controls (none after destroy).

**My mutants: 15 of 15 killed by assertion failures, sources restored byte for byte.** They
covered:
- the epoch bump, the page check and the operation generation;
- each open check, singly and together;
- the new-copy picker check and stale-grant tolerance;
- the save's grant identity and the committed-outcome branch;
- each helper check point and the post-commit report.

I had predicted two of them (the picker plus pre-read pair, and the helper's entry check) would
survive as redundant layers. The read-count and call-count assertions kill them too.

**Full-app probe** (production build, Xvfb, stubbed dialogs, real preload and IPC):

| Probe | Fix `0c73895b` | Control `139b9046` |
| --- | --- | --- |
| A: reviewer's R1 repro (pending open, real hash navigation, resolve, save-current) | open refused; draft status refused; save refused; bytes unchanged | open succeeded with a token; save replaced the file |
| B: same window back on the editor page, fresh open and save | saved | not run |
| C: real Lesson guide holds an edited opened file, the page navigates, Save changes is clicked | refused with the plain "no longer linked" message; file bytes unchanged; typed text kept; status shows unsaved | not run |

The reviewer's own repro at `51e46e44` is the primary control, and its evidence is preserved.

### Not covered

- A real crash or destroy during a physical save. These are deterministic event probes in unit
  tests.
- A commit racing an invalidation in the real app. It is covered only at the helper and
  registration level, by consultation order.
- Windows rename semantics, a real picker, a screen reader and audio.

### Evidence

- `../openscreen-evaluation/opus-r1-r2-fix-2026-11-10/`: probe results for the fix and the
  control, smoke, mutation script and results, and the build log.
- The reviewer's temporary evidence, copied before `/tmp` loss and checked against its source
  hashes: `../openscreen-evaluation/opus-independent-review-2026-11-10-retained/`. The originals
  in `/tmp` were left untouched, and the large code snapshot is listed, not copied.

### D3 decision recorded

On 10 November 2026 the owner approved D3(b), recorded in the roadmap decision table. The
approval covers read-only inspection and playback of an explicitly chosen package without
opening a video project. It does not cover create, copy or reseal unbinding, automatic recovery
writes, Windows gates, format, GIF/PNG or cap changes. The review's statement that D3 was still
pending was true when written, and the review is not edited.

The [player plan](OFFLINE_LEARNER_PLAYER_PLAN_2026-11-10.md) was updated, as a plan only, with:
- the D3 approval;
- review Lows P1 (one unique ephemeral partition per player owner, with enforced exclusivity)
  and P2 (bounded buffered reads with final identity and capability checks, an aggregate
  concurrency and byte budget, cancellation on revocation, and mutation-during-read tests);
- the R1/R2 lifetime pattern as a requirement for slice 0.

No player code exists. Slice 0 waits for the coordinator gate.

## Follow-up: L1 and the read-only offline player (10 November 2026, evening)

**Status:** self-tested, **not independently reviewed**.

**Coordinator task:** `task_79b62a210df3`, dispatch `ctx_7cec8747c95d`.

**Base:** root checkpoint `4489db2a`, pushed privately. It records the
[lifetime-fix review](OPUS_LIFETIME_FIX_INDEPENDENT_REVIEW_2026-11-10.md) accepting
`0c73895b`/`3e3785da` (R1/R2 closed) with one nonblocking Low, L1. The review is unchanged. Its
`/tmp` evidence was copied, hash-verified, to
`../openscreen-evaluation/opus-lifetime-fix-review-2026-11-10-retained/`; the originals were
left untouched.

**Commits:** `cabaf30e` (L1), `82f69ca0` (the player), then this documentation commit.

### `cabaf30e`: L1, no stale new-copy picker

The new-copy save now checks its operation before showing the save dialog, as well as after it
returns. The regression tests hold the real WebCrypto validation digest of a lesson with an
image, then:
- navigate the window, crash its renderer, or start a newer operation, after which no picker
  opens;
- or leave the request current, as a positive control, after which the picker opens once.

Removing the new check fails all three refusal cases.

### `82f69ca0`: the player (owner decision D3(b): read-only inspection and playback only)

**What a learner gets.** The full description is in the roadmap ("What an author can do
today", item 9) and the player plan's "Delivered so far" section. In short: open a verified
package with no video project, read the ordered steps, and play each step's MP4 with seek,
Replay, speed and Previous/Next. Everything is offline and nothing is saved.

**Authority and isolation:**
- **Window:**
  - Each player window is created only by main.
  - It is registered with its exact page URL.
  - It runs on its own unique in-memory partition, with sandbox, `contextIsolation`, no Node,
    `webSecurity` on and a separate CSP-locked page.
  - Its only bridge is open, cancel and close.
- **Opening a package:**
  - The native folder picker is the only path authority.
  - The existing full v1 verification runs before anything is shown, and every pinned file is
    rechecked before the capability is installed.
  - The R1 epoch and operation pattern ends the capability on navigation, crash, close, explicit
    close or a newer folder.
- **Media:** a scheme handled only in that partition, mapping token and step to the verified
  inventory. Each request is one bounded buffered range from an `O_NOFOLLOW` descriptor, with
  final descriptor, path and capability checks before any byte, under per-capability and
  aggregate budgets. Any change ends the capability.
- **Unchanged:** authoring, package copy, reseal and create, CLI/MCP, and their project checks.
  The player gains none of them, and the editor gains no player media.

### Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc`; lint (35 baseline warnings); `i18n:check`; `docs:check` | pass |
| `electron/lesson/playerMedia.test.ts` | 11 pass: ranges; headers; refusals; in-place, rename, symlink and delete changes; mutation and revocation during a read; budgets |
| `electron/ipc/lessonPlayer.test.ts` | 15 pass: production registration; a real package built from the fixture and moved away from its deleted originals (decode mocked here only); isolation; lifecycle; cancellation; pre-install change |
| `src/lessonPlayer/LessonPlayer.test.tsx` (jsdom) | 9 pass |
| `electron/ipc/lesson.lifetime.test.ts` (with L1) | 22 pass |
| Vite build (two preloads, two pages); required foreign-directory startup smoke | pass; `success: true` |
| Full suite at `82f69ca0` | **6,360 / 464 files pass, 0 skipped** |

**My mutants: 11, sources restored byte for byte.** 10 were killed by assertions:
- token comparison;
- the final identity and path check;
- the final capability check;
- the in-flight bound and the aggregate byte budget (made decisive with a 500 ms race after an
  earlier run timed out instead of asserting);
- the player-page frame check;
- the pre-install recheck;
- the launch editor check;
- a new folder ending the previous package;
- lifecycle ending plus epoch outdating, paired.

The one survivor, lifecycle ending alone, is a real redundant layer: the epoch check in
`isCurrent()` still refuses, and the pair is killed.

### Full-app probe

Production build, Xvfb, real preloads, IPC, partitions, scheme and Chromium `<video>`. Only the
folder dialog is stubbed.

**Package:** a real, CLI-built, moved v1 package copied from preserved evidence
(`package-reseal-2026-11-09T1933Z/fresh moved package`; the original is hash-verified
unchanged). It has two steps and a stored 45-sample 640×360 H.264 step video. The real CLI
`lesson verify-package` on this build reported `verified`.

| Probe | Result |
| --- | --- |
| Launch | The editor's real button (no project), File menu item and preload all open a player. The player has `lessonPlayer` only (no `electronAPI`), the CSP is present, and the preferences are sandbox/isolation/no Node/webSecurity on an in-memory session |
| View | Title, ordered steps, "Step 1 of 2", instructions, data-URL JPEG with alt text, code, a capability video URL with no autoplay. The checked/not-signature/not-approved/audio-not-checked note is shown. The picker is parented and called once |
| Playback | `loadedmetadata`: duration 1.5 s, 640×360. Played to about 0.48 s, seeked to 1.0, Replay restarted, speed 1.5. Next goes to step 2 (no video, focus on its heading); Previous gives a new paused video at 0 that keeps 1.5× |
| Isolation, through each window's real session (`session.fetch`) | Own token 206. Editor session `ERR_UNKNOWN_URL_SCHEME`. Second player with the first player's token 404 (its own token 206). Multipart and out-of-range 416. Unknown step, `file:` URL and network in the player all refused. Two distinct in-memory sessions, neither the editor's nor the default |
| Changes | A media byte appended → 404, and the capability stays ended after the file is restored. A fresh open gets a new token, 206 |
| Lifecycle | Navigation in the player → 404, and a reopen from the navigated page returns `lesson-player-unavailable`. The editor's authoring routes are still served. Closing both players leaves the editor alive |
| Files | The package copy and the original evidence are byte-identical before and after |

An earlier run reported "loaded" after a change or navigation. That was Chromium's in-renderer
media buffer, not the server, so the final run checks every server-side outcome through
`session.fetch`.

### Limits

- **Not tested:** a real folder picker, physical keyboard or screen reader, Windows or macOS,
  audio (receipts keep audio flags false), and real lessons. Browser `<video>` playback is not
  independent verification of the visual content.
- **Not delivered:** Loop and the keyboard shortcuts, progress, captions, troubleshooting, and a
  standalone player outside the app.
- **Buffered bytes:** bytes Chromium already buffered in a renderer may still play after
  revocation; no new bytes are served.
- **Linux only,** through the existing verification gate.

### Evidence

`../openscreen-evaluation/opus-player-2026-11-10/` holds:
- the probe and launch-probe results;
- the first, cache-limited run, kept and labelled;
- the smoke;
- the mutation script and results;
- the fixture hash lists;
- the build log.

## Follow-up: player lifetime fixes MP1 and MP2 (10 November 2026, night)

**Status:** self-tested, **not independently reviewed**. The same reviewer rechecks the exact
fix before a private push or any further player features.

**Coordinator task:** `task_fd7103fdbe70`, dispatch `ctx_cf71bfa77a7e`.

**Why:**
- The [offline-player review](OFFLINE_PLAYER_INDEPENDENT_REVIEW_2026-11-10.md) of `43b18c70`
  closes L1 but requests changes for two Medium player lifetime defects, MP1 and MP2, plus a
  documentation Low, DOC1. The review is committed unchanged (SHA256 `ddd71b66…`).
- Its `/tmp` evidence was copied, hash-verified, to
  `../openscreen-evaluation/offline-player-review-2026-11-10-retained/`; the originals were left
  untouched.

**Commits:** `71546046` (the fix), then this documentation commit.

### What changed

- **MP1 (media):**
  - Every awaited step, including the descriptor `close`, now finishes before the last
    authorization.
  - That last check is synchronous, with no await before the `Response`: the path is still the
    verified file, the capability is live, and the request is not abandoned.
  - Unchanged: the descriptor identity check after the read, the bounded buffer, and the
    per-capability and aggregate budgets.
  - The descriptor closes exactly once on every path, including when `close` itself fails, and
    the budgets return to zero.
- **MP2 (owner):**
  - The public close and every navigation, crash or window close now call `release()`. It
    advances the epoch, aborts any open still in its picker or verification, and revokes the
    current media capability.
  - Revoking the old capability when a new folder is chosen is a separate private step, so an
    open never cancels itself.
  - A new open after a release waits for the released open to settle, then starts fresh. Other
    windows still cannot close or cancel a player's work.
- **DOC1:** the plan header now separates the delivered, self-tested slices from what is still
  only planned.
- **Unchanged:** D3 read-only scope, authoring and project checks, CSP, session isolation,
  budgets, v1 contracts and media formats. No new features.

### Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc`; lint (35 baseline warnings); `i18n:check`; `docs:check` | pass |
| `playerMedia.test.ts` | 17 pass, including a held real descriptor close during: revocation, request abort, in-place change, and ancestor folder replaced by a symlink to an identical copy; a held-close positive control; and a failing close (one close, budgets zero) |
| `lessonPlayer.test.ts` | 20 pass, including: close during picker and during verification (no inspector after a picker-stage close, the older package ends at once, a fresh open plays); open-after-close waits for the released verification to settle; a new valid folder does not cancel itself; no other window can close or cancel |
| `LessonPlayer.test.tsx` | 10 pass, including: Close package hidden while opening, Cancel shown |
| The new tests against the pre-fix `43b18c70` production files | **all 7 new MP1/MP2 regressions fail**, then the fixed files were restored |
| Vite build; required foreign-directory startup smoke | pass; `success: true` |
| Full suite at `71546046` | **6,372 / 464 files pass, 0 skipped** |

**My mutants: 9, sources restored byte for byte. 7 were killed by assertions:**
- the post-close capability/abort check;
- the post-close path check;
- release without a pending abort (the next open is then busy-refused);
- release ending neither the epoch nor the pending open;
- release only aborting the pending open (paired);
- a new folder using the public release;
- no wait for the released open to settle.

Two survive alone, each covered by the other: release without the epoch bump (the revocation
still removes the capability), and release without revoking (the epoch makes it non-current).

### Full-app probe

Production build, Xvfb, real preload, IPC, player session, protocol and `<video>`. Only the folder
dialog is stubbed; MP1 also holds the real descriptor close inside the main process. The package
is the same CLI-verified, moved v1 copy as before, and both it and the original evidence are
byte-identical afterwards.

| Probe | Result |
| --- | --- |
| Baseline playback | 1.5 s 640×360; plays, seeks to 1.0, replays, 1.5×; Next/Previous gives a paused video at 0 that keeps 1.5× |
| MP2: `lessonPlayer.close()` during a held real picker, then the picker resolves | `lesson-package-cancelled`; the older package ends at once (404) |
| MP2: close during the real full verification | `lesson-package-cancelled`; a fresh open works (206) |
| MP1: `lessonPlayer.close()` while a range's descriptor close is held | client unsettled before the release, then **404 and 0 bytes**; one close; later requests 404 |
| MP1 control: held close, nothing changed | 206, 10 bytes |
| MP1: media changed in place during the held close | 404, and stays 404 |
| Final | A fresh open plays in the real `<video>`; the editor's authoring is still served |

The reviewer's real reproductions at `43b18c70` (206 and 10 bytes after release; a new view and
token after close) are the bug-present control.

### Limits

- **Not tested:** a physical picker, a screen reader, physical input, Windows or macOS, and
  audio.
- **Buffered bytes:** bytes Chromium already buffered may still play after release; no new bytes
  are sent.
- **Close-during-verification probe:** in the real app it relies on a 30 ms wait. The
  deterministic, gated case is in the unit tests.

### Evidence

`../openscreen-evaluation/opus-player-mp1-mp2-fix-2026-11-10/` holds:
- the probe results;
- the smoke;
- the mutation script and results;
- the log of the new tests against `43b18c70`;
- the build log;
- the fixture hashes.

## Follow-up: MP2 continuation, opens no longer wait (10 November 2026, late)

**Status:** self-tested, **not independently reviewed**. **MP2 is not closed** until the same
reviewer rechecks it.

**Coordinator task:** `task_10d95e626c8f`, dispatch `ctx_c9bd1dd8ba8c`.

**Why:**
- The [lifetime-fix recheck](OFFLINE_PLAYER_LIFETIME_FIX_REVIEW_2026-11-10.md) of `5a304a4b`
  closes MP1 and DOC1. MP2 stays open at Medium.
- My settlement wait let a new open sit waiting for an earlier released open. It captured its
  epoch only after waiting, so a later Close or Cancel missed it, and it then opened a picker,
  verified and installed a working view and token.
- The report is committed unchanged (SHA256 `0e99f988…`). Its `/tmp` evidence was copied,
  hash-verified, to `../openscreen-evaluation/player-lifetime-recheck-2026-11-10-retained/`; the
  originals were left untouched.

**Commits:** `e2e31d32` (the fix), then this documentation commit.

### What changed

I chose the simpler, honest contract the brief allowed: **nothing waits**.
- While an earlier open is running, or is released or cancelled but still unwinding its picker
  or verification, a new open is refused at once with `lesson-player-busy`.
- No request can sit waiting where a later close or cancel would miss it.
- No stale request can start a picker or verification, or install a view or capability.
- The learner opens again once the earlier open has settled. That fresh open works as before.

**Unchanged:** release (epoch, pending abort, capability), the separate new-folder revocation,
the wrong-owner refusals, MP1, D3 scope, authoring checks, CSP, session isolation, budgets and
formats.

### Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc`; lint (35 baseline warnings); `i18n:check`; `docs:check` | pass |
| `lessonPlayer.test.ts` | 31 pass, including the reviewer's sequence at the picker and in verification: two overlapping requests refused within 200 ms, then a second close, cancel, navigation, crash or destroy. No further picker or verification follows. A fresh open works where the page is still the player, and is `unavailable` after navigation or destroy. Close and cancel abort the verifier's own signal at once |
| Focused (player media/owner/UI, lifetime, package open, authority, lessonFile) | 188 pass / 7 files |
| The new tests against the pre-fix `71546046` owner | **all 10 new sequence tests fail on assertions** ("still-waiting" instead of busy), then the fixed file was restored |
| Vite build; required foreign-directory startup smoke | pass; `success: true` |
| Full suite at `e2e31d32` | **6,383 / 464 files pass, 0 skipped** |

**My mutants: 5, all killed by assertions, with no timeouts; sources restored byte for byte:**
- no busy refusal;
- busy only for opens not yet released;
- cancel does nothing;
- release does not abort the pending open (pinned by the new verifier-signal test);
- release keeps the epoch and the capability (paired).

### Full-app probe

Production build, real preload, IPC, session, protocol and `<video>`. Deterministic gates only: a
held native folder picker, and a held real WebCrypto digest inside the actual verification.

| Probe | Result |
| --- | --- |
| Picker held → close → two opens → second **close** → picker resolves | earlier open `lesson-package-cancelled`; both later opens `lesson-player-busy` at once; only 1 picker ever opened; a fresh open then serves 206 |
| The same with a second **cancel** | same |
| Verification held (real digest) → close → two opens → second close / cancel → released | same in both variants; no new picker; fresh open 206 |
| MP1: release during a held real descriptor close | 404, 0 bytes, 1 close; the unchanged control returns 206 and 10 bytes |
| Baseline UI and `<video>` | 1.5 s 640×360, plays, seeks to 1.0, replays, 1.5×; editor authoring still served |

The package copy and the original evidence are byte-identical afterwards. The reviewer's real
reproductions at `5a304a4b` are the bug-present control.

### Limits

- **Not tested:** a physical picker, a screen reader, physical input, Windows or macOS, and
  audio.
- **Busy refusal after Close:** an open requested immediately after a Close or Cancel is refused
  until the earlier open settles. The UI shows "A package is already being opened.", and opening
  again once it has settled works.

### Evidence

`../openscreen-evaluation/opus-player-mp2-recheck-fix-2026-11-10/` holds:
- the probe results;
- the smoke;
- the mutation script and results;
- the log of the new tests against `71546046`;
- the build log;
- the fixture hashes.

## Follow-up: loop, keyboard shortcuts and explicitly saved places (10 November 2026, evening)

**Status:** self-tested, **not independently reviewed**.

**Coordinator task:** `task_c44def2445a3`, dispatch `ctx_2a225b2f14ad`.

**Base:** root checkpoint `e3c00e0e`, pushed privately. The
[final continuation review](OFFLINE_PLAYER_MP2_CONTINUATION_REVIEW_2026-11-10.md) accepts
`e2e31d32`/`1dd36bc8` and closes MP2; MP1 and DOC1 were closed before. The original reviews are
unchanged.

**Commits:** `1215af69` (the feature), then this documentation commit.

### What a learner gets

- **Loop:** a "Loop step video" toggle (`aria-pressed`), announced, and kept with the speed
  across steps. Step changes still pause and never autoplay.
- **Keyboard:** single-key shortcuts, listed on screen with `aria-keyshortcuts` on the
  controls: N/P step, K play/pause, R replay, L loop, [ ] speed. They never act with Ctrl, Alt or
  Cmd, or in text fields, the speed list, editable content or the video's own controls. Native
  controls stay reachable, and focus still moves to the active step heading.
- **Saved places:** Save my place, Restore saved place, Clear saved place, and Clear all saved
  places (asks first). A status line says whether the current place is saved.
  - **When:** nothing is written on open, play, step change, close, navigation or crash.
  - **What:** the package fingerprint, step ID, time, speed and loop. The fingerprint is main's
    digest of the verified manifest.
  - **Restore:** only in that exact verified package, with the time clamped and no autoplay.
  - **Meaning:** a bookmark, not evidence of learning.

### Privacy and authority

- **Store:**
  - `userData/lesson-player-progress/progress.json`, separate from the authoring recovery
    store, which is untouched.
  - A 0700 directory, refused if it is a link. No-follow, bounded (64 KiB) reads with a strict
    schema.
  - A 0600 `wx` staged write, then fsync and atomic rename. No staged file is left behind on
    failure.
  - At most 100 places: a full store refuses new places and never prunes.
  - Corrupt data is refused and never repaired; the explicit Clear all removes the store file
    only (a link itself, never its target).
  - Actions are serialized across windows, in one order.
- **IPC:**
  - Only from the exact player page and main frame, with the open package's token and a strict
    schema.
  - The step must exist, and the time must fit that step's verified video.
  - One action per window at a time: busy, never queued.
  - The ticket (capability plus epoch) is taken before any await and checked after reading and
    right before writing. A close, navigation, crash, destroy or new folder during store I/O ends
    the action with no write and no place returned.
  - A save that has already committed is reported as saved.
  - The preload gains only the four saved-place methods.
- **Unchanged:** D3(b) scope, v1 contracts, media caps and formats, the Linux gate, unique
  ephemeral sessions, CSP, network denial, grants, lifetime, the no-new-bytes boundary, and
  authoring checks.

### Validation

All runs used pinned Node 22.22.1 and npm 10.9.4.

| Check | Result |
| --- | --- |
| Both `tsc`; lint (35 baseline warnings); `i18n:check`; `docs:check` | pass |
| `playerProgress.test.ts` | 11 pass: lazy creation, modes and minimal fields; strict refusals; corrupt, unknown, duplicate and oversized stores refused unchanged, and Clear all as the way out; linked directory or file refused, with the link target intact; full store refuses and never prunes; ticket checks; cross-window order with no resurrection; no staged leftovers |
| `lessonPlayer.test.ts` | 43 pass, adding: exact-package save, restore and clear; a different (rebuilt) package restores and clears nothing; no writes on open, media, close, navigation or crash; foreign window, subframe, editor, cross-token, unknown and malformed tokens and closed packages refused; strict request refusals; busy without queueing; close, navigation, crash, destroy or new folder during store I/O for save and restore gives cancelled with no write; Clear all removes only the store file |
| `LessonPlayer.test.tsx` (jsdom) | 15 pass, adding: loop; shortcuts and their exclusions; no automatic saves and an honest saved/not-saved status; restore to step, time, speed and loop without play; clear; clear-all confirmation; plain store errors |
| Focused set, including the unchanged recovery store | 213 pass / 8 files |
| Vite build; required foreign-directory startup smoke | pass; `success: true` |
| Full suite at `1215af69` | **6,411 / 465 files pass, 0 skipped** |

**My mutants: 11, all killed by assertions, sources restored byte for byte:**
- the save and clear write-time ticket checks;
- the restore post-read checks (paired);
- no-follow reads;
- pruning when full;
- the per-window busy refusal;
- the token check;
- strict requests;
- the step time bound;
- the shortcut exclusions for fields and the video, and for modifiers.

Three (busy, field exclusion, modifier exclusion) first failed by timeout or Testing Library
lookup errors. Their assertions were made decisive and those three were re-run.

### Full-app probe

Production build, real preload, IPC, sessions, protocol, store and `<video>`. Keys are CDP key
events, not physical keys. Only the folder dialog is stubbed.

| Probe | Result |
| --- | --- |
| Open the moved, CLI-verified package | no store directory exists |
| Play; Loop button; keys `]`, `n` (focus on the step-2 heading), `p`; `n` pressed inside the speed list | loop on, 1.25×, paused at 0, speed list ignored `n`; still no store after all of it |
| Seek to 1.0, Save my place | a 0600 file with one five-field record and no path |
| Close the window | nothing written (same mtime) |
| A new player window, same package, Restore | step 1 at 1.0 s, 1.25×, loop on, **paused** |
| A real resealed package (same step IDs, different verified inventory), Restore | "No saved place for this package." |
| Clear saved place, then Restore | "No saved place…"; store `places: []` |
| After | editor authoring still served; both package copies and both original evidence packages byte-identical |

### Limits

- **Not tested by a person:** no physical keyboard, screen reader (Orca) or real folder picker;
  no Windows or macOS; no audio. The computer-use pass was not available in this headless
  environment, so it is not accepted.
- **Several windows on one package:** the last explicit action wins, in the store's serialized
  order. A save that had already committed before its window closed stays saved.
- **Unreadable store:** it stays unreadable until the learner chooses Clear all.

### Next dependencies

- **Captions:** need package v2 acceptance (inventory-listed WebVTT), the transcript-to-step
  mapping, and author review.
- **Standalone player:** needs a new guide-contract version and a decision on browser trials
  over `file://`.
- **Accessibility acceptance:** needs a person at a real desktop.

### Evidence

`../openscreen-evaluation/opus-player-loop-keys-places-2026-11-10/` holds:
- the probe results and the store after the probe;
- the smoke;
- the mutation scripts and results;
- the build log;
- the fixture hashes.
