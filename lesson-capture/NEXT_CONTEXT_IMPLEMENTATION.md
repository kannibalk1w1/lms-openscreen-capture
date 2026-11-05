# Fresh-context implementation handoff

User authorized a new private repository snapshot, Claude review of all work so
far, and starting the next roadmap item in a NEW context. This file is that
implementation handoff. Prior agent stops after launching the two fresh sessions.

Work ONLY in the existing checkout:
/home/kannibalkiwi/Documents/Projects/George Godot Terms/Capture Toolkit Specification/openscreen
No new checkout, reset/stash, deletion of prior work or publishing. Read AGENTS.md,
LESSON_CAPTURE_ROADMAP.md, LESSON_CAPTURE_TYPING.md, LESSON_CAPTURE_FLAGS.md,
LESSON_CAPTURE_INPUT_EVENTS.md and LESSON_CAPTURE_CODE_PRESENTATION.md first.
The previous all-work commit is the review baseline. Remote `private` points to
kannibalk1w1/lms-openscreen-capture; `origin` remains upstream. The private repository
has Actions disabled to avoid running upstream release/publish workflows.
Do not turn them on. Existing native binaries and node_modules remain available.

Next coherent implementation: explicitly associate Godot typing capture sessions
with OpenScreen recording media time, preserving pause/resume boundaries. Provide
reliable source-anchored placement of imported typing sections on the matching
recording; keep manual playhead placement for independent/unassociated takes.
Do not infer exact video timing from UTC alone or the independent active typing
clock. Inspect/reuse recording flags and input journals, recording session IDs,
Godot adapter journals and existing source projection before designing the slice.
Choose an achievable implementation; complete and test it locally. Do not silently
install the optional adapter into the user's real Godot projects.

Standing user choices: scoped actual text/edit evidence from Godot, with clean
or faithful in-video presentation. Code panel has independent pause-picture/play
and blur switches, drag/resize, font/theme/excerpt. Pause picture holds source
screen/camera/cursor while lesson timeline and audio continue; no inserted time.
Preserve those behaviors and all captured edit evidence. Subsequent roadmap item
is portable text/JSON/playback-file export, after clock association.

Claude reviews the baseline concurrently, writing only
lesson-capture/CLAUDE_REVIEW.md. Do not overwrite that file. Read/incorporate its
findings when available; distinguish baseline issues from new clock-sync work.
No need to wait idle for that review before inspecting/implementing your slice.
Do not claim Claude approved anything until its report actually arrives.

Pinned toolchain:
export PATH=/home/kannibalkiwi/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin:$PATH
npm CLI if needed: node /home/kannibalkiwi/.npm/_npx/69e9286a8508643f/node_modules/npm/bin/npm-cli.js
Use npm; read AGENTS test rules. Baseline validation: 5,272 full-suite tests pass;
6 final focused tests pass (2 added after full run), both TS configurations, Vite,
i18n, Biome (35 existing warnings), docs/diff checks; native evidence documented.
Real Electron/physical Godot/IME, Windows/macOS and broad timeline matrix remain
open. Existing Orca computer provider lacked screenshot/hotkey support; recheck
capabilities before claiming a desktop pass. Never represent isolated browser
fixtures or offscreen native rendering as complete desktop end-to-end coverage.

Start taking action in the fresh session; do not ask permission for authorized
local work. Keep useful progress updates. After every build report the next
concrete roadmap step. Preserve local work and report exact coverage/limitations.
The prior snapshot was pushed; new work can remain local until the user asks for
another push. No force pushes or changes to upstream.
