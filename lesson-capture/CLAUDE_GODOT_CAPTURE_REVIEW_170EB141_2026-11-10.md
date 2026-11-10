# Independent review: Godot capture slices — HEAD 170eb141

- Reviewed HEAD: `170eb141b617d02b71daba7cb0a9c315e3d6f4f5` (feature `lesson-capture/input-boundaries`)
- Base: `a113504064b9df5cd909380ba522039158223a83`. Commits reviewed: `c5eb2145` and `170eb141`.
- Not reviewed: the parked player additions below a1135040.
- Reviewer: Claude (Opus 5.5), Orca task `task_9539167b9d44`. This was a read-only review. `git status` was clean before and after.
- Process note: I copied one probe entry file into the repo root by mistake (`.claude-review-entry.tmp.ts`, untracked). I deleted it within seconds, before any build or test, and the tree was confirmed clean. No other repo, git, VM or process state was touched.

## Verdict: REQUEST CHANGES (small)

The producer, decoder, normalized format, privacy scoping and evidence claims hold up under independent checks. One Medium UI integration defect should be fixed before acceptance (F1). F2 and F3 are bounded-input consistency gaps between layers. Everything else is informational.

## Findings

### F1 — Medium — Appending observation drafts resets the author's step inclusion, filters and in-flight work
`src/components/ai-edition/v4/LessonGuideDialog.tsx:393-400` passes `onAppend` to `replaceLesson(next)` (`:90-96`). `replaceLesson` is the open/restore path. It:
- sets `selected` to **every** step (`:94`), so steps the author had excluded from output are included again without notice;
- clears the review query (`:95`);
- calls `stopExport("stale")` and increments `generation` (`:91-92`). That invalidates any in-flight `run` (the `current()` check at `:218-219`) and remounts every `LessonRangeControls`, because their key includes `generation.current` (`:611`).

The existing append paths (Add step, Draft from document, `:281-301`) use `author(...)` plus `setSelected([...active, ...newIds])`. They keep the prior selection and only add the new steps.

Repro: open a lesson with 3 steps, untick "include" on step 2, then append one observation draft. All 4 steps are now included and step 2 is back in the output.

Fix: follow the existing append idiom, i.e. `author(() => next)` (or equivalent) plus `setSelected([...active, ...appendedIds])` and `setQuery(emptyLessonQuery())`. The `ApplicationCaptureReview` tests do not catch this because they mock `onAppend`.

### F2 — Low/Medium — The decoder hard-rejects journals the producer writes within its own bounds
`src/lib/applicationIntegrations/godotScene.ts:153` throws `"Too many scene observations"` at 10,000 observations. The producer (`scene_capture.gd`) bounds records (4096) and bytes (8 MiB) but not the diff count. Each sample can therefore produce up to 512 appear/disappear/change observations.

Repro (`/tmp/claude-review-170eb141/probe.cjs`, using the bundled production decoder): a schema-valid journal of 46 records and 856,367 bytes, with 22 cycles of delete-then-undo on 255 child nodes, gives `REJECT: Too many scene observations`. The whole take becomes unimportable instead of being treated as `limited`. The UI only shows the generic "invalid" message.

Related: diffs can be larger than the journal, because a node-changed observation stores both before and after. A journal far below 8 MiB can therefore exceed the 8 MiB normalized-capture cap in `validateApplicationCapture`. Probe 2 (741 KB journal) normalized to 2.6 MB, below the cap, so this path is plausible but I did not demonstrate it.

Options:
- truncate to `limited` coverage at the cap;
- add a matching producer-side bound;
- at minimum, document the limit and give a specific error.

### F3 — Low — The normalized format accepts identities the lesson schema rejects
`capture.ts:242` allows `instanceId` up to 200 characters. `schema.ts` `application.instanceId` allows at most 100.

Repro (`probe2.cjs`): a normalized capture with a 150-character `instanceId` imports and reviews fine, then `appendApplicationDrafts` throws a zod `too_big` error. The author sees only "failed".

All other cross-limits I checked agree: adapterId (100), type (100), payload (32 KiB), label/title (300), scope (1000), and instructions at maximum scope and label (append and reopen OK). The fix is to align the two maxima, or validate at import. Godot's own IDs are 32 hex characters, so only third-party or crafted captures are affected.

### Informational (no change required)
- **I1. Editor-wide `tree_changed`:** `scene_capture.gd:114-115` connects to the editor's whole `SceneTree.tree_changed`, which also fires for editor UI nodes such as popups and tooltips. Any editor UI churn re-samples (snapshot plus stringify of up to 512 nodes) at up to 20 Hz, and labels the sample `samplingTrigger: "tree"`. The cost is bounded and writes happen only on change. The docs already state the trigger is contextual and not causal, so this is just worth knowing.
- **I2. Save As keeps the old scope label:** after Save As (including the first save of an unsaved scene), capture continues because root identity is unchanged. The normalized `scope` keeps the start value, for example `built-in-or-unsaved`; only the `scene-saved` record carries the new path. Identity is correct; only the draft label is stale.
- **I3. Misleading internal error for one-line journals:** a header-only journal (the footer-failure fixture) is one valid JSON line, so `importCapture.ts` reports "Unsupported application capture format" rather than a journal error. It is still correctly rejected, and the UI shows a generic message.
- **I4. Deep nesting is rejected safely:** a pathologically nested normalized payload (200k levels) is rejected with a `RangeError` in about 90 ms, which the UI catches. It does not hang and is not accepted.

