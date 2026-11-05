// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import { assetSchema, clipSchema, createEmptyDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import * as customCursorModule from "@/lib/cursor/customCursors";
import { type NativeCursorType, nativeBridgeClient } from "@/native";
import { CursorPane } from "./RightPanes";

beforeEach(() => {
	const store = new Map<string, string>([[LOCALE_STORAGE_KEY, "en"]]);
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key),
			clear: () => store.clear(),
			key: (i: number) => [...store.keys()][i] ?? null,
			get length() {
				return store.size;
			},
		},
	});
});

afterEach(() => {
	cleanup();
	useProjectStore.getState().clear();
});

function renderWithCursor(legacyEditor: Record<string, unknown>) {
	const document = createEmptyDocument({ projectId: "p", title: "t" });
	useProjectStore.setState({ projectId: "p", document: { ...document, legacyEditor } });
	render(
		<I18nProvider>
			<CursorPane />
		</I18nProvider>,
	);
}

const pressed = (group: string) =>
	screen.getByRole("group", { name: group }).querySelectorAll('button[aria-pressed="true"]');

describe("CursorPane named levels", () => {
	it("names the click bounce instead of showing a number", () => {
		renderWithCursor({ cursorClickBounce: 0 });
		expect([...pressed("Click bounce")].map((b) => b.textContent)).toEqual(["None"]);
	});

	it("presses nothing for a stored value between two levels", () => {
		renderWithCursor({ cursorClickBounce: 1.5 });
		expect(pressed("Click bounce")).toHaveLength(0);
	});
});

describe("CursorPane cursor types", () => {
	/** A one-clip project over a recording whose cursor walks through `states`, 100 ms each. */
	function renderWithRecording(
		legacyEditor: Record<string, unknown>,
		states: Array<NativeCursorType | null>,
	) {
		mockRecording(states);
		// A path per test: the pane reads each recording once per session.
		renderProject(legacyEditor, `/recordings/${crypto.randomUUID()}.mp4`);
	}

	function mockRecording(states: Array<NativeCursorType | null>) {
		return vi.spyOn(nativeBridgeClient.cursor, "getRecordingData").mockResolvedValue({
			version: 2,
			provider: "native",
			assets: [],
			samples: states.map((cursorType, i) => ({ timeMs: i * 100, cx: 0.5, cy: 0.5, cursorType })),
		});
	}

	function renderProject(legacyEditor: Record<string, unknown>, originalPath: string) {
		vi.spyOn(nativeBridgeClient.aiEdition, "save").mockImplementation(async (document) => ({
			success: true,
			document,
		}));
		const document = createEmptyDocument({ projectId: "p", title: "t" });
		const asset = assetSchema.parse({ id: "a", label: "take", originalPath });
		const clip = clipSchema.parse({
			id: "c",
			assetId: "a",
			sourceStartSec: 0,
			sourceEndSec: 10,
			timelineStartSec: 0,
			timelineEndSec: 10,
			origin: "user",
		});
		useProjectStore.setState({
			projectId: "p",
			document: {
				...document,
				assets: [asset],
				timeline: { ...document.timeline, clips: [clip] },
				legacyEditor,
			},
		});
		render(
			<I18nProvider>
				<CursorPane />
			</I18nProvider>,
		);
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("offers only the cursors the video shows, lit until drawn as the arrow", async () => {
		renderWithRecording({ cursorAsArrow: ["text"] }, ["arrow", "pointer", "text", null]);
		const group = await screen.findByRole("group", { name: "Cursor types" });
		const buttons = [...group.querySelectorAll("button")];
		expect(
			buttons.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]),
		).toEqual([
			["Hand", "true"],
			["Text", "false"],
		]);
		// The arrow is what the others become: shown, never a switch.
		expect(within(group).getByRole("img", { name: "Arrow" }).tagName).toBe("SPAN");
	});

	// Out of the box only the two cursors a viewer follows keep their own art.
	it("lights only the arrow and the hand by default", async () => {
		renderWithRecording({}, ["arrow", "pointer", "text", "resize-ew"]);
		const group = await screen.findByRole("group", { name: "Cursor types" });
		const buttons = [...group.querySelectorAll("button")];
		expect(
			buttons.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]),
		).toEqual([
			["Hand", "true"],
			["Text", "false"],
			["Resize", "false"],
		]);
	});

	it("draws a type as the arrow on a click, and as recorded on the next", async () => {
		renderWithRecording({ cursorAsArrow: [] }, ["arrow", "resize-ns", "pointer"]);
		const resize = await screen.findByRole("button", { name: "Resize" });
		fireEvent.click(resize);
		const asArrow = () => useProjectStore.getState().document?.legacyEditor?.cursorAsArrow;
		expect(asArrow()).toEqual(["resize"]);
		fireEvent.click(screen.getByRole("button", { name: "Hand" }));
		expect(asArrow()).toEqual(["pointer", "resize"]);
		fireEvent.click(screen.getByRole("button", { name: "Resize" }));
		expect(asArrow()).toEqual(["pointer"]);
	});

	it("offers nothing to redraw when the video only shows the arrow", async () => {
		renderWithRecording({}, ["arrow", null]);
		await waitFor(() => expect(nativeBridgeClient.cursor.getRecordingData).toHaveBeenCalled());
		expect(screen.queryByRole("group", { name: "Cursor types" })).toBeNull();
	});

	// A cursor file still being written right after a take must not hide the row all session.
	it("reads a recording again after a read that failed", async () => {
		const originalPath = `/recordings/${crypto.randomUUID()}.mp4`;
		const read = mockRecording(["arrow", "pointer"]).mockRejectedValueOnce(new Error("busy"));
		renderProject({}, originalPath);
		await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
		// Let the failed read settle before the pane opens again.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole("group", { name: "Cursor types" })).toBeNull();

		cleanup();
		renderProject({}, originalPath);
		expect(await screen.findByRole("button", { name: "Hand" })).toBeTruthy();
		expect(read).toHaveBeenCalledTimes(2);
	});

	// The 3D switch changes how the chosen style looks, so it sits right under the styles.
	it("puts the 3D switch right under the cursor styles", () => {
		renderWithCursor({});
		const styleLabel = screen.getByText("Cursor style");
		const grid = styleLabel.nextElementSibling;
		expect(grid?.nextElementSibling?.textContent).toBe("3D cursor");
	});
});

