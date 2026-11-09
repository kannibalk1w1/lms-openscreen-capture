# Fable full review — lesson-capture fork (9 November 2026)

Reviewer and, from Part 3 onward, sole writer: Claude Fable (model ID as self-reported:
`claude-fable-5-2`). Reviewed: branch `lesson-capture/input-boundaries` at exact
`259534fe0c1b64274c4543c7034a035eb3f2231b` (on `9479172b`), against preserved main
`fd2775e2dbc540306b46085eb0301fa06a6a3aaa` (`git diff fd2775e2...HEAD`: 368 files,
+49,392/−796 in 61 commits). The checkout was clean at that HEAD when I started; main, private
main and the private feature ref (`5d73f835`) were as stated; the addon hash is
`5d16ea98…09efca`. Nothing was pushed.

Evidence for this review is in `../openscreen-evaluation/fable-review-2026-11-09T2130Z/`.
Part 1 and Part 2 were written before I changed any code. Part 3 slices are appended below
as they land; they are my own work and are **not** independently reviewed.

Read first: `AGENTS.md`, the handoff, the roadmap, the product map, `project-spec.md`, the
external "LMS content and media workflow report", review 41, follow-up 41 and
`PACKAGE_RESEAL_2026-11-09.md`. I read the earlier reviews selectively, not line by line, and
I say below where I relied on them instead of re-deriving their results.

## Part 1 — independent assessment of `259534fe` (M41-1 fix) and `9479172b`

### Verdict

**`259534fe` fixes M41-1 and I found no authority, integrity or data-loss defect in it or in
the reseal feature beneath it. Accept.** I found three Low usability defects and three test
gaps, listed below; none blocks a private push. They are fixed in Part 3 slice 1.

### What I ran (verified)

| Check | Result |
| --- | --- |
| Focused Vitest on a `git archive HEAD` snapshot: `electron/ipc/lessonPackageOpen.test.ts`, `LessonPackagePanel.test.tsx`, `LessonPackageReseal.integration.test.tsx`, `LessonGuideDialog.test.tsx` | 109 tests / 4 files pass, 0 skipped |
| 14 of my own single-guard mutants (string swap in the snapshot, same 4 files, exact restore confirmed with `cmp`) | 10 killed by assertion failures, 4 survived (below) |
| Full production app probe: my own `vite build` of the snapshot, Playwright Electron under Xvfb, foreign cwd, no `APP_ROOT`/FFmpeg hint, `--mute-audio`, native dialogs stubbed in main | 13 of 13 probes pass |
| Fresh production CLI `lesson verify-package` on both packages the probe produced | `verified`, 45 samples / 45 decoded frames / 1.5 s each |

The probe drives the real editor window, preload and production handlers through the DOM
(fill, click). It is **not** physical input, a real native picker, Windows/macOS, audio or
capture acceptance.

**Probe results** (`part1-full-app-probe/results.json`, driver `probe.cjs`):

| Probe | Observed |
| --- | --- |
| P1 destination inside the source package | Refused, `capability: "retained"`; step titles, instructions, code, alt text and order all byte-equal to what was typed; destination empty |
| P4 Cancel while the native picker is pending | Draft stays frozen and busy until the picker settles; `lesson-package-cancelled`, `retained`; all values kept |
| P1b plain picker cancel | Values kept |
| P1c retry with a valid destination | Saved; all steps `draft`; edited text, code, alt and order present in the output |
| P2 source tampered after the draft (one byte appended to `lesson.md`) | Refused, `reopen-required`; Save disabled; values kept; no new output |
| P3 old token replayed over real IPC after the bytes **and mtime** were restored | Refused; no picker opened; no output. Authority was not revived |
| P2b reopen with a different valid package | "That package differs…"; Save still disabled; values kept; the new token was released in main |
| P2c the released token replayed | Refused |
| P2d reopen with the restored original | Resumed; values unchanged; Save succeeds |
| P6 source package after all of the above | Every payload, manifest and receipt hash unchanged |

**Mutants** (`part1-mutations/results.json`, one log each):

