# Input event capture: first development slice

Native Linux recordings started through OpenScreen's recording handlers now save
`<recording>.mp4.events.ndjson` beside the video. The source events stay separate
from cursor effects, zooms and video exports. CLI project packing copies the
journal with the recording; discarding a recording removes its journal.

This is groundwork for click lanes and typing sections. There is no event
timeline, keyboard/text capture or ScriptWriter-style export UI yet. The installed
upstream AppImage is unchanged; use this source checkout's development build.

## Implemented

- Version 1 NDJSON records with a session UUID, increasing sequence and unique ID.
  Records are appended during capture rather than retained until Stop. There is
  no cursor-sample count limit on this journal.
- Linux evdev physical button down/up edges for left, right, middle, side, extra,
  forward, back and task (`0x110`–`0x117`). Repeats and keyboard keys are excluded.
  A double click remains two down/up pairs; a drag retains its down/up boundaries.
- Recording-start filtering and suppression during native capture pauses. Each
  button has a monotonic observation time and the encoder's active media clock
  at dispatch. A session header records the clock reference.
- Source pixel coordinates and recorded dimensions from the latest PipeWire
  cursor observation where available. This is **latest-frame position**, not an
  exact simultaneous button/position observation. Unknown positions are null;
  embedded cursor mode can still save button events.
- Initial driver status, device-loss warnings and a normal session-end record.
  An absent session-end identifies an interrupted journal. A write failure logs
  an error and marks the native session result failed without stopping video.
  Existing evidence is never overwritten if the destination already exists.

## Read a saved journal

Each line is independent JSON. For example, with jq:

```bash
jq -c 'select(.event == "pointer-button") | {code, pressed, mediaTimeMs, position}' recording.mp4.events.ndjson
```

The shared contract is in `src/native/captureEvents.ts`. `mediaTimeMs` refers to
source footage before editor cuts/speed changes; timeline consumers must map it
through edits. `monotonicMs` is helper-relative, not Unix time. `timestampMs` is
the separate wall clock. Dispatch can trail the device observation while the
encoder is busy; this version does not claim sub-frame alignment.

## Coverage limits and reuse

The driver reports **partial**, even when devices are readable. It observes
global physical buttons during the explicitly started recording, including input
outside the selected window. Application/window identity and filtering are not
implemented. Device adoption requires BTN_LEFT capability; unreadable devices
are unavailable. No new input permissions are installed by this change.

Trackpad tap-to-click is synthesized above evdev and remains unsupported. Scroll,
touch, text/IME commits, keyboard shortcuts and Windows are pending. Hotplug
adoption exists; a device-loss warning does not mean every other device is lost.
Capability/error visibility currently lives in the journal, native session result
and diagnostics, not a new recording-status UI.

Panoptix's KWin effect was inspected before extending evdev:
`https://github.com/kannibalk1w1/panoptix/blob/master/integrations/kwin/panoptixclick.cpp`.
Its compositor signal is a promising path for synthesized taps. Its existing
sender forwards only left presses and drops events while an HTTP request is in
flight, so it does not yet satisfy counted capture. It is GPL-2.0-or-later; no
code from that effect was copied into this MIT checkout. A compositor driver
needs a separate implementation/integration and compatibility review.

## Validation, 5 November 2026

- 5,205 TypeScript tests pass across 374 files. The first high-concurrency run
  hit the existing chat-panel asynchronous render timeout; its isolated run and
  the complete rerun with four workers pass.
- Both TypeScript configurations, Vite build and Biome check pass. Biome reports
  35 existing warnings. Rust suite: 102 pass, one existing test ignored.
- Real KDE Wayland/PipeWire capture with a virtual evdev mouse: eight buttons,
  rapid double click, drag, pause/resume and device removal. Exactly 24 expected
  edges persisted, two paused edges were excluded, IDs were unique, media times
  ordered, device loss persisted and Stop finalized the journal. The resulting
  video is playable. A separate interrupted run preserved its appended journal.
- Final smoke helper SHA256:
  `a981dab903c29e1969002699c7da46ec2f8208b6fb73df8245ecf371985b17ae`.
  The running executable was hash-compared with the rebuilt helper.
- Artifacts and repeatable fixture scripts:
  `../openscreen-evaluation/input-events/`. Use a PTY for `session-smoke.mjs`
  so its pause/resume/stop commands remain available on stdin.

This is a partial development smoke pass, not launch acceptance. Hardware mouse
comparison, trackpad taps, display scaling, application dialogs, Windows,
end-user event UI, long recordings and edited timeline mapping remain untested
or unimplemented. Encoder fallback and producer-marked invalid frames were
reported by the existing capture pipeline during the local test.

## Next implementation

Add an in-app capability indicator and a KWin/compositor input driver; use the
same counted test for hardware clicks and taps. Then capture actual text/edit
operations plus shortcut evidence, group them into editable typing sections and
export timed JSON, resulting code/text and a controlled playback recipe. Raw
keyboard codes alone will not reconstruct auto-indent, paste or IME text.

## Next slice: visible health and optional KWin driver

Linux recording HUDs now display live input health: checking, partial,
unavailable, disabled, interrupted, or failed journal writes. Warnings remain
visible while recording; video continues on journal failure. Health is available
through `get-input-capture-health` IPC. Evdev reports device adoption/loss changes,
and saved result status reflects actual availability rather than always partial.
The notice is mounted in the existing measured HUD notice stack. English fallback
strings are present across locales; translations are pending.

An explicitly selected `OPENSCREEN_INPUT_DRIVER=kwin` uses a separately built
GPL KWin plugin and a user-only, sequenced local socket. It observes compositor
button edges, including the event path used for synthesized taps. Evdev is not
started concurrently, and disconnect never silently changes drivers. Setup,
licensing, buffering, recovery and limitations:
[integrations/kwin-input/README.md](integrations/kwin-input/README.md).
This supersedes the earlier statement that capability visibility exists only in
diagnostics. Default evdev still cannot capture trackpad taps.

Validation for this slice, 5 November 2026:

- Full Vitest: **5,210 tests / 375 files pass**, four workers. Both TypeScript
  configurations and Vite build pass. i18n check passes; final Biome has zero
  errors and 35 pre-existing warnings. Rust: **105 pass, one existing ignored**.
- KWin 6.8.2 / Qt 6.11 plugin builds and loads in a disposable nested compositor;
  host compositor and installed app were not modified. Real ScreenCast portal
  recording of that window was finalized and its MP4 fully decoded.
- KDE fake-input in the nested compositor: eight buttons, double click and drag
  plus resumed right click produce **exactly 24 expected edges**, excluding two
  paused edges. Unique IDs, ordered media times, disconnect/unavailable warning,
  normal journal end and rejection of a second consumer are checked. Records
  before the saved baseline are excluded from this counted assertion.
- Artifacts: `../openscreen-evaluation/input-events/kwin-counted*`, including the
  baseline and machine-readable report. Final helper was rebuilt after warning
  wording and reader extraction; its running **probe** hash matched staged
  `980a87e8dbde1f776a1353e7ce71cecfe36a6f647cb61c557af659c74f608e22`.
  The counted recording used the preceding helper build, not this final probe.
- **Not verified:** physical/libinput touchpad taps, native visual HUD status
  interaction (computer-use listed no apps), hardware/device/scaling/dialog
  matrix, final plugin teardown on a live compositor after the small destructor
  change, Windows/macOS, sustained takes, timeline or typing exports. HUD states
  and failure transitions are covered by renderer/session tests.

This remains partial milestone-1 coverage. Actual text/edit capture, editable
sections and portable typing exports have not been implemented in this slice.
