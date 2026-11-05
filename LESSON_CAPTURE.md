# Lesson Capture development

This is a local development branch, `lesson-capture/voiceover-captions`, based on
OpenScreen v2.2.2 (`d7adf059`). The upstream MIT licence and attribution are retained.
The installed `openscreen` AppImage remains the unmodified upstream release.

## First change: narration captions

Open an existing video and press **V** to open **Add voiceover**. Leave **Create
captions** checked, then record a microphone take or import a voiceover file.

After the narration is placed, the editor enables captions from the voiceover
lane and opens Transcript for review. The existing local Whisper queue produces
the text and timing; an existing transcript or in-flight job is reused. Words
remain editable, and caption styling, timing, preview and exports continue to
use OpenScreen's transcript-derived caption system. No flattened annotation copy
or new speech service is introduced.

Uncheck **Create captions** to add narration without changing the existing
caption source or visibility. Background transcription is still OpenScreen's
normal behaviour. This choice is offered afresh whenever the voiceover bar opens.

The action preserves narration placement at the start playhead, including across
cuts. Failed placement and project switches do not enable captions on another
project. Caption defaults respect landscape/portrait output. Existing annotations
are preserved. Suggested teaching-step markers are deferred.

## Run the prepared local checkout

Use the repository's pinned Node 22.22.1 and npm 10.9.4. On this CachyOS machine,
the pinned Node is under `~/.local/share/lesson-capture-tools/`.

```bash
export PATH="$HOME/.local/share/lesson-capture-tools/node-v22.22.1-linux-x64/bin:$PATH"
npm run build-vite
./node_modules/.bin/electron . --user-data-dir="$HOME/.local/share/lc-dev"
```

Quit the previous development instance before relaunching. The separate profile
keeps the release's projects/settings intact and has a short path for Linux's
MCP socket. Do not move it under the long lesson folder path: Unix socket path
length limits prevent the live MCP channel from opening there.

Native helpers in this prepared checkout were initially copied as a complete set from
the verified v2.2.2 AppImage and hash-compared (37 files). They are gitignored;
a fresh checkout needs the native build/staging steps in AGENTS.md. The Linux
capture helper has since been rebuilt from source for the input-event slice.
Speech-engine source remains unchanged. Build this helper separately with
`node scripts/build-linux-pipewire-helper.mjs` after native capture edits.

## Input capture foundation

Linux recordings now append physical mouse button evidence to a separate saved
journal. See [input event implementation and limits](LESSON_CAPTURE_INPUT_EVENTS.md)
for the format, counted desktop test and remaining work. Typing capture and the
event timeline are next milestones, not implemented features.

## Validation

Regression coverage includes recorded/imported narration, opt-out, caption lane
selection, failed placement, a project switch during placement, portrait safe
areas, and the existing voiceover offset/cut behaviour. The repository's undo
write audit declares the explicit caption action. A small test teardown change
retires the old HUD polling timer so it does not escape its window fake.

The local desktop smoke pass observed the new checkbox, ran the real Whisper
Vulkan backend on an imported public speech fixture, stored a timed transcript,
and exported voiceover captions over a real Godot capture. The fixture was placed
at 2 seconds to exercise narration offset. Output and test logs are under
`../openscreen-evaluation/voiceover-captions/`.

This is an initial development build. The physical microphone path, Windows,
and a complete native-dialog import/record-to-export pass still need validation.
The mic UI completion path has automated coverage using a fake MediaRecorder;
the speech-engine/export pass used real imported audio through MCP. These are
different checks and are not reported as a hardware-microphone test.
