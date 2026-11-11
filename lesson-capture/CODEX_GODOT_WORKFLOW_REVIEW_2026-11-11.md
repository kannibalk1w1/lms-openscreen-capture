# Independent workflow review and recording acceptance — 11 November 2026

A separate read-only Codex collaborator reviewed `8dba84d5` and the X11 source-enumeration
follow-up. Claude remains at its reported weekly limit; this is not a Claude review.

## Finding and disposition

**P2: an in-flight illustration could attach to a replacement take.** Replacement has
its own asynchronous validation, allowing another parent operation to begin meanwhile.
If the replacement committed first and both image IDs were undefined, the older capture
could pass the existing attachment guard and attach to the new take.

The integration regression `does not attach an old in-flight illustration after a
replacement take commits` reproduced this: the old code saved an unexpected image ID.
The workflow commit callback now increments the existing lesson generation after a
successful authoring change. Pending illustration/range/save/export callbacks use the
existing `current()` checks and reject the older generation. Busy state still releases
unconditionally. The regression passes; the two GUI test files pass 30 tests.

Independent recheck: the reviewer accepted the correction, confirmed the test's event
ordering, and reported no further actionable findings. The collaborator performed
static review only; the coordinator ran the tests and production probes.

## Additional recording issue found by actually using the app

The real demonstration exposed remaining combined screen/window calls in source
selection/restoration, although public source listing already applied the X11 split
workaround. Both internal paths now use the same existing sequential helper. Wayland,
Windows and macOS selection policy stays as defined by that helper.

Validation: 20 source-enumeration/ownership/settings tests, full 6,772 tests / 495 files,
real production CLI/MCP startup, and three repeated actual X11 source-restoration calls
before a successful GUI recording. The final illustration-race correction came after
that full suite and has targeted 30-test coverage, both TS checks and a final build.
No fresh full-suite result is claimed for that one-line follow-up.

## Actual recorded deliverable

`../Godot sprint demo 2026-11-11/index.html` opens a captioned approximately 45-second
H.264/30 fps 1280×800 video, an eight-step generated guide, editable lesson with manual
run check/handoff, raw Godot journal and a finished runnable Godot project. The untouched
OpenScreen WebM, capture metadata, extracted frames and earlier attempts are retained.
The clean take is `attempt-6`.

The actual GUI recorder's Record/Stop and Hide actions were automated through CDP on an
isolated X11 display; camera, microphone and system audio were off. Godot edits and
journaling used editor APIs. Eight authored markers and 18 observations decode with
sampled coverage and a user-stop footer. Observed yellow-star positions in actual frames
34 s and 36 s moved from approximately (642,444) to (802,325); this supports visible
motion only. Captions are approximate author annotations, not clock synchronization.

Godot emitted an internal editor-list error and a software-driver V-Sync warning. The
manual check explicitly records those limits; no clean-engine, hardware, automatic
grading or learning-achievement claim is made. CLI recording attempts hit GTK startup
failure on this isolated setup; the delivered video used the working normal GUI route.

WinBoat physical-style GUI acceptance remains blocked: Orca still lists no accessible
apps. No visible logged-in VM desktop has been supplied. The demo does not substitute
for that test. Project archive/restore, live KDE acceptance, automatic output/error
collection and automatic video synchronization remain separate work.
