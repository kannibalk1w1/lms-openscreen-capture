import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	compareGodotCheckpointsFile,
	GodotCheckpointFileError,
	inspectGodotCheckpointsFile,
} from "./godotCheckpointFile";
import * as selectedFile from "./selectedFile";

const v1 = fileURLToPath(
	new URL("../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
);
const v2 = fileURLToPath(
	new URL("../../integrations/godot-typing/probes/fixtures/checkpoints.jsonl", import.meta.url),
);
let root: string;
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "godot-checkpoint-file-")));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});

it("lists v1 as zero markers and pages real v2 checkpoints by distinct raw record sequence", async () => {
	const v1Path = path.join(root, "v1.jsonl"),
		v2Path = path.join(root, "v2.jsonl");
	await fs.copyFile(v1, v1Path);
	await fs.copyFile(v2, v2Path);
	const old = inspectGodotCheckpointsFile({ journalPath: v1Path });
	expect(old.checkpointCount).toBe(0);
	const firstPage = inspectGodotCheckpointsFile({ journalPath: v2Path, limit: 2 });
	expect(firstPage).toMatchObject({
		checkpointCount: 4,
		nextOffset: 2,
		checkpoints: [{ recordSequence: 1 }, { recordSequence: 6 }],
	});
	expect(firstPage.checkpoints[0].label).toBe("Scene opened");
	expect(
		inspectGodotCheckpointsFile({ journalPath: v2Path, offset: 2, limit: 2 }).checkpoints.map(
			(x) => x.recordSequence,
		),
	).toEqual([7, 13]);
	expect(firstPage.sha256).toBe(
		createHash("sha256")
			.update(await fs.readFile(v2Path))
			.digest("hex"),
	);
});

it("keeps duplicate labels distinct, compares forward/reverse, and omits paths and resource values", async () => {
	const journalPath = path.join(root, "v2.jsonl");
	const records = (await fs.readFile(v2, "utf8"))
		.trimEnd()
		.split("\n")
		.map((line) => JSON.parse(line));
	records.find((record) => record.event === "scene-checkpoint" && record.sequence === 6).label =
		"Scene opened";
	const duplicateLabelRaw = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
	await fs.writeFile(journalPath, duplicateLabelRaw);
	const inspection = inspectGodotCheckpointsFile({ journalPath });
	const sameLabel = inspection.checkpoints.filter((item) => item.label === "Scene opened");
	expect(sameLabel.map((item) => item.recordSequence)).toEqual([1, 6]);
	const forward = compareGodotCheckpointsFile({
		journalPath,
		fromRecordSequence: 1,
		toRecordSequence: 6,
		sha256: inspection.sha256,
	});
	const reverse = compareGodotCheckpointsFile({
		journalPath,
		fromRecordSequence: 6,
		toRecordSequence: 1,
		sha256: inspection.sha256,
	});
	expect(forward.comparison).toMatchObject({
		from: { recordSequence: 1 },
		to: { recordSequence: 6 },
	});
	expect(reverse.comparison).toMatchObject({
		from: { recordSequence: 6 },
		to: { recordSequence: 1 },
	});
	expect(JSON.stringify(forward)).not.toContain(journalPath);
	expect(JSON.stringify(forward)).not.toContain("res://");
	expect(await fs.readFile(journalPath, "utf8")).toBe(duplicateLabelRaw);
});

it("binds comparison to exact source SHA and rejects non-checkpoint sequences", async () => {
	const journalPath = path.join(root, "v2.jsonl");
	await fs.copyFile(v2, journalPath);
	const sha256 = inspectGodotCheckpointsFile({ journalPath }).sha256;
	await fs.appendFile(journalPath, "\n");
	expect(() =>
		compareGodotCheckpointsFile({
			journalPath,
			fromRecordSequence: 1,
			toRecordSequence: 6,
			sha256,
		}),
	).toThrowError(new GodotCheckpointFileError("capture-file-changed"));
	const restored = await fs.readFile(v2);
	await fs.writeFile(journalPath, restored);
	expect(() =>
		compareGodotCheckpointsFile({
			journalPath,
			fromRecordSequence: 0,
			toRecordSequence: 6,
			sha256,
		}),
	).toThrow();
});

it("validates whole input and rejects normalized data, malformed tails, invalid UTF-8, symlinks and oversized sources", async () => {
	const source = path.join(root, "source.jsonl");
	await fs.writeFile(source, JSON.stringify({ adapterId: "godot-scene", observations: [] }));
	expect(() => inspectGodotCheckpointsFile({ journalPath: source })).toThrowError(
		new GodotCheckpointFileError("capture-file-invalid"),
	);
	await fs.copyFile(v1, source);
	await fs.appendFile(source, "not-json\n");
	expect(() => inspectGodotCheckpointsFile({ journalPath: source })).toThrowError(
		new GodotCheckpointFileError("capture-file-invalid"),
	);
	await fs.writeFile(source, Buffer.from([0xff, 0xfe]));
	expect(() => inspectGodotCheckpointsFile({ journalPath: source })).toThrowError(
		new GodotCheckpointFileError("capture-file-invalid"),
	);
	// Windows symlink creation requires separate OS privileges; exercise this on POSIX.
	if (process.platform !== "win32") {
		const link = path.join(root, "link.jsonl");
		await fs.symlink(v1, link);
		expect(() => inspectGodotCheckpointsFile({ journalPath: link })).toThrowError(
			new GodotCheckpointFileError("capture-file-unavailable"),
		);
	}
	const large = path.join(root, "large.jsonl");
	await fs.writeFile(large, Buffer.alloc(8 * 1024 * 1024 + 1));
	expect(() => inspectGodotCheckpointsFile({ journalPath: large })).toThrowError(
		new GodotCheckpointFileError("capture-file-unavailable"),
	);
});

it("calls current-authority guard before reading and rejects invalid service arguments", async () => {
	const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
	const assertCurrent = vi.fn(() => {
		throw new Error("cancelled");
	});
	expect(() =>
		inspectGodotCheckpointsFile({ journalPath: path.join(root, "missing") }, assertCurrent),
	).toThrow("cancelled");
	expect(read).not.toHaveBeenCalled();
	expect(() => inspectGodotCheckpointsFile({ journalPath: "relative" })).toThrowError(
		new GodotCheckpointFileError("invalid-request"),
	);
});
