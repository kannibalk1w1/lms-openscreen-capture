# Explicit native recording clock link (overnight slice 11)

An optional, read-only Godot clock client can now sample the **actual Linux native
encoder clock**, including waiting, recording, paused and stopped interval state.
This is a second capability provider for the same Godot integration, not another
application adapter. Selected-file text decoding and a live project clock grant
have separate controls. Ordinary recording, imported typing and offline inspection
continue with every integration disabled or Godot absent.

## User workflow and scope

In Typing Capture, choose **Create clock link**, explicitly select a disposable or
authorized Godot project and a new private JSON link file. No project files are
modified, installed, scanned or watched. The bundled Godot addon has an independent
**Recording clock** dialog: explicitly load that link in the same project. It
shows delayed native state. Optionally choose a new clock-samples JSONL file, then
stop saving independently of monitoring. OpenScreen can inspect this file offline
and report sample/gap/paused counts, maximum round trip and whether it has a footer.
A footer means that this journal closed; it does not certify complete observations.

The current typing producer remains independent. **The clock client neither pauses
typing capture nor places edits on video.** Continue using explicit onset
association and separate typing takes across pauses. Automatic continuous edit
projection requires a later, separately validated slice. There is no recording
start/pause/stop control in this transport and no editor text or scene contents.

The loopback listener exists only after explicit pairing, binds 127.0.0.1 on an
OS-selected port, rejects browser Origin requests and requires a random bearer
secret in a private new file. UI/diagnostic/sample records omit that secret. The
link contains the selected project path for client scope verification; keep it
private. Links expire after one monotonic hour or explicit Stop/application exit.
An expired/revoked file is preserved, but cannot authorize a new listener. A grant
binds to its first native capture identity and ends when that source ends or
changes; it cannot silently follow another take. Create a fresh link for a new
take. Unsupported helpers fail pairing explicitly without blocking capture.

Requests, sockets, peers, native queries, timeouts and journal sizes are bounded.
Malformed/replayed/wrong-project requests cannot reach the native source. Stop
invalidates in-flight pairing/query results before they can expose another take.
The project selection grants clock access only; the separate Godot file decoder
checkbox grants no live clock or text monitoring permission. No paid service,
network upload, plugin loader or automatic project installation is involved.

## Clock meaning

The helper accepts a bounded `clock <request-id>` query on its existing stdin
channel. Its response is built from the same CaptureClock used by the encoder and
native input projection, rather than UTC or a new wall-clock stopwatch. Responses
contain a native process-monotonic observation, capture/interval identity,
interval bounds and media milliseconds. They carry **no UTC timestamp**. Paused
media time freezes; resume opens a new interval. Missing/unsupported/ended helpers
produce an explicit unavailable or source-ended gap.

Godot records its own send/receive monotonic ticks and the native response. The
relation is a **round-trip bracket**, not clock equality, physical event timing,
frame-accurate sync or a continuous mapping. HTTP scheduling and renderer polling
can delay the displayed state. There is no inference that every pause, edit or
physical edge was observed between samples. Original typing journals remain intact.

The versioned clock-only journal has a header, ordered samples/gaps and optional
footer. It is bounded to 8 MiB / 50,000 records. The portable inspector is independent
of Godot availability, validates the envelope and clock bounds, and never turns a
missing footer or explicit gap into complete coverage. Metadata is unverified
imported observation, not source attestation.

## Validation evidence

Pinned Node 22.22.1; Godot 4.7.1.stable.official.a13da4feb on CachyOS.
Native Rust: **134 passed, one existing live-PipeWire test ignored**. Both Linux
helpers rebuilt; SHA256
`f7c5055fb322ebc201a01ef0122d0222b56d354dfee5ce2b9b2bbfe1a37b4d3c`.
A real hidden-cursor/no-button startup probe reports button privacy version 1,
clock snapshot version 1 and PipeWire 1.6.10 without starting a portal recording.
The native query has no input-reader or recording-control side effect.

The final real Godot client → real loopback broker fixture produced **11 samples,
two paused samples, one explicit unavailable gap, a closed journal and 56 ms maximum
round trip**. The broker's native source was a **synthetic encoder clock**, not
portal capture. A separate disposable headless Godot editor compile/startup/teardown
passed with the final addon. These checks establish actual GDScript parsing and
transport/journal interoperability; they do not establish GUI reachability,
physical input, live encoder alignment or desktop privacy acceptance.

Artifacts are preserved outside the checkout under
`../openscreen-evaluation/overnight-2026-11-06/`: `slice-11-*.log`,
`slice-11-hidden-clock-probe.ndjson`, `slice-11-helper-sha256.txt`,
`clock-bridge-live-fixture/` and `clock-bridge-final-fixture/` (raw journals,
Godot output and inspection summaries). Private probe links were explicitly revoked
and removed after each disposable run; original sample evidence is preserved.

Full milestone: **5,465 Vitest passes / 411 files**, 136.26 seconds; this also
covers slice 10. A subsequent Stop-during-helper-probe regression adds one test
outside that full count; final IPC/broker **11 tests / two files pass**, overlapping
the milestone. Both TypeScript configurations pass. Renderer/main/preload Vite
builds pass, Biome has only the 35 existing warnings, i18n validates 1,167 literal
keys and docs/diff checks pass. No additional native source changes followed the
134-test Rust run and helper build. Pairing is serialized; Stop/application exit
invalidates pending probes/dialogs before they can enable a late listener.
Claude review of the exact committed SHA remains pending until its actual report.

**Skipped:** real desktop/portal capture and counted OS input, live physical
pause/Stop/device loss, actual encoder → Godot timing under load, native visual
export/audio alignment, visible addon/renderer keyboard/accessibility inspection,
Windows/macOS, sustained capture and the rest of the desktop checklist. The Orca
computer provider lacks screenshot/hotkey/focus support. Headless fixtures are not
substitutes for these checks. No release or production acceptance is claimed.

The next concrete item is a shared application-neutral lesson manifest and editable
steps feeding an offline illustrated HTML/Markdown guide; continuous edit mapping
and remaining physical/platform acceptance stay open.

Primary API references: [Godot HTTPRequest](https://docs.godotengine.org/en/stable/classes/class_httprequest.html)
and [FileAccess](https://docs.godotengine.org/en/4.5/classes/class_fileaccess.html).
