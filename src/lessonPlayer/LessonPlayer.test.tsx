// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, type Mock, vi } from "vitest";
import { I18nProvider } from "@/contexts/I18nContext";
import type { LessonPlayerApi, LessonPlayerView } from "@/lib/lesson/player";
import { LessonPlayer } from "./LessonPlayer";

const token = "11111111-1111-4111-8111-111111111111";
const view: LessonPlayerView = {
	status: "opened",
	title: "Make a player move",
	steps: [
		{
			id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			title: "Open the script",
			instructions: "Double-click player.gd.\nThen read it.",
			code: { language: "gdscript", text: "extends CharacterBody2D" },
			image: { src: "data:image/jpeg;base64,AAAA", alt: "The script editor", width: 4, height: 3 },
			video: {
				src: `openscreen-lesson-media://${token}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
				durationSec: 1.5,
				width: 320,
				height: 180,
			},
		},
		{
			id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			title: "Run the game",
			instructions: "Press F5.",
			video: {
				src: `openscreen-lesson-media://${token}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
				durationSec: 2,
				width: 320,
				height: 180,
			},
		},
		{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Reflect", instructions: "What changed?" },
	],
	checks: { videos: 2, audioChecked: false, authenticity: "local-readback-not-signature" },
};
let play: Mock<() => Promise<void>>, pause: Mock<() => void>;
beforeEach(() => {
	play = vi.fn(async () => undefined);
	pause = vi.fn();
	vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
function api(overrides: Partial<LessonPlayerApi> = {}): LessonPlayerApi {
	return {
		open: vi.fn(async () => ({ success: true as const, result: view })),
		cancel: vi.fn(async () => undefined),
		close: vi.fn(async () => undefined),
		...overrides,
	};
}
const show = (value?: LessonPlayerApi) =>
	render(
		<I18nProvider>
			<LessonPlayer api={value} />
		</I18nProvider>,
	);
const openPackage = async () => {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Open lesson package…" }));
	});
};
const videoElement = () => document.querySelector("video") as HTMLVideoElement;

it("opens a verified package and shows the first step's text, image, code and video without playing it", async () => {
	const bridge = api();
	show(bridge);
	expect(screen.getByText("No package is open.")).toBeTruthy();
	await openPackage();
	expect(bridge.open).toHaveBeenCalledTimes(1);
	expect(screen.getByRole("heading", { name: "Make a player move" })).toBeTruthy();
	expect(
		screen.getByText(/not a signature, and not an approved learning or assessment record/),
	).toBeTruthy();
	expect(screen.getByText(/Audio is not checked/)).toBeTruthy();
	expect(screen.getByText("Step 1 of 3")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "Open the script" })).toBeTruthy();
	expect(screen.getByText(/Double-click player\.gd\./)).toBeTruthy();
	expect(screen.getByAltText("The script editor").getAttribute("src")).toBe(
		"data:image/jpeg;base64,AAAA",
	);
	expect(screen.getByText("extends CharacterBody2D")).toBeTruthy();
	const video = videoElement();
	expect(video.getAttribute("src")).toBe(view.steps[0].video!.src);
	expect(video.hasAttribute("autoplay")).toBe(false);
	expect(video.getAttribute("aria-label")).toBe("Step video: Open the script");
	expect(play).not.toHaveBeenCalled();
	const [first] = screen.getAllByRole("listitem");
	expect(first.querySelector("button")!.getAttribute("aria-current")).toBe("step");
});

