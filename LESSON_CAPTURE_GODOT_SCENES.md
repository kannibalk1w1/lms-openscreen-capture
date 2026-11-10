# Godot scene observations — first bounded slice

10 November 2026. The learner player proof of concept is parked at the owner's
request. Deeper Godot integration is the current priority.

## Author workflow

1. Copy the optional `integrations/godot-typing/addons/openscreen_typing` addon into
   a project you explicitly want to demonstrate, then enable it in Godot's Plugins
   settings. Nothing installs or enables it automatically.
2. Open the scene to demonstrate. Choose **Capture scene actions**, read the scope
   confirmation and choose a **new** `.jsonl` file. Cancelling leaves capture off.
3. Demonstrate scene edits. Stop with **Stop scene capture**. Switching/closing the
   scene or disabling the plugin ends the take. Each new take needs explicit start.
4. In OpenScreen's **Lesson guide**, expand **Application capture observations** and choose
   **Import application capture or Godot journal**. Review the baseline and before/after evidence.
5. Select the observations that matter and choose **Add selected observations as
   draft steps**. Edit their titles/instructions, choose illustrations/media through
   the existing authoring controls, review and save the lesson normally.

The imported file is read only. Import does not connect to Godot or authorize live
collection. No persistent adapter setting, recording-clock grant or video-window
selection silently starts scene capture. Decoding and reopening saved selected
observations work with Godot absent and all live integrations disabled.

## What the evidence means

The addon now samples on public scene-tree/selection/Inspector signals with a
50 ms minimum spacing, plus **250 ms fallback polling**, deduplicating unchanged
snapshots. Inspector requests are limited to the current scene and the same
property allowlist. Observers connect only for an explicitly started take and
disconnect on stop/scope change/disable/write failure. Signal names are retained as
`samplingTrigger` context; they do not prove which action caused a state change. A starting snapshot provides context; it does not assert those nodes
were created during this take. The offline decoder compares later snapshots to
report nodes appearing/disappearing, names/parents/properties changing and selection
changes. A separate public editor signal records scene saves. The addon uses the public
[EditorInterface](https://docs.godotengine.org/en/stable/classes/class_editorinterface.html)
and [EditorSelection](https://docs.godotengine.org/en/stable/classes/class_editorselection.html) APIs. It never asserts a
specific click, creation command, Inspector gesture, undo cause or learning outcome.

Captured fields are deliberately narrow:

- Current root and descendants owned by that root: session-local object IDs,
  names, native types and parent IDs. Internal/non-owned subtrees are excluded.
- Node2D position, rotation (radians), scale and visibility.
- Script resource identity and Sprite2D texture resource identity: `res://` paths
  only; built-in/unsaved and external/unsupported resources have explicit markers.
- Selection IDs within the observed node set.

No arbitrary Inspector/custom properties, metadata, script source, resource bytes,
other scenes, project scans, global inputs or network messages are collected.
Node/resource names can still be private: inspect them before sharing. This is
sampled state, not a guarantee of every intermediate change. Inherited/instanced
non-owned children and their properties are outside this first slice. Node order
and runtime/run/error diagnostics are not captured yet.

Random adapter-instance and take identities, contiguous sequences, original elapsed
milliseconds and the stable root identity isolate journals. Malformed, mixed,
unsupported and truncated journals are rejected. Imported producer claims are
labelled as unverified; a file is not authenticated evidence. The clock is explicitly
**unmapped**. It is not encoder time and does not follow recording pauses.

Only selected observations are copied into draft steps, using generic optional
`application-observation` evidence with bounded application payloads. No baseline
or unselected observation is silently copied into the lesson. Drafts remain drafts
until author review; selecting evidence does not assign a video range. Selected
before/after data survives editable lesson save/reopen without the addon. Older
readers that do not understand this added evidence kind may reject such lessons;
ordinary older lesson files remain readable. Guides contain the authored teaching
text; the editable lesson retains structured evidence.

## Bounds and failures

512 nodes, hierarchy depth 64, 4,096 records including the footer, 8 MiB JSONL,
24-hour elapsed clock and up to 10,000 retained decoded observations within the
normalized byte budget. Larger valid diffs retain a visibly limited prefix; the
whole raw journal is still validated and corrupt tails are refused. The importer validates tree,
selection, lifecycle, identities, clock order, paths and strict property allowlists.
An oversized starting scene refuses capture. Hitting a runtime limit closes with
`limited` coverage. Ordinary closure says `sampled`, never `complete`.

Files are flushed per record. Write errors stop capture and display an incomplete
file error; incomplete files cannot be imported. Existing output paths are refused
before opening. Godot's FileAccess writer does not provide atomic exclusive-create
here: concurrent replacement of a path between the check and open is not prevented.
Use a new private path. Plugin failure cannot stop or control OpenScreen recording;
there is no live transport between this observer and the recorder.

## Validation and remaining work

Run the real disposable editor probe with pinned Node and a selected Godot binary:

```sh
GODOT_BIN=/path/to/godot node scripts/probe-godot-scene.cjs
```

It retains its entire fixture/logs under `/tmp/godot-scene-probe-*`. It enables only
the disposable addon, exercises real Godot EditorInterface/EditorSelection APIs,
adds/renames/transforms/reparents/removes a Sprite2D, assigns a texture/script,
saves, switches scenes, disables the plugin and checks stop/reuse/privacy canaries.
It also exercises the real writer at both record and byte limits, then decodes
those journals after Godot exits. A simulated footer-write failure verifies that
the failure status survives and that its incomplete journal is rejected. The retained
small journal in `integrations/godot-typing/probes/fixtures/scene.jsonl` is parsed by
committed tests. The fixture is synthetic, not a recording of a real lesson project.

The original slice was Godot **4.7.1 on Linux**, headless editor/API coverage.
The follow-up also passes in WinBoat Windows 11; see the
[Windows and reuse validation](lesson-capture/GODOT_CAPTURE_WINDOWS_REUSE_2026-11-10.md). The dummy renderer
reports a thumbnail warning when saving the scene; thumbnail rendering is not
part of this proof. It does not establish physical Inspector/mouse/picker input,
macOS, real screen recording, audio, or accessibility acceptance.

Next: explicit semantic-to-recording clock association with pause/gap handling,
then a lesson-oriented Enemy/Sprite2D/asset/scale/save/script/run walkthrough and
checkpoint comparison. Broader Inspector fields, 3D properties and diagnostics
need separate field-level scope and validation. No generated action wording or
video synchronization should be inferred from the sampled journal alone.

Validation: [6,437 tests, real Godot probe and exact scope](lesson-capture/GODOT_SCENES_VALIDATION_2026-11-10.md).

The shared offline review and draft path now accepts a bounded application-neutral
format; [adapter recipe and contract](lesson-capture/APPLICATION_CAPTURE_CONTRACT.md).
