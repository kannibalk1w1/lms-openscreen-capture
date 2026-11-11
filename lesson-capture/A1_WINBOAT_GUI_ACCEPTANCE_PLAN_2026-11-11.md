# A1 — WinBoat Windows GUI acceptance plan (prepared, not yet run) — 11 November 2026

The coordinator chose **A1**: physical-style GUI acceptance in the WinBoat Windows 11 VM only,
on an owned disposable Godot project with the portable Godot 4.7.1 profile. It does not use
the owner's live KDE apps, real lesson projects or other VM work. Live-KDE testing (A2) stays
deferred.

## Why it has not run yet

Observed on 11 November 2026, read-only over the existing SSH alias:

- The guest has **no interactive user session**: `query user` lists nobody, and only
  `winlogon` is present in session 1, with no `explorer`.
- No WinBoat viewer window is open on the host.
- `orca computer list-apps` returns no apps, so computer-use cannot see a window.

There is therefore no Windows desktop to drive. Starting or logging into a WinBoat desktop
session, and keeping hands off while it is driven, are the owner's to do. Until then this
coverage is **unavailable**, not passed.

## Prepared materials

- **Guest project:** a disposable project in the owned guest temp root, `A1 GUI acceptance
  project`. It has the OpenScreen addon enabled, `enemy.tscn`, `main.tscn` (the main scene)
  and `hitbox.gd`, and contains no real lesson content.
- **Host files:** `/tmp/a1-gui-acceptance/` holds the project zip, the bundled production
  decoder (`verify/decoder.cjs`) and `verify/verify.cjs`. The verifier decodes the retrieved
  journal offline and checks the expectations below. A dry run against an API-probe journal
  correctly fails the GUI-only expectations.

## Procedure (once a WinBoat desktop window is visible and the owner is hands-off)

1. Confirm `orca computer list-apps` shows the WinBoat window. Take exclusive ownership of
   that one window, and stop if the owner's input or another window appears.
2. In the guest, start the portable Godot (`godot\` with its `_sc_` marker) on the
   disposable project, with no other editor settings changed.
3. Through the WinBoat window, using real clicks and keys on the remote desktop:
   1. Open `enemy.tscn`.
   2. Choose **Capture scene actions**, read and accept the consent dialog, and save the
      journal to a new file inside the disposable project.
   3. Add a Sprite2D through the Scene dock, then rename it.
   4. Press **Ctrl+Z** once.
   5. Change its position in the Inspector.
   6. Choose **Mark scene checkpoint**, enter a label and confirm.
   7. Run the current scene (F6), wait, then stop it.
   8. Choose **Stop scene capture**.
4. Retrieve the journal over SSH, run `verify.cjs`, and keep screenshots, the journal and
   the report in a new `openscreen-evaluation/a1-winboat-gui-*` directory.
5. Close the owned Godot instance only, and leave the VM session as found.

Expected verifier results:

- a node appeared;
- at least one editor-history label and one stepped-back (undo) observation;
- a current-scene run of `res://enemy.tscn` and a run-stop observation;
- an authored checkpoint;
- a selection or Inspector signal trigger.

## What it will and will not prove

Input arrives as OS input in a real Windows 11 interactive session, delivered through the
WinBoat remote-desktop window by computer-use. This is stronger than the headless
API/injected probes: it exercises real dock, Inspector, dialog, shortcut and Run-button
routes. It is still **not** host hardware input, a native capture or recording,
packaged-app or OpenScreen-GUI acceptance, or a live-KDE pass. Any step that fails or is
skipped is reported as such.
