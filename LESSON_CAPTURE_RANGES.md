# Explicit lesson video-range references — slice21

A lesson step can now retain an explicit author-selected interval on the saved
video project's editor ruler. This is a learner-package prerequisite, not a
playable video asset or a claim about recording, device, typing or Godot clocks.
Ordinary lessons, recording and guides still work with integrations disabled.

In Lesson guide, use the step's **Video range reference** controls: enter start
and end seconds, or explicitly use the current playhead for either boundary,
then choose **Attach range from saved project**. Save the project first. Successful
attachment marks the step draft, keeps its other authored text, and stores the
reference only in the separate lesson. **Remove video range reference** removes
that step's reference. Neither operation edits the video project. Opening the
controls or moving the playhead does not collect or attach a range automatically.
Local field edits are pending until Attach; save a lesson or explicit recovery
copy to retain the attached revision. No autosave is introduced.

The main-process planner reads the chosen saved project by its existing project
ID and checks the shared render-input fingerprint sent by the UI. Dirty, changed,
restored/replaced and late-source results are refused or fenced before attachment.
Attachment uses current authored state, preserves later text edits and refuses a
removed/changed target. Main/preload/UI errors are bounded fixed codes, without
raw project paths or source exception text. Requests are validated before a
project read. No new MCP/project/path discovery or recovery-store API is added.

## Range and clock meaning

The version1 `mediaSelection` step field records:

- `provenance: authored-selection`, `basis: editor-ruler-seconds`, start/end and
  the saved project ID plus `render-inputs-v1` fingerprint;
- up to128 kept ruler spans, derived using the same trim/clip reader as the editor;
- a separately labelled `editor-programme-seconds` start/end, derived with the
  existing cuts/speed projection. These are continuous numeric seconds, not an
  encoded frame grid, sample-accurate audio boundary or physical observation.

The requested interval is half-open. Start must be inside kept video; end must
be a kept span's positive endpoint or interior, so a removed/gap boundary is
refused instead of silently clamped. Internal cuts and gaps remain explicit in
`keptSpans`; they do not become fabricated media. Unprobed clips anywhere in the
project are refused because they can shift programme time. Overlapping kept
spans anywhere in the project are refused rather than choosing an owner. More
than128 selected fragments is refused. Selection ruler bounds are0–86400seconds;
derived programme bounds are finite/nonnegative, positive length, up to8640000
seconds. Imported structural bounds/order are validated, not repaired.

The fingerprint identifies render inputs, not original media bytes or an
application/project attestation. The planner does not open/decode source media,
check its availability, encode video, package audio/captions or read input journals.
A stored/imported reference can become stale after edits or moving/missing media.
Imported plans are unverified claims until revalidated against an explicitly
selected unchanged source. Nothing equates these editor clocks with native
capture/input time, UTC or independent application clocks. Future media output
must revalidate the source and test the actual encoded result before making
frame/audio/playback claims.

## Saving, query and output boundary

Full editable lesson saves/reopens and explicit manual recovery copies retain
these bounded references. Source manifests using the new optional field require
a slice21-or-newer strict reader; older readers reject it rather than dropping it.
Old manifests without references remain unchanged and open normally. The root
manifest stays development format version1; the new nested field has version1.

Explicit-file CLI/MCP query returns only `hasMediaSelection`, alongside the
existing minimal step summary. It does not expose project IDs, fingerprints,
kept spans or programme times. HTTP still requires MCP edits before arbitrary-path
lesson reads; CLI/stdio/app-channel keep their existing explicit-file/launch
boundaries. Attaching a new plan currently uses the GUI/saved-project IPC route;
a remote planning command and fine-grained file grants remain open.

Static HTML/Markdown guides contain no video, so their selected editable manifest
projection strips unresolved range references from every selected step, even when
images/code are included. Source metadata and full saved lessons remain intact;
no video files or source paths are silently added to guide folders. This is a
purposeful derived-output exclusion, not a complete learner package. Packaging
selected media segments, captions, accurate encoded boundaries, offline timed
controls and progress remain future work.

## Evidence and limits

Tests cover saved fingerprint refusal, cut/speed projection, invalid/removed/
outside boundaries, overlaps, unprobed clips, the128-fragment cap, full source
roundtrip, malformed/imported plans, static-guide exclusion, query minimization,
fixed IPC errors before reads, explicit UI attach/save/remove and a late project
change. Functional attachment preserves newer authored text and refuses changed
or removed targets. Existing review/state tests continue to apply.

A real DocumentService disposable fixture copies an earlier synthetic MP4 into
its own project, saves a cut1–2seconds and2x speed2–4seconds, then reopens it in a
fresh service. Requested ruler0.5–4 yields kept0.5–1 and2–4, with derived programme
0.5–2. Full lesson and explicit recovery roundtrips retain the plan; query exposes
only its presence; static guide strips it. Changing the fixture project makes the
old fingerprint fail. Source lesson/original evidence bytes stay identical. It
makes0 native render calls and does not decode or play media. An Electron app-path
lookup is stubbed only in this external Node fixture; it is not an Electron run.
Artifacts: `slice-21-*` and `lesson-range-fixture/` outside the checkout.

The slice also addresses review17 N20-1 with factory-level HTTP/stdio transport
propagation assertions and N20-2 by reusing the neutral English StepN fallback in
empty/whitespace title headings, matching contents/region naming without rewriting
source or Markdown. N20-3 remains a presentation nit: the English contents
container is LTR, while authored RTL title spans retain their own direction;
fully mirrored contents markers/alignment are not claimed. Original review17 is
preserved unchanged. No new native/helper/compositor source or binary is involved.
Physical desktop, actual Electron/stdio processes, screen readers, platform/native
capture and sustained acceptance remain open; no production/timed-player claim.

Final validation: **5,592tests/424files,0skipped**,139.66s;158focused/11files
(overlap). Root/test TypeScript, renderer/main/preload Vite build, whole lint
35existing warnings, i18n1253, docs/diff pass. The9 new UI keys and associated
error string use English fallback across all15 locales; parity is not translation
or linguistic acceptance. No Rust/helper/compositor source or binary changed and
no native/physical test or build was rerun. Actual review18 must assess the exact
committed SHA. Next concrete item: selected-media materialization/revalidation and
encoded-output proof, before claiming offline timed-player behavior.
