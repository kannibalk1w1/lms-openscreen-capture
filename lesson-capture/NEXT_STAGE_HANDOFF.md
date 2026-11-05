# OpenScreen lesson capture — next-stage handoff

User explicitly requested: “move on to the next stage in a new context window”.
Take ownership and continue implementation in this existing checkout. The previous
agent stops after delivering this handoff. No reporting-back/supervision required.

## Latest continuation status — 5 November 2026

The original next slice below has progressed through input health/KWin, custom
cursors/click markers, vector/SVG arrows, recording flags and scoped Godot typing.
The latest build adds in-video GDScript presentation with independent pause/play
and blur, panel drag/resize, theme/font/excerpt controls and a Code timeline lane.
Read openscreen/LESSON_CAPTURE_CODE_PRESENTATION.md and the updated roadmap for
coverage and limits. All prior/current changes remain uncommitted in the same
checkout. Native Linux compositor and Vite/main/preload have been rebuilt.

Next useful work is explicit **Godot capture ↔ recording media clock association**
and automatic source-anchored placement, followed by portable typing-file exports.
The current user-approved pause option holds visual frames while timeline/audio
continue; it does not insert time. Manual placement works with independent takes.
After each build, report the next concrete roadmap item to the user.

## Objective and next stage

Engine-agnostic LMS capture for Godot, Roblox Studio and Blockbench: effortless
human capture plus agent-driven first passes; editable screenshot/video/GIF
annotations, narration captions and input evidence. Linux/CachyOS hosts most
agent work; Linux and Windows must support human recording. Reuse existing open
source before inventing replacements. User approved the roadmap and asks for action.

Next stage: complete the next useful slice of milestone 1 — visible capture
capability/error status and compositor-level mouse/tap capture on KDE, preserving
the counted-event acceptance test. Then actual text/edit capture, editable typing
sections and ScriptWriter-style exports. Do not skip straight to a raw keylogger
and claim it reconstructs typing: paste, auto-indent, auto-pairs and IME require
text/edit evidence or application adapters. Deliver concrete, tested work.

Read LESSON_CAPTURE_ROADMAP.md and LESSON_CAPTURE_INPUT_EVENTS.md first. Evaluate
KWin integration reuse carefully; Panoptix's GPL effect was inspected, not copied.

## Checkout and preserve existing work

Repo: /home/kannibalkiwi/Documents/Projects/George Godot Terms/Capture Toolkit Specification/openscreen
Branch: lesson-capture/voiceover-captions, based on upstream v2.2.2 d7adf059.
All local changes are uncommitted, including prior narration work. Preserve them.
Do not reset/stash/delete them. No remote fork, push or publish has been performed.
Read the repository AGENTS.md before editing. Do not spawn other agents unless
requested or required by applicable instructions.

Completed slices:
1. Recorded/imported narration defaults to editable local Whisper captions;
   opt-out, voiceover placement/cuts, failed placement and project switches tested.
2. Native Linux recordings through IPC append <video>.events.ndjson. Contract:
   src/native/captureEvents.ts. Writer: electron/recording/captureEventJournal.ts.
   Integration: electron/native-bridge/capture/linuxNativeCaptureSession.ts,
   electron/ipc/handlers.ts, CLI projectCommands.ts packing. Native changes:
   electron/native/pipewire-capture/src/{input,main,events,capture}.rs.
   Eight physical button down/up types, unique IDs and two clocks, latest-frame
   source coordinates or null, pause suppression, device-loss warnings and end
   marker. Separate from cursor effects. Journal IO failure preserves video.

Limits: evdev misses tap-to-click, observes global physical button input while
recording rather than selected-app input, initial driver status can be partial/
unavailable/disabled, no status UI, no keyboard/text, no event timeline, no Windows
journal driver. Coordinates are latest PipeWire cursor observations, not precise
simultaneous button coordinates. Media time is encoder-active clock at dispatch.

## Environment/build

Pinned Node22.22.1:
/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin/node
Pinned npm10.9.4 CLI:
/home/kannibalkiwi/.npm/_npx/69e9286a8508643f/node_modules/npm/bin/npm-cli.js
Set PATH to pinned Node bin. npm only. Dependencies already installed.

