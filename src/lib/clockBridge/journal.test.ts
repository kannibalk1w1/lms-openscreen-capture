import { expect, it } from "vitest";
import { inspectClockJournal } from "./journal";

const id = "64c1e73a-04b8-40da-aa34-7a7ec0f1c711";
const rows = () => [
	{
		schemaVersion: 1,
		event: "clock-start",
		sequence: 0,
		atMs: 0,
		format: "openscreen-clock-samples",
		version: 1,
		instanceId: "godot-clock-fixture",
		grantId: id,
		projectId: "f".repeat(64),
		clock: "session-elapsed-ms",
	},
	{
		schemaVersion: 1,
		event: "clock-sample",
		relation: "round-trip-bracket",
		sequence: 1,
		atMs: 20,
		requestSequence: 0,
		clientSendMs: 10,
		clientReceiveMs: 20,
		nativeClock: {
			version: 1,
			clockId: id,
			observedMonotonicMs: 200,
			state: "paused",
			mediaTimeMs: 100,
			intervalId: 0,
			intervalStartMonotonicMs: 0,
			intervalEndMonotonicMs: 100,
			intervalMediaStartMs: 0,
		},
	},
	{ schemaVersion: 1, event: "clock-stop", sequence: 2, atMs: 30, reason: "user-stop" },
];
const text = (value: unknown[]) => value.map((row) => JSON.stringify(row)).join("\n");
it("inspects portable sampled evidence without an adapter or UTC mapping", () => {
	expect(inspectClockJournal(text(rows()))).toMatchObject({
		samples: 1,
		pausedSamples: 1,
		gaps: 0,
		closed: true,
		maxRoundTripMs: 10,
		durationMs: 30,
		nativeClockIds: [id],
	});
});
it("retains missing closure as unverified instead of pretending complete capture", () => {
	expect(inspectClockJournal(text(rows().slice(0, 2))).closed).toBe(false);
});
it("counts declared gaps and limit closure without fabricating media times", () => {
	const [header] = rows();
	expect(
		inspectClockJournal(
			text([
				header,
				{
					schemaVersion: 1,
					event: "clock-gap",
					sequence: 1,
					atMs: 15,
					requestSequence: 0,
					reason: "native-unavailable",
				},
				{ schemaVersion: 1, event: "clock-stop", sequence: 2, atMs: 20, reason: "limit" },
			]),
		),
	).toMatchObject({ samples: 0, gaps: 1, closed: true, stopReason: "limit", nativeClockIds: [] });
});
it.each([
	"sequence",
	"backwards",
	"round-trip",
	"trailing",
	"unknown-version",
])("rejects %s journal corruption", (kind) => {
	const value = rows();
	if (kind === "sequence") value[1].sequence = 4;
	if (kind === "backwards") value[1].atMs = -1;
	if (kind === "round-trip") Object.assign(value[1], { clientSendMs: 21 });
	if (kind === "trailing") value.push(value[1]);
	if (kind === "unknown-version") Object.assign(value[0], { version: 9 });
	expect(() => inspectClockJournal(text(value))).toThrow();
});
it("bounds input bytes before parsing any unknown payload", () => {
	expect(() => inspectClockJournal("x".repeat(8 * 1024 * 1024 + 1))).toThrow("8 MiB");
});
