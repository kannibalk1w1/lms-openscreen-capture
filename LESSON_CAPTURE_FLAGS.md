# Recording flags and a separate timeline row

Restart the development app to load the rebuilt main process, preload and editor.

- **Ctrl+Shift+F** (Cmd+Shift+F on macOS) drops a silent flag during capture even
  while another application has focus, subject to desktop shortcut availability.
  Change **Add Flag** in Keyboard Shortcuts to choose another binding.
- The recording HUD has a flag button and count. A failed registration says
  **No hotkey** and keeps the button available. On Wayland, **Hotkey requested**
  remains until an actual shortcut callback is observed; allow the desktop's
  shortcut request and try the key. A portal request is not proof of approval.
- Pause time is excluded. Flags are ignored while paused or stopping, and rapid
  duplicate requests within 300 ms are coalesced. Cancel/restart discards the old
  take's flags. The clock starts when capture is reported running (at the browser
  start signal on that backend), so these are human review cues, not frame-accurate
  audio synchronisation measurements. No clap sound or video overlay is inserted.
- In the editor, the same hotkey or the flag toolbar button marks the playhead.
  The **Flags** row is separate from annotation, trim and audio lanes. Click a flag
  to seek and open its label; rename it and press Enter or leave the field. Remove
  it from that popover, or focus its button and press Delete/Backspace. Edits use
  normal undo history. At the film's final boundary, a flag attaches just inside
  the last clip. Empty timeline gaps have no source moment and cannot take a flag.

## Persistence and source mapping

Capture flags are written to `<video>.flags.json` when the recording is stored.
Import embeds them on the source asset in the project; reopening the saved project
no longer needs the sidecar. Keep the sidecar beside an unimported recording when
moving it. Legacy CLI packing copies it beside the video, as for cursor/event
sidecars. Existing saved projects without embedded flags are not automatically
backfilled; newly importing their original take reads the sidecar.

Flags use source milliseconds, so moving/reordering/splitting a clip keeps its
flags attached to the footage. A split point belongs to the right-hand clip once.
Repeating source footage repeats its source flags; renaming/removing one edits
that source flag across placements. Flags outside a clip's source window are
hidden. The ruler keeps trimmed-out time visible, so flags there remain available
for review; speed edits retain the same raw ruler position. Flags do not enter
rendered preview frames, MP4 or GIF output. Clear edit regions leaves source flags
intact; deleting a source asset removes its flags with it.

The Electron global shortcut/accelerator code is reused, with a monotonic clock,
pause compaction, best-effort sidecar storage and validated import. A flag-save
failure notifies the HUD without failing the video. Full recovery after a process
crash before finalization is not implemented.

Wayland enables `GlobalShortcutsPortal` as required by the pinned
[Electron 41 documentation](https://github.com/electron/electron/blob/v41.2.1/docs/api/global-shortcut.md).
That version's [portal shortcut implementation](https://github.com/electron/electron/blob/v41.2.1/shell/browser/api/electron_api_global_shortcut.cc)
can retain callbacks after `unregister`. Old bindings are guarded after a rebind;
an inactive current binding routes only to a focused editor, respecting text
fields and modal dialogs. The desktop may retain the key reservation until app
exit. OS approval and actual key delivery require a real desktop check.

## Validation — 5 November 2026

Full Vitest: **5,255 tests / 386 files pass**. Both TypeScript configurations,
Vite build, i18n and Biome pass (35 pre-existing warnings). A final targeted
recording-manager recheck also passes after allowing inactive portal callbacks to
reach the editor even when a cancelled browser take has no file to finalize.

Focused tests cover recording clock/pause/cancellation, unavailable and pending
portal shortcuts, retired portal callbacks, sidecar validation, actual document
import/reopen without its sidecar, packaging, source/ruler mappings across splits
and duplicates, last-boundary insertion, editor hotkey/repeat/text-field handling,
HUD fallback/count and flag seek/rename/remove controls. The undo audit explicitly
classifies flag edits as user gestures.

An isolated Chromium harness drives the real flag row and HUD control in light
and dark themes, including seek, rename, add and remove. Its recording IPC is a
fixture, so it verifies interface behaviour, not OS capture or global hotkeys.
Artifacts: `../openscreen-evaluation/recording-flags/`.

Not exercised: actual OS hotkey delivery while recording in another application,
real recording pause alignment at frame boundaries, desktop portal approval,
Windows/macOS runtime, every speed/cut/undo combination, crash recovery and the
remaining manual capture checklist. Orca's provider exposed no screenshots or
hotkeys and discovered only an unrelated terminal during this pass. Native helper
and compositor code did not change in this slice; no native rebuild is required.

Next roadmap slice: actual text/edit capture grouped into editable typing sections;
portable typing JSON/text exports follow. New locale strings use English fallback.
