import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
	draftApplicationCaptureFile,
	inspectApplicationCaptureFile,
} from "./applicationCaptureFile";

let root: string;
const fixture = () =>
	JSON.stringify({
		format: "openscreen-application-capture",
		version: 1,
		adapterId: "fixture-editor",
		instanceId: "instance-1",
		sessionId: "take-1",
		scope: "synthetic-project",
		clock: "unmapped",
		coverage: "sampled",
		stopReason: "user-stop",
		pollIntervalMs: 100,
		durationMs: 900,
		baseline: { private: "BASELINE_CANARY" },
		observations: [
			{
				id: "event-a",
				atMs: 100,
				type: "node.changed",
				label: "First observation",
				payload: { secret: "PAYLOAD_A" },
			},
			{
				id: "event-b",
				atMs: 500,
				type: "node.changed",
				label: "Second observation",
				payload: { secret: "PAYLOAD_B" },
			},
		],
	});
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "capture-parity-")));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});
const paths = () => ({
	capturePath: path.join(root, "capture.json"),
	outputPath: path.join(root, "lesson.json"),
});
it("inspects only bounded metadata, then creates selected unmapped draft evidence", async () => {
	const p = paths(),
		raw = fixture();
	await fs.writeFile(p.capturePath, raw);
	const inspected = inspectApplicationCaptureFile({
		capturePath: p.capturePath,
	});
	expect(inspected).toMatchObject({
		observationCount: 2,
		coverage: "sampled",
		sha256: createHash("sha256").update(raw).digest("hex"),
	});
	expect(JSON.stringify(inspected)).not.toMatch(/BASELINE_CANARY|PAYLOAD_[AB]/);
	const result = await draftApplicationCaptureFile({
		...p,
		title: "Selected capture",
		sha256: inspected.sha256,
		observationIds: ["event-b"],
	});
	const lesson = JSON.parse(await fs.readFile(p.outputPath, "utf8"));
	expect(result.totalSteps).toBe(1);
	expect(lesson.steps[0].evidence).toMatchObject([
		{
			kind: "application-observation",
			eventId: "event-b",
			clock: "unmapped",
			application: { payload: { secret: "PAYLOAD_B" } },
		},
	]);
	expect(JSON.stringify(lesson)).not.toContain("PAYLOAD_A");
	expect(JSON.stringify(lesson)).not.toContain("BASELINE_CANARY");
	// Windows uses ACLs rather than POSIX permission bits.
	if (process.platform !== "win32") expect((await fs.stat(p.outputPath)).mode & 0o777).toBe(0o600);
});
it("rejects changed captures and invalid or duplicate selected ids without output", async () => {
	const p = paths();
	await fs.writeFile(p.capturePath, fixture());
	const inspected = inspectApplicationCaptureFile({
		capturePath: p.capturePath,
	});
	await fs.appendFile(p.capturePath, " ");
	await expect(
		draftApplicationCaptureFile({
			...p,
			title: "x",
			sha256: inspected.sha256,
			observationIds: ["event-a"],
		}),
	).rejects.toMatchObject({ code: "capture-file-changed" });
	const fresh = await inspectApplicationCaptureFile({
		capturePath: p.capturePath,
	});
	await expect(
		draftApplicationCaptureFile({
			...p,
			title: "x",
			sha256: fresh.sha256,
			observationIds: ["missing"],
		}),
	).rejects.toMatchObject({ code: "capture-observation-invalid" });
	for (const ids of [["event-a", "event-a"], []])
		await expect(
			draftApplicationCaptureFile({
				...p,
				title: "x",
				sha256: fresh.sha256,
				observationIds: ids,
			}),
		).rejects.toMatchObject({ code: "invalid-request" });
	await expect(fs.stat(p.outputPath)).rejects.toThrow();
});
it("refuses malformed, truncated, oversized, symlinked, colliding and existing output paths", async () => {
	const p = paths();
	await fs.writeFile(p.capturePath, "{ truncated");
	expect(() => inspectApplicationCaptureFile({ capturePath: p.capturePath })).toThrow();
	await fs.writeFile(p.capturePath, "x".repeat(8 * 1024 * 1024 + 1));
	expect(() => inspectApplicationCaptureFile({ capturePath: p.capturePath })).toThrow();
	await fs.writeFile(p.capturePath, Buffer.from([0xff, 0xfe, 0xfd]));
	expect(() => inspectApplicationCaptureFile({ capturePath: p.capturePath })).toThrow();
	const godot = await fs.readFile(
		new URL("../../integrations/godot-typing/probes/fixtures/scene.jsonl", import.meta.url),
	);
	await fs.writeFile(p.capturePath, godot.subarray(0, godot.length - 10));
	expect(() => inspectApplicationCaptureFile({ capturePath: p.capturePath })).toThrow();
	await fs.writeFile(p.capturePath, fixture());
	const inspected = inspectApplicationCaptureFile({
		capturePath: p.capturePath,
	});
	await expect(
		draftApplicationCaptureFile({
			...p,
			outputPath: p.capturePath,
			title: "x",
			sha256: inspected.sha256,
			observationIds: ["event-a"],
		}),
	).rejects.toMatchObject({ code: "invalid-request" });
	await fs.writeFile(p.outputPath, "preserve");
	await expect(
		draftApplicationCaptureFile({
			...p,
			title: "x",
			sha256: inspected.sha256,
			observationIds: ["event-a"],
		}),
	).rejects.toMatchObject({ code: "lesson-file-operation-failed" });
	// Windows symlink creation requires Developer Mode or elevated privileges.
	if (process.platform !== "win32") {
		const link = path.join(root, "linked.json");
		await fs.symlink(p.capturePath, link);
		expect(() => inspectApplicationCaptureFile({ capturePath: link })).toThrow();
	}
});

