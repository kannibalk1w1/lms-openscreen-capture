# Independent review: Godot checkpoint comparison — 5055a279 vs bda9f8d2

- Reviewed HEAD: `5055a2797214cd04f1210485af089af0cf2fe4ea`. Base: accepted `bda9f8d2`.
- Scope:
  - `godotScene.ts`: the private `decodeGodotSceneJournal`, used by `parseGodotSceneJournal`, `listGodotSceneCheckpoints` and `compareGodotSceneCheckpoints`;
  - `GodotCheckpointComparison.tsx`;
  - the source gating, key and forget handling in `ApplicationCaptureReview.tsx`;
  - the locale keys, tests and documentation.
- Excluded: the parked player, older history, and `/tmp/godot-checkpoint-file-tools-prototype`.
- Reviewer: Claude (Opus 5.5), Orca task `task_e14b61c1bb01`. Read-only; `git status` was clean. Probes used an esbuild bundle of HEAD (built from stdin) in `/tmp/claude-cmp-5055a279/` on the retained real Godot 4.7.1 Linux and WinBoat journals from `godot-checkpoint-unicode-2026-11-10`.

## Verdict: ACCEPT

No blocking or Low findings.

## Independent evidence

### Real journals, Linux and Windows (`p.cjs`, `p2.cjs`)
- Both list the same 4 markers: records 1, 6, 7 and 13, with snapshots 0, 5, 5 and 11. This includes the Unicode-surrounded label.

| Comparison | Result |
|---|---|
| 1→6 | Slime added |
| 6→13 and 7→13 | Container added, Slime removed |
| 1→13 | Container added |
| 13→1 | Container removed |
| 6→7 (same snapshot) | all zero |

**Refusals:**

| Input | Error |
|---|---|
| same record | "Choose two distinct…" |
| record 0 (the header, not a marker) | "not an authored scene checkpoint" |
| 4000 (beyond the records) | "not an authored scene checkpoint" |
| 4096 | refused |
| `NaN` | refused |
| 1.5 | refused |
| session tampered in the last record before the footer (after all markers) | whole-journal error |
| a normalized capture | refused |

The public importer is unchanged: 15 observations.

**Output contents:** the top-level keys are only `from, to, counts, added, removed, changed` (plus `selection` when it changes). There are no `res://` paths, coordinates or other values, only names, types, IDs and field names.

### Synthetic changed-state cases on the real Linux journal (`p3.cjs`)
I added a valid snapshot and marker after record 6.
- Moving the position, setting texture to `null`, renaming and selecting gives `changed: [{nameBefore "Slime", nameAfter "Slime2", fields ["name","position","texture"]}]` plus `selection: {before: [], after: [id]}`, with no values leaked.
- Removing `texture` entirely (versus a path) is reported as `texture` changed, so absent is kept distinct from `null`.
- Pointing at the unchanged snapshot reports nothing.

The real journals never contain a same-node field change between markers, so this path is covered only by these synthetic cases and the unit tests.

### UI (code read and focused tests)
- **When it appears:** only for an adapter `godot-scene` whose source is not a normalized JSON object, and only when `listGodotSceneCheckpoints` succeeds with at least 2 markers.
- **Holding the raw text:** the parent keeps it in state. Load and forget clear it, and `key={import epoch}` resets choices and results on each import.
- **Choices:** neither select has a default. Changing either clears the result and error. Compare is disabled for the same marker, and options show label · record · ms.
- **Display:** the result is in an `aria-live` section with a bounded scrolling area.
- **No new authority:** no persistence, export, append or project access. Comparison is synchronous, so there is no stale async path.
- Focused vitest: **57 passed / 5 files** (`godotScene.checkpoint`, `godotScene`, `GodotCheckpointComparison`, `ApplicationCaptureReview.checkpoints`, `ApplicationCaptureReview`).

### Retained artifacts
- `node-linux-final` and `node-windows-final` report: linux and win32, Node v22.22.1, 20/20 checks, scoped to "no project restoration/runtime claims".
- `browser-final/report.json`: Win32 Edge 156.0.4314.58, 16/16 checks, save-IPC stub only.
- All 27 entries in `SOURCE_SHA256.json` match `git show HEAD:<path>` exactly (0 mismatches).

## Informational (no change required)
- **I1. Untranslated option text:** the option text in `GodotCheckpointComparison.tsx:36` (`"record #… · … ms"`) is hard-coded English and not an i18n key. It is cosmetic.
- **I2. It compares end states, not what happened between:** two snapshots are compared, so an A→B→A edit between markers shows "no change". The scope text says "sampled changes only" and disclaims proof. Wording such as "net difference between the two snapshots" would be more precise.
- **I3. Large journals decode twice:** an 8 MiB raw journal is decoded once by the importer and again by `listGodotSceneCheckpoints` on load, and again on every Compare click, synchronously. That is acceptable at current bounds but could cause a noticeable pause on large journals.
- **I4. Markers beyond a truncated review still appear:** checkpoints come from the raw records. When the normalized review is truncated at the prefix limit, markers beyond it still appear in the comparison list but not among the observations. That fits "raw-validated" and is not wrong, but the docs might note it.

## Limits
- No full suite, build or tsc rerun; I relied on root's 6512/478 and green final tsc/build report. The equivalent property-presence expression is covered by my synthetic absent-versus-null probe.
- I did not run the Windows Node probe, Edge or the VM myself. The browser screenshot is not visual QA, and there is no physical input, packaged Electron or project-run claim.
