# Claude overnight review 10: slice 12 (review-9 follow-up) and slice 13 (editable lessons and offline illustrated guides)

Reviewer: Claude (Opus 5.5), the only reviewer for Orca task `task_fe3cac58dcdf`. It ran read-only in this terminal: a nested sub-worker launch was refused (`nested_worker_depth_exceeded`), and the coordinator confirmed that this dispatch is the review.
Date: 6 November 2026.

Reviewed immutable ranges:

- **Slice 12:** `98413e492ce460bcb7ffd99e5c4b5e12952e3b41` vs `1e2ddea31c863dcd918c9e4d9e35cc95a70128d8` (`fix: preserve clock pairing across source teardown`).
- **Slice 13:** `1bd83d66f6141cf4cbefe59aafbcbd087f98ac3b` vs `98413e492ce460bcb7ffd99e5c4b5e12952e3b41` (`feat: author portable lessons and offline illustrated guides`).

All code was read with `git show`/`git diff` at those SHAs, never from the working tree. `main` was checked and is still `fd2775e2`. At review time the checkout HEAD was `1bd83d66` with a clean status. This file is the only file I wrote in the checkout. No existing review, follow-up, code, git state, config or project was changed.

What I read:

- `lesson-capture/CLAUDE_OVERNIGHT_REVIEW_9.md` and `lesson-capture/CLAUDE_OVERNIGHT_FOLLOWUP_9.md`.
- `LESSON_CAPTURE_CLOCK_BRIDGE.md` at `98413e49` and `LESSON_CAPTURE_GUIDES.md` at `1bd83d66`.
- `AGENTS.md`.
- Every changed source and test file in both ranges.
- The supporting code each one relies on:
  - `DocumentService.getProject`/`saveProject`/`addAsset`;
  - `inspectCapturePrivacy`;
  - `projectRawTimelineSecToPlayback`/`keptRawSpans`;
  - the MCP `renderProjectFrames` path;
  - the `projectStore` save path;
  - the typing and recording-flag schemas.
- The implementer's logs and artifacts in `../openscreen-evaluation/overnight-2026-11-06/` (`slice-12-*`, `slice-13-*`, `lesson-guide-native-fixture-final/`).

## Verdict

- **Slice 12: accepted.**
  - L11-1 and L11-2 are fixed, and the Info items are dispositioned (I11-1 and I11-5 in code; I11-2/3/4 in the clock document).
  - One new Low/nit: **L12-1**, the Godot dock shows `off` instead of `limit` after the limit footer.
- **Slice 13: no High. One Medium (M13-1), three Lows, several Info items.**
  - The export side meets its claims. It writes a new folder, files are created exclusively (never overwritten), only selected material goes out, writes are read back, and the receipt is written last. The HTML has no script and an escaped, restrictive CSP. Images are bounded and checked by hash.
  - **M13-1 (Medium, new):** "Illustrate from current saved playhead" can never succeed for some saved projects, including any project with a recovered (interrupted) capture. It fails closed, telling the user to "save and retry", and retrying never helps. Confirmed with a real `DocumentService` probe.
  - **L13-1 (Low, new):** `lesson.md` renders every apostrophe as the literal text `&#39;`. A line of `=`/`-` in the instructions turns the line above into a heading.
  - **L13-2 (Low, new):** an exported subset manifest keeps the original lesson's `id` and `revision`.
  - **L12-1** is listed under slice 12.
  - Nothing in slice 13 exposes data from the wrong source, writes over evidence, or modifies the original project.

Approval is limited to these SHAs and the scope below. It is not desktop, physical or production acceptance.

## Slice 12 — review-9 follow-up (`98413e49` vs `1e2ddea3`)

### Review-9 dispositions