| Mutant | Result |
| --- | --- |
| F1 renderer treats `reopen-required` as retained | Killed |
| F2 main skips the pinned-identity check on failure | Killed (3 tests) |
| F4 main never drops the capability on a reseal failure | Killed (2 tests) |
| F5 resume accepts any well-formed digest | Killed |
| F8 static-copy route also retains | Killed (7 tests) |
| F12 context change does not flag reopen | Killed (2 tests) |
| F13 main re-reads source files even after cancellation | Killed |
| F14 resume replaces the draft | Killed (3 tests) |
| F15 reseal ignores the token | Killed |
| F16 stale reseal result is applied | Killed |
| F3 main skips the open-time **session** check on failure | **Survived** — redundant outside cancellation: `held.value.assertCurrent()` already embeds the open-time session and dirty check (`package.ts:225-231` via `checkFor(authority)`). Only the cancel-plus-session-change path depends on it, and that path is untested |
| F6 renderer keeps its token when the IPC call throws | **Survived** — test gap |
| F9 a successful reseal does not clear the draft | **Survived** — the documented "only success clears the draft" has no assertion |
| F11 `snapshotSha256` covers only the lesson ID, not the inventory | **Survived** — the "different package" tests use a different lesson; nothing pins "same lesson, different inventory" |

### What I checked by reading (inferred, not executed)

- **Retry revalidates.** A retained token still passes through the token compare, the
  open-time session check, edit validation, the picker, the destination check, the open-time
  pinned identities and a full strict re-inspection (`packageReseal.ts:21-33`) before the
  shared writer runs. Retention skips none of these.
- **Cancellation.** After an abort the failure path deliberately does not re-read files
  (`lessonPackageOpen.ts:89`). It keeps the old frozen identity, which the next retry must
  re-prove. P4 and F13 agree with this.
- **Dirty and project change.** `editorRangeSessions.capture` checks project identity, URL and
  the live dirty provider on every assertion (`editorRangeSession.ts:36-45`). A dirty refusal
  drops the capability in main through the pre-authorize owner lookup
  (`lessonPackageOpen.ts:64`), so clearing dirty cannot revive it. I did not drive a dirty
  race through the real app; the jsdom-to-production integration test covers it.
- **Originals.** Reseal reads the package directory only and writes a fresh
  `lesson-package-<uuid>` folder with exclusive creates. No code path writes to the source
  package or to the authored project.

### Part 1 findings

**L-F1 (Low, usability) — discarding a draft after authority loss leaves a dead snapshot.**
`LessonPackagePanel.tsx:371-381` clears only the draft and the message. `needsReopen` stays
true and the token is already gone, so the still-visible snapshot has "Edit supported text…"
permanently disabled (`:273`), "Save a new editable text and image copy" enabled but a silent
no-op (`:104`), and an empty status line. Reproduced in the real app (probe P5:
`editVisible: true, editDisabled: true, status: ""`, screenshot `p5-after-discard.png`). The
user can recover with Close or Open, but nothing says so.

**L-F2 (Low) — a `lesson-package-busy` reply to reseal revokes a good capability.**
Main returns busy without a `capability` field (`lessonPackageOpen.ts:69`). The renderer
treats anything other than `"retained"` as lost: it releases the token and demands a reopen
(`LessonPackagePanel.tsx:86-91`). The release handler also aborts whatever operation is
active (`lessonPackageOpen.ts:236`). Hard to reach from the current UI, because the renderer
blocks concurrent operations, but the contract is wrong.

**L-F3 (Low) — a wrong token is answered with `capability: "retained"`.**
The failure path reports on whatever capability main holds, not on the token presented
(`lessonPackageOpen.ts:85-90`). A caller with a stale token is told its authority is retained
and can never succeed. No authority is gained; the label is misleading.

**N-F4 — wrong advice for destination mistakes (was N41-2).** Choosing a folder inside the
package returns `lesson-package-invalid`, whose text tells the user to "Save and reload your
project, then choose an intact package folder again". Neither action helps.

**T-F5 — test gaps:** F6, F9, F11 above, plus the cancel-plus-session-change path (F3).

**Not a defect, but worth knowing.** If the editor context changes while a reseal is in
flight and main still completes it, the package is written but the renderer ignores the late
result and keeps the draft with "authority lost". The user may then save a second copy. No
data is lost.

## Part 2 — full review against the original goal

The goal, from `project-spec.md` and the external workflow report: **capture friction is the
primary problem.** An author or agent demonstrates once, marks moments with shortcuts,
reviews a timeline of footage and events, turns moments into steps, and exports PNG/MP4/GIF
with a **lesson/slide mapping manifest**, on **Windows and CachyOS/KDE**, keeping an editable
project. A bad step can be replaced without rebuilding the lesson.

