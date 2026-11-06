import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationIntegrationHost } from "../../src/lib/applicationIntegrations/host";
import { GODOT_CLOCK_DESCRIPTOR } from "../../src/lib/applicationIntegrations/schema";
import {
	type ClockLink,
	clockLinkSchema,
	type NativeClockSnapshot,
} from "../../src/lib/clockBridge/schema";
import { RecordingClockBridge } from "./recordingClockBridge";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});
const point = (state: "recording" | "paused" = "recording"): NativeClockSnapshot => ({
	version: 1,
	clockId: randomUUID(),
	observedMonotonicMs: 200,
	state,
	mediaTimeMs: 100,
	intervalId: 0,
	intervalStartMonotonicMs: 100,
	intervalEndMonotonicMs: state === "paused" ? 200 : null,
	intervalMediaStartMs: 0,
});
async function fixture(query?: () => Promise<NativeClockSnapshot>) {
	const stable = point();
	query = query ?? vi.fn(async () => stable);
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "recording-clock-link-"));
	cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
	const project = path.join(root, "project");
	await fs.mkdir(project);
	await fs.writeFile(
		path.join(project, "project.godot"),
		'config_version=5\n[application]\nconfig/name="Clock fixture"\n',
	);
	let time = 0;
	const bridge = new RecordingClockBridge(
		query,
		() => true,
		() => time,
	);
	const host = new ApplicationIntegrationHost([GODOT_CLOCK_DESCRIPTOR], [bridge.provider]);
	bridge.attachHost(host);
	cleanup.push(async () => {
		await bridge.stop();
	});
	return {
		root,
		project,
		bridge,
		host,
		query,
		advance: (ms: number) => {
			time += ms;
		},
		pair: async () => {
			const file = path.join(root, `link-${randomUUID()}.json`);
			await bridge.createPair(project, file);
			return clockLinkSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
		},
	};
}
function body(link: ClockLink, sequence = 0, instanceId = "godot-peer-0001") {
	return {
		version: 1,
		grantId: link.grantId,
		projectId: link.projectId,
		instanceId,
		sequence,
		clientSendMs: sequence * 100,
	};
}
function request(link: ClockLink, value: unknown = body(link), auth = `Bearer ${link.token}`) {
	return fetch(link.endpoint, {
		method: "POST",
		headers: { Authorization: auth, "Content-Type": "application/json" },
		body: JSON.stringify(value),
	});
}
it("has no default listener/permission and creates a private read-only project link only on request", async () => {
	const f = await fixture();
	expect(f.bridge.snapshot()).toEqual({ available: true, state: "disabled", peers: 0 });
	expect(f.host.statuses()[0].enabled).toBe(false);
	expect(f.query).not.toHaveBeenCalled();
	const link = await f.pair();
	expect(link.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:/);
	const status = f.bridge.snapshot();
	expect(status.state).toBe("paired");
	expect(JSON.stringify(status)).not.toContain(link.token);
	if (process.platform !== "win32")
		expect((await fs.stat(status.pairFilePath!)).mode & 0o777).toBe(0o600);
	const response = await request(link);
	expect(response.status).toBe(200);
	const value = await response.json();
	expect(value).toMatchObject({
		success: true,
		grantId: link.grantId,
		sequence: 0,
		nativeClock: { state: "recording", mediaTimeMs: 100 },
	});
	expect(value).not.toHaveProperty("timestampMs");
	expect(f.bridge.snapshot().state).toBe("recording");
	expect(f.query).toHaveBeenCalledTimes(1);
});
it("rejects bad token, wrong project, unknown fields and replay without reading the native source", async () => {
	const f = await fixture();
	const link = await f.pair();
	expect((await request(link, body(link), `Bearer ${"é".repeat(64)}`)).status).toBe(403);
	expect((await request(link, { ...body(link), projectId: "f".repeat(64) })).status).toBe(403);
	const invalid = await request(link, { ...body(link), text: "PRIVATE_CLOCK_REQUEST_CANARY" });
	expect(invalid.status).toBe(400);
	expect(JSON.stringify(await invalid.json())).not.toContain("PRIVATE_");
	expect(f.query).not.toHaveBeenCalled();
	expect((await request(link)).status).toBe(200);
	f.advance(101);
	expect((await request(link)).status).toBe(409);
	expect(f.query).toHaveBeenCalledTimes(1);
});
it("bounds peer/query rate while allowing explicit request gaps", async () => {
	const f = await fixture();
	const link = await f.pair();
	expect((await request(link)).status).toBe(200);
	expect((await request(link, body(link, 1))).status).toBe(429);
	f.advance(101);
	expect((await request(link, body(link, 2))).status).toBe(200);
	for (let n = 2; n <= 4; n++)
		expect((await request(link, body(link, 0, `godot-peer-000${n}`))).status).toBe(200);
	expect((await request(link, body(link, 0, "godot-peer-0005"))).status).toBe(429);
	expect(f.bridge.snapshot().peers).toBe(4);
});
it("reports native unavailability as a gap and observes pause without issuing controls", async () => {
	const query = vi
		.fn<() => Promise<NativeClockSnapshot>>()
		.mockRejectedValueOnce(new Error("PRIVATE_NATIVE_FAILURE_CANARY"))
		.mockResolvedValue(point("paused"));
	const f = await fixture(query);
	const link = await f.pair();
	const unavailable = await request(link);
	expect(unavailable.status).toBe(503);
	expect(JSON.stringify(await unavailable.json())).not.toContain("PRIVATE_");
	expect(f.bridge.snapshot().state).toBe("waiting");
	f.advance(101);
	const paused = await request(link, body(link, 1));
	expect((await paused.json()).nativeClock.state).toBe("paused");
	expect(f.bridge.snapshot().state).toBe("paused");
	f.advance(1600);
	expect(f.bridge.snapshot().state).toBe("stale");
});
it("expires the grant on its monotonic lifetime and preserves its original private file", async () => {
	const f = await fixture();
	const link = await f.pair();
	const file = f.bridge.snapshot().pairFilePath!;
	const original = await fs.readFile(file, "utf8");
	f.advance(3600001);
	expect(f.bridge.snapshot().state).toBe("expired");
	expect((await request(link)).status).toBe(410);
	expect(f.query).not.toHaveBeenCalled();
	await f.bridge.stop();
	expect(await fs.readFile(file, "utf8")).toBe(original);
	expect(f.host.statuses()[0].enabled).toBe(false);
});
it("revokes an in-flight query before it can return any clock data", async () => {
	let finish: (point: NativeClockSnapshot) => void = () => undefined;
	const query = vi.fn(
		() =>
			new Promise<NativeClockSnapshot>((resolve) => {
				finish = resolve;
			}),
	);
	const f = await fixture(query);
	const link = await f.pair();
	const pending = request(link)
		.then((response) => response.text())
		.catch(() => "connection-closed");
	await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(1));
	await f.bridge.stop();
	finish(point());
	expect(await pending).toBe("connection-closed");
	expect(f.host.statuses()[0].activeSessions).toBe(0);
});
it("never overwrites an existing link or a project file", async () => {
	const f = await fixture();
	const file = path.join(f.root, "prior.json");
	await fs.writeFile(file, "prior evidence");
	await expect(f.bridge.createPair(f.project, file)).rejects.toThrow("already exists");
	expect(await fs.readFile(file, "utf8")).toBe("prior evidence");
	expect(f.bridge.snapshot().state).toBe("disabled");
});
it("binds a grant to its first native take and never returns a different take's clock", async () => {
	const first = point(),
		second = point();
	const query = vi
		.fn<(_expected?: string) => Promise<NativeClockSnapshot>>()
		.mockResolvedValueOnce(first)
		.mockResolvedValueOnce(second);
	const f = await fixture(query);
	const link = await f.pair();
	expect((await request(link)).status).toBe(200);
	f.advance(101);
	const ended = await request(link, body(link, 1));
	expect(ended.status).toBe(410);
	const result = await ended.json();
	expect(result.code).toBe("source-ended");
	expect(JSON.stringify(result)).not.toContain(second.clockId);
	expect(query.mock.calls[1][0]).toBe(first.clockId);
	await vi.waitFor(() => expect(f.bridge.snapshot().state).toBe("ended"));
	expect(f.host.statuses()[0].enabled).toBe(false);
});