- **L11-1 (an unbound link ended by the previous take's teardown): fixed.**
  - What changed: `recordingClockBridge.ts:350`. `NativeClockSourceEndedError` now ends the grant only when `grant.sourceClockId` is set. An unbound grant falls through to the existing `native-unavailable` gap path and returns `503`, and the grant stays alive.
  - The case that matters still works: a bound grant whose source ends still closes, both by identity mismatch (line 345) and by the error.
  - The direct test `keeps an unbound link waiting through a previous native session teardown` checks `503 native-unavailable` → `waiting` → `200` → `recording`.
  - An unbound grant cannot bind to the stopping session, because `sampleClock` rejects whenever `stopping`, `stopped` or `discarded` is set.
- **L11-2 (an old source's close cancelled a concurrent pairing): fixed.**
  - What changed: `this.operation++` is removed from the deferred source-ended `close()`. The `this.grant !== grant` guard runs synchronously just before `closeGrant`, so it cannot close a newer grant.
  - Stays correct: `createPair` still calls `closeGrant()` itself, and the user's Stop still bumps `operation`.
  - If the old close lands during the new pairing's early awaits, it sets `ended`/clears `grant`; `createPair`'s own `closeGrant()` resets both before assigning the new grant. I traced this and saw no leftover state.
  - The direct test holds `fs.realpath` across the old `410`/close, then checks that the new pairing is `paired` and that the fresh link's first query is unbound (`[undefined]`). It passes in my snapshot.
- **I11-1 (Host not validated): fixed.** `request.headers.host !== \`127.0.0.1:${request.socket.localPort}\`` is rejected with `403`. The test uses `node:http` to send a hostile Host with the correct bearer token, and the native query is never called.
- **I11-5 (no per-clock monotonicity in the inspector): fixed.**
  - `journal.ts` now keeps a `Map` from `clockId` to the last point and rejects:
    - observed monotonic time, media time or interval id going backwards;
    - a non-null value becoming null;
    - `stopped` going back to another state;
    - an interval that changes identity;
    - a new interval that starts before the previous interval's end or media time.
  - Different clock ids are never compared with each other, as the document says.
- **I11-2/3/4 (document wording): addressed** in `LESSON_CAPTURE_CLOCK_BRIDGE.md`:
  - possession of the link is the authorization, and project scope is advisory;
  - the TTL does not advance during suspend;
  - opening a project through a symlink alias fails;
  - an unavailable gap, not a `waiting` sample, is normal before the session is assigned.
- **Godot nits from review 9: fixed, except for the leftover in L12-1.**
  - `403`/`410` responses with `unauthorized`, `scope-mismatch`, `revoked` or `expired` now record a `revoked` gap, disconnect and set the `revoked`/`expired` state. The journal schema adds the `revoked` gap reason.
  - The limit path writes a `limit` footer before `disconnect_clock()`.
  - The implementer's real Godot 4.7.1 headless fixture (`/tmp/openscreen-clock-review-fixes-erwyr9u6/probe.gd`, log `slice-12-godot-fixes.log`) checks the footer reason and the `revoked` state. I read its `limit.clock.jsonl`: the last record is `{"event":"clock-stop","reason":"limit"}`.

### L12-1 (Low/nit, new): after the limit, the Godot dock reports the sample file as `off`, not `limit`

- **What happens:** `clock_client.gd` `_process` calls `stop_journal("limit")` and then `disconnect_clock()`. `disconnect_clock()` calls `stop_journal("disconnect")` again.
- **Why it matters:** the second call writes nothing, because `_journal` is null, but it still runs `_journal_state = "limit" if reason == "limit" else "off"` and emits `journal_changed("off")`. `plugin.gd:89` displays that value, so the dock reads "sample file: off".
- **What is not affected:** the footer on disk is correct.
- **Why the test missed it:** the fixture asserts only the footer and `clock_state()`.
- **Suggested fix:** return early from `stop_journal` when `_journal == null and _journal_state != "recording"`, or skip the second call.
- **Baseline vs new:** new in slice 12.

### Slice 12 Info

- **I12-1:** the inspector rejects a same-clock point that goes from non-null `mediaTimeMs`/`intervalId` to `stopped` with nulls, which the schema allows only before any interval exists.
  - In real use the bridge never emits a sample after its source stops: `sampleClock` rejects as source-ended. So this is reachable only by a hand-made journal.
  - I did not check the Rust producer's stopped snapshot shape.

## Slice 13 — editable lessons and offline guides (`1bd83d66` vs `98413e49`)

### Scope checked against the brief and `LESSON_CAPTURE_GUIDES.md`

- **Separate contract.**
  - `openscreen-lesson` v1 (`src/lib/lesson/schema.ts`) is strict at every level, with UUID lesson, step and image ids and an integer `revision`.
  - Extensions are namespaced (`^[a-z][a-z0-9.-]{0,79}$`) `z.json()` values.
  - Duplicate step or image ids, missing image references and images over 8 Mi pixels are refused.
  - It has no dependency on the project schema; the drafting helper only reads a document.
- **Stable identity.**
  - Ids survive reorder (`moveStep` swaps elements), save and reopen. The numbering is generated only at render time.
  - `reviseLesson` bumps `revision` on every title, step or asset change.
  - Editing any field resets `status` to `draft` (`LessonGuideDialog.tsx:42`), so a "reviewed" claim cannot survive a later edit. Good for truthfulness.
- **Metadata-only drafts.** `draftLessonSteps` copies only the flag or section label and a title fallback. It adds evidence ids and the original clock label (`recording-control-active-ms` with the flag's `timeMs`, or `typing-session-elapsed-ms` with no time).
  - It copies no keys, text history or paths, and infers no action.
  - The UI string "No action or timing alignment inferred" is accurate.
  - Flag labels are at most 200 characters with a fallback, and take titles are 1–200 characters, so a draft title is always valid. (I first suspected empty titles; my probe used an invalid take, so I withdrew that.)
- **Native still.**
  - `LessonService.captureFrame` (`electron/lesson/service.ts:43-103`) uses the same `projectRawTimelineSecToPlayback(..., readSpeedRegions(doc))`, 60 fps floor index (`+1e-6`), `buildNativeClipList`/`buildSceneDescription` and the clip-path precheck as the existing MCP `renderProjectFrames` (`electron/mcp/media-tools.ts:551-580`), so the frame selection matches export and MCP.
  - `currentTimeSec` is the raw ruler position. The preview projects it the same way (`VirtualPreview.tsx:1036`), so the clock semantics are consistent.
  - Positions in a raw gap or inside a trim are refused before projection, so a still cannot silently come from the next kept frame. See I13-1 for one edge.
  - The JPEG is checked against its header dimensions, a 1 MiB limit and 4096 px / 8 Mi pixels.
  - The provenance records `rulerSec`, `basis`, `precision`, `projectId` and `documentSha256`. Nothing is inferred from UTC or flags.
  - One render is admitted at a time.
  - The renderer supplies only `{projectId, rulerSec, documentSha256}`. The main process resolves the media from the saved document.
- **Save and open.**
  - `saveEditable` validates, then creates the file with `flag: "wx"` and mode `0600`; it never overwrites.
  - `openEditable` checks `lstat().isFile()`, opens with `O_NOFOLLOW`, and reads with a real byte bound of 16 MiB + 1. `parseLesson` then repeats the full schema, hash and dimension check.
  - The renderer validates once more. Late open results are fenced by an epoch object, and the dialog is keyed to the project id.
- **Export.**
  - `exportGuide` validates the lesson and selection and renders everything before showing the folder picker. It then:
    1. creates a fresh `lesson-<UUID>` directory (`0700`, non-recursive, so it fails if the name exists);
    2. writes every file with `wx`/`0600`;
    3. reads every file back and checks size and SHA-256;
    4. writes `export-report.json` last, also with `wx`.
  - Nothing is deleted or rolled back.
  - `projectLesson` keeps only the selected steps and the images they reference, and sets `extensions` to undefined.
  - Asset filenames are validated UUIDs, so no path traversal is possible.
  - The receipt contains no absolute paths.
- **HTML.**
  - `escape` covers `& < > " '` for text, alt text and code. Instruction newlines become `<br>` only after escaping.
  - Base64 is restricted to `[A-Za-z0-9+/=]`.
  - The CSP is `default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`, so scripts fall back to `none`.
  - There are no external URLs. Drafts are labelled "Draft — review required" and reviewed steps "Reviewed by author", which is truthful.
- **Alternative text.** It is required for every selected illustrated step: the UI disables Export, and `renderLessonGuide` throws.
- **Adapters absent.** The dialog uses only the document and the four optional `electronAPI` entries. Godot and the integrations are never touched, and the tests cover this.
- **Original project and evidence are left alone.** `LessonService` only reads the project through `getProject`.
- **Documentation.** `LESSON_CAPTURE_GUIDES.md` explicitly disclaims autosave/recovery, lesson undo, PDF, CLI/MCP, profiles, learner player and review approval, and the UI makes no such claims.

### M13-1 (Medium, new): Capture always fails for some saved projects, including any with a recovered capture

**What happens:**
- The renderer computes `documentSha256` as `sha256(JSON.stringify(useProjectStore.getState().document))` (`LessonGuideDialog.tsx:309`).
- The main process compares it with `sha256(JSON.stringify(await getProject(id)))` (`service.ts:48-51`).
- These are not the same serialization of the same saved bytes:
  - **The store holds a zod-parsed object.** It holds `documentSchema.parse(saveProject result)` (`projectStore.ts:576`). `saveProject` returns `stampForSave(doc)`, which is also `documentSchema.parse` output. Zod emits keys in schema order.
  - **`getProject` rebuilds part of the document on every read.** Its `parseProjectFile` (`document-service.ts:446-466`) runs `inspectCapturePrivacy` again for every video asset and **replaces** `asset.capturePrivacy` with a freshly built object. That object is not re-parsed, so its keys come out in construction order:
    - `{status, recoveredFrom, journalPresent}` (`capturePolicyReceipt.ts:252-256`);
    - `{...inspected, recoveredFrom}` appended last (`:300-303`);
    - the schema order, by contrast, is `status, journalPresent, recoveredFrom, receipt, binding`.
  - **The inspection itself can also change between reads.** For example, a binding or receipt sidecar appears or disappears, or a journal is removed. Because the store keeps its own copy after each save, the mismatch lasts until the project is reloaded. For the key-order case it survives a reload too.

**Repro (probe P1, scratch snapshot only):**
1. Use a real `DocumentService` in a temp directory and the implementer's MPEG-4 fixture.
2. `createProject` → `addAsset` → add one clip.
3. Simulate the renderer: load with `documentSchema.parse(getProject)`, save, and take `documentSchema.parse(saveProject result)`.
4. Call `LessonService.captureFrame` with that digest, reading through the real `getProject`.

Results:
- **Plain video, no capture-privacy record:** digests equal; the call reaches `renderFrames`.
- **Asset with `capturePrivacy {status:"interrupted", journalPresent:false, recoveredFrom:"interrupted"}`:**
  - store: `{"status":"interrupted","journalPresent":false,"recoveredFrom":"interrupted"}`;
  - main: `{"status":"interrupted","recoveredFrom":"interrupted","journalPresent":false}`;
  - outcome: digests differ, and `captureFrame` → `Project changed; save and retry`, on every attempt.

**Impact:**
- Lesson-capture recordings recovered after an interruption are exactly the assets this toolkit produces. For these, and for any project whose privacy inspection changes after load, the illustrate action can never work.
- The user sees only the generic "Save the video project before capturing a still…" message (`lesson.error`). That is not true for this case, because saving does not help.
- It fails closed: no wrong frame and no wrong source.

**Why the tests missed it:**
- `service.test.ts` hashes the same in-memory object that its fake `readDocument` returns.
- The native fixture called `LessonService` with a synthetic document (`projectId: "lesson-guide-fixture"` in `probe-result.json`), not through `DocumentService`.
- So the claim "actual UI … captures saved playhead" was not shown end to end through the real project read path.

**Suggested fix (any of these):**
- Have the main process hash a canonical form that both sides share, for example `JSON.stringify(documentSchema.parse(...))` on both sides. Or exclude load-time derived fields such as `capturePrivacy` (re-inspection) from the fingerprint.
- Fingerprint the saved file bytes or the `DocumentService` version instead of the re-inspected object, and return that fingerprint to the renderer on load and save.
- Add a regression test that goes through a real `DocumentService` with a recovered-capture asset.

Also consider giving the user a separate "project changed" message.

**Baseline vs new:** new in slice 13. The re-inspection itself is baseline behaviour; the new part is depending on its serialization.

### L13-1 (Low, new): Markdown output turns apostrophes into a visible `&#39;`, and `===`/`---` lines become headings

**What happens:**
- `md = (text) => html(text).replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1")` (`src/lib/lesson/export.ts:8`) HTML-escapes first and then backslash-escapes `#`. So `'` → `&#39;` → `&\#39;`.
- Under CommonMark, `&\#39;` is not a character reference: the backslash makes `#` literal, so the reader shows `&#39;`.
- `=` is not escaped. An instruction line consisting of `===` turns the line above into a setext `<h1>`. `-` is escaped, so `---` is safe.
- Instruction newlines are kept as single `\n`, which Markdown readers join into one paragraph, while the HTML uses `<br>`. The two outputs therefore differ in line structure.

**Repro (probe P2):**
- Title `Don't <panic>` → `# Don&\#39;t &lt;panic&gt;`.
- An instruction line `===` passes through unchanged.
- I could not render this, because no CommonMark renderer is installed in this environment. The result follows the CommonMark rules for backslash escapes, entity references and setext headings.

**Impact:**
- A cosmetic but very common corruption: "don't", "it's" and so on appear in every English lesson. Because the guide document says "Markdown-reader behaviour beyond the tested HTML is unverified", the problem is disclosed in general terms but not this specific defect.
- No injection: `<` and `>` stay entity-escaped.

**Suggested fix:**
- Do not entity-escape `'`/`"` for Markdown, or use `&apos;`/`&quot;` without `#`.
- Escape a leading `=`.
- Emit hard line breaks (`\\\n` or two trailing spaces).

**Baseline vs new:** new in slice 13.

### L13-2 (Low, new): an exported subset keeps the original lesson's `id` and `revision`

**What happens:** `projectLesson` returns `{...valid, steps, assets, extensions: undefined}` (`export.ts:22`). The guide's `lesson.openscreen-lesson.json` therefore has the same `id`/`revision` as the full editable original, with different content.

**Repro (probe P2):** a lesson with two steps at revision 7 is exported with one step. The subset has the same `id`, `revision` 7 and one step.

**Impact:**
- The document describes this file as "independently reopenable". Reopening and editing it continues the original's revision line, so two different lessons can claim the same `(id, revision)`.
- The receipt records the input revision correctly, but the manifest has no marker that it is a derived subset.
- This matters for the roadmap's next "review/query workflow over this same contract".

**Suggested fix:** give the derived manifest a new id with a `derivedFrom {id, revision, stepIds}` field, or document that `(id, revision)` does not identify content.

**Baseline vs new:** new in slice 13.

### Slice 13 Info and nits

- **I13-1:** the visibility check (`service.ts:52-60`) uses `[timelineStartSec, timelineEndSec)` with 1:1 source mapping, but the projection walks `keptRawSpans`, which uses the source-derived extent `timelineStartSec + (sourceEndSec − sourceStartSec)`.
  - If a clip's `timelineEndSec` were ever longer than its source extent, a position in the overhang would pass the check, and the projection would clamp to the next kept span, producing a still from the next clip.
  - Normal clips keep the two equal. Checking against `keptRawSpans` directly would remove the question.
  - For unprobed clips (`sourceEndSec` unset), the check applies trims while the projection ignores them. That direction fails closed.
- **I13-2:** every IPC failure becomes `lesson-operation-failed`, and the UI shows one combined hint. Busy, stale, trimmed, gap, missing media, `EEXIST` on save after a native overwrite confirmation, and an invalid file all look the same.
  - Not exposing exception text is a reasonable privacy choice. Still, "trimmed position" and "save first" need different user actions.
- **I13-3:** the exported `lesson.openscreen-lesson.json` carries the evidence identifiers (`assetId`, `sessionId`, `eventId`, `takeId`, the flag's `atMs`) and each image's `source.projectId`/`documentSha256`.
  - These are random ids and hashes, not personal content, but they correlate the guide with the original project and recording.
  - The privacy string ("Export includes only selected steps and referenced images") does not mention them.
  - Consider stripping evidence from the derived export, or naming it in the inventory.
- **I13-4:** `lessonEvidenceSchema.eventId` allows at most 200 characters, while `typingSectionSchema.id` allows up to 220. A section id of 201–220 characters would make the Draft handler throw.
  - That handler and Add, Title, Move and Remove call `reviseLesson` outside `run()`, so a validation error escapes as an uncaught error with no UI message.
- **I13-5 (accessibility):** `<figcaption>` repeats the `alt` text, so screen readers announce it twice. `lang="en"` is hard-coded whatever the content language. Both are already listed as open (accessible output/profile).
- **I13-6:** the lesson draft is not part of the editor's unsaved-changes guard. Switching projects re-keys the dialog and drops the draft without a prompt, and Open replaces the draft without confirmation. Both are documented ("not autosaved", "Opening another lesson replaces the dialog draft"); there is just no prompt.
- **I13-7:** `openEditable` does `lstat` and then `open`. A same-user swap to a FIFO between the two would block the `open` (no `O_NONBLOCK`), and the regular-file check is not repeated on the open descriptor. Only the same user can do this; noted for completeness.
- **I13-8 (UX nit):** the lesson and step title inputs ignore an empty value, so the last character cannot be deleted in order to retype a title.
- **I13-9:** `captureFrame`'s `getProject` read bumps the `DocumentService` generation, so a concurrent MCP `saveProjectIfUnchanged` refuses. This is the same as any other read, and conservative.

## Validation I ran (independent, outside the checkout)

**Environment:**
- Pinned Node `v22.22.1` (`/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin`) and Vitest 4.1.10.
- The snapshot is `git archive 1bd83d66f6141cf4cbefe59aafbcbd087f98ac3b`, extracted into my session scratchpad.
- `node_modules` is symlinked entry by entry from the checkout (538 entries). `.vite` and `.vite-temp` are excluded and created fresh in the snapshot. Nothing was built or run inside the checkout.

**Results:**
- **Focused, slice 12 and 13 files:**
  - Files: `electron/lesson/service.test.ts`, `electron/ipc/lesson.test.ts`, `src/lib/lesson/lesson.test.ts`, `src/components/ai-edition/v4/LessonGuideDialog.test.tsx`, `electron/integrations/recordingClockBridge.test.ts`, `src/lib/clockBridge/journal.test.ts`.
  - Result: **6 files / 46 tests passed**, 3.30 s.
- **`npx tsc --noEmit`:** exit 0.
- **`npx tsc -p tsconfig.test.json --noEmit`:** exit 0.
- **Full suite (`npx vitest --run`) on the snapshot without my probes:** **415 files passed; 5,494 tests passed, 1 skipped (5,495)**, 51.02 s, exit 0. The one skip is a conditional environment skip and is expected: the snapshot lacks the untracked `crates/thirdparty` FFmpeg, which gates for example `electron/stt/extractAudio.integration.test.ts` `describe.skipIf(!ffmpegAvailable)`. I did not identify the skipped test individually. The total of 5,495 equals the implementer's count (5,495 passed); their environment had FFmpeg available.
- **Probes** were scratch-only test files in the snapshot, moved out before the full run:
  - **P1 (`electron/review10/p1-digest.test.ts`):** the real `DocumentService` → `LessonService` digest round trip described in M13-1. 2/2 ran: the plain case matches; the recovered case mismatches and capture is refused.
  - **P2 (`src/review10/p2-export.test.ts`):** Markdown/HTML escaping (L13-1), subset identity (L13-2) and JPEG-validator edge cases. A 4-byte SOI/EOI file gives "JPEG dimensions unavailable"; a truncated segment gives "Invalid JPEG segment". No `<script` appears in the HTML.
- **Artifact checks:**
  - `sha256sum electron/native/bin/linux-x64/compositor_view.node` = `a66dbe748a1d8129292e6099cd34ed875bf5ef17eddad5cf082541831e72f446`, matching the claim.
  - In `lesson-guide-native-fixture-final/lesson-e9efb574-…/`, all four inventory SHA-256 values match `export-report.json`. Files and directories are `0600`/`0700`.
  - The guide manifest has no `extensions`. `browser-validation.json` shows `scriptCount 0`, `externalRequests []`, `offline true`, `visibleDesktop false`.
  - Slice 13 changes no file under `crates/` or `electron/native/`, so the "no new native code" claim holds.

**Implementer claims I did not rerun:**
- Biome/lint 35, i18n 1197, Vite renderer/main/preload builds and docs/diff checks: their logs exist in the evaluation folder; I did not run them.
- The real Vulkan RTX 4070 compositor frame and the Chromium `file://` run: I read their artifacts and did not repeat them, as the brief says.
- Rust 134 passed / 1 ignored: not rerun; Rust sources and helpers are unchanged in both ranges.

## Limits

- **Read-only, headless review.** Not done: visible Electron, Godot editor UI, OS keyboard, focus, accessibility, portal, physical capture/input/timing, Windows/macOS, sustained or large guides, and privacy review of real footage. None of these is implied by the results above.
- **No native rebuild or new native frame.** The compositor path was reviewed statically and through the implementer's fixture.
- **Not tried:** M13-1 with a real lesson-capture `bound` receipt or binding, which would need a real recorded capture. Nested receipt key order could make more cases mismatch.
- **Markdown (L13-1)** was assessed against the CommonMark rules, not rendered; no renderer is installed here.
- **Godot slice-12 behaviour** was checked by reading the code and the implementer's fixture. I did not run Godot.