### What a teacher can actually do end to end today

On Linux, in the GUI, with the build at this HEAD:

1. Record with the inherited recorder; optionally collect button events (default off) and
   recording flags; type into the scoped typing pad or the Godot plugin.
2. In the editor, open **Lesson guide**. Add steps by hand or draft them from flags and
   typing labels. Type a title, instructions and code per step.
3. Capture the saved playhead frame as a step illustration and describe it.
4. Export the selected steps as an offline HTML and Markdown guide folder.
5. Attach and confirm a video range on a step, then export that step's MP4
   (video only, at most 1280 px on the long edge, 30 fps, at most 120 s).
6. Save the lesson as a new JSON file each time. Open one again later.
7. Open, inspect, and re-edit the text of a portable package.

What the teacher **cannot** do today:

| Missing path | Evidence |
| --- | --- |
| Any lesson media step on **Windows** (or macOS) | `package.ts:53`, `rangeMedia.ts:157`, `rangeAuthoring.ts:60`, `sourceIdentity.ts:31`, `encodedVideo.ts:377` all refuse off Linux |
| Create a portable package from the GUI | `preload.ts:75-79` exposes open, copy, reseal, cancel, release only; creation is CLI/MCP (`package-tools.ts:65`) |
| Record which LMS lesson or slide a step belongs to, or export a mapping manifest | `schema.ts:45-60`: a step has no mapping field; no exporter writes one |
| Export a step as a GIF, or a still as a standalone PNG | Range export is MP4 only (`rangeMedia.ts:111`, `:222`); illustrations are JPEG inside the guide |
| A 1920×1080 step video (the spec's stated target) | `rangeMedia.ts:107` scales to 1280; `packageContracts.ts:39-40` caps width and height at 1280 |
| Verified audio in any lesson output | Every receipt hard-codes both audio flags false (`packageContracts.ts:48-50`) |
| Save over the same lesson file, or autosave | `service.ts:111` writes with `wx`; the lesson lives in dialog state (`LessonGuideDialog.tsx:54`) |
| Replace a bad step's take, rolling buffer, save-recent, retake from checkpoint | Not started (product map P0.4, P2.2) |
| An agent authoring steps headlessly | MCP lesson tools are `queryLessonFile`, `exportLessonGuide`, `confirmLessonRangeFile`, `exportLessonRangeFile` plus the two package tools; none creates a lesson, adds a step or attaches an illustration |
| The Enemy-sequence pilot from the spec | Not run |

### Findings

Severity reflects impact on the stated goal, not just code correctness.

#### H1 (High, product) — the whole lesson media pipeline is Linux-only, while Windows is a primary target

Range confirmation, range export, video validation, packaging, verification, package open and
reseal each start with a `process.platform !== "linux"` refusal (files above). The UI says so
("Package checking is supported on Linux only"). The spec's first confirmed decision is human
capture on Windows and Linux, and its acceptance list includes reopening the same project on
the other OS. Four days of work have deepened the Linux path while the Windows path has not
moved. Nothing in the identity code is inherently Linux-specific except the inode/ctime
pinning (`packageIO.ts:9`) and `O_NOFOLLOW` use (`packageIO.ts:73`).

**Recommendation:** before any further package or player work, run the existing suites on
Windows, find what actually breaks, and replace the blanket platform gates with capability
checks. Treat "same package verifies on both OSes" as the next acceptance gate.

#### H2 (High, product) — the lesson/slide mapping manifest, the spec's first export requirement, does not exist

"Initially export organised media and a lesson/slide mapping manifest" is a confirmed decision
in the spec, and the external report describes the whole purpose as keeping media "connected
to the lesson". The lesson model carries evidence IDs, source fingerprints, pins and
derivation lineage, but no field that says which LMS lesson or slide a step is for, and no
export lists "step → slide → files". A teacher still matches files to slides by hand.

**Recommendation:** add an optional authored LMS reference to the lesson and to each step,
and write a small mapping file beside the guide. This is cheap and is done in Part 3 slice 3.

#### H3 (High, usability) — packaging a video breaks if the lesson is touched after the MP4 export

`selectedPackageMedia` requires `receipt.target.revision === lesson.revision`
(`packageMedia.ts:69`). Every keystroke in the guide dialog increments the revision
(`authoring.ts:34`, called from `LessonGuideDialog.tsx:166-174`). So the only working order
is: confirm ranges, export every MP4, change nothing, save the lesson, package. Fixing a typo
in any step after an export makes `lesson package` refuse every video with
`lesson-package-invalid`, and the only remedy is to render them all again.

The check also protects nothing. The package test fixture itself rewrites the instructions,
code, image and evidence after the export and still packages, because it leaves the revision
number alone (`package.test-support.ts:30-63`). What actually binds a video to a step is the
lesson ID, the step ID and the exact confirmed selection, and those are compared separately
(`packageMedia.ts:66-70`).

**Recommendation:** drop the revision equality; keep lesson ID, step ID and exact pin
equality. Done in Part 3 slice 2.

#### M1 (Medium, usability) — authored lessons are easy to lose and awkward to keep

- The lesson is React state in a dialog (`LessonGuideDialog.tsx:54`). The dialog is keyed by
  project (`NewEditorShell.tsx:2021`), so switching project discards it. An editor reload or
  crash discards it too.
- "Save new editable copy" never overwrites (`service.ts:111`), so iterating produces a trail
  of files, and there is no "this lesson is saved at …" state.
- Closing the dialog asks for confirmation only when a *package* draft exists
  (`LessonGuideDialog.tsx:51-53`), not when the authored lesson has unsaved changes.
- Recovery copies are manual only.

The cautious "never replace a file" rule is defensible for a derived artefact. For the
author's own working document it works against the spec's "effortless" goal.

**Recommendation:** remember the file a lesson was opened from or saved to and offer Save to
that file through an atomic replace; add a dirty marker and a close confirmation; consider a
timed recovery copy.

#### M2 (Medium, architecture) — the package tools are gated on unrelated editor state

Opening a package for inspection needs a selected video project that is saved and clean
(`lessonWorkflow.ts:27-29`, `editorRangeSession.ts:36-45`). Any change to the project
document, including the dirty flag flipping, revokes the package capability and forces the
user back through a native picker to re-find the same folder
(`LessonPackagePanel.tsx:48-59`). A package is a self-contained folder; the current video
project has no bearing on whether its bytes verify. The session machinery was built to
protect range export, where project identity matters, and was reused here because it existed.

**Recommendation:** key package capabilities to the window and its navigation lifetime only.
This would delete the "authority lost / reopen the same package" state for the commonest
trigger and most of the recovery UI added in `259534fe`.

#### M3 (Medium, proportion) — verification depth far exceeds the threat, and costs the user

The package format re-hashes every file, regenerates and byte-compares the guide, fully
decodes every video on open, on reseal input and on reseal output, pins inodes and ctimes at
each await, and refuses on any difference. The documents correctly say this is "local
readback, not a signature": anyone who can edit the folder can also rewrite the manifest and
receipt. So the checks defend against accident and bit rot, not tampering, and a much smaller
set would do that (hash on open, hash on write). Review 41 already found two of the layers
individually redundant (N41-1), and my F3 mutant found another.

The cost is real: about 600 lines of identity plumbing, long test files (`lessonPackageOpen.test.ts`
is 918 lines), hard caps that bind users (4 videos, 64 files, 1280 px, 120 s), and a
copy-then-refuse flow that leaves complete-looking folders without receipts in the user's
chosen directory on any late failure (`package.ts:476-486`), with no path shown in the GUI.

**Recommendation:** freeze this layer. Do not add further identity checks. When the format
next changes, state the threat model first and remove what it does not need.

#### M4 (Medium, process) — the review ritual has outgrown the product

Of 49,392 inserted lines, 15,223 are Markdown in 117 files, 15,537 are tests, 4,335 are
locale catalogues, and roughly 11,600 are production TypeScript, Rust and GDScript. There are
41 numbered reviews plus follow-ups. Each recent slice is a narrow guard-and-authority
increment with seven mutation controls and a preserved inventory of earlier evidence, and the
last three slices (package open, reseal, draft recovery) serve a workflow — re-editing a
received package — that the spec never asks for, while the two cheapest spec items (H2, M1)
were not started. The dependency chain "privacy → steps → package → reseal → player" has
become a reason to defer user-visible work.

**Recommendation:** order work by what a teacher can newly do. Keep the real startup smoke
and focused tests. Reserve mutation controls for authority and integrity code.

#### M5 (Medium, evidence) — acceptance evidence is narrower than its volume suggests

Everything in the lesson pipeline has been exercised only with synthetic 45-to-75-frame clips,
under Xvfb, with software encoding, with dialogs stubbed, driven through jsdom or CDP. No one
has: clicked a real picker; recorded a real lesson and taken it through steps to a package;
tested with a screen reader or keyboard only; run on Windows or macOS; or verified audio. The
reports say this honestly each time. The risk is in the accumulation: "accepted" appears
forty times and reads as product readiness. The spec's own acceptance list (30-minute
reliability run, 100 ms event alignment, 250 ms control acknowledgement, reopen on the other
OS, author effort against the OBS baseline) has no entry with evidence.

