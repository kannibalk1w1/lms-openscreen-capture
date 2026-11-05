> **Lesson Capture fork:** use [LESSON_CAPTURE_ROADMAP.md](LESSON_CAPTURE_ROADMAP.md)
> and its [expanded product map](lesson-capture/PRODUCT_MAP.md) for this fork's
> current priorities and evidence. The upstream roadmap below is preserved as a
> dated 27 October 2026 snapshot; issue/PR statuses are not reverified here.

# OpenScreen Roadmap

Record → Edit → Export. The priority is reliable recording and editing on Windows, macOS and Linux, with a simple workflow and a free, open-source app.

Updated 2026-10-27. Work below has no fixed release date. Follow the linked issues and PRs for its current status.

## Current exploration: MCP and Off-Menu

MCP and Off-Menu are the direction we are exploring: let an agent carry a demo from recording to export, and create effects beyond the editor's built-in controls.

- **MCP:** improve how agents record, inspect, edit and export projects, with clear progress, useful errors and control over their changes.
- **Off-Menu:** explore agent-written visual effects inside the editor. Start with effects that respond to the footage, cursor and clicks, keep their settings editable, and use the same rendering path for preview and export.

Real demo workflows will guide what we extend next. See the [MCP guide](https://getopenscreen.com/docs/ai-editing/) and [Off-Menu effects](https://getopenscreen.com/docs/effects/) for the approach.

## Planned work

- **Long projects:** stream audio exports to reduce memory use ([#1385](https://github.com/getopenscreen/openscreen/issues/1385)).
- **Agent visibility:** show execution steps and make token costs easier to understand and measure ([#1169](https://github.com/getopenscreen/openscreen/issues/1169), [#1096](https://github.com/getopenscreen/openscreen/issues/1096)).
- **Subtitle import:** bring existing SRT files into the transcript, with clear rules for timestamps and existing text ([#1365](https://github.com/getopenscreen/openscreen/issues/1365)).
- **Video layouts:** explore multiple video layers and split-screen editing ([#1316](https://github.com/getopenscreen/openscreen/issues/1316)).

## Work in progress

Open proposals and fixes under review:

| Area | Work |
| --- | --- |
| Recording | [Camera-only recording](https://github.com/getopenscreen/openscreen/pull/1398), [floating camera preview](https://github.com/getopenscreen/openscreen/pull/1288), [macOS echo cancellation](https://github.com/getopenscreen/openscreen/pull/1265) |
| Capture compatibility | [Direct X11 capture](https://github.com/getopenscreen/openscreen/pull/1328), [Windows capture fallback](https://github.com/getopenscreen/openscreen/pull/1254) |
| Editing | [Precise crop controls](https://github.com/getopenscreen/openscreen/pull/1389), [green-screen chroma key](https://github.com/getopenscreen/openscreen/pull/1321) |
| Storage | [Manage and delete recordings](https://github.com/getopenscreen/openscreen/pull/1382), [delete recordings with their project](https://github.com/getopenscreen/openscreen/pull/1381) |
| Agents | [Per-turn token usage](https://github.com/getopenscreen/openscreen/pull/1177), [MCP waiting for a user-controlled recording](https://github.com/getopenscreen/openscreen/pull/1369) |
| Diagnostics | [Persistent application logs](https://github.com/getopenscreen/openscreen/pull/1331) |

Recording and preview issues remain a priority:

- **Windows:** [capture access denied](https://github.com/getopenscreen/openscreen/issues/1247), [recording bar input](https://github.com/getopenscreen/openscreen/issues/1203).
- **macOS:** [permission warnings](https://github.com/getopenscreen/openscreen/issues/1196), [corrupted MOV preview](https://github.com/getopenscreen/openscreen/issues/1390).
- **Linux:** [AMD capture crashes](https://github.com/getopenscreen/openscreen/issues/1340), [niri/NVIDIA capture](https://github.com/getopenscreen/openscreen/issues/1244), [missing recording controls on KDE](https://github.com/getopenscreen/openscreen/issues/1101).

Follow the [open issues](https://github.com/getopenscreen/openscreen/issues) or suggest a direction on [Discord](https://getopenscreen.com/discord).