it("inspects and drafts from the retained real Godot v1 journal", async () => {
	const fixturePath = new URL(
		"../../integrations/godot-typing/probes/fixtures/scene.jsonl",
		import.meta.url,
	);
	const raw = await fs.readFile(fixturePath, "utf8");
	const p = paths();
	await fs.writeFile(p.capturePath, raw);
	const inspected = inspectApplicationCaptureFile({
		capturePath: p.capturePath,
		offset: 0,
		limit: 200,
	});
	expect(inspected).toMatchObject({
		adapterId: "godot-scene",
		coverage: "sampled",
		observationCount: 8,
	});
	expect(inspected.sha256).toBe(createHash("sha256").update(raw).digest("hex"));
	expect(JSON.stringify(inspected)).not.toMatch(/res:\/\/slime\.svg|baseline|properties/);
	const selected = inspected.observations.find((item) => item.label.includes("Slime"))!;
	const result = await draftApplicationCaptureFile({
		capturePath: p.capturePath,
		outputPath: p.outputPath,
		title: "Enemy sprite",
		sha256: inspected.sha256,
		observationIds: [selected.id],
	});
	const lesson = JSON.parse(await fs.readFile(p.outputPath, "utf8"));
	expect(result.totalSteps).toBe(1);
	expect(lesson.steps[0].evidence[0]).toMatchObject({
		kind: "application-observation",
		eventId: selected.id,
		clock: "unmapped",
	});
	const unsupported = raw
		.split("\n")
		.filter(Boolean)
		.map((line) => ({ ...JSON.parse(line), schemaVersion: 4 }));
	await fs.writeFile(
		p.capturePath,
		unsupported.map((record) => JSON.stringify(record)).join("\n") + "\n",
	);
	expect(() => inspectApplicationCaptureFile({ capturePath: p.capturePath })).toThrow();
});

it("inspects and drafts an authored checkpoint from a real-v1-derived Godot v2 fixture", async () => {
	const fixturePath = new URL(
		"../../integrations/godot-typing/probes/fixtures/scene.jsonl",
		import.meta.url,
	);
	const sourceRecords = (await fs.readFile(fixturePath, "utf8"))
		.trimEnd()
		.split("\n")
		.map((line) => JSON.parse(line));
	const latest = sourceRecords[2];
	const marker = {
		event: "scene-checkpoint",
		sessionId: sourceRecords[0].sessionId,
		instanceId: sourceRecords[0].instanceId,
		label: "Sprite settings checked",
		labelProvenance: "authored",
		nodeCount: latest.state.nodes.length,
		snapshotSequence: latest.sequence,
	};
	const records = [...sourceRecords.slice(0, 3), marker, ...sourceRecords.slice(3)].map(
		(record, sequence) => ({
			...record,
			schemaVersion: 2,
			sequence,
			atMs: sequence * 250,
		}),
	);
	const raw = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
	const p = paths();
	await fs.writeFile(p.capturePath, raw);
	const inspected = inspectApplicationCaptureFile({
		capturePath: p.capturePath,
		offset: 0,
		limit: 200,
	});
	const checkpoint = inspected.observations.find((item) => item.type === "author-checkpoint")!;
	expect(checkpoint.label).toContain("Sprite settings checked");
	expect(JSON.stringify(inspected)).not.toContain("res://slime.svg");
	const result = await draftApplicationCaptureFile({
		capturePath: p.capturePath,
		outputPath: p.outputPath,
		title: "Enemy checkpoint",
		sha256: inspected.sha256,
		observationIds: [checkpoint.id],
	});
	const lesson = JSON.parse(await fs.readFile(p.outputPath, "utf8"));
	expect(result.totalSteps).toBe(1);
	expect(lesson.steps[0].evidence[0]).toMatchObject({
		kind: "application-observation",
		eventId: checkpoint.id,
		clock: "unmapped",
		application: {
			type: "author-checkpoint",
			payload: { labelProvenance: "authored", nodeCount: 2 },
		},
	});
});
