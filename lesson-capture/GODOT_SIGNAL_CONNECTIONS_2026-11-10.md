# Godot saved signal connections — 10 November 2026

Built by Claude (Opus 5.5, lead builder). Raw Godot scene journal **v5** adds the saved
(persistent) signal connections between nodes of the captured scene to every sampled
state. v1–v4 import unchanged (v4 history/run context is also present in v5); the
generic normalized application capture stays **v1**.

## Supported API audit (real Godot 4.7.1)

- `Object.get_incoming_connections()` on each observed node returns `{signal, callable,
  flags}`. Connections saved in the scene (loaded from `[connection]` or made with
  `CONNECT_PERSIST`, as the Signals dock does) carry flag 2. Editor-internal connections
  (SceneTreeEditor, viewports) have no persist flag and target editor objects.
- A bound callable (`.bind(...)`) is a **custom** callable (`is_standard() == false`) whose
  `get_object()/get_method()` report the wrapped method. `.unbind(n)` is also custom.
- `Script.has_method()` does not see script-declared methods; `get_script_method_list()` does.
- `connect()` refuses a callable naming a method the target's script does not declare.
- A lambda's object is the lambda's owner, so a lambda never appears as an incoming
  connection to a scene node unless that node's own script created it.

## What a v5 take records

Consent: the start dialog adds "Records saved signal connections between nodes of this
scene (signal, source, target and method names, and how many arguments are bound, never
their values)".

Each state carries `connections` (sorted, unique, at most 1,024) and `excludedConnections`:

- **Recorded** only when all hold: the persist flag is set; the source is an observed
  (root or owned) node of this scene; the callable's object is the observed target node;
  the callable is a plain method, or a bound wrapper around a method declared in the
  target's script (method table only, never source text); signal and method names are
  identifiers of at most 100 characters. Fields: `signal`, `from`, `to` (session node
  IDs), `method`, `boundArgs` (count, 0–64), `deferred`, `oneShot`. Bound **values**,
  the callable object, other flags and script contents are never recorded, and no
  Callable is ever invoked.
- **Counted, not described** (`excludedConnections`): persistent connections into an
  observed node whose source is outside the observed set (a non-owned/instanced node, a
  resource, another object), whose callable is custom other than a method bind (e.g.
  `unbind`, a lambda on the target), or whose names are unsupported.
- **Not seen**: connections from an observed node to an unobserved target (only incoming
  connections of observed nodes are enumerated), and non-persistent runtime connections.

Bounds: each recorded connection is under 300 bytes, so one observation payload stays far
below the shared 32 KiB limit. 1,024 connections add roughly 200 KiB to a state, inside
the existing 8 MiB journal budget. Going over 1,024 stops the take with a valid `limited`
footer, through the existing limit path.

## What the decoder reports

- Starting connections are baseline context only.
- `signal-connection-added` / `signal-connection-removed`: "Signal connection observed:
  Timer.timeout → Hitbox._on_timeout" or "… no longer observed: …". These are differences
  between samples. They don't prove which route was used (dock, script or plugin), that
  the signal ever fired, or what the method does. A change of flags or of the bound count
  shows up as a removal plus an addition.
- `signal-connections-unrecorded`: the excluded count changed; the payload carries
  before/after counts and the fixed reason `outside-observed-scene-or-unsupported-callable`.
- Checkpoint comparison returns `connections: {added, removed}` when the two snapshots
  differ.

Rejected: connections or the count in v1–v4, a v5 state missing either, endpoints outside
the state's nodes, duplicates, non-identifier names, extra fields (e.g. bound values or a
callable object), out-of-range counts and non-boolean flags. Every raw record is validated
even after the normalized observation cap.

## Validation

- Unit: new `godotScene.connections.test.ts` (20 tests); history tests adjusted for "v4 or
  later". Full suite **6,585 tests / 483 files**; both `tsc` configs, `vite build`, lint
  (35 existing warnings), docs, i18n pass.
- Real Godot 4.7.1 editor/API probe, Linux and WinBoat Windows 11 (portable official
  Godot/Node, hashes in the Windows report): `CONNECTIONS_PASSED: baseline/add/remove/reopen;
  3 out-of-scope or unsupported persistent connections counted, not described`.
  - Scene-file connection as baseline.
  - Added: a deferred, one-shot, bound connection. Only `boundArgs: 1` is recorded; the
    `BOUND_VALUE_CANARY` value is absent.
  - Canaries:
    - Excluded and counted: an unowned source node, a Resource source and an `unbind`
      custom callable.
    - Not recorded (absent from the journal): a non-persistent connection, a lambda and a
      connection to an outside target.
    - Script text canary absent.
  - Removal of the baseline connection.
  - Save, then reload: the saved connection is the new take's baseline.
  - All earlier probe checks (history/run, 2D/3D, limits, footer failure) still pass. The
    probe's frame/time limits were raised for the longer run.
- Production: real built Linux Electron CLI `inspect-capture`/`import-capture` and MCP
  `inspectApplicationCaptureFile`/`draftLessonFromApplicationCapture`/
  `inspectGodotCheckpointsFile`, from a foreign cwd, with the real accepted **raw v4**
  history/run journal and a real raw v5 connections journal: 15 checks each, CLI/MCP
  parity, selected drafts reopen, sources unchanged. `scripts/smoke-headless-startup.cjs`
  passes.

Evidence: `../openscreen-evaluation/godot-signal-connections-2026-11-10/`. These are
headless editor/API checks: no physical Signals-dock use, no signal emission and no
game run is claimed.

## Review

Awaiting an independent Claude review of the immutable source commit.
