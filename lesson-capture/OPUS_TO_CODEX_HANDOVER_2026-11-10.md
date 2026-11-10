# Opus to Codex handover — 10 November 2026

**Writer:** Claude Opus 5.5 (`claude-opus-5-5`), the sole implementation writer since `139b9046`.
Claude and Fable work stop with this handover. Root Codex takes over all implementation, review
coordination and pushes. The detailed per-slice record is
[OPUS_SESSION_HANDOFF_2026-11-10.md](OPUS_SESSION_HANDOFF_2026-11-10.md).

## Repository state at handover

| Item | Value |
| --- | --- |
| Branch | `lesson-capture/input-boundaries` |
| HEAD before this handover commit | `f5b89b6c5eb1ca72457d4fe5c512834c9c5909d8`, clean tree |
| Private feature ref (`private/lesson-capture/input-boundaries`) | `e3c00e0e`, root checkpoint, independently accepted, pushed |
| Main and private main | `fd2775e2dbc540306b46085eb0301fa06a6a3aaa`, unchanged |
| Local commits not pushed | `1215af69`, `f5b89b6c`, and this handover commit |
| Addon `compositor_view.node` | SHA256 `5d16ea98…`, unchanged |
| External LMS workflow report | SHA256 `f87c9eb7…`, unchanged |

## What is accepted, and what is not

**Accepted by independent review and pushed (through `e3c00e0e`):**

| Commits | What | Review |
| --- | --- | --- |
| `e3701396`, `7636185d`, `90116cae`, `0c73895b`, `3e3785da` | Editor-only Lesson guide routes; GUI package-create rejects duplicate steps; lifecycle tests; parented dialogs; same-file save and open lifetime fixes R1/R2 | [OPUS_INDEPENDENT_REVIEW](OPUS_INDEPENDENT_REVIEW_2026-11-10.md) → [lifetime fix review](OPUS_LIFETIME_FIX_INDEPENDENT_REVIEW_2026-11-10.md) |
| `cabaf30e` | L1: no stale new-copy picker | [offline-player review](OFFLINE_PLAYER_INDEPENDENT_REVIEW_2026-11-10.md) |
| `82f69ca0`, `71546046`, `e2e31d32` (+ docs `43b18c70`, `5a304a4b`, `1dd36bc8`) | Read-only offline player (D3(b)), MP1 media-after-release fix, MP2 close/cancel lifetime fix (no waiting opens) | [lifetime-fix recheck](OFFLINE_PLAYER_LIFETIME_FIX_REVIEW_2026-11-10.md) → [MP2 continuation review](OFFLINE_PLAYER_MP2_CONTINUATION_REVIEW_2026-11-10.md): MP1, MP2, DOC1 closed |

**NOT reviewed (local only):** `1215af69`, which adds player loop, keyboard shortcuts and
explicitly saved places, and its documentation commit `f5b89b6c`. An independent review of them
was started and **interrupted with no completed result. They have no acceptance.** The status in
the roadmap and session handoff is "self-tested, not independently reviewed".

## The unreviewed slice (`1215af69`), in short

- **Loop:** a toggle, kept across steps; step changes never autoplay.
- **Keyboard:** single-key shortcuts N/P/K/R/L/[ ]. They are refused with Ctrl/Alt/Cmd, in
  fields, the speed list, editable content and the native video.
- **Saved places:**
  - Save, Restore, Clear and Clear all write or remove only on those clicks.
  - The store is `userData/lesson-player-progress/progress.json`, separate from the authoring
    recovery store.
  - Each record is `{fingerprint, stepId, timeSec, speed, loop}`. The fingerprint is the digest
    of the verified manifest, so a resealed or rebuilt package restores nothing.
  - Store file rules: a 0700 directory refused if linked, no-follow bounded reads, a strict
    schema, an atomic 0600 write, and at most 100 places, refused when full and never pruned.
  - Corrupt data is refused, never repaired; only Clear all removes it.
  - IPC: exact player page, the open package's token, per-window busy refusal, and a ticket
    (capability plus epoch) checked after reading and right before writing.
