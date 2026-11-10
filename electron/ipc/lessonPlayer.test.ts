import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, expect, it, type Mock, vi } from "vitest";
import type { LessonPlayerView } from "../../src/lib/lesson/player";
import { editorRangeSessions } from "../lesson/editorRangeSession";
import { validateRangeVideo } from "../lesson/encodedVideo";
import { createLessonPackage } from "../lesson/package";
import { fakePackageVideo, packageFixture } from "../lesson/package.test-support";
import { openSelectedLessonPackage } from "../lesson/packageOpen";
import {
	LessonPlayerOwners,
	MAX_PLAYER_WINDOWS,
	registerLessonPlayerHandlers,
} from "./lessonPlayer";

const host = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: host.handle } }));
// The decode itself is proven by the real-app probe; here it reports the stored fixture's facts.
vi.mock("../lesson/encodedVideo", () => ({ validateRangeVideo: vi.fn() }));

const PLAYER = "file:///app/dist/lesson-player.html";
let root: string, moved: string, owners: LessonPlayerOwners;
let pick: Mock<(event: IpcMainInvokeEvent) => Promise<string | null>>,
	openWindow: Mock<() => void>,
	inspect: Mock<typeof openSelectedLessonPackage>;
const route = (name: string) =>
	[...host.handle.mock.calls]
		.reverse()
		.find(([value]: unknown[]) => value === `lesson-player:${name}`)![1] as (
		event: unknown,
	) => Promise<{ success: boolean; code?: string; result?: unknown }>;

function contents(url = PLAYER) {
	let destroyed = false,
		current = url;
	const value = Object.assign(new EventEmitter(), {
		mainFrame: {},
		getURL: () => current,
		isDestroyed: () => destroyed,
	});
	return {
		value,
		event: { sender: value, senderFrame: value.mainFrame } as unknown as IpcMainInvokeEvent,
		navigate(next = `${url}#elsewhere`) {
			current = next;
			value.emit("did-start-navigation");
		},
		crash: () => value.emit("render-process-gone"),
		destroy() {
			destroyed = true;
			value.emit("destroyed");
		},
	};
}
function player() {
	const c = contents();
	return { ...c, owner: owners.register(c.value, PLAYER) };
}
async function tree(directory: string) {
	const hashes: Record<string, string> = {};
	const visit = async (relative: string) => {
		for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
			const name = path.join(relative, entry.name);
			if (entry.isDirectory()) await visit(name);
			else
				hashes[name] = createHash("sha256")
					.update(await fs.readFile(path.join(directory, name)))
					.digest("hex");
		}
	};
	await visit("");
	return hashes;
}
const media = (
	owner: { serve(request: Request): Promise<Response> },
	src: string,
	range = "bytes=0-",
) => owner.serve(new Request(src, { headers: { Range: range } }));

beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-player-"));
	vi.mocked(validateRangeVideo).mockImplementation(fakePackageVideo);
	const authoring = path.join(root, "made");
	await fs.mkdir(authoring);
	const f = await packageFixture(authoring);
	const created = await createLessonPackage(f.request, { assertCurrent: () => undefined });
	if (created.status !== "packaged") throw new Error("fixture package");
	// The learner's copy: moved elsewhere, with every authoring original gone.
	moved = path.join(root, "learner", "package");
	await fs.mkdir(path.dirname(moved));
	await fs.cp(created.path, moved, { recursive: true });
	await fs.rm(authoring, { recursive: true, force: true });
	owners = new LessonPlayerOwners();
	host.handle.mockClear();
	pick = vi.fn(async () => moved);
	openWindow = vi.fn();
	inspect = vi.fn(openSelectedLessonPackage);
	registerLessonPlayerHandlers({
		owners,
		isEditorFrame: (event) => editorRangeSessions.isEditorPage(event.sender),
		openWindow,
		pickDirectory: pick,
		inspect,
	});
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

