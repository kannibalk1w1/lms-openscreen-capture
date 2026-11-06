# Review16 disposition — slice20

Actual review16 examined74d58a5a against414823d6, found no High/Medium and
accepted the query/export logic and scope. It independently ran167 focused tests
in11files,0skip,4TS configs, touched15-file Biome and source/privacy/permission
mutation probes. It did not run full/Vite/Electron CLI or stdio/native/desktop.
It independently closed T18-1 and confirmed the delayed-digest source guard by
mutation. Both original review reports remain unchanged.

LowL19-1: coordinator chose the conservative HTTP boundary. Enabling the server
with MCP edits off continues to grant project reads; HTTP arbitrary-path lesson
queries now require the existing MCP edits permission before any filesystem
access, just like guide export. This does not introduce another permission
framework or grant. Explicit CLI file selection and existing stdio/app-channel
explicit-launch authority remain. No discovery or recovery-store API is added.

The shared registration takes explicit transport/permission dependencies. Actual
HTTP and in-memory tests spy on filesystem lstat/open, assert neither is called
when query permission is off, and check subsequent grant/revocation. An immutable
74d58a5a snapshot outside checkout, overlaid with the current helper/server/tests,
passes the selected actual HTTP test; moving a read before the gate fails it on
filesystem access. Logs retain exact selection/skips. Existing stdio query
semantics have a separate bounded SDK transport test. No real stdio process was
launched. Settings append an explicit lesson-file authority hint before granting
MCP edits; old translations remain and the new hint is English fallback in all
15 locales, not a claim of translated-language acceptance. Tool/server guidance
and the IPC trust comment now match this boundary.

N19-2: documented that an explicitly chosen destination directory symlink is
followed, whereas source leaf symlinks are rejected. Missing output parents fail
without recursive creation. N19-3: repeated query flags remain last-wins, as
existing CLI parsers commonly do; docs now say so. Duplicate output directories
remain rejected. N19-4: SDK diagnostics identify invalid field/key names without
returning their values; fixed file errors remain unchanged.

The same slice adds offline guide reading navigation/print improvements over the
existing validated projection. No JavaScript, account, storage/progress, media
player, timed segments or live application collection is introduced. Its own
exact tests/artifacts/limits are in [guide coverage](../LESSON_CAPTURE_GUIDES.md).
Review17 must assess this new slice; review16 approves only its own immutable SHA.
