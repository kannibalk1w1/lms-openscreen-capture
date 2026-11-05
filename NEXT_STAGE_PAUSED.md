# Paused at user's request — 5 November 2026

User resumed work later on 5 November. This historical pause note is superseded
by LESSON_CAPTURE_INPUT_EVENTS.md and integrations/kwin-input/README.md. All modifications remain
uncommitted in the existing checkout; preserve prior narration and journal work.
No push, publish, reset, stash or additional project checkout.

Implemented this turn (not yet final-reviewed):
- Live Linux input health getter in native session and polling IPC/preload API.
- InputCaptureNotice in measured HUD notice stack during Linux recording:
  partial/unavailable/disabled/unknown, journal failure, interruption and warnings.
- English input-health strings in all launch locale files (translations pending).
- evdev status updates on device adoption/loss.
- Explicit OPENSCREEN_INPUT_DRIVER=kwin selects sole authoritative compositor
  driver; no concurrent evdev or automatic mid-session fallback.
- Rust bounded NDJSON reader with hello/sequence validation and disconnect status.
- Standalone GPL-2.0-or-later plugin integrations/kwin-input, using KWin
  InputEventSpy::pointerButton rather than Panoptix code. User-only local socket,
  one consumer, buffered writes, overflow disconnect. Separate build, not packaged.
- Result inputEvents.status now reflects actual health, rather than always partial.

Verified so far:
- Both TS configurations pass; Vite build passes; i18n check passes.
- Targeted 140 tests pass across InputCaptureNotice, LaunchWindow and native
  Linux session tests. Two new test empty-block warnings subsequently fixed;
  rerun final lint/tests still needed.
- Rust 104 pass / 1 existing ignored; helper rebuilt/staged.
- KWin plugin successfully compiled against installed KWin 6.8.2, Qt 6.11.
  Missing ECM and Vulkan headers downloaded/staged only under /tmp, no system
  package/install changes. Configure with CMAKE_PREFIX_PATH=/tmp/openscreen-ecm
  and Vulkan_INCLUDE_DIR=/tmp/Vulkan-Headers-1.4.328/include, build directory
  /tmp/openscreen-kwin-input-build.
- Plugin loaded in a disposable NESTED KWin (private DBus, host compositor
  unchanged). Real portal recording selected nested compositor window.
- Explicit counted test AFTER baseline: eight buttons, double click, drag =
  exactly 22 edges confirmed. Paused 2 edges injected, resume 2 more injected;
  final report/assertion still needed. Plugin unload reports unavailable and
  warning; video finalized normally. Second consumer rejected (EOF).
- Source injections were KDE fake-input in the nested compositor, not physical
  hardware/libinput tap-to-click. Do not claim actual touchpad taps verified.
- Native smoke artifacts in ../openscreen-evaluation/input-events/kwin-counted*.
  Earlier uncounted events exist; analyze ONLY records starting at baseline
  `records` in kwin-counted-baseline.json. Result says unavailable after unload.
- Helper staged/build SHA256:
  00c82dc5ead651d598edbef92d90a28e792adf0fcd06b6fcbd09beda3bae640b
  Running /proc executable hash was NOT checked this turn; paths were checked.
- Computer-use skill read and resolved CLI used; bridge capabilities available
  but list-apps empty and nested PID app_not_found. Spectacle plus a temporary
  KWin activation script observed rendered fixture. Native status UI screenshot
  NOT verified. User was actively using desktop; avoid further interaction now.

Pause cleanup:
- Native recorder already stopped, video and journal finalized.
- Plugin already unloaded from nested KWin.
- Terminated only disposable nested KWin PID1266156 and fake pointer PID1282390.
- Host KWin PID7903 untouched. No virtual evdev/UInput device was created.
- Temporary host focus script `openscreen-test-focus` already unloaded.

Remaining before reporting completed slice:
- Review plugin teardown/socket handling and status messages; currently generic
  device-loss warning includes evdev reconnect advice after KWin restart advice.
- Full Vitest run with maxWorkers=4, final Biome, diff check, docs/roadmap/manual
  checklist update. Existing rustfmt invocation also formatted portions of prior
  changed Rust files; preserve semantic existing changes.
- Add more transport/error coverage if useful, check exact smoke counts/media.
- Default evdev fresh smoke/recovery status and hardware taps not verified here.
- Actual text/edit capture and typing exports not started; remain later roadmap.