it("opens a moved, verified package with no video project and plays its bound step video", async () => {
	const before = await tree(moved),
		p = player();
	const result = (await route("open")(p.event)) as { success: true; result: LessonPlayerView };
	expect(result.success).toBe(true);
	const view = result.result;
	expect(view.checks).toEqual({
		videos: 1,
		audioChecked: false,
		authenticity: "local-readback-not-signature",
	});
	expect(view.steps).toHaveLength(1);
	const [step] = view.steps;
	expect(step.instructions).toBe("Public selected instructions");
	// The package was made without code or images; nothing excluded reappears.
	expect(step.code).toBeUndefined();
	expect(step.image).toBeUndefined();
	expect(step.video?.src).toMatch(
		new RegExp(`^openscreen-lesson-media://[0-9a-f-]{36}/${step.id}$`),
	);
	// No filesystem path or excluded private text ever reaches the player.
	expect(JSON.stringify(view)).not.toContain(root);
	expect(JSON.stringify(view)).not.toMatch(/PRIVATE_/);
	const file = await fs.readFile(path.join(moved, "media", `${step.id}.mp4`));
	const whole = await media(p.owner, step.video!.src, `bytes=0-${file.length - 1}`);
	expect(whole.status).toBe(206);
	expect(Buffer.from(await whole.arrayBuffer()).equals(file)).toBe(true);
	const seek = await media(p.owner, step.video!.src, "bytes=100-199");
	expect(Buffer.from(await seek.arrayBuffer()).equals(file.subarray(100, 200))).toBe(true);
	expect(pick).toHaveBeenCalledTimes(1);
	// Reading never changes the package.
	expect(await tree(moved)).toEqual(before);
});

it("builds a view with ordered steps, embedded images and code when the package includes them", async () => {
	const view = (await route("open")(player().event)) as { result: LessonPlayerView };
	const opened = await openSelectedLessonPackage(moved, { assertCurrent: () => undefined });
	expect(view.result.steps.map((s) => s.id)).toEqual(opened.lesson.steps.map((s) => s.id));
	const { playerView } = await import("./lessonPlayer");
	const image = opened.lesson.assets[0] ?? {
		id: randomUUID(),
		mime: "image/jpeg" as const,
		base64: "AAAA",
		sha256: "a".repeat(64),
		width: 4,
		height: 3,
	};
	const rich = playerView(randomUUID(), {
		...opened,
		lesson: {
			...opened.lesson,
			assets: [image] as typeof opened.lesson.assets,
			steps: opened.lesson.steps.map((s) => ({
				...s,
				imageId: image.id,
				imageAlt: "Alt text",
				code: { language: "gdscript", text: "func _ready():\n\tpass" },
			})),
		},
	});
	expect(rich.steps[0].image).toEqual({
		src: `data:image/jpeg;base64,${image.base64}`,
		alt: "Alt text",
		width: image.width,
		height: image.height,
	});
	expect(rich.steps[0].code).toEqual({ language: "gdscript", text: "func _ready():\n\tpass" });
});

it("serves the open route only to the exact registered player page, never an editor or a frame", async () => {
	const editor = contents("file:///app/dist/index.html?windowType=editor");
	editorRangeSessions.register(editor.value, editor.value.getURL());
	const p = player();
	const refused = { success: false, code: "lesson-player-unavailable" };
	expect(await route("open")(editor.event)).toEqual(refused);
	expect(await route("open")({ ...p.event, senderFrame: {} })).toEqual(refused);
	expect(await route("open")(undefined)).toEqual(refused);
	const stranger = contents();
	expect(await route("open")(stranger.event)).toEqual(refused);
	p.navigate();
	expect(await route("open")(p.event)).toEqual(refused);
	expect(pick).not.toHaveBeenCalled();
	// The player is not an editor: it gains no authoring authority.
	expect(editorRangeSessions.isEditorPage(p.value)).toBe(false);
});