**Recommendation:** one manual session by a human on real hardware, following the spec's
pilot, is now worth more than another reviewed slice.

#### M6 (Medium, agent parity) — agents cannot author a lesson through the tools

The spec's agent workflow ends with "export a first pass with completed/failed/unverified
statuses". The headless surface can query, export, confirm, render and package an existing
lesson file, but cannot create one, add a step, or attach an illustration from a project
frame. An agent must hand-write the JSON, including a base64 JPEG and its SHA-256.

**Recommendation:** add `lesson new`, `lesson add-step` and `lesson illustrate` (frame at a
ruler time) to the CLI and MCP, reusing `LessonService.captureFrame`.

#### L1 (Low, consistency) — authority checks are uneven across lesson IPC

Package handlers verify main frame, owner, token, session and dirty state. The draft store,
save, open, export and plan-range handlers verify nothing about the sender
(`electron/ipc/lesson.ts:35-45`, `:73-107`); any window in the app can list, read or delete
recovery copies. With local trusted renderers this is not exploitable today. It does show
that the strict model is applied by habit, not by a stated threat model. The save, open and
export dialogs are also unparented (`lesson.ts:76`, `:88`, `:100`), so they can open behind
the editor window.

#### L2 (Low, usability and accessibility) — package panel wording and structure

