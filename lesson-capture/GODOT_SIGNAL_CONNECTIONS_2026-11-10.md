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
- `bind`, `unbind`, `bind(...).unbind(...)` and lambdas are all custom callables. A bind
  wrapper equals `Callable(target, method).bindv(binds)`; a lambda (even one named like a
  declared method and bound) and any unbind do not.
- `connect()` refuses a callable naming a method the target's script does not declare.
- A lambda's object is the lambda's owner, so a lambda never appears as an incoming
  connection to a scene node unless that node's own script created it.

## What a v5 take records

Consent: the start dialog adds "Records saved signal connections between nodes of this
scene (signal, source, target and method names, and how many arguments are bound, never
their values)".

Each state carries `connections` (sorted, unique, at most 256) and `excludedConnections`
(capped at 1,000,000):

- **Recorded** only when all hold: the persist flag is set; the source is an observed
  (root or owned) node of this scene; the callable's object is the observed target node;
  the callable is a plain method, or a bind wrapper that equals `Callable(target, method)`
  with the same binds and nothing unbound (bound values are held only for that in-memory
  comparison, never serialized or invoked; script text is never read); signal and method names are
  identifiers of at most 100 characters. Fields: `signal`, `from`, `to` (session node
  IDs), `method`, `boundArgs` (count, 0–64), `deferred`, `oneShot`. Bound **values**,
  the callable object, other flags and script contents are never recorded, and no
  Callable is ever invoked.
- **Counted, not described** (`excludedConnections`): persistent connections into an
  observed node whose source is outside the observed set (a non-owned/instanced node, a
  resource, another object), whose callable is custom other than an exact method bind
  (`unbind`, `bind().unbind()`, a lambda created by the target, bound or not, and nested
  binds such as `bind(1).bind(2)`, which do not equal a single rebuilt bind), or whose
  names are unsupported.
- **Not seen**: connections from an observed node to an unobserved target (only incoming
  connections of observed nodes are enumerated), and non-persistent runtime connections.

Bounds: each recorded connection is under 300 bytes, so one observation payload stays far
below the shared 32 KiB limit. Labels shorten node, signal and method names to 48
characters so they fit the shared 300-character label; the payload keeps full names and
node IDs (node names need not be unique, so labels can be ambiguous). 256 connections
add about 33 KiB to every written state, and states are repeated whenever anything
changes, so a scene at the cap reaches the 8 MiB journal budget after roughly 250 changed
samples. Going over 256 stops the take with a valid `limited` footer. A full snapshot at
the cap (259 nodes, 256 connections) took 11 ms in real Godot 4.7.1 on Linux; the first
build's comparator sort took about 400 ms at 1,024 and was replaced by a keyed sort.

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
  5 out-of-scope or unsupported persistent connections counted, not described` and
  `CONNECTION_LIMIT_PASSED` (257th connection → limited footer).
  - Scene-file connection as baseline.
  - Added: a deferred, one-shot, bound connection. Only `boundArgs: 1` is recorded; the
    `BOUND_VALUE_CANARY` value is absent.
  - Canaries:
    - Excluded and counted: an unowned source node, a Resource source, an `unbind`
      wrapper, a `bind().unbind()` wrapper and a bound lambda created by the (tool) target
      script under a declared method's name.
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

[Independent review of `e0786f0f`](CLAUDE_GODOT_SIGNAL_CONNECTIONS_REVIEW_E0786F0F_2026-11-10.md):
**changes requested** — two Medium (F1 labels over 300 characters broke import of a valid
take; F2 ~400 ms enumeration per poll at 1,024 connections), Lows F3 (bound same-name
lambda recorded as a method), F4 (`bind().unbind()` recorded), L1/L2 test gaps, Nits N1–N4.
The follow-up commit: F1 shortened label segments plus a maximal-name import test; F2 cap
256 and keyed sort (11 ms measured); F3/F4 exact-bind equality and zero unbound
arguments, both as real probe canaries; L1 identity tests for every key field; L2 real
limit take (a GDScript mutation removing the equality guard fails the real probe; removing the unbound-count guard survives because equality already rejects `bind().unbind()` — kept as defence in depth); N1/N4 documented above; N2 producer cap; N3 messages. The [recheck of `e5521683`](CLAUDE_GODOT_SIGNAL_CONNECTIONS_RECHECK_E5521683_2026-11-10.md)
**accepts it with Lows**: L1 (nested binds are counted, not recorded) is now documented
above; N1 label shortening now works on code points; N2 — the decoder cap of 256 refuses
any v5 journal from the unreleased `e0786f0f` build with more than 256 connections. The
only such journals are this run's probe evidence, all far below that.

### Recheck disposition ledger

| Item | Disposition |
| --- | --- |
| Recheck L1 (nested binds counted, not recorded) | Intentionally kept; documented in "Counted, not described". |
| Recheck N1 (emoji split in labels) | Fixed in `abc342ad`. A coordinator-requested worst-case test then showed that 48-code-point segments can reach 95 UTF-16 units, so 200-emoji node names could again exceed the 300-unit label limit. Fixed in the next commit: segments are cut at ≤48 UTF-16 units on code-point boundaries. The test covers 100-emoji names on both endpoints plus 100-character signal and method names; the `abc342ad` expression fails it. |
| Recheck N2 (cap refuses older >256 journals) | Intentionally kept; documented above. |