it("moves between steps with Previous/Next and the step list, pausing and never autoplaying", async () => {
	show(api());
	await openPackage();
	const previous = screen.getByRole("button", { name: "Previous step" }) as HTMLButtonElement;
	expect(previous.disabled).toBe(true);
	const firstVideo = videoElement();
	fireEvent.click(screen.getByRole("button", { name: "Next step" }));
	expect(pause).toHaveBeenCalled();
	expect(screen.getByText("Step 2 of 3")).toBeTruthy();
	const heading = screen.getByRole("heading", { name: "Run the game" });
	expect(document.activeElement).toBe(heading);
	// A fresh element for the new step's video: it starts paused at the start.
	expect(videoElement()).not.toBe(firstVideo);
	expect(videoElement().getAttribute("src")).toBe(view.steps[1].video!.src);
	expect(play).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Reflect" }));
	expect(screen.getByText("This step has no video.")).toBeTruthy();
	expect(videoElement()).toBeNull();
	expect((screen.getByRole("button", { name: "Next step" }) as HTMLButtonElement).disabled).toBe(
		true,
	);
	fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
	expect(screen.getByText("Step 2 of 3")).toBeTruthy();
});

it("replays from the start and keeps the chosen speed for later step videos", async () => {
	show(api());
	await openPackage();
	const video = videoElement();
	video.currentTime = 1;
	fireEvent.click(screen.getByRole("button", { name: "Replay step video" }));
	expect(video.currentTime).toBe(0);
	expect(play).toHaveBeenCalledTimes(1);
	fireEvent.change(screen.getByLabelText(/Playback speed/), { target: { value: "0.5" } });
	expect(video.playbackRate).toBe(0.5);
	fireEvent.click(screen.getByRole("button", { name: "Next step" }));
	const next = videoElement();
	fireEvent(next, new Event("loadedmetadata"));
	expect(next.playbackRate).toBe(0.5);
	expect(play).toHaveBeenCalledTimes(1);
});

it.each([
	[
		"lesson-package-invalid",
		"This folder is not a complete, unchanged lesson package, so nothing from it is shown.",
	],
	["lesson-package-unsupported", "Lesson packages can only be played on Linux for now."],
	["lesson-package-cancelled", "Opening was cancelled."],
	[
		"lesson-player-unavailable",
		"This player window can no longer open packages. Close it and open a new lesson player.",
	],
] as const)("shows %s plainly and no stale steps", async (code, message) => {
	const open = vi
		.fn<LessonPlayerApi["open"]>()
		.mockResolvedValueOnce({ success: true, result: view })
		.mockResolvedValueOnce({ success: false, code });
	show(api({ open }));
	await openPackage();
	await openPackage();
	expect(screen.getByRole("alert").textContent).toBe(message);
	expect(screen.queryByText("Step 1 of 3")).toBeNull();
	expect(videoElement()).toBeNull();
});

it("closing the package releases it in main and clears the view; a cancelled picker changes nothing", async () => {
	const open = vi
		.fn<LessonPlayerApi["open"]>()
		.mockResolvedValueOnce({ success: true, result: view })
		.mockResolvedValueOnce({ success: true, result: { status: "cancelled" } });
	const bridge = api({ open });
	show(bridge);
	await openPackage();
	await openPackage();
	expect(screen.getByText("Step 1 of 3")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Close package" }));
	expect(bridge.close).toHaveBeenCalledTimes(1);
	expect(screen.getByText("No package is open.")).toBeTruthy();
});

it("offers Cancel while a package is being checked, and is inert without the player bridge", async () => {
	let finish!: (value: Awaited<ReturnType<LessonPlayerApi["open"]>>) => void;
	const bridge = api({
		open: vi.fn<LessonPlayerApi["open"]>(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		),
	});
	show(bridge);
	fireEvent.click(screen.getByRole("button", { name: "Open lesson package…" }));
	expect(screen.getByRole("status").textContent).toMatch(/Checking the package/);
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(bridge.cancel).toHaveBeenCalledTimes(1);
	await act(async () => finish({ success: false, code: "lesson-package-cancelled" }));
	cleanup();
	show(undefined);
	expect(
		(screen.getByRole("button", { name: "Open lesson package…" }) as HTMLButtonElement).disabled,
	).toBe(true);
});
