# Claude roadmap review 41 — media-preserving package reseal (9 November 2026)

Reviewed: exact `9479172bc92db76a062224b94816df044a71aa1e` ("feat(lesson): reseal supported
package edits with retained media") against `5d73f835257c50144823257caf26ba465331c107`, branch
`lesson-capture/input-boundaries`. Main is still `fd2775e2dbc540306b46085eb0301fa06a6a3aaa` and
the addon is unchanged (`5d16ea98…`). The checkout was clean at the exact HEAD at the start and
at the end. This review added only this file.

Read: `AGENTS.md`, the handoff, `PACKAGE_RESEAL_2026-11-09.md` and the diff (33 files):
`electron/lesson/packageReseal.ts`, `src/lib/lesson/packageEdit.ts`, the new
`lesson:package-reseal` handler, the `publishLessonPackage` extraction in `package.ts`,
`LessonPackagePanel.tsx`/`LessonGuideDialog.tsx`, preload, and the catalogs.

## Verdict

**Accepted within the stated scope, with one Medium usability/data-loss finding to fix or
consciously accept before building on it. No security, integrity or certification defect was
found.**

The core design is sound:

- **Edit validation** (`validatePackageEdit`). The expected lesson is rebuilt from the
  verified original, taking only the title, instructions, image alt text, existing code text,
  revision and order from the draft. Every step is forced to `draft`, and the result must match
  the submitted draft byte-for-byte after canonical validation. So changed or new step IDs,
  removal, addition, approval, asset or policy changes, and resurrected excluded code or images
  are refused **before** any picker.
- **Reseal** (`resealLessonPackage`).
  - **Order of operations:** an explicit native existing-directory picker comes after edit
    validation. The destination must be outside the source package. The open-time identities
    are re-asserted and the strict v1 inspector runs again (including decode), with no original
    project, receipt or pin lookup.
  - **Lesson identity:** the new lesson gets a fresh ID at revision 0, with `derivedFrom`
    recording the new step order.
  - **Media:** MP4s are re-pinned against the source inventory and keep their stable
    `media/<stepId>.mp4` bindings.
  - **Publication:** through the **one shared** `publishLessonPackage` writer (also used by
    CLI/MCP create), with copied-output readback and decode and the receipt written last.
- **Authority.** It reuses the owner-scoped capability, main frame, current session and dirty
  checks, plus the open-time session re-assertion. CLI/MCP reseal is not delivered, and the
  document says so.

**Required real startup smoke (per `AGENTS.md`).** The committed script ran on my production
build of `9479172b` from a foreign working directory, with no decoder or `APP_ROOT` hint and
pinned Node: `success: true`.

## Findings

### M41-1 Medium — any failed reseal discards the user's unsaved package draft

When `lesson:package-reseal` returns any failure, the panel discards the draft and the opened
snapshot (`LessonPackagePanel.tsx:68-71`: `setOpened(null); setDraft(null);`). Main also drops
the capability on every failure (`lessonPackageOpen.ts:79`, `if (state) state.opened = undefined;`).
Because opening another package is disabled while a draft exists, a retry with the same draft
is impossible. The behaviour is deliberate: a panel test pins "cancelling reseal discards the
unpublishable draft". The design document only says that a stale completion cannot attach.

The user-typed edits are therefore lost on routine, recoverable refusals:
- choosing a destination inside the package;
- a symlinked destination;
- a changed source package;
- a missing verification tool (`lesson-package-tool-unavailable`);
- cancelling while verification or decode is in progress;
- a project-dirty race.

A plain picker cancel (`status: "cancelled"`) does keep the draft (probe RS8).

**Reproduction (real IPC, full app):**
1. Open the video package.
2. Reseal a valid draft with the destination picker returning the source package itself
   → `{"success":false,"code":"lesson-package-invalid"}`.
3. Retry with the same token to a valid folder → `lesson-package-invalid` (probe RS5/RS5b).

The renderer's handling of that failure is the `setDraft(null)` above.

**Fix options:**
- Keep the capability for pre-publication refusals (destination or edit refusals and
  cancellation), so the draft can be retried.
- Or keep the draft on failure and allow "re-open and continue editing" when the re-opened
  package has the same lesson ID and inventory.
- Or at least tell the user explicitly that edits will be discarded on failure.

No package or original data is affected; only in-progress text is lost.

### Nits

- **N41-1: two redundant checks.** V6 (re-running the source inspector inside reseal) and V7
  (checking re-pinned MP4 bytes against the inventory) are redundant with the open-time
  identity assertions and the copied-output decode. Each mutant survives the focused set, which
  matches the follow-up's "layered checks, not individually necessary".
- **N41-2: N39 nits remain.** A non-specific invalid code is still returned for
  destination-inside-package and dirty refusals.

## Independent validation

- **Toolchain:** pinned Node 22.22.1 / npm 10.9.4.
- **Snapshots:** `git archive 9479172b` copies in my scratchpad.

| Check | Result |
| --- | --- |
| Focused: `ipc/lessonPackageOpen`, `LessonPackagePanel`, `LessonPackageReseal.integration`, `LessonGuideDialog`, `package`, `package.privacy`, `cli/lessonPackage`, `mcp/package.integration`, `src/lib/lesson/lesson`, `output` | 206 / 10 pass, 0 skip |
| Both `tsc`, i18n, Biome on the 5 changed sources | pass |
| Production `vite build` + required startup smoke | pass |
| My mutants | 8 single + 1 paired: 7 killed (V1 exact compare, V2 membership, V3 draft status, V9 code resurrection, V5 outside package, V11 edit-before-picker order, V8 paired reseal session), 2 survived (V6, V7 = N41-1); snapshot restored clean |

### Full-app real Electron probe (production build)

- **Setup:**
  - The full application with the editor opened through `switch-to-editor`, from a foreign
    working directory with no decoder hint.
  - The dialog stubbed in main; no picker clicks.
  - The source was a real CLI-built two-step package (step 1 has the 75-frame MP4 and code),
    **copied elsewhere**, with the original authoring inputs renamed away.

| Probe | Result |
| --- | --- |
| RS2/RS3/RS4/RS6/RS6b: changed step ID / `reviewed` status / step deleted / code added to a code-less step / output policy changed | `lesson-package-edit-unsupported` each; **no** destination picker opened |
| RS8 picker cancel | `{status: "cancelled"}`, draft and capability kept |
| RS1 reorder + title, instructions and code edits | `packaged`; source package byte-unchanged (`sha256sum -c`) |
| RS5 destination = source package / RS5b retry with the same token | `lesson-package-invalid` / `lesson-package-invalid` (M41-1) |
| RS7 dirty / RS9 source tampered after open | `lesson-package-invalid` / `lesson-package-invalid`, no output |

The only output folder is the RS1 package.

**Fresh CLI `verify-package` of the RS1 output** (foreign working directory, originals
offline): `verified`.
- **Lesson:** steps reordered (`914c0a2e`, `9baf7f17`), new title, revision 0, `derivedFrom`
  in the new order, both steps `draft`, code `EDITED_CODE`, no pins.
- **Video:** the MP4 is still bound to step `9baf7f17` (`media/…1afec345.mp4`), with
  75 samples / 75 decoded frames / 2.5 s and audio flags false.
- **Guide:** contains the edited text.

**Not covered:** GUI clicks, the native picker, CLI/MCP reseal, physical capture, audio,
other platforms and human translation.

## Preservation and cleanup

Re-hashed:

| Inventory | Entries | Mismatches |
| --- | --- | --- |
| Imported | 1485 / 76 | 0 |
| Extended | 1873 / 78 | 0 |
| Additional reports | 77 | 0 |
| Follow-up files | 125 | 0 |
| Prior slice files | 267 | 0 |
| Prior review-39 files | 32 | 0 |
| Extra preserved files | 2 | 0 |
| Original native evidence | 112 | 0 |

- **Review 40** is in the tree at `91a30a15…`.
- **Addon:** hash unchanged.
- **Cleanup:** all my Electron processes have exited. I removed profiles, packages and media,
  and kept scratch builds and probe JSON in the session scratchpad.

## Next

- Decide on M41-1: keep the draft or capability on pre-publication failures, or warn the user.
- Coordinator private push.
- Then headless CLI/MCP reseal parity, or bounded media access and the player.