- The copy is written for reviewers: "Verification authority is no longer current",
  "Changed media or inventory cannot be rebased automatically", "matched-author-selected-pin-claims".
  A teacher needs "The package or project changed. Choose the same package folder again to
  continue; your edits are kept."
- Every step's move buttons share one accessible name ("Move package step up"), so a
  screen-reader user cannot tell them apart (`LessonPackagePanel.tsx:346-359`).
- Step titles and the lesson title are all `h4` inside an `h3` section (`:226`, `:242`).
- The panel never shows which folder is open, so "reopen the same package" relies on memory.
- The destination picker lacks `createDirectory` (`lessonPackageOpen.ts:203-206`).
- All 14 non-English catalogues carry English fallback text for the lesson features.

#### L3 (Low, documentation) — stale and unreadable status

- `PRODUCT_MAP.md:42`, `:128` and `:307` still say package inspection is "pending review";
  reviews 39 and 40 accepted it.
- `LESSON_CAPTURE_ROADMAP.md` "Active work" is a stack of eleven dated paragraphs, newest
  first, each saying earlier ones are historical. The current queue cannot be read from it.
- The product map's delivery order still puts privacy and the player ahead of mapping and
  cross-platform, which this review disputes (H1, H2).

### What is good

- The lesson model is small, validated and stable (`schema.ts`), with stable step IDs.
- One shared package writer serves CLI, MCP and GUI (`publishLessonPackage`).
- The real headless startup smoke exists and is enforced; it catches a class of failure that
  mocks missed twice.
- Originals are never modified; every output is a new file or folder.
- Reports are honest about scope, including failed harness attempts.
- Input capture is default-off with explicit consent.

### Areas I did not review in depth

The native PipeWire helper (about 2,700 lines of Rust and GDScript), the input journal and
timing projection, the clock bridge, cursor recovery and the native render-ownership locks. I
read their documents and entry points and relied on reviews 1 to 30 for their correctness. I
have no new finding there and make no claim about them.

### Prioritised plan

