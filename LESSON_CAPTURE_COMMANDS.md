# Explicit-file lesson query and guide export

Slice19 shares the lesson reader, validators, review filters and verified guide
export service with the existing CLI and both existing MCP server transports.
This is file access over an already authored lesson, independent of integrations,
Godot, recording, video projects or native rendering. It adds no application
adapter, live collection, server enablement, authentication or configuration change.

## CLI

Use a separately saved editable lesson file, not a video project:

```sh
openscreen lesson query ./lesson.openscreen-lesson.json --json
openscreen lesson query ./lesson.openscreen-lesson.json --title "First" --status draft --source authored --problems-only --json
openscreen lesson export ./lesson.openscreen-lesson.json --out ./existing-guide-parent --step 12345678-1234-4123-8123-123456789012 --json
```

`--step <UUID>` is repeatable. Export requires1–200 unique explicit IDs and an
explicit existing output directory. There is no default selection, `--all`,
automatic destination, directory scan or source-file replacement. Relative CLI
paths resolve from the command's current directory. Query options are title
(max300 characters), status `all|draft|reviewed`, source
`all|authored|recording-flag|typing-section`, and `--problems-only`. Missing query
fields use the same UI defaults. Invalid/unknown options and unsupported manifests
fail. Title search is NFKC plus default lowercase substring, not full Unicode case
folding or locale-aware search. Findings and source reviewed labels are advisory.

With `--json`, stdout contains one newline-delimited event: success is
`{"event":"done","result":...}`; file-operation failure is
`{"event":"error","message":"lesson-file-operation-failed"}` with exit1.
Argument errors use the existing CLI error/help path and exit2. Without `--json`,
success is readable JSON and file failure is the same fixed error string. This
command has no JSON-output-file option. Successful query output contains lesson
UUID/revision/title, total/matching counts and matched step IDs, source-order
numbers, titles, draft/reviewed status, source kinds, image/code presence and
review findings. It omits instructions, code, image bytes/alt, evidence identifiers,
source paths, provenance hashes and extensions. Authored titles are still content:
select only a lesson whose titles may be shared with the client.

The early CLI route runs before media permissions, recording services or runner
creation. It retains existing CLI session isolation/Chromium process mechanics;
it is not a separate standalone executable. No recovery store APIs are imported.

## MCP

The existing enabled/authenticated HTTP server and explicitly launched
`openscreen mcp` stdio server both register:

- `queryLessonFile({manifestPath, query?})`: an absolute server-local path and the
  same bounded filters. Returns the minimal summary above and works with MCP
  edits disabled. It has read-only/non-destructive annotations.
- `exportLessonGuide({manifestPath, outputDirectory, stepIds})`: both paths
  absolute, explicit unique IDs required. The existing MCP edits permission must
  allow writes; refusal happens before file access. The HTTP setting is checked
  for each call; stdio uses its existing explicit-launch write authority. The
  tool is a write, annotated non-destructive because it creates new files only.

Missing/invalid tool arguments are refused by the existing SDK schema validation;
file/parser/OS failures return a fixed error with no raw payload or filesystem
path. SDK validation diagnostics identify fields but are not raw file errors.
Export success returns the explicitly chosen output folder path and step/image
counts. It does not return the full lesson or illustrations through MCP.

There is no recovery-list/status/location/read/delete/save tool, IPC forwarding,
app-data lookup, directory discovery or inferred source path. The caller must
explicitly select a file. If a caller already knows and explicitly selects one
valid lesson file located in a recovery directory, the same single-file reader
can read that file; this is not recovery-store discovery or a sandbox against a
client that already has local filesystem authority. No recovery location or OS
username is automatically included in responses. Server access remains governed
by existing MCP enablement/authentication; no new network listener is introduced.

## Output and safety bounds

Both channels use the same bounded16MiB regular-file reader as editable Open and
manual recovery, with leaf-symlink/nonregular rejection and full manifest/image
validation. They never reconstruct lesson content from recording/input journals.
The standalone image validator alone is not a substitute for full validation.
Existing same-user filesystem races and Windows/no-follow/ACL limits still apply.

Export preserves source bytes, uses the stored reading/language/direction and
image/code inclusion settings, projects only selected steps/dependencies, creates
a fresh derived UUID and immediate-parent lineage, and writes HTML, Markdown,
selected editable manifest, referenced JPEGs and a completion receipt. SHA256
readback verification precedes the receipt. Excluded code/image/alt/assets and
unknown extensions are omitted from all derived files. Selected instructions
remain part of learner output. Every export creates a new UUID folder inside the
selected existing parent; existing files are not overwritten. Failure can leave
a partial folder without a completion receipt; the tool does not silently delete
or label it complete. Source labels are not privacy approval or learning proof.

## Evidence and limits

The disposable `lesson-file-commands-fixture/` uses a copy of earlier synthetic
source evidence and actual bundled Node22 parser/commands:2 queried steps,1
selected output,0images/code under source exclusions,3 receipt hashes verified,
unknown selection refused and source/prior evidence byte-identical. It launches
neither Electron nor native media. SDK in-memory protocol tests cover schemas,
minimal responses, fixed errors, permission revocation between calls and fresh
output; real authenticated HTTP tests exercise query with edits off and export
with edits on. CLI dispatch tests verify early routing before media services.

Slice19 also repairs review15 LowT18-1: Restore assertions now await busy drain.
A pinned Node22 immutable414823d6 snapshot outside checkout passes11/11 with the
waited regression and fails the same-identity case10/11 when the generation bump
is removed. A delayed integrity-validation test exercises the second document
stale guard. Review14's original report is preserved; review15 corrects its
reachability claim: real Chromium151's disabled fieldset already blocks real
Restore/typing during a pending illustration. The guard fixes are state-level
defence in depth, not a demonstrated physical-user bug. Neither probe was the
actual Electron dialog or real OS desktop input.

An initial snapshot/test attempt hit a full tmpfs `/tmp` and produced no test
coverage; only the newly created failed snapshot was removed. Scratch files/tests
were rerun on `/home`. The first full rerun used a long evaluation TMPDIR,
which exceeded the Linux Unix-socket path limit:5,561pass/13fail in422files
plus one unhandled socket error, all failures in the existing app-channel suite.
That is not a passing milestone. A short private cache TMPDIR restored that
suite:15/15 pass; a fresh full run then uses the short path recorded in
`slice-19-temp-root.txt`. Earlier evidence
and other processes' temporary files were not removed. Full milestone and final
build/check counts are appended after completion. Physical desktop, OS input,
portal/native timing/device loss, accessibility/screen readers, Windows/macOS,
packaged CLI/stdio process and sustained-use acceptance remain open.

Final slice19 milestone: **5,575 tests/422files,0skipped**,125.76s. It includes
all final source/test changes, including the separate POSIX symlink case. Focused
218/19 preceded the final delayed-validation case and symlink split;12/1 dialog
and5/1 file-command runs overlap that/full evidence and must not be added.
Root/test TypeScript pass; Vite renderer/main/preload passes; whole Biome reports
35 existing warnings and touched15files are clean; i18n1243 and docs/diff pass.
No Rust/helper/compositor source or binary changed, and no native test/build or
physical acceptance was rerun. Review16 must assess this exact committed slice;
review15's acceptance covers414823d6 only. Next concrete item: accessible offline
guide navigation and print presentation, with media-player acceptance still open.
