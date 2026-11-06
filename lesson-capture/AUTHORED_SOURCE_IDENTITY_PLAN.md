# Slice26 implementation status — 6 November 2026

The user explicitly resumed with “continue”. The bounded Linux backend described
below is now implemented and locally validated; actual exact-SHA Claude review
is pending. See [implementation and evidence](AUTHORED_SOURCE_IDENTITY.md). The
original inspected plan below is preserved as historical design, not a claim that
user-facing materialization, authenticated history or a player is delivered.

# Authored source identity — inspected dependency plan, not implementation

Historical source identity remains **open**. The current range backend has only
per-operation source hashes and a saved render-input fingerprint. This document
records the distinct next slice after the review23 process/provenance fixes; it
introduces no schema, authoring operation, migration or identity enforcement.
The user requested a pause after this current task. Resume this plan only after
explicit resumption and the coordinator's accepted checkpoint.

## Inspected seams and why this is a separate slice

- `src/lib/lesson/mediaSelection.ts` defines strict version1 geometry/render pins;
  `electron/lesson/rangePlan.ts` plans metadata without opening sources.
  `LessonService.planRange` in `electron/lesson/service.ts` currently delegates to
  that planner. Turning this existing metadata operation into implicit source IO
  would change its authority and cancellation behavior.
- `attachLessonMediaSelection` in `src/lib/lesson/authoring.ts` applies an async
  result only to the same current lesson/step/previous selection, preserves newer
  text, revises the lesson and returns the step to draft. Its stale-target contract
  must also protect a newly captured or explicitly refreshed content pin.
- `src/lib/lesson/schema.ts`, `LessonService.saveEditable`/`openEditable` and
  `electron/lesson/draftStore.ts` preserve full editable references through strict
  validation and bounded saves/recovery. Parsing/recovery must not read sources.
- `electron/lesson/fileCommands.ts` queries only `hasMediaSelection`; static output
  in `src/lib/lesson/export.ts` strips the entire selection. Keep both redaction
  boundaries, and the existing MCP/file permissions, unchanged.
- `electron/lesson/rangeMedia.ts` prepares ephemeral cuts through shared clip/scene
  readers, rechecks saved render inputs, hashes at most8unique sources and8GiB
  total, then renders with before/after checks. Its private `hashRegularFile` is
  the main reusable source-reader seam. It does not establish author-time bytes.

## Proposed contract and migration behavior

Add an explicitly versioned content-pin variant alongside legacy version1, rather
than mutating version1 or treating missing identity as trusted. A proposed new
record binds the existing project/render pin and selection geometry to bounded
opaque asset/source-role identifiers with file byte length and SHA256. No absolute
path, filename, label, inode or machine filesystem timestamp belongs in portable
identity records. Exact field names require implementation review; this plan is
not a shipped API or a promise of immutable historical attestation.

A distinct explicit author/refresh backend operation should capture these hashes
from the currently authorized saved project sources, with a clear author-current
versus refresh-current basis. Reuse pure geometry planning separately: ordinary
planning, open/save, recovery, query and static export must never silently capture
identity, upgrade a legacy record or discover missing files. The existing metadata
planner remains usable without Godot or any enabled application adapter.

| Situation | Planned behavior |
| --- | --- |
| New explicitly authorized content capture | Hash bounded regular sources; revalidate project/geometry and source identity before returning a pin for stale-safe attachment |
| Legacy/unattested version1 | Preserve on parse/open/recovery and identify as unattested; refuse materialization until an explicit current-content capture/refresh |
| Missing/unreadable/nonregular/symlink source | Fixed unavailable/unsupported error; no path leakage, fallback, directory scan or source discovery |
| Changed current bytes | Refuse materialization before output creation/rendering; do not replace the stored pin with an export-time hash |
| Same-path replacement with identical bytes | Content identity can match; this is a content pin, not historical inode continuity or proof the file never changed |
| Edit then exact byte revert | Old content pin may match again; do not claim continuous unchanged history |
| Explicit relink, even with identical bytes | Existing render fingerprint includes paths and must fail stale until explicit rebind/refresh; never silently rewrite that fingerprint |
| Explicit human-authorized refresh | Create a new current observation/revision, preserve the previous reference in source/recovery history, and never backdate the new hash as original author-time evidence |
| Cancelled destination for a valid attested request | Preserve cancellation before current source reads/rendering; identity presence/geometry may be checked first without filesystem IO |

