# SVG arrowheads, styles and whole-arrow graphics

Restart the development app to load the rebuilt renderer and Linux compositor.
Draw or select an editable arrow, then use its annotation inspector.

## Editable arrows first

**Import SVG arrowhead** adds custom artwork to the existing straight, curved or
elbow connector. Endpoints, bends and bounding-box scaling remain editable. Choose
solid/dashed line, target/both/no heads, open/filled triangle/custom SVG design,
and head size. Colour and line thickness use the existing controls.

Author head artwork pointing right, with its tip at the right edge halfway down
the SVG viewBox. Original colours are retained; `currentColor` follows the shaft
colour. Paths, groups, basic shapes, gradients and internal references are
supported. Keep files self-contained and under 256 KiB; convert lettering to paths.
Scripts, external resources, embedded raster images and SVG text are rejected.

Name the appearance and choose **Save style** to reuse it across projects. Applying
a style preserves the arrow's geometry. Up to 20 local styles can be saved;
saving the same name replaces it. The last applied/saved style is used when drawing
new arrows. Presets live in this app profile; SVG source on an actual annotation
is embedded in the project and survives JSON save/reopen and project packaging.

## Secondary: whole-arrow SVG graphics

Expand **Whole-arrow SVG graphic** and import artwork to replace the selected
arrow with a graphic. The image annotation uploader also accepts SVG. Move and
resize it with the usual controls; the SVG rotation slider turns the whole
artwork. Endpoint/bend editing applies to connectors, not imported whole graphics.
The original self-contained SVG source is stored in the project.

## Rendering and reuse

Styled connectors remain vector geometry in the document. At the shared native
preview/export boundary, their paths and head artwork become an SVG image scene.
The compositor uses the existing image render path with the MIT/Apache-2.0 `resvg`
renderer, rasterizing at the render target size (up to 4096 pixels on the longest
side). Plain default arrows retain their existing native geometry. Windows,
macOS and Linux backends share the SVG decoder. SVG image caching now uses content
and render size, so equal-length artwork edits invalidate cached pixels.

## Validation — 5 November 2026

- Full Vitest: **5,244 tests / 382 files pass**. Both TypeScript configurations,
  Vite build, i18n and Biome pass (35 pre-existing lint warnings). Targeted
  persistence checks also pass after their final assertions. Automated checks cover
  SVG import validation, source roundtrip, preserving custom styles through shape
  changes, native scene preparation, rotation idempotence, local preset reload,
  appearance controls and distinct head/whole-graphic imports.
- An isolated Chromium harness exercised actual SVG file input/import, dashed
  lines, both heads, save/reload/apply preset, whole-graphic import and narrow
  light/dark layouts. This uses the real controls and importer; browser filechooser
  automation supplies files, rather than testing the operating-system picker.
- Rebuilt Linux compositor: custom magenta heads on a green curved dashed shaft
  and a rotated gold whole SVG appear in native MP4 exports. The custom-head
  curved/dashed arrow also passes an actual native preview pixel check. Native preview
  updates from red to blue for two equal-length SVG sources under the same image ID.
  Native SVG alpha/target-size test: 1 pass; connector tests: 2 pass; existing
  arrow-related Rust tests: 12 pass.
- Artifacts and reproducible harnesses: `../openscreen-evaluation/svg-arrows/`.
  Native addon SHA256:
  `de5c698d5e090fdc4aa222ab4b2a889b7fa40e0f974bfb04aac27b42fb75d17f`.
- Not exercised: complete desktop editor/file-picker gestures (Orca computer-use
  app discovery returned no applications), Windows/macOS runtime, GIF output,
  every SVG editor's syntax, and the remaining manual checklist. This is a partial
  feature check, not release acceptance. New locale strings use English fallback.