## Verified as sound (code read)
- **Scoping:** `_collect` excludes nodes not owned by the edited root, which covers instanced-scene internals and editable children. Selection is filtered to collected IDs. The Inspector trigger checks root/owned-descendant plus a property allowlist. Resource paths allow only `res://` with no `.`/`..` segments, backslashes or C0/C1 control characters, and the decoder mirrors these rules exactly (UTF-16 lengths 200/1000 match).
- **Lifecycle:**
  - begin refuses an existing file, a non-current root and an oversized start scene before creating the file;
  - observers connect only after a successful header write;
  - stop, scope change, disable and write failure all disconnect observers;
  - recursive limit-stop inside stop/sample/write terminates cleanly with one footer and no writes after stop;
  - a scene switch between the confirm dialog and the file picker is refused by begin's current-root check.
- **Limits:** the writer reserves 1 KiB and one record for the footer, so the maximum is 4096 records / 8 MiB. Decoder bounds match (sequence ≤ 4095, ≤ 4096 lines, ≤ 8 MiB).
- **Decoder integrity:** contiguous sequence, the same session and instance on every record, monotonic `atMs`, header at 0 ms, footer last, lifecycle records never mid-stream, root identity fixed, type-change identity reuse rejected, parent-before-child hierarchy, depth ≤ 64, unique selection IDs drawn from the nodes, and `limit` ⇒ `limited`.
- **UI async:** epoch guard on load and unmount, `key={projectId:lesson.id}` reset, React-escaped rendering of untrusted labels and payloads, and selection capped by remaining step capacity.
- **Timing:** observations remain `clock: "unmapped"`. Draft text says "independent application clock" and "sampled", and nothing claims causality or video time.

## Independent checks run
1. Bundled the production TS modules with the repo's esbuild into `/tmp/claude-review-170eb141/` and ran probes with pinned Node 22.22.1 (`probe.cjs`, `probe2.cjs`, `probe3.cjs`, `probe4.cjs`).
2. **Re-decoded the retained real evidence** (WinBoat `windows/evidence-run-2/godot-scene-probe-Al7OpQ` and Linux `godot-scene-probe-eBCnXy`) with HEAD's decoder:

   | Journal | Records | Bytes | Observations | Result |
   |---|---:|---:|---:|---|
   | scene | 10 | 4875 / 4874 | 11 | stops with `scene-changed` |
   | record-limit | 4096 | 1,659,760 / 1,658,663 | 4094 | `limited` |
   | byte-limit | 57 | 8,248,709 / 8,248,708 | 55 | `limited` |
   | disable | 2 | — | — | `plugin-disabled` |
   | footer-failure | — | — | — | rejected |

   Notes on the re-decode:
   - All of this matches the doc's tables.
   - No CRLF appeared in the Windows journals.
   - A fresh decode equals the retained `normalized-capture.json` exactly.
   - Each `lesson.json` reopens with the HEAD schema, and its evidence `eventId` `4:3`, session and payload match the fresh decode.
3. The `openscreen_typing` addon copies in both evidence fixtures (`scene_capture.gd`, `plugin.gd`, `plugin.cfg`, `observer.gd`, `clock_client.gd`) are byte-identical to HEAD after CRLF normalization. `addons/probe/` is a separate test plugin.
4. `windows-report.json` describes itself as "headless real Windows editor APIs and injected signals; no physical UI/capture acceptance", with Godot 4.7.1 and Node 22.22.1 SHA256 values matching the doc. The doc's limits section does not overclaim.
5. Focused vitest: **50 passed / 5 files** (`src/lib/applicationIntegrations`, `sceneDraft.test.ts`, `ApplicationCaptureReview.test.tsx`).

## Skipped or limits
- No full suite, tsc, lint, build or CLI/MCP smoke. The diff does not touch `registerIpcHandlers` or CLI/MCP bootstrap, and root reports those as passing. I did not repeat them.
- No live Godot editor run of my own and no WinBoat access. Windows acceptance here means re-validating the retained API/headless artifacts, **not** physical Windows input, video or audio acceptance. None is claimed.
- I did not exercise F1 in a rendered dialog. It is established by reading the code paths (`:90-96`, `:393-400` and `:281-301`).
- The `scripts/probe-godot-scene.*` probe runners and the documentation prose were only skimmed.
