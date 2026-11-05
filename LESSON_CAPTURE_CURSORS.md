# Custom cursors and click-location markers

The Cursor inspector now supports project-local custom PNG sprites and an amber
click-location ring in the native preview and exports. Restart the development
app after rebuilding so Electron loads the new renderer and native addon.

## Use

1. Record with **Editable cursor** enabled, then open the recording in the editor.
2. Open the **Cursor** inspector and enable **Highlight click locations**. This
   uses recorded left-click telemetry; it does not infer clicks from video pixels.
   It works with 3D cursor and click bounce switched off. The cursor must be visible.
3. Under **Custom cursors**, choose a cursor state, then **Import cursor PNG**.
   PNGs can be transparent and must be at most 256 × 256 pixels and 1 MB.
4. Click the point in the image that should touch the target, or adjust **Hotspot X**
   and **Hotspot Y** with the keyboard-accessible sliders. The yellow cross marks
   that hotspot; native rendering preserves the image's aspect ratio.
5. **Use theme cursor for this state** removes that override. Other imported states
   remain intact. Theme sprites fill states without a custom override; states set
   to appear as an arrow use the custom arrow if present.

Custom image bytes and fractional hotspots are saved in the project, without an
external file reference, and follow normal settings save/undo behavior. They
therefore travel with the document and work in the same scene used for export.
Style-preset files do not yet include these project-local cursor overrides.

Click markers stay separate from **Click impact**, which moves the picture, and
**Click bounce**, which animates the cursor. The marker grows and fades over about
0.4 seconds, with an amber ring and dark halo. Its minimum size follows the cursor
so an enlarged custom sprite does not cover the entire ring. No live desktop
overlay is installed.

Existing footage needs cursor telemetry. A normal imported video without that
telemetry cannot gain accurate click positions. This slice uses the compositor's
existing left-click cursor track, not every button in the newer input journal;
right/extra-button journal events are not yet rendered as markers.

## Validation — 5 November 2026

- Full suite: 5,218 TypeScript tests across 376 files pass. Both TS configurations,
  Vite build, i18n and Biome pass (35 existing warnings). New English strings are
  present across locale files; translations are pending.
- Native compositor rebuilt separately, with its six matched FFmpeg libraries.
  Sixteen click-related Rust tests pass, including rings for a flat cursor with
  bounce disabled, existing raw-point/tilt tests and Linux GPU click tests.
- Real Vulkan offscreen preview and native MP4 exports: a 640 × 360 fixture with a
  non-square embedded magenta cursor and a click at (192, 180). The ring centre is
  (191.5, 179.59) in the encoded video and (191.5, 179.5) in preview. Custom cursor
  centre is (191.48, 179.53), matching its 50% hotspot within one pixel. Before the
  click, after the ring expires, and with markers off, no ring is detected.
- UI tests cover import/state selection, hotspot placement, removal, project
  switching while an import is pending, and an independent marker toggle. Store
  tests cover embedded-image save/reopen and clearing overrides; scene resolution
  tests verify custom sprites replace theme models and respect as-arrow choices.
- Reproducible source, PNG, sidecar, on/off MP4s, native preview PNG and JSON report:
  `../openscreen-evaluation/custom-cursors/`. Addon SHA256:
  `b14fdc0a229cc926b0356176936b66b676d2603d15eeef04df8f787dd774e715`.
- Not exercised: native OS file-picker gestures (Orca computer-use returned no apps and
  app_not_found even with a running accessibility-enabled test instance and
  NO_AT_BRIDGE unset; this provider also reports screenshots unsupported),
  real Godot recording with the new controls, Windows/macOS rendering, GIF output,
  every custom cursor state, or the complete capture/editor/export checklist.
  This is a partial development verification, not release acceptance.

Layout follow-up: replaced the inline upload label/native file field with a
full-width import button and hidden input, styled the state dropdown, and aligned
hotspot controls with inspector spacing. Isolated Chromium rendering at a
340-pixel panel width verified light/dark appearance, no horizontal overflow and
no visible browser file widget. Screenshots: `controls-light.png` and
`controls-dark.png` in the same evaluation directory. All 16 CursorPane tests pass,
including hidden-input/button wiring. This visual component check is not an OS
file-picker gesture pass.
