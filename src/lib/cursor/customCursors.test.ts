import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../ai-edition/schema";
import { getEditorSettings, patchEditorSettings } from "../ai-edition/store/editorSettings";
import { readCustomCursors } from "./customCursors";

const dataUrl = `data:image/png;base64,${readFileSync("public/cursors/default/arrow.png").toString("base64")}`;
describe("portable custom cursors", () => {
	it("round trips per-state PNGs and hotspots through the saved document", () => {
		const original = createEmptyDocument({ projectId: "custom", title: "Cursor" });
		const custom = {
			arrow: { dataUrl, hotspotX: 0.12, hotspotY: 0.08 },
			text: { dataUrl, hotspotX: 0.5, hotspotY: 0.5 },
		};
		const next = patchEditorSettings(original, { cursorCustom: custom, cursorClickMarkers: true });
		const reopened = getEditorSettings(JSON.parse(JSON.stringify(next)));
		expect(reopened.cursorCustom).toEqual(custom);
		expect(reopened.cursorClickMarkers).toBe(true);
		expect(getEditorSettings(original).cursorCustom).toEqual({});
		const cleared = getEditorSettings(patchEditorSettings(next, { cursorCustom: {} }));
		expect(cleared.cursorCustom).toEqual({});
		expect(cleared.cursorClickMarkers).toBe(true);
	});
	it("ignores invalid sources and unknown states, clamps finite hotspots", () => {
		expect(
			readCustomCursors({ arrow: { dataUrl: "file:///tmp/image.png", hotspotX: 0, hotspotY: 0 } }),
		).toEqual({});
		expect(
			readCustomCursors({
				arrow: { dataUrl, hotspotX: Number.NaN, hotspotY: 0 },
				secret: { dataUrl, hotspotX: 0, hotspotY: 0 },
			}),
		).toEqual({});
		expect(
			readCustomCursors({ arrow: { dataUrl, hotspotX: -1, hotspotY: 2 } }).arrow,
		).toMatchObject({ hotspotX: 0, hotspotY: 1 });
	});
});

it("rejects unsupported and oversized files before trying to decode them", async () => {
	const { importCustomCursor, CUSTOM_CURSOR_MAX_BYTES } = await import("./customCursors");
	await expect(
		importCustomCursor(new File(["x"], "cursor.svg", { type: "image/svg+xml" })),
	).rejects.toThrow("unsupported");
	await expect(
		importCustomCursor(
			new File([new Uint8Array(CUSTOM_CURSOR_MAX_BYTES + 1)], "cursor.png", { type: "image/png" }),
		),
	).rejects.toThrow("unsupported");
});