Matching a JSON content pin is not proof that a trusted author created it: editable
same-user manifests can be forged. Record a local observation, not authenticated
human identity, signed history or immutable attestation. Do not use UTC timestamps
to imply encoder clock alignment. Source hashes prove full-file byte identity,
not correct visual content, audio alignment or source metadata duration.

## Bounded capture and enforcement design

1. Add a strict discriminated schema with bounded source entries, byte counts and
   SHA256 strings. Preserve lesson/step IDs and geometry. Existing manifest and
   recovery size limits continue to apply; schema validation alone opens no files.
2. Resolve only selected native dependencies through the shared ephemeral-cut /
   visible-segment builders, with explicit asset/role bindings. Keep the current
   unsupported-dependency policy (webcam/external audio/image/sidecar cases),
   at most8sources/8GiB total, and regular-file/no-follow/nonblocking reads.
   Do not choose files from an arbitrary path supplied inside an imported pin.
3. Extract/reuse the source hash reader, strengthening descriptor and named-path
   dev/inode/size/mtime/ctime revalidation. Bound chunk size and total work, check
   cancellation between chunks and document that kernel filesystem IO is not a
   hard real-time deadline. Start with the accepted Linux backend scope; other
   platform file-authority guarantees need their own tests/acceptance.
4. Re-read the saved project/render pin after capture, and attach only if the
   lesson target/previous selection still match. A delayed response cannot upgrade
   a replaced range. Explicit refresh requires fresh intent and a new observation.
5. At materialization, validate identity presence, exact source coverage/binding,
   saved project/render fingerprint and geometry without recapturing identity.
   After destination cancellation is resolved, compare current bounded source
   hashes to the stored pin before rendering/output creation. Retain source /
   project revalidation after render/decoded-output validation as well.
6. Keep private source locations inside the current project authority. Receipts
   may copy bounded opaque IDs/content hashes where necessary; queries remain
   presence/status only and static guides strip the complete selection, including
   every new identity field. Loading a full portable reference does not discover,
   relink, refresh or authorize arbitrary local source reads.

Before/after checks cannot pin every native pathname use atomically or defeat a
malicious same-user swap between observations. Document that residual race. Reuse
safe file handles where existing renderer contracts allow; do not pretend native
path-based rendering has acquired an immutable source snapshot. A later snapshot
or stronger native descriptor API would be a separate design/acceptance decision.

## Required acceptance before calling source identity delivered

- Author a new pin from disposable real source bytes, attach, save/reopen and
  explicitly recover it; preserve reference/step IDs and provenance exactly.
- Legacy parse/reopen/recovery succeeds unchanged; materialization refuses it and
  no hash is inferred or stored by planning, export, query or recovery.
- Changed, missing, truncated, same-size rewritten, replaced and symlinked sources;
  project changes during hashing; mismatched asset/role coverage; no implicit
  discovery; unsupported dependencies and8source/8GiB boundaries with bounded doubles.
- Query canary redaction and static HTML/Markdown/reference stripping, full editable
  source portability, malformed/extra identity fields and existing size limits.
- Explicit relink/refresh behavior, stale async attachment, authored text edits
  during capture, and cancellation preserving existing source/destination authority.
- Real disposable MP4 copy: capture pin, save/reopen, alter source bytes and prove
  refusal before native output, then restore exact original bytes and prove content
  matching again. Record original/source/project hashes and all artifacts; never
  modify a real lesson or silently refresh to make the altered source pass.

No item in this acceptance list is claimed by the settlement/provenance slice.
Historical source identity remains the prerequisite before any user-facing
materialization integration or timed delivery.