describe("CursorPane size", () => {
	// Named steps stopped at 2.75; people asked for at least twice that.
	it("is a slider from the default up to four times it", () => {
		renderWithCursor({ cursorSize: 4.5 });
		const slider = screen.getByRole("slider", { name: "Size" }) as HTMLInputElement;
		expect([slider.min, slider.max, slider.value]).toEqual(["1.5", "6", "4.5"]);
	});
});

describe("CursorPane click impact", () => {
	const toggle = () => screen.queryByRole("button", { name: "Click impact" });

	it("is a project-wide switch, off by default", () => {
		renderWithCursor({});
		expect(toggle()?.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(toggle() as HTMLElement);
		expect(useProjectStore.getState().document?.legacyEditor).toMatchObject({
			cursorClickImpact: true,
		});
	});

	it("sits right under the click bounce levels", () => {
		renderWithCursor({});
		const controls = [...document.querySelectorAll("button, input")];
		const levels = within(screen.getByRole("group", { name: "Click bounce" })).getAllByRole(
			"button",
		);
		const last = controls.indexOf(levels[levels.length - 1]);
		expect(controls.indexOf(toggle() as HTMLElement)).toBe(last + 1);
	});

	// The impact follows the pointer you see: with the cursor hidden it has nothing to show.
	it("is not offered while the cursor is hidden", () => {
		renderWithCursor({ cursorShow: false });
		expect(toggle()).toBeNull();
	});
});

it("offers click location rings independently of 3D, bounce and screen impact", () => {
	renderWithCursor({ cursorModel3d: false, cursorClickBounce: 0, cursorClickImpact: false });
	fireEvent.click(screen.getByRole("button", { name: "Highlight click locations" }));
	expect(useProjectStore.getState().document?.legacyEditor).toMatchObject({
		cursorClickMarkers: true,
		cursorModel3d: false,
		cursorClickBounce: 0,
		cursorClickImpact: false,
	});
});

it("offers importing a cursor for each state and restores the theme cursor", () => {
	const custom = {
		dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
		hotspotX: 0.1,
		hotspotY: 0.2,
	};
	renderWithCursor({ cursorCustom: { arrow: custom } });
	expect(screen.getByLabelText("Import cursor PNG").getAttribute("accept")).toBe("image/png,.png");
	expect((screen.getByLabelText("Import cursor PNG") as HTMLInputElement).hidden).toBe(true);
	const picker = vi
		.spyOn(screen.getByLabelText("Import cursor PNG"), "click")
		.mockImplementation(() => undefined);
	fireEvent.click(screen.getByRole("button", { name: "Import cursor PNG" }));
	expect(picker).toHaveBeenCalledOnce();
	picker.mockRestore();
	fireEvent.click(screen.getByRole("button", { name: "Use theme cursor for this state" }));
	expect(useProjectStore.getState().document?.legacyEditor).toMatchObject({ cursorCustom: {} });
});

it("imports a cursor and sets its hotspot at the clicked image point", async () => {
	const custom = {
		dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
		hotspotX: 0,
		hotspotY: 0,
	};
	const importer = vi.spyOn(customCursorModule, "importCustomCursor").mockResolvedValue(custom);
	try {
		renderWithCursor({});
		fireEvent.change(screen.getByLabelText("Cursor state"), { target: { value: "text" } });
		fireEvent.change(screen.getByLabelText("Import cursor PNG"), {
			target: { files: [new File(["PNG"], "pointer.png", { type: "image/png" })] },
		});
		await waitFor(() =>
			expect(useProjectStore.getState().document?.legacyEditor).toMatchObject({
				cursorCustom: { text: custom },
			}),
		);
		const target = screen.getByRole("button", { name: "Cursor hotspot" });
		vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
			left: 10,
			top: 20,
			width: 128,
			height: 128,
		} as DOMRect);
		fireEvent.click(target, { clientX: 74, clientY: 52 });
		expect(useProjectStore.getState().document?.legacyEditor).toMatchObject({
			cursorCustom: { text: { hotspotX: 0.5, hotspotY: 0.25 } },
		});
	} finally {
		importer.mockRestore();
	}
});

it("does not apply an unfinished cursor import to another project", async () => {
	let finish!: (image: customCursorModule.CustomCursor) => void;
	const importer = vi.spyOn(customCursorModule, "importCustomCursor").mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	try {
		renderWithCursor({});
		fireEvent.change(screen.getByLabelText("Import cursor PNG"), {
			target: { files: [new File(["PNG"], "pointer.png", { type: "image/png" })] },
		});
		const next = createEmptyDocument({ projectId: "next", title: "Next" });
		act(() => useProjectStore.setState({ projectId: "next", document: next }));
		await act(async () => {
			finish({
				dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				hotspotX: 0,
				hotspotY: 0,
			});
		});
		expect(useProjectStore.getState().document).toBe(next);
	} finally {
		importer.mockRestore();
	}
});
