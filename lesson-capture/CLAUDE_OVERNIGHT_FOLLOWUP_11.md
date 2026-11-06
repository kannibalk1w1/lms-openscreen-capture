# Review11 disposition (slice15)

Original [review11](CLAUDE_OVERNIGHT_REVIEW_11.md), exact f801837a vs1bd83d66,
is preserved. It found new MediumM14-1; prior MediumM13-1 was fixed for privacy
inspection/key ordering but capture correctness was not closed for split regions.

M14-1: `buildSceneDescription` now accepts an optional fragment allocator, keeping
its original `createId` default for ordinary preview/export. Lesson fingerprint
and actual still render share `buildLessonSceneDescription`, which reserves all
authored IDs and assigns deterministic, collision-checked IDs only to ephemeral
extra fragments. Authored IDs/payload/draw order remain intact. No native scene
schema or Rust/binary change is involved.

Coverage includes every projection family across trims and two clips: zoom,
annotation, caption annotation, speed, legacy camera, shader and layout. Tests
compare repeated scenes/hashes and render payload/order against the default scene
with identity fields omitted; edited source geometry changes the fingerprint.
They assert actual extra-fragment allocation, except two-clip layouts, which are
already materialized per clip and need no extra allocator call. A collision with
an authored synthetic-looking ID is explicitly covered.

Real disk DocumentService save/reopen/store-parse fixtures cross a trim or two
clips with a zoom; captures at1s and6s reach native callback, actual scene matches
the fingerprinted builder, and a later zoom-depth edit rejects the old fingerprint.
Actual Vulkan renders from a saved recovered project with a zoom crossing a trim
also succeed at0.5s and2s; a derived guide reopens. Original fixture artifacts are
preserved under lesson-guide-crossing-fragment-fixture outsidecheckout.

I14-1: UI now says **Exports and editable copies** retain correlation metadata.
I14-2: Markdown distinguishes derived revision0 from the source revision.
I14-3: leading indentation as Markdown code remains format debt for the profile
slice; no injection was found. I14-4/5 remain unreachable/not-current UI behavior
notes, not a claim of generalized transactional authoring or lesson undo.

177 focused tests/3 files and full5,519/416 pass134.66s (overlap). BothTS,Vite,
Biome35existing warnings,i18n1196,docs/diff pass. Review11 independently ran203focused/7 and
bothTS only; it did not run a new full/native/Godot/build check, so no new full skip
count is claimed from it. All physical/visibleDesktop/platform limits stay open.
Actual exact-SHA rereview pending; no production/release approval.

User rescinded07:30/08:00 limits after subscription interruption. Both scheduled
checkpoints were disabled by coordinator (enabledfalse verified); plan/roadmap
record current authority and preserve original schedule as superseded history.