it("launches player windows only for a registered editor's main frame, up to a limit", async () => {
	const editor = contents("file:///app/dist/index.html?windowType=editor");
	const refused = { success: false, code: "lesson-player-unavailable" };
	expect(await route("launch")(editor.event)).toEqual(refused);
	editorRangeSessions.register(editor.value, editor.value.getURL());
	expect(await route("launch")({ ...editor.event, senderFrame: {} })).toEqual(refused);
	expect(await route("launch")(player().event)).toEqual(refused);
	expect(openWindow).not.toHaveBeenCalled();
	expect(await route("launch")(editor.event)).toEqual({
		success: true,
		result: { status: "launched" },
	});
	expect(openWindow).toHaveBeenCalledTimes(1);
	for (let i = owners.count(); i < MAX_PLAYER_WINDOWS; i++) player();
	expect(await route("launch")(editor.event)).toEqual({
		success: false,
		code: "lesson-player-limit",
	});
	expect(openWindow).toHaveBeenCalledTimes(1);
});

it("keeps each player's media reachable only through its own owner and token", async () => {
	const first = player(),
		second = player();
	const a = ((await route("open")(first.event)) as { result: LessonPlayerView }).result;
	const b = ((await route("open")(second.event)) as { result: LessonPlayerView }).result;
	const src = a.steps[0].video!.src,
		other = b.steps[0].video!.src;
	expect(src).not.toBe(other);
	// Replaying one window's token in another window's session gets nothing.
	expect((await media(second.owner, src)).status).toBe(404);
	expect((await media(first.owner, other)).status).toBe(404);
	expect((await media(first.owner, src.replace(/[0-9a-f-]{36}$/, randomUUID()))).status).toBe(404);
	expect((await media(first.owner, src)).status).toBe(206);
});

it.each([
	"navigate",
	"crash",
	"destroy",
	"close",
])("ends playback when the player window does %s, and only a fresh open restores it", async (end) => {
	const p = player();
	const view = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const src = view.steps[0].video!.src;
	if (end === "navigate") p.navigate();
	if (end === "crash") p.crash();
	if (end === "destroy") p.destroy();
	if (end === "close") await route("close")(p.event);
	expect((await media(p.owner, src)).status).toBe(404);
	if (end === "close" || end === "crash") {
		const again = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
		expect((await media(p.owner, src)).status).toBe(404);
		expect((await media(p.owner, again.steps[0].video!.src)).status).toBe(206);
	}
});

it.each([
	"navigate",
	"crash",
	"cancel",
])("an open still in its picker or verification when the player does %s exposes nothing", async (end) => {
	for (const stage of ["picker", "verification"] as const) {
		const p = player();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		if (stage === "picker")
			pick.mockImplementationOnce(async () => {
				await gate;
				return moved;
			});
		else
			inspect.mockImplementationOnce(
				async (...args: Parameters<typeof openSelectedLessonPackage>) => {
					await gate;
					return openSelectedLessonPackage(...args);
				},
			);
		const pending = route("open")(p.event);
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (end === "navigate") p.navigate();
		if (end === "crash") p.crash();
		if (end === "cancel") await route("cancel")(p.event);
		release();
		expect(await pending, `${end} during ${stage}`).toEqual({
			success: false,
			code: "lesson-package-cancelled",
		});
	}
});

it("refuses a package whose files changed before opening, and ends playback when media changes after", async () => {
	const p = player();
	const index = path.join(moved, "index.html");
	const original = await fs.readFile(index);
	await fs.appendFile(index, "<!-- changed -->");
	expect(await route("open")(p.event)).toEqual({ success: false, code: "lesson-package-invalid" });
	await fs.writeFile(index, original);
	const view = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const src = view.steps[0].video!.src;
	const file = path.join(moved, "media", `${view.steps[0].id}.mp4`);
	const bytes = await fs.readFile(file);
	bytes[bytes.length - 1] ^= 0xff;
	await fs.writeFile(file, bytes);
	expect((await media(p.owner, src)).status).toBe(404);
	// The capability is gone, not just that request.
	await fs.writeFile(
		file,
		Buffer.from(bytes.map((v, i) => (i === bytes.length - 1 ? v ^ 0xff : v))),
	);
	expect((await media(p.owner, src)).status).toBe(404);
});

