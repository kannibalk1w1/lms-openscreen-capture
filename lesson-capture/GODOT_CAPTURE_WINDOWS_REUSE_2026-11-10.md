# Godot capture, Windows and reuse — 10 November 2026

Root Codex implementation on parent `c5eb2145`. The owner requested continued
Godot capture work, WinBoat Windows testing, and a reusable path for programs such
as MCreator and Roblox Studio. No delegated agents or independent review are claimed.
The player remains parked. This is a local checkpoint, not a push/release.

## Delivered

- Signal-assisted current-scene sampling: public scene-tree/selection/Inspector
  signals request observations with 50 ms minimum spacing; 250 ms fallback polling
  remains. Inspector requests use the current-root/owned-descendant and property
  allowlist. Observers connect only after explicit start and disconnect on scope
  change, stop, disable or write failure. `samplingTrigger` is contextual evidence,
  not proof of a causal editor command or every intermediate action.
- A strict **application-neutral offline capture format**, separated from Godot's
  raw scene decoder. Shared review, selected draft creation, bounded lesson evidence
  and save/reopen consume that format. Existing Godot journals remain importable.
- The same controls import normalized non-Godot evidence. A synthetic fixture
  proves this path without installing another program. No real MCreator/Roblox
  adapter is built or claimed supported. See [the contract and adapter recipe](APPLICATION_CAPTURE_CONTRACT.md).
- Windows PowerShell runner and a portable host-bundled production decoder/authoring
  probe. Tests use new temporary directories with spaces and a self-contained
  Godot editor, preserving the user's installed settings and real lesson projects.

## Windows proof through WinBoat

Used the existing running WinBoat VM and its configured SSH test account. No VM
reconfiguration, account/policy changes or application installation occurred.
Portable Godot/Node archives came from their
[official Godot release](https://github.com/godotengine/godot-builds/releases/tag/4.7.1-stable)
and [Node release checksums](https://nodejs.org/dist/v22.22.1/SHASUMS256.txt);
Godot's GitHub asset SHA256 and Node's SHASUMS256 matched before transfer. Godot self-contained
mode was enabled only beside the disposable portable executable.

| Component | Actual version |
| --- | --- |
| Guest | Windows 11, NT build 26200 |
| PowerShell | 5.1.26100.6584 |
| Godot | 4.7.1.stable.official.a13da4feb |
| Node | v22.22.1 |

The successful run used **Godot's main executable**, with its stdout/stderr captured
by the probe. The first console-wrapper run timed out and is retained as a failed
attempt; its cause is not established. Both binaries subsequently answered version
probes. Do not treat the failed attempt as acceptance evidence.

Successful guest root:
`C:\Users\kannibalkiwi\AppData\Local\Temp\OpenScreen Godot Capture 111d0ec64a3e437d8075f7c8330b9c73`

Successful fixture: `evidence-run-2\godot-scene-probe-Al7OpQ` beneath that root.
The raw 10-record journal decodes into 11 observations. The real Windows editor
and API-driven fixture exercise node creation/rename, transforms, script/texture
assignment, selection, reparenting, removal and save. A short selection reaches
sampling before 250 ms; an injected EditorInspector signal yields an Inspector-
triggered snapshot. Actual signal disconnection is asserted after scope closure.

Scene switch and plugin disable end capture; existing output refusal and no
post-stop writes pass. Private metadata, script-text and other-scene canaries are
absent from the take. Oversized starting scenes are refused before file creation.
Record and byte caps produce accepted `limited` footers:

| Writer bound | Windows records | Windows bytes |
| --- | ---: | ---: |
| Record budget | 4,096 | 1,659,760 |
| Byte budget | 57 | 8,248,709 |

The production decoder accepts these files after Godot exits, rejects a simulated
footer-failure journal, normalizes the evidence and creates/reopens a selected
one-step lesson on Windows with no Godot process needed. Those same Windows raw,
normalized and lesson files were retrieved and **reopened on Linux**, preserving
the session identity, 11 observations and selected draft evidence.

Windows main executable SHA256:
`323f9c4cc5db674e98815cdd8e69da007d5efc779abedc8c0e42883b7fdea12a`

Node executable SHA256:
`923a41f268ab49ede2e3363fbdd9e790609e385c6f3ca880b4ee9a56a8133e5a`

## Linux and regression checks

- Final real Godot 4.7.1 editor probe: `/tmp/godot-scene-probe-eBCnXy`.
  10 records → 11 observations, rapid selection/Inspector paths, scoped teardown,
  privacy/limits/footer failure and portable selected authoring pass.
- Linux record cap: 4,096 records / 1,658,663 bytes. Byte cap: 57 / 8,248,708 bytes.
- An initial assertion while reading the open journal failed, although the
  retained closed file contains the expected selection. Its timing/read cause was
  not isolated. The corrected probe awaits the completed editor frame, checks the
  writer sequence, and validates signal metadata from the closed journal; it does
  not loosen the requirement for a selection observation before fallback polling.
- Focused tests: **57 pass / 5 files**, including generic import/review/draft and
  existing lesson guide regressions.
- Full suite: **6,443 pass / 469 files**, 161.34 seconds, pinned Node/npm, four workers,
  required local child-process/socket access. No unrelated test timeouts changed.
- Application and test TypeScript checks pass. Production Vite build passes.
- Lint passes with 35 existing warnings; i18n validates 15 catalogs (English fallback
  copy for new UI text); docs check passes for its 37 tracked documentation targets.
- Real production CLI/MCP startup smoke passes, including SDK initialize/listTools
  and foreign-cwd CLI registration/runner to its expected missing-project error.
  This is startup coverage, not media capture/export acceptance.

## Limits, artifacts and next task

Windows proof is **headless editor/API and injected-signal coverage**, not physical
mouse/Inspector/file-picker input, a restricted learner account, screen-reader
acceptance, WGC video/audio capture, a complete Windows app build or release.
Linux's dummy renderer thumbnail warning on save remains outside this proof.
Clock relation remains `unmapped`; no pause synchronization or automatic encoder
alignment is claimed. The non-atomic FileAccess new-path limitation remains as
previously documented. The neutral format is data, not a plugin loader or live
monitoring grant.

Raw Windows attempts, fixture/addon copies, Linux journals, decoded evidence,
portable lesson files, official download metadata, startup logs, test logs and
hashes are retained outside the repo at
`../openscreen-evaluation/godot-capture-windows-reuse-2026-11-10/`.
Original temporary guest/host folders remain intact for continued testing.

Next: explicit application-neutral semantic-to-recording association, with native
capture/interval identity, pause/gap handling and review. Checkpoint comparison,
run/error diagnostics and physical Windows capture remain later acceptance work.