| Order | Item | Why | Size |
| --- | --- | --- | --- |
| 1 | Part 1 lows: dead snapshot, busy and wrong-token replies, destination message, test gaps | Finish the unpushed feature properly | S |
| 2 | H3: drop the receipt revision equality | Removes the trap between GUI authoring and packaging | S |
| 3 | H2: LMS lesson and slide references plus a mapping file | First export requirement in the spec | M |
| 4 | M1: Save to the same file, dirty marker, close confirmation | Stops routine loss of authored work | M |
| 5 | GUI "create package" from the guide dialog | Completes the GUI path that today ends at the CLI | M |
| 6 | M6: headless lesson authoring commands | Agent first-pass workflow | M |
| 7 | H1: Windows run and capability gates | Primary platform; needs a Windows machine | L |
| 8 | M2: decouple package capability from project state | Deletes complexity and a recovery flow | M |
| 9 | GIF and PNG step outputs; lift the 1280 px cap | Spec outputs | M |
| 10 | Manual pilot on real hardware (spec's Enemy sequence) | Real acceptance evidence | human |

Items 1 to 3 are implemented below. Items 7 and 10 cannot be done from this session.

## Part 3 — implementation slices (my own work; not independently reviewed)

### Slice 1 — reseal recovery follow-ups (L-F1, L-F2, L-F3, N-F4, T-F5)

Parent: `52008fac`. Evidence: `../openscreen-evaluation/fable-review-2026-11-09T2130Z/slice1/`.

**Changed**

- `LessonPackagePanel.tsx`: discarding a draft whose verification was lost now closes the
  unusable snapshot and says to open the package again (L-F1). A `lesson-package-busy` reply
  no longer releases the token or demands a reopen (L-F2).
- `lessonPackageOpen.ts`: the failure path keeps and reports a capability only for the token
  that was presented. A wrong token gets `reopen-required` and the held capability is
  dropped, as the static-copy route already did (L-F3).
- `packageReseal.ts` and `packageOpen.ts`: a destination inside the package, a missing
  folder, a non-folder or a symlinked folder returns the new code
  `lesson-package-destination-invalid` before any source re-read or output. The capability
  is retained (N-F4).
- 15 `timeline.json` catalogues: two new strings. The 14 non-English catalogues carry the
  English text, as with earlier slices; no translation is claimed.
- Tests: 3 new production-registration tests and 5 new panel tests, covering the four fixes
  and the F6, F9 and F11 gaps from Part 1. The cancel-plus-session-change path (F3) is still
  untested.

**Validation**

| Check | Result |
| --- | --- |
| Focused Vitest, 8 files (`ipc/lessonPackageOpen`, `LessonPackagePanel`, `LessonPackageReseal.integration`, `LessonGuideDialog`, `lesson/package`, `package.privacy`, `cli/lessonPackage`, `mcp/package.integration`) | 195 tests pass, 0 skipped |
| `npx tsc --noEmit` and `npx tsc -p tsconfig.test.json --noEmit` | pass |
| `npm run lint` | 35 baseline warnings |
| `npm run i18n:check` | pass, 15 locales, 1306 keys |
| `npx vite build` | pass |
| Required real startup smoke, foreign cwd, hints cleared, pinned Node | `success: true` |
| 5 single-guard controls on my own changes (snapshot, exact restore) | 5 killed by assertions |
| Part 1 full-app probe rerun on the new build | P0 to P2d pass; P1 now shows the destination message. The driver's old P5 line then times out waiting for the Edit button, which the fix removes; the saved page text shows the new message and no snapshot. P6 and P7 did not run in this rerun |

The full suite was not run for this slice. Dialogs were stubbed; no real picker, physical
input, audio or other platform was exercised.

**Limits and next.** Failed reseals still leave a receipt-less folder in the chosen
directory. Next: slice 2 (H3).

### Slice 2 — packaging survives lesson text edits made after an MP4 export (H3)

Parent: `ebb2926c`. Evidence: `../openscreen-evaluation/fable-review-2026-11-09T2130Z/slice2/`.

**Changed.** `electron/lesson/packageMedia.ts`: the receipt's target revision must now be
**no later than** the lesson's revision, instead of equal to it. Lesson ID, step ID and the
exact confirmed selection are still compared as before, and the video bytes, timing and
decode checks are untouched. This deliberately relaxes a guard that review 37 accepted; the
reason is in finding H3. A receipt that claims a later revision than the lesson file is still
refused (existing `receipt-target` case).

**Test.** One new case in `electron/lesson/package.test.ts`: a lesson whose text and revision
moved on after the export packages and verifies with the corrected text and the same video
binding; the receipt file is unchanged; a lesson whose confirmed range changed afterwards is
refused and leaves no second package.

**Validation**

| Check | Result |
| --- | --- |
| Focused Vitest, 5 files (`lesson/package`, `package.privacy`, `cli/lessonPackage`, `mcp/package.integration`, `ipc/lessonPackageOpen`) | 152 tests pass, 0 skipped |
| Both `tsc` configurations, `npm run lint` (35 baseline), `npx vite build` | pass |
| 3 controls: restore strict equality; remove the revision check; remove the pin comparison | 3 killed by assertions |

Not run for this slice: the full suite, the startup smoke (no registration or bootstrap
change) and a real CLI packaging run with an actual rendered MP4. The unit fixture uses the
mocked video validator.

**Next:** slice 3 (H2, LMS references and mapping file).

### Slice 3 — LMS lesson and slide references with a mapping file (H2)

Parent: `cd444252`. Evidence: `../openscreen-evaluation/fable-review-2026-11-09T2130Z/slice3/`.

**What a teacher or agent can now do.** Type an optional "LMS lesson reference" for the
lesson and an optional "LMS slide reference" for each step in the Lesson guide dialog (or set
`lessonRef` and `slideRef` in the lesson JSON). Every guide export then contains
`lesson-mapping.json`, which lists each exported step with its number, stable ID, title,
review status, slide reference if any, guide anchor, image file and alt text if any, video
file if any, and whether it has code. The HTML and Markdown guides show the references too.

**Changed**

- `src/lib/lesson/schema.ts`: optional `lessonRef` on the lesson and `slideRef` on a step.
  Each is one line of 1 to 200 characters with no control characters.
- `src/lib/lesson/mapping.ts` (new): builds the mapping from an already projected lesson.
  It records what the author typed and which files exist. It infers nothing and checks
  nothing against an LMS, and says so in its `meaning` field.
- `src/lib/lesson/export.ts`: guides show "LMS lesson" and "LMS slide" lines only when a
  reference exists, HTML-escaped. Guides for lessons without references are byte-identical
  to before.
- `electron/lesson/service.ts`: the guide export always writes `lesson-mapping.json` and
  lists it in the checksum report.
- `electron/lesson/package.ts`: a package includes `lesson-mapping.json`, with video paths,
  **only when** the lesson has a reference. Packages without references keep the original v1
  inventory, so existing packages and the retained v1 fixture verify unchanged. The file is
  part of the checked inventory.
- `LessonGuideDialog.tsx`: the two inputs. Editing a slide reference keeps a step's reviewed
  status, because a destination label is not teaching content.
- 15 catalogues: three strings, English text in all.

**Decisions and limits**

- A build older than this commit rejects a lesson file or package that contains a reference,
  because its schema is strict. Files without references are unaffected in both directions.
- References are free text. There is no LMS lookup, no slide picker and no insertion into
  LMS upload files; the spec defers that.
- The package re-edit panel keeps references fixed; they are not editable there yet.
- `lesson query` output does not show references yet.
- A selected-step MP4 exported on its own (outside a package) is not listed in a guide
  export's mapping, because the guide export does not know about it.

**Validation**

| Check | Result |
| --- | --- |
| Focused lesson-area Vitest (`src/lib/lesson`, `electron/lesson`, `electron/mcp`, `electron/cli`, `src/components/ai-edition/v4`, two IPC files) | 1,174 tests / 73 files pass, 0 skipped |
| Full suite once, `npm run test -- --maxWorkers=4` | 6,181 tests / 455 files pass, 0 skipped |
| Both `tsc` configurations; `npm run lint` (35 baseline); `npm run i18n:check` (15 locales, 1309 keys); `npx vite build` | pass |
| Required real startup smoke, foreign cwd, hints cleared | `success: true` |
| Real production CLI, pinned Electron build under Xvfb: `lesson export`, `lesson package` (text only), `lesson verify-package` on a hand-written lesson with references | exported with the mapping shown in `cli-export-lesson-mapping.json`; packaged with `lesson-mapping.json`; `verified` |
| Real production CLI `verify-package` on a copy of the pre-existing video package from the reseal evidence | `verified` (old inventory still accepted) |
| 2 controls: always add the mapping to packages; never add it | 2 killed (the first by the retained v1 fixture test) |

Not exercised: the two new inputs in the real app (jsdom test only), a package with both a
video and references through the real CLI (unit fixture with the mocked validator only), any
other platform.

### State after the three slices, and what is next

The remaining plan items, in order: M1 (save to the same lesson file, dirty marker, close
confirmation); GUI package creation; headless lesson authoring commands (M6); a Windows run
and capability gates (H1); decoupling the package capability from project state (M2); GIF and
PNG step outputs and the 1280 px cap; and the manual pilot on real hardware. None of these is
started.