it("a cancelled picker keeps the open package; a failed new folder ends it", async () => {
	const p = player();
	const view = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const src = view.steps[0].video!.src;
	pick.mockResolvedValueOnce(null);
	expect(await route("open")(p.event)).toEqual({ success: true, result: { status: "cancelled" } });
	expect((await media(p.owner, src)).status).toBe(206);
	pick.mockResolvedValueOnce(path.join(root, "learner"));
	expect(await route("open")(p.event)).toEqual({ success: false, code: "lesson-package-invalid" });
	expect((await media(p.owner, src)).status).toBe(404);
});

it("never pins media that changed between verification and installing the capability", async () => {
	const p = player();
	inspect.mockImplementationOnce(async (...args: Parameters<typeof openSelectedLessonPackage>) => {
		const opened = await openSelectedLessonPackage(...args);
		// After every file was hashed and decoded, before main records what to serve.
		const file = path.join(moved, opened.manifest.videos[0].path);
		await fs.appendFile(file, Buffer.from([0]));
		return opened;
	});
	expect(await route("open")(p.event)).toEqual({ success: false, code: "lesson-package-invalid" });
});

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}
it.each([
	"picker",
	"verification",
])("an explicit close while an open is in its %s ends that open: no view or capability, and only a fresh open restores", async (stage) => {
	const p = player();
	// An older package is playing when the learner starts opening another one.
	const older = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const olderSrc = older.steps[0].video!.src;
	const held = gate();
	inspect.mockClear();
	if (stage === "picker")
		pick.mockImplementationOnce(async () => {
			await held.promise;
			return moved;
		});
	else
		inspect.mockImplementationOnce(
			async (...args: Parameters<typeof openSelectedLessonPackage>) => {
				await held.promise;
				return openSelectedLessonPackage(...args);
			},
		);
	const pending = route("open")(p.event);
	await new Promise((resolve) => setTimeout(resolve, 10));
	await route("close")(p.event);
	// The release ends the older package at once, not when the pending open settles.
	expect((await media(p.owner, olderSrc)).status).toBe(404);
	held.release();
	expect(await pending).toEqual({ success: false, code: "lesson-package-cancelled" });
	if (stage === "picker") expect(inspect).not.toHaveBeenCalled();
	// Positive control: a fresh open after the release works and plays.
	const fresh = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	expect((await media(p.owner, fresh.steps[0].video!.src)).status).toBe(206);
	expect((await media(p.owner, olderSrc)).status).toBe(404);
});

