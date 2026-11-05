# Capture toolkit: reuse research

Research date: 5 November 2026. This is a source review, not a hands-on compatibility test. Candidate capabilities are documented upstream; none has yet passed the proposed Godot/Windows/CachyOS trial. Final dependency choices need pinned releases, source inspection, and representative capture tests.

Update: OpenScreen 2.2.2 has now been installed and smoke-tested locally. See the [hands-on evaluation](openscreen-evaluation/README.md) for actual capture, editing, export, and packaging results. The full cross-platform lesson trial remains outstanding.

## Recommended direction

Evaluate an existing recorder/editor before building one. The initial shortlist is OpenScreen for editing and agent-accessible export, OBS for dependable recording/replay, and waymux for isolated Linux automation. These are alternative or complementary components to test, not three mandatory applications for authors to operate.

The toolkit's distinctive work is joining media and events to lesson steps, supporting human/agent handoffs, recovering failed steps, and producing editable lesson assets. Keep that information independent of an upstream editor's project format.

## Candidate comparison

| Candidate | Documented capability and reuse opportunity | Important gap or qualification | Initial disposition |
| --- | --- | --- | --- |
| [OpenScreen](https://github.com/getopenscreen/openscreen) | Windows/Linux recorder/editor; editable projects, zooms, trims, annotations, MP4/GIF; CLI and MCP. [MIT licence](https://github.com/getopenscreen/openscreen/blob/main/LICENSE). | Upstream warns project/CLI compatibility can break. Its [Linux CLI](https://getopenscreen.com/docs/cli/) requires a portal picker on every recording; it cannot start unattended directly. | First editor/integration candidate; test import/export and portability before choosing a fork. |
| [OBS + obs-websocket](https://github.com/obsproject/obs-websocket) | Remote recording and replay-buffer control via [protocol requests](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md). OBS documents [separate audio tracks](https://obsproject.com/kb/multiple-audio-track-recording-guide). | Does not supply our lesson event timeline or editable teaching annotations. Capture source lifecycle and event/media synchronisation need testing. OBS ships a [GPL licence](https://github.com/obsproject/obs-studio/blob/master/COPYING). | Recording/replay baseline, potentially managed behind the toolkit's controls. |
| [waymux](https://github.com/tek-cat/waymux) | Isolated Linux GUI sessions, input injection, screenshots, recording, CLI/MCP, and live viewing; Apache-2.0 advertised in [source README](https://github.com/tek-cat/waymux/blob/main/README.md). | Early public release. Godot, NVIDIA hardware encoding, popups, and handover must be tested. It does not provide the Windows manual recorder or our lesson editor. | First isolated automation candidate, with virtual-display/VM alternatives if it fails. |
| [Recordly](https://github.com/webadderallorg/Recordly) | Windows/Linux recording, persisted timeline edits, annotations, zooms, audio regions, MP4/GIF. Linux uses a system picker on Wayland; cursor hiding is currently unsupported there. | [Licence file](https://github.com/webadderallorg/Recordly/blob/main/LICENSE.md) identifies AGPLv3 and includes branding/attribution wording. Verify exact terms before deriving code. | Compare human capture/editing experience against OpenScreen; do not mix code casually between them. |
| [Cap](https://github.com/CapSoftware/Cap) | Local Studio recording/editing plus a larger sharing platform. Current README lists Linux and Windows. | Its [licence](https://github.com/CapSoftware/Cap/blob/main/LICENSE) identifies MIT for specified capture/camera crate families and AGPLv3 for most remaining content. Larger product footprint than our initial local workflow. | Secondary candidate; inspect individual capture crates if needed. |
| [Kdenlive](https://docs.kdenlive.org/en/project_and_asset_management/file_management/project_files.html) | Editable XML projects preserve media references, cuts, effects, and keyframes. | Full video editor rather than our lightweight capture interface. Generating an editable project is possible in principle; supported operations need a tested mapping. | External finishing option, not a promised lossless round trip. |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Existing media processing foundation to evaluate for extraction, trimming, encoding, and inspection. | [Licence varies with build options and libraries](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md). Pin the actual distributed build and its notices. | Reuse rather than implement codecs or basic media processing. |

[OpenScreen recording documentation](https://getopenscreen.com/docs/recording/) distinguishes Linux pointer position/shape from click collection: clicks require access to mouse input. Neither cursor telemetry nor a video stream proves keyboard/semantic event coverage. Review this against Panoptix's KWin approach before choosing input instrumentation.

## Existing work to retain

### Panoptix

The supplied [repository](https://github.com/kannibalk1w1/panoptix) documents Windows and CachyOS/KDE packaging, tray controls, shortcut commands, screenshot review, and an optional KWin click bridge. Its KDE screenshot path uses Spectacle, with documented frame-rate limitations. It is a useful platform integration reference and possible component source; its capture workflow has already failed the user's usability comparison with ordinary screenshots/OBS.

Do not assume that ownership or a public repository automatically establishes the terms for copying every component. Record code ownership/licences when selecting actual files. Reuse working platform integration without inheriting evidence-reporting UI as the lesson-authoring workflow.

### Existing RPG shotkit and completed capture pilot

Workspace-relative references:

- `Godot Turn-Based RPG - Course 1 Upload Pack (club format)/screenshots/tools/shotkit.py`
- `Godot Turn-Based RPG - Course 1 Upload Pack (club format)/screenshots/l01/README.md`
- `Godot Turn-Based RPG - Course 1 Upload Pack (club format)/screenshots/l01/gaps.md`
- `Godot Turn-Based RPG - Course 1 Upload Pack (club format)/screenshots/l01/manifest.json`
- `Godot Turn-Based RPG - Course 1 Upload Pack (club format)/screenshots/Codex screenshot brief - Lesson 1 resume from slide 5.md`

The completed pilot contains 54 annotated stills across 12 slides. Reuse its raw PNG → annotation JSON → editable SVG → LMS PNG pattern, captions, slide mappings, and accepted assets. Its coordinate automation is X11-specific, including xdotool, ImageMagick capture, /proc, systemd, and KDE clipboard calls; it is not a portable driver.

A small separate rename popup was initially excluded from capture. The resumed run retained accepted images and rebuilt the unsaved application state. Turn that history into a regression scenario: include transient windows and preserve finished work during recovery.

### Lesson sources and export mappings

Existing video scripts use SCREEN, ZOOM, OVERLAY, ACTION, VOICE, PAUSE POINT, and CHECKPOINT cues. For example:

- `Godot Bullet Heaven - Course 5 Upload Pack/video scripts/READ ME — script format.md`
- `Godot Bullet Heaven - Course 5 Upload Pack/video scripts/C5L01 Reunion and genre safari — video script.md`

These are inputs to a capture plan; do not require authors to rewrite every lesson in a new DSL. Existing LMS JSON has course/lesson/checkpoint metadata and slide media fields, but sampled slide IDs are null. Add durable toolkit step IDs and explicit source mappings rather than relying solely on current slide positions.

## Application automation

| Application | Existing surface | Reuse boundary |
| --- | --- | --- |
| Godot | [Coding-Solo/godot-mcp](https://github.com/Coding-Solo/godot-mcp) documents editor launch, project execution, and debug output; repository identifies MIT. Existing shotkit proves coordinate-driven editor capture locally. | Evaluate lifecycle/state inspection first. Do not assume an MCP that creates scene files can visibly perform the lesson's editor actions. |
| Roblox Studio | [Official Studio MCP documentation](https://github.com/Roblox/creator-docs/blob/main/content/en-us/studio/mcp.md) describes built-in model/script/playtest access. | Integrate an existing server instead of implementing another scene API. Captured UI actions remain separately necessary. Windows hosting is consistent with the existing WinBoat lesson test. |
| Blockbench | [Official plugin documentation](https://blockbench.net/wiki/docs/plugin/) provides an extension route. | Evaluate existing plugins before writing a bridge. No particular third-party MCP is selected; no local Blockbench lesson sample was found in the research pass. |

## Evaluation before custom implementation

1. Use the same RPG Enemy sequence to compare OpenScreen and Recordly with the screenshot/OBS baseline. Record elapsed author effort and interruptions.
2. Verify readable 1080p capture, popups, editor-to-playtest window transitions, cursor/click events, separate audio, and 30-minute reliability on both launch platforms.
3. Test OBS record/replay control with timestamped sidecar events. Compare against an editor's own capture path; avoid two simultaneous encoders unless justified.
4. Test waymux with the real Godot build and assets on CachyOS, including the NVIDIA path. Verify an agent can drive it while the human keeps using their desktop.
5. Import the resulting media into the editor candidate; preserve annotations and timing through save, reopen, and transfer to Windows.
6. Check that an agent can create/edit/export a project using supported interfaces. Test the exact release rather than inferring support from documentation.
7. Record selected versions, transitive licences, redistribution notices, failures, and maintenance cost. Choose integration, a small upstream contribution, or a fork only after this comparison.

No packages were installed, capture permissions changed, applications driven, or external repositories modified during this research.