Renderer/main: npm run build-vite. Both tsc --noEmit and tsc -p tsconfig.test.json
--noEmit required. Target tests during work, full Vitest at end. Use --maxWorkers=4:
very high default concurrency hit an unrelated chat-render waitFor timeout.
Native changes MUST rebuild separately:
node scripts/build-linux-pipewire-helper.mjs
cargo test --manifest-path electron/native/pipewire-capture/Cargo.toml
FFmpeg SDK already fetched under crates/thirdparty/ffmpeg-linux64-lgpl-shared.
Native bin directory began as full 37-file copy/hash verification from upstream
AppImage; Linux helper and its helper-ffmpeg libraries now rebuilt/staged. Do not
assume a Vite build recompiles native code. Compare running /proc/PID/exe hash.

Installed ~/.local/bin/openscreen is still unmodified upstream AppImage. Dev run:
node_modules/electron/dist/electron . --user-data-dir=$HOME/.local/share/lc-dev
Use that SHORT profile: workspace paths exceed Unix MCP socket path limits.
Existing dev Electron PID was 1047443 (verify before touching); it may still run
older loaded JS. Do not kill a user's open project without checking state.
No capture intentionally left active. Disposable test fixture was closed.

## Verification at handoff

5205 TS tests passed, 374 files, full rerun with four workers. Initial run had
existing LeftPanel.copyMessage async render timeout; isolated and full rerun pass.
Rust: 102 pass, one existing ignored. Both TS checks, Vite build, Biome pass;
35 pre-existing lint warnings. git diff --check clean.

Real KDE6.8.2 Wayland/PipeWire1.6.10/RTX4070 smoke: virtual evdev mouse generated
8 buttons, double click and drag (22 edges), paused click (2 excluded), resumed
right click (2 edges), removal and Stop. Exactly24 expected edges persisted once,
IDs/times correct, warning/end saved; playable48.9s video. Final helper SHA256:
a981dab903c29e1969002699c7da46ec2f8208b6fb73df8245ecf371985b17ae

Artifacts and reproducible scripts:
Capture Toolkit Specification/openscreen-evaluation/input-events/
final-counted.mp4, .events.ndjson, .result.json, final-counted-report.json.
fixture.cjs/html disposable Electron click-count window; pointer-fixture.py uses
existing writable /dev/uinput; session-smoke.ts/mjs drives real native session.
Run interactive harnesses in PTY (tty=true); plain exec closes stdin, preventing
pause/resume/stop control. Inputs: sequence, paused, resumed, exit; recorder:
pause, resume, stop. No input permission changes made.
Manual checklist has a Partial row. No release candidate acceptance claimed.

## GUI and reuse discoveries

Read /home/kannibalkiwi/.agents/skills/computer-use/SKILL.md when GUI needed.
Orca executable: /home/kannibalkiwi/.config/orca/linux-orca-cli-shim/orca
Load versioned guides using skills get. Native Wayland picker is not accessible
through current bridge (screenshots=false, no native dialog support). Spectacle
--background --nonotify --activewindow/--fullscreen --output PATH observes KDE.
xdotool can position Xwayland pointer; evdev UInput keyboard/native touch can
operate Wayland when freshly verified. Avoid blind retries; user may interact.
Terminal XDG_SESSION_TYPE misleadingly says x11; actual login session is Wayland.

Panoptix repo: https://github.com/kannibalk1w1/panoptix (default branch master).
KWin file integrations/kwin/panoptixclick.cpp listens to EffectsHandler::mouseChanged.
Existing sender reports only left presses and DROPS inputs while HTTP in-flight.
Uses GPL-2.0-or-later. Do not copy into MIT checkout without considering licence;
compositor signal/API is useful research. Need robust buffered delivery and a
single authoritative driver to avoid duplicate evdev/compositor events.

Earlier narration artifacts: openscreen-evaluation/voiceover-captions/. Local
Whisper model already cached in ~/.local/share/lc-dev/stt-models. Public JFK audio
was transcribed, corrected and exported via actual Whisper Vulkan/MCP. Hardware
microphone and Windows not physically tested.

## User interaction

User dislikes needless confirmation. Reversible local implementation and tests
are authorized. Keep useful progress updates, finish a coherent slice, document
remaining coverage honestly. No external messaging/push/publish authorized.
