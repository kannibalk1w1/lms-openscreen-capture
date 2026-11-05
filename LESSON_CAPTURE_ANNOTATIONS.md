# Vector annotation arrows and numbered steps

The editor now has **Draw arrow** and **Add step box** controls above the preview.
Restart the development app to load the rebuilt renderer and native compositor.

## Drawing and editing

- Choose **Draw arrow**, press at the tail, drag to the target and release. Tiny
  clicks create nothing. Escape, pointer cancellation or changing projects cancels
  the drawing tool. Drawing pauses playback and uses the existing new-region
  duration at the playhead.
- The new annotation is selected on its normal timeline track. Drag its endpoint
  handles to aim it, or drag its stroke/selection box to move it. Selection-box
  handles scale the vector geometry. Colour and line thickness stay editable.
- In the annotation inspector, **Arrow type** chooses **Straight**, **Curved** or
  **Elbow** after drawing. A curved arrow has a bend control; an elbow's middle
  horizontal position controls its right-angle route. Focused handles also accept
  arrow keys for fine adjustments.
- Existing compass-direction arrows keep their previous rendering. **Edit arrow
  with endpoint handles**, or choosing a new type, upgrades one individually.
  Converting a text/image annotation to an arrow also creates an editable connector.
- **Add step box** creates an editable text annotation such as `1. Step description`
  on the normal text plate. The next number follows the highest existing numbered
  text step. Edit the number and wording in the text inspector. These are freely
  positioned boxes; arrows do not automatically attach to them or renumber after
  deletion/reordering.

Endpoints and bend controls are stored as normalized coordinates inside a scalable
annotation box. They survive save/reopen, project packaging and normal annotation
history/timeline edits. The native compositor builds line segments and arrowhead
geometry at render time, with quadratic curves subdivided into 32 segments.
Preview, MP4 and GIF share this rendering path; geometry is not a text glyph or a
baked image. The legacy path is retained for existing projects.

Custom SVG heads, reusable appearance styles and secondary whole-arrow imports are
covered in [LESSON_CAPTURE_SVG_ARROWS.md](LESSON_CAPTURE_SVG_ARROWS.md).

## Validation — 5 November 2026

- Full Vitest: **5,226 tests / 378 files pass**. Both TypeScript configurations,
  Vite build, i18n and Biome pass; 35 pre-existing lint warnings remain. English
  fallback strings were added across locales; translations are pending.
- New tests cover drawing/reversed direction, tiny clicks, Escape cancellation,
  arbitrary endpoint save/reopen and scaling, shape changes, invalid persisted
  points, step numbering and actual timeline creation of arrows/step text.
- Headless Chromium exercised the actual drawing layer, AnnotationLayer and
  connector controls: draw, choose curved type, drag an endpoint, adjust a handle
  by keyboard, and resize the bounding box. The isolated harness supplies the
  application's positioning utilities and a simple SVG paint stand-in; it is a
  control interaction check, not a full desktop editor pass.
- Native Vulkan preview plus MP4 exports show straight, curved and elbow geometry
  and a numbered text box. All three exports contain the expected coloured vector
  pixels. Native connector unit tests: **2 pass**; existing arrow-related tests:
  **12 pass**, including Linux GPU rendering checks.
- The compositor addon and six matched FFmpeg libraries were rebuilt/staged.
  Addon SHA256:
  `55b8f37e5e48cacf645ee19ef45f980f6f8f9635a6877c74b25c583659ca7ea9`.
- Artifacts: `../openscreen-evaluation/vector-arrows/` — reproducible native script,
  per-type scenes/MP4s/PNGs, native preview, browser interaction fixture/screenshot,
  and pixel-count report. Browser harness uses `/tmp/lc-arrows-ui` as its build
  directory and runs from the checkout root.
- Not exercised: the full native desktop editor gesture flow (Orca app discovery
  was unavailable in the preceding checks), Windows/macOS runtime, GIF output,
  complete undo/speed/cut matrix, attachment to moving boxes, and remaining manual
  checklist sections. No release acceptance or publishing is claimed.