- **Self-tested evidence:**
  - Full suite 6,411 / 465 files pass, 0 skipped, at `1215af69`. Both `tsc`, lint (35 baseline
    warnings), i18n and docs pass. Vite and the required foreign-directory startup smoke pass.
  - 11 targeted mutants, all killed by assertions and restored.
  - A real production-app probe on a moved, CLI-verified package and a real resealed package,
    using CDP key events and a stubbed folder dialog only.
- **Review focus suggested:**
  - races between several windows on one package (the last explicit action wins);
  - honest reporting of a save already committed after its window closed;
  - store edge cases: corrupt, linked, full;
  - whether the plain-key shortcut set is acceptable;
  - the privacy wording in the UI.

## Evidence locations (all under `../openscreen-evaluation/`)

- **Retained reviewer evidence:**
  - `opus-independent-review-2026-11-10-retained/`
  - `opus-lifetime-fix-review-2026-11-10-retained/`
  - `offline-player-review-2026-11-10-retained/`
  - `player-lifetime-recheck-2026-11-10-retained/`
- **Opus probes, smokes, mutants and full-suite logs:**
  - `opus-sole-writer-2026-11-10/`
  - `opus-r1-r2-fix-2026-11-10/`
  - `opus-player-2026-11-10/`
  - `opus-player-mp1-mp2-fix-2026-11-10/`
  - `opus-player-mp2-recheck-fix-2026-11-10/`
  - `opus-player-loop-keys-places-2026-11-10/` (the unreviewed slice)

## Known limits (all slices)

- Everything is Linux-only: Xvfb, DOM/CDP and stubbed native dialogs. There is no physical
  picker, keyboard-only person, screen reader, audio, Windows/macOS or real-lesson acceptance.
- The player shows only verified v1 packages. Bytes Chromium has already buffered can still play
  after a release; no new bytes are served.
- An open requested right after Close or Cancel is refused as busy until the earlier one
  settles.
- A renderer reload or crash still loses unsaved Lesson guide work (L42-2). Authoring recovery
  stays manual.

## Owner decisions still open (roadmap D-table)

- **D1:** automatic recovery of Lesson guide work. Default: manual only.
- **D2:** Windows hardware for H1.
- **D4:** GIF, PNG or 1920 px outputs. Default: MP4 at 1280 px.
- **D5:** translations. Default: English fallback.
- **D6:** package verification depth.
- **D7:** same-file save mode 0600.

D3(b), read-only inspection and playback without a project, is decided. D3(c) and automatic
progress or recovery are not approved.

## Prioritised next actions for root Codex

1. Independently review `1215af69`/`f5b89b6c`. Fix any findings before any push of them.
2. Decide on a private push of the reviewed slice.
3. Run a human accessibility and real-hardware learner pass of the player: real picker, keyboard
   only, Orca.
4. Captions, which need package v2 acceptance (inventory-listed WebVTT, the transcript-to-step
   mapping, author review).
5. A standalone player, which needs a new guide-contract version and a `file://` browser-trial
   decision.
6. H1 Windows run, and the specification's Enemy pilot, when hardware and a person are
   available.

## Quota and process state

- **Quota:** in this final window no quota or usage-limit error occurred. Earlier, the
  coordinator reported a 5-hour limit with reset at 1:30pm Europe/London and authorised
  continuation. Fable's earlier limits are recorded in
  [FABLE_TO_OPUS_HANDOVER_2026-11-10.md](FABLE_TO_OPUS_HANDOVER_2026-11-10.md).
- **Processes:** no owned Electron, Xvfb, Vitest or probe processes remain; this was checked at
  handover. The Fable subagent was stopped before `139b9046` and has not run since. No helper
  workers exist.
- **Scratch:** scratch files are in the session scratchpad only; everything needed is copied
  under `../openscreen-evaluation/` above.
