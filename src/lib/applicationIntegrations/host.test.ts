import { expect, it, vi } from "vitest";
import { ApplicationIntegrationHost, type IntegrationProvider } from "./host";
import { GODOT_JOURNAL_DESCRIPTOR, type IntegrationSession } from "./schema";

const context = (instanceId = "instance-a"): IntegrationSession => ({
	version: 1,
	adapterId: "godot-codeedit",
	instanceId,
	sessionId: "shared-local-session",
	capability: "typing.journal-import",
	scope: { kind: "selected-file", artifactId: `file-${instanceId}` },
});
const observation = (session: IntegrationSession, sequence = 0) => ({
	...session,
	sequence,
	type: "test",
	clock: { id: "producer-clock", tickMs: sequence, relation: "unmapped" },
	provenance: "observed",
	payload: { text: "allowed" },
});
function fixture(start?: IntegrationProvider["start"]) {
	const emits = new Map<string, (value: unknown) => boolean>();
	const stops = new Map<string, ReturnType<typeof vi.fn>>();
	const provider: IntegrationProvider = {
		descriptor: GODOT_JOURNAL_DESCRIPTOR,
		start:
			start ??
			((session, emit) => {
				emits.set(session.instanceId, emit);
				const stop = vi.fn();
				stops.set(session.instanceId, stop);
				return stop;
			}),
	};
	const host = new ApplicationIntegrationHost([GODOT_JOURNAL_DESCRIPTOR], [provider], 20);
	return { host, emits, stops, provider };
}
it("an empty registry requires no application and exposes no available integration", () => {
	const host = new ApplicationIntegrationHost();
	expect(host.statuses()).toEqual([]);
	host.setEnabled(["godot-codeedit"]);
	expect(host.statuses()).toEqual([]);
});
it("defaults disabled, denies unknown scope/permission and never invokes its producer", async () => {
	const start = vi.fn(() => () => undefined);
	const f = fixture(start);
	await expect(f.host.open(context(), { selectedFileAuthorized: true })).rejects.toThrow(
		"not authorized",
	);
	f.host.setEnabled(["godot-codeedit"]);
	await expect(
		f.host.open(
			{ ...context(), scope: { kind: "application", applicationId: null } },
			{ selectedFileAuthorized: true },
		),
	).rejects.toThrow();
	await expect(f.host.open(context(), { selectedFileAuthorized: false })).rejects.toThrow(
		"not authorized",
	);
	expect(start).not.toHaveBeenCalled();
	expect(f.host.statuses()[0].activeSessions).toBe(0);
});
it("isolates two same-type instances sharing local session IDs and sequences", async () => {
	const f = fixture();
	f.host.setEnabled(["godot-codeedit"]);
	const a = context("a"),
		b = context("b");
	await Promise.all([
		f.host.open(a, { selectedFileAuthorized: true }),
		f.host.open(b, { selectedFileAuthorized: true }),
	]);
	expect(f.emits.get("a")!(observation(a))).toBe(true);
	expect(f.emits.get("b")!(observation(b))).toBe(true);
	expect(f.host.take("a")[0].scope).toEqual({ kind: "selected-file", artifactId: "file-a" });
	expect(f.host.take("b")[0].scope).toEqual({ kind: "selected-file", artifactId: "file-b" });
	expect(f.emits.get("a")!(observation(b, 1))).toBe(false);
	expect(f.host.statuses()[0].activeSessions).toBe(1);
	expect(f.stops.get("a")).toHaveBeenCalledTimes(1);
	expect(f.emits.get("b")!(observation(b, 1))).toBe(true);
	expect(f.host.take("b")).toHaveLength(1);
	f.host.close("b");
});
it.each([
	"sessionId",
	"capability",
	"scope",
	"sequence",
	"clock",
])("rejects stale/wrong %s and clears queued private content", async (field) => {
	const f = fixture();
	f.host.setEnabled(["godot-codeedit"]);
	const c = context();
	await f.host.open(c, { selectedFileAuthorized: true });
	const first = observation(c);
	expect(f.emits.get(c.instanceId)!(first)).toBe(true);
	const bad = {
		...observation(c, 1),
		payload: { text: "PRIVATE_CANARY" },
		[field]:
			field === "scope"
				? { kind: "selected-file", artifactId: "other" }
				: field === "clock"
					? { id: "other-clock", tickMs: 0, relation: "unmapped" }
					: field === "sequence"
						? 4
						: "wrong",
	};
	expect(f.emits.get(c.instanceId)!(bad)).toBe(false);
	expect(() => f.host.take(c.instanceId)).toThrow("unavailable");
	expect(JSON.stringify(f.host.statuses())).not.toContain("PRIVATE_CANARY");
});
it("disable stops callbacks before touching late payloads and drops queued content", async () => {
	const f = fixture();
	f.host.setEnabled(["godot-codeedit"]);
	const c = context();
	await f.host.open(c, { selectedFileAuthorized: true });
	f.emits.get(c.instanceId)!(observation(c));
	f.host.disable(c.adapterId);
	const payload = vi.fn(() => {
		throw new Error("PRIVATE_GETTER_CANARY");
	});
	const raw = Object.defineProperty({}, "payload", { get: payload });
	expect(f.emits.get(c.instanceId)!(raw)).toBe(false);
	expect(payload).not.toHaveBeenCalled();
	expect(f.stops.get(c.instanceId)).toHaveBeenCalledTimes(1);
	expect(() => f.host.take(c.instanceId)).toThrow();
});
it("enforces queue capacity and refuses data after failure", async () => {
	const f = fixture();
	f.host.setEnabled(["godot-codeedit"]);
	const c = context();
	await f.host.open(c, { selectedFileAuthorized: true });
	for (let i = 0; i < 64; i++) expect(f.emits.get(c.instanceId)!(observation(c, i))).toBe(true);
	expect(f.emits.get(c.instanceId)!(observation(c, 64))).toBe(false);
	expect(f.host.statuses()[0].error).toBe("capacity");
	expect(() => f.host.take(c.instanceId)).toThrow();
});
it("bounds bytes independently of record count", async () => {
	const f = fixture();
	f.host.setEnabled(["godot-codeedit"]);
	const c = context();
	await f.host.open(c, { selectedFileAuthorized: true });
	expect(
		f.emits.get(c.instanceId)!({
			...observation(c),
			payload: { text: "x".repeat(8 * 1024 * 1024 + 65536) },
		}),
	).toBe(false);
	expect(f.host.statuses()[0].error).toBe("capacity");
});
it("isolates a startup fault and a missing provider", async () => {
	const f = fixture(() => {
		throw new Error("PRIVATE_FAILURE_CANARY");
	});
	f.host.setEnabled(["godot-codeedit"]);
	await expect(f.host.open(context(), { selectedFileAuthorized: true })).rejects.toThrow(
		"Optional integration could not start",
	);
	expect(JSON.stringify(f.host.statuses())).not.toContain("PRIVATE_FAILURE_CANARY");
	const absent = new ApplicationIntegrationHost([GODOT_JOURNAL_DESCRIPTOR]);
	absent.setEnabled(["godot-codeedit"]);
	expect(absent.statuses()[0].state).toBe("unavailable");
});
it("times out a producer and tears it down if startup later completes", async () => {
	let finish: (stop: () => void) => void = () => undefined;
	const stop = vi.fn();
	const f = fixture(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	f.host.setEnabled(["godot-codeedit"]);
	await expect(f.host.open(context(), { selectedFileAuthorized: true })).rejects.toThrow(
		"could not start",
	);
	finish(stop);
	await Promise.resolve();
	await Promise.resolve();
	expect(stop).toHaveBeenCalledTimes(1);
	expect(f.host.statuses()[0].activeSessions).toBe(0);
});
it("does not let producer or status consumers rewrite authoritative context", async () => {
	const f = fixture((session, emit) => {
		session.sessionId = "changed";
		emit(observation(session));
		return () => undefined;
	});
	f.host.setEnabled(["godot-codeedit"]);
	f.host.statuses()[0].descriptor.capabilities.push("unapproved");
	await expect(
		f.host.open({ ...context(), capability: "unapproved" }, { selectedFileAuthorized: true }),
	).rejects.toThrow();
	await expect(f.host.open(context(), { selectedFileAuthorized: true })).rejects.toThrow(
		"could not start",
	);
});
it("disable during startup closes the producer when it finally returns and rejects late payloads", async () => {
	let finish: (stop: () => void) => void = () => undefined;
	let emit: (value: unknown) => boolean = () => false;
	const f = fixture((_session, callback) => {
		emit = callback;
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	f.host.setEnabled(["godot-codeedit"]);
	const opening = f.host.open(context(), { selectedFileAuthorized: true });
	const rejected = expect(opening).rejects.toThrow("could not start");
	await Promise.resolve();
	f.host.disable("godot-codeedit");
	const stop = vi.fn();
	finish(stop);
	await rejected;
	expect(stop).toHaveBeenCalledTimes(1);
	expect(emit({ ...observation(context()), payload: { text: "PRIVATE_LATE_CANARY" } })).toBe(false);
	expect(f.host.statuses()[0].state).toBe("disabled");
});
it("isolates an incompatible provider contract rather than failing the core host", async () => {
	const incompatible = {
		descriptor: { ...GODOT_JOURNAL_DESCRIPTOR, version: "unsupported" },
		start: vi.fn(() => () => undefined),
	};
	const host = new ApplicationIntegrationHost([GODOT_JOURNAL_DESCRIPTOR], [incompatible]);
	host.setEnabled(["godot-codeedit"]);
	expect(host.statuses()[0].state).toBe("incompatible");
	await expect(host.open(context(), { selectedFileAuthorized: true })).rejects.toThrow(
		"unavailable",
	);
	expect(incompatible.start).not.toHaveBeenCalled();
});
it("routes different adapter IDs independently even when their local IDs collide", async () => {
	const other = { ...GODOT_JOURNAL_DESCRIPTOR, id: "test-only" };
	const emits = new Map<string, (value: unknown) => boolean>();
	const providers = [GODOT_JOURNAL_DESCRIPTOR, other].map((descriptor) => ({
		descriptor,
		start: (session: IntegrationSession, emit: (value: unknown) => boolean) => {
			emits.set(session.adapterId, emit);
			return () => undefined;
		},
	}));
	const host = new ApplicationIntegrationHost([GODOT_JOURNAL_DESCRIPTOR, other], providers);
	host.setEnabled(["godot-codeedit", "test-only"]);
	const a = context("a"),
		b = { ...context("b"), adapterId: "test-only" };
	await host.open(a, { selectedFileAuthorized: true });
	await host.open(b, { selectedFileAuthorized: true });
	expect(emits.get(a.adapterId)!(observation(a))).toBe(true);
	expect(emits.get(b.adapterId)!(observation(b))).toBe(true);
	expect(host.take("a")[0].adapterId).toBe(a.adapterId);
	expect(host.take("b")[0].adapterId).toBe(b.adapterId);
	host.disable(a.adapterId);
	expect(emits.get(b.adapterId)!(observation(b, 1))).toBe(true);
	host.close("b");
});
it("a selected-file grant cannot authorize a paired-project clock capability", async () => {
	const descriptor = {
		...GODOT_JOURNAL_DESCRIPTOR,
		id: "godot-recording-clock",
		mode: "paired-project" as const,
		capabilities: ["recording.clock"],
	};
	const start = vi.fn(() => () => undefined);
	const host = new ApplicationIntegrationHost([descriptor], [{ descriptor, start }]);
	host.enable(descriptor.id);
	const session = {
		version: 1,
		adapterId: descriptor.id,
		instanceId: "paired-instance",
		sessionId: "paired-session",
		capability: "recording.clock",
		scope: {
			kind: "paired-project",
			applicationId: "godot",
			projectId: "a".repeat(64),
			grantId: "64c1e73a-04b8-40da-aa34-7a7ec0f1c711",
		},
	};
	await expect(host.open(session, { selectedFileAuthorized: true })).rejects.toThrow(
		"not authorized",
	);
	await expect(host.open(session, { pairedProjectGrantId: "other" })).rejects.toThrow(
		"not authorized",
	);
	expect(start).not.toHaveBeenCalled();
	await host.open(session, { pairedProjectGrantId: session.scope.grantId });
	expect(start).toHaveBeenCalledTimes(1);
	host.disable(descriptor.id);
});