// Review recheck MP2: a request made while a released open is still unwinding must never wait and
// later run; it is refused at once, so no later close or cancel can miss it.
const SECOND_ENDS = ["close", "cancel", "navigate", "crash", "destroy"] as const;
for (const stage of ["picker", "verification"] as const)
	it.each(
		SECOND_ENDS,
	)(`opens requested while a released open is unwinding in its ${stage} are refused at once and never run later (then %s)`, async (secondEnd) => {
		const p = player(),
			held = gate();
		pick.mockClear();
		inspect.mockClear();
		if (stage === "picker")
			pick.mockImplementationOnce(async () => {
				await held.promise;
				return moved;
			});
		else
			inspect.mockImplementationOnce(
				async (...args: Parameters<typeof openSelectedLessonPackage>) => {
					await held.promise;
					return openSelectedLessonPackage(...args);
				},
			);
		const a = route("open")(p.event);
		await vi.waitFor(() => expect(stage === "picker" ? pick : inspect).toHaveBeenCalledTimes(1));
		await route("close")(p.event);
		// Two more requests while A unwinds: both refused immediately, neither queued.
		const busy = { success: false, code: "lesson-player-busy" };
		const now = (request: Promise<unknown>) =>
			Promise.race([
				request,
				new Promise((resolve) => setTimeout(() => resolve("still-waiting"), 200)),
			]);
		expect(await now(route("open")(p.event))).toEqual(busy);
		expect(await now(route("open")(p.event))).toEqual(busy);
		if (secondEnd === "close") await route("close")(p.event);
		if (secondEnd === "cancel") await route("cancel")(p.event);
		if (secondEnd === "navigate") p.navigate();
		if (secondEnd === "crash") p.crash();
		if (secondEnd === "destroy") p.destroy();
		held.release();
		expect(await a).toEqual({ success: false, code: "lesson-package-cancelled" });
		await new Promise((resolve) => setTimeout(resolve, 20));
		// Nothing ran for the refused requests: no further picker or verification.
		expect(pick).toHaveBeenCalledTimes(1);
		expect(inspect).toHaveBeenCalledTimes(stage === "picker" ? 0 : 1);
		// A genuinely new open afterwards works only where the page is still the player.
		const fresh = await route("open")(p.event);
		if (secondEnd === "navigate" || secondEnd === "destroy") {
			expect(fresh).toEqual({ success: false, code: "lesson-player-unavailable" });
			return;
		}
		const view = (fresh as { result: LessonPlayerView }).result;
		expect((await media(p.owner, view.steps[0].video!.src)).status).toBe(206);
	});

it("choosing a new valid folder replaces the old package without cancelling the new open", async () => {
	const p = player();
	const first = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const second = (await route("open")(p.event)) as { success: boolean; result: LessonPlayerView };
	expect(second.success).toBe(true);
	expect((await media(p.owner, first.steps[0].video!.src)).status).toBe(404);
	expect((await media(p.owner, second.result.steps[0].video!.src)).status).toBe(206);
});

it("no other window can close or cancel a player's package or pending open", async () => {
	const p = player(),
		other = player(),
		editor = contents("file:///app/dist/index.html?windowType=editor"),
		stranger = contents();
	editorRangeSessions.register(editor.value, editor.value.getURL());
	const view = ((await route("open")(p.event)) as { result: LessonPlayerView }).result;
	const held = gate();
	pick.mockImplementationOnce(async () => {
		await held.promise;
		return moved;
	});
	const pending = route("open")(p.event);
	await new Promise((resolve) => setTimeout(resolve, 10));
	for (const intruder of [
		other.event,
		editor.event,
		stranger.event,
		{ ...p.event, senderFrame: {} },
	]) {
		await route("close")(intruder);
		await route("cancel")(intruder);
	}
	expect((await media(p.owner, view.steps[0].video!.src)).status).toBe(206);
	held.release();
	const result = (await pending) as { success: boolean; result: LessonPlayerView };
	expect(result.success).toBe(true);
	expect((await media(p.owner, result.result.steps[0].video!.src)).status).toBe(206);
});

it.each([
	"close",
	"cancel",
])("a %s during verification aborts the verifier's own signal at once, so its work stops", async (end) => {
	const p = player(),
		held = gate();
	let signal: AbortSignal | undefined;
	inspect.mockImplementationOnce(async (...args: Parameters<typeof openSelectedLessonPackage>) => {
		signal = args[1].signal;
		await held.promise;
		return openSelectedLessonPackage(...args);
	});
	const pending = route("open")(p.event);
	await vi.waitFor(() => expect(signal).toBeDefined());
	expect(signal!.aborted).toBe(false);
	await route(end)(p.event);
	expect(signal!.aborted).toBe(true);
	held.release();
	expect(await pending).toEqual({ success: false, code: "lesson-package-cancelled" });
});
