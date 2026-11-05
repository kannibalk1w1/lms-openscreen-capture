import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureJournalRecord } from "../../src/native/captureEvents";
import { CaptureEventJournal } from "./captureEventJournal";

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "capture-events-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("persists counted edges with unique IDs, preserving timing and unknown positions", () => {
	const onError = vi.fn();
	const journal = new CaptureEventJournal(join(root, "video.mp4"), onError);
	for (let click = 0; click < 1000; click++) {
		for (const pressed of [true, false]) {
			journal.append({
				event: "pointer-button",
				timestampMs: 1000 + click,
				monotonicMs: click,
				mediaTimeMs: click,
				code: 0x110 + (click % 8),
				pressed,
				device: "/dev/input/event1",
				position: null,
			});
		}
	}
	// Read before finalization: the journal is already on disk during capture.
	const records = readFileSync(journal.path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as CaptureJournalRecord);
	expect(records).toHaveLength(2000);
	expect(new Set(records.map((record) => record.id)).size).toBe(2000);
	expect(records.at(-1)).toMatchObject({
		sequence: 1999,
		code: 0x117,
		pressed: false,
		mediaTimeMs: 999,
		monotonicMs: 999,
		position: null,
	});
	expect(onError).not.toHaveBeenCalled();
});

it("never overwrites an existing journal and reports creation failure", () => {
	const video = join(root, "same.mp4");
	const first = new CaptureEventJournal(video, vi.fn());
	first.append({ event: "session-end", durationMs: 10 });
	const before = readFileSync(first.path, "utf8");
	const onError = vi.fn();
	const second = new CaptureEventJournal(video, onError);
	second.append({ event: "session-end", durationMs: 20 });
	expect(second.available).toBe(false);
	expect(onError).toHaveBeenCalledTimes(1);
	expect(readFileSync(first.path, "utf8")).toBe(before);
});

it("reports append failure once without throwing or writing after finalization", () => {
	const onError = vi.fn();
	const journal = new CaptureEventJournal(join(root, "video.mp4"), onError);
	rmSync(root, { recursive: true });
	expect(() => journal.append({ event: "session-end", durationMs: 10 })).not.toThrow();
	journal.append({ event: "session-end", durationMs: 20 });
	expect(journal.available).toBe(false);
	expect(onError).toHaveBeenCalledTimes(1);
});

it("finalizes once and ignores late events", () => {
	const journal = new CaptureEventJournal(join(root, "video.mp4"), vi.fn());
	journal.append({ event: "session-end", durationMs: 10 });
	journal.append({ event: "session-end", durationMs: 20 });
	expect(readFileSync(journal.path, "utf8").trim().split("\n")).toHaveLength(1);
});
