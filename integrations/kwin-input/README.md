# Optional KDE compositor input driver

This standalone KWin plugin feeds mouse button edges into OpenScreen's existing
input journal, including buttons synthesized by the compositor (the path used by
libinput tap-to-click). It uses `KWin::InputEventSpy::pointerButton`, observing
native button codes directly rather than sampling pressed-button masks. It does
not paint, intercept input, read keyboard events, or reconstruct text.

The plugin is **GPL-2.0-or-later** because it links KWin; see [COPYING](COPYING).
It is separately built and loaded by KWin. The MIT Electron application/native
helper only speak a local socket protocol. No Panoptix implementation was copied.
This is an experimental development integration, not an installed app feature.

## Build and enable

Requires CMake, a C++ compiler, ECM, Qt 6 Network/Widgets, and the development
headers/dependencies for the **exact running KWin version**. Tested with KWin
6.8.2 and Qt 6.11. KWin checks the plugin factory ABI version at load time.

```sh
cmake -S integrations/kwin-input -B /tmp/openscreen-kwin-input-build
cmake --build /tmp/openscreen-kwin-input-build -j4
```

The module is `lib/kwin/effects/plugins/openscreen_input.so` under the build
directory. Install it into a Qt plugin directory already searched by KWin (the
CMake `KDE_INSTALL_PLUGINDIR` controls this), or start a **disposable nested KWin**
with `QT_PLUGIN_PATH=/tmp/openscreen-kwin-input-build/lib` for development.
Merely setting that variable on Electron cannot alter an already running KWin.
No plugin is automatically installed or enabled by OpenScreen.

On the target compositor's session bus, enable explicitly:

```sh
qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.loadEffect openscreen_input
```

Start OpenScreen from this checkout with `OPENSCREEN_INPUT_DRIVER=kwin` set in its
environment. The helper connects once before recording starts. The normal driver
remains evdev when the variable is absent. `OPENSCREEN_DISABLE_CLICK_CAPTURE`
disables either source. The selected driver is authoritative for the whole take:
there is no concurrent evdev evidence or automatic fallback. If the module is
missing, busy, incompatible or disconnected, status is unavailable. Restore the
module and start a new recording to reconnect.

Unload on that same compositor's bus when finished:

```sh
qdbus6 org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect openscreen_input
```

## Transport and limits

The module listens on `$XDG_RUNTIME_DIR/openscreen-kwin-input-v1.sock`, restricted
to the desktop user, accepting one consumer. It sends nothing without a connected
consumer and retains no event history. A second connection is closed. The helper
filters picker/countdown input and paused input using the existing capture loop.

The handshake is `openscreen-kwin-buttons-v1\n`. Following lines are JSON:
`{"sequence":0,"code":272,"pressed":true}`. Sequences start at zero per connection;
button codes are Linux `0x110` through `0x117`. Each edge is queued on the socket.
The module closes the stream if queued writes exceed 1 MiB or a write fails;
the helper rejects malformed, oversized, missing or repeated sequence records,
marks capture unavailable and appends a warning. Nothing silently switches drivers.

A crashed compositor can leave a stale socket path. The plugin deliberately does
not unlink an existing path belonging to another instance; remove a confirmed
stale socket only after its compositor has exited. Nested compositors sharing a
runtime directory cannot simultaneously provide this socket.

Coverage remains partial: events span the desktop, with no application filter,
scrolling or text capture. Positions remain latest PipeWire frame coordinates,
not the compositor position at the exact button edge. Helper observation clocks
are stamped when socket records are read; compositor queueing can delay them.
Physical libinput tap-to-click, display scaling and the hardware device matrix
still need acceptance testing. Compositor-injected buttons passed the counted
real-recording test; that does not establish physical touchpad coverage.

The live HUD polls native health every 500 ms. It shows driver coverage, journal
write failure, unexpected helper exit and retained input warnings. The new copy
has English fallback text in all locales; translations are pending.
