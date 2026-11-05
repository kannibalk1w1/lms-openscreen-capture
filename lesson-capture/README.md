# LMS OpenScreen development snapshot

The application lives at this repository root. All lesson-capture work based on
upstream `d7adf059` is preserved with upstream history and licenses.

Start with `LESSON_CAPTURE_ROADMAP.md` and `LESSON_CAPTURE_CODE_PRESENTATION.md`.
Other `LESSON_CAPTURE_*.md` files describe the accumulated work and validation.
The original specification, reuse research and handoff are archived here.

`evidence/evaluation.tar.gz.part-*` preserves the local experiments, fixture projects, screenshots,
recordings, test harnesses and measured reports. Existing reports may refer to
`../openscreen-evaluation/` or machine-local paths: that original sibling remains
on the development PC; its portable copy is archived here. Reconstruct it from the repository root:

```sh
cat lesson-capture/evidence/evaluation.tar.gz.part-* > /tmp/openscreen-evaluation.tar.gz
tar -xzf /tmp/openscreen-evaluation.tar.gz -C /desired/parent/directory
```

The ordered parts and full archive SHA-256 are recorded in `evidence/manifest.json`.
Archive parts avoid including fixture scripts/generated bundles in app lint/build scans.
Do not claim the old absolute paths or fixture IDs are portable without adapting them.
Browser profiles, Godot/editor caches, process IDs and compiled application/dependency
outputs are excluded. Local native binaries must be rebuilt using the documented
Linux scripts; a fresh checkout does not contain those ignored binaries.

Validation at snapshot: full Vitest 5,272 tests / 391 files pass; final targeted
6-test run includes two later additions. Both TS configurations, Vite/main/preload,
i18n, Biome (35 existing warnings), docs and diff checks pass. Native Linux code
presentation: 3 Rust tests plus 1 SVG regression, six MP4 variants and offscreen
preview seek. See the feature docs for previous-stage checks and skipped coverage.
Windows/macOS runtime and the complete physical desktop acceptance pass remain open.

Next: explicit Godot typing session association with recording media time, including
pause/resume boundaries and source-anchored placement. Preserve manual placement for
independent journals. Portable typing-file exports follow.
