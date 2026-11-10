import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listGodotSceneCheckpoints } from "../../src/lib/applicationIntegrations/godotScene";
import { parseCliArgs } from "../cli/args";
import { runLessonCommand } from "../cli/lessonCommands";
import { registerLessonTools } from "../mcp/lesson-tools";
import { compareGodotReferenceFile, GodotCheckpointFileError } from "./godotCheckpointFile";
import * as selectedFile from "./selectedFile";

const fixture = (name: string) =>
	fileURLToPath(
		new URL(`../../integrations/godot-typing/probes/fixtures/${name}`, import.meta.url),
	);
let root: string, referencePath: string, candidatePath: string;
let referenceSha256: string, candidateSha256: string;
let referenceRecord: number, candidateRecord: number;
const sha = async (file: string) =>
	createHash("sha256")
		.update(await fs.readFile(file))
		.digest("hex");
const marker = async (file: string, label: string) => {
	const found = listGodotSceneCheckpoints(await fs.readFile(file, "utf8")).find(
		(entry) => entry.label === label,
	);
	if (!found) throw new Error(`missing ${label}`);
	return found.recordSequence;
};
beforeEach(async () => {
	root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "godot-reference-file-")));
	referencePath = path.join(root, "linux take.jsonl");
	candidatePath = path.join(root, "windows take.jsonl");
	await fs.copyFile(fixture("scene-v5-linux.jsonl"), referencePath);
	await fs.copyFile(fixture("scene-v5-windows.jsonl"), candidatePath);
	referenceSha256 = await sha(referencePath);
	candidateSha256 = await sha(candidatePath);
	referenceRecord = await marker(referencePath, "3D baseline");
	candidateRecord = await marker(candidatePath, "3D baseline");
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
	vi.restoreAllMocks();
});
const request = (change: Record<string, unknown> = {}) => ({
	referencePath,
	referenceSha256,
	referenceRecordSequence: referenceRecord,
	candidatePath,
	candidateSha256,
	candidateRecordSequence: candidateRecord,
	...change,
});

describe("compareGodotReferenceFile", () => {
	it("compares two real takes bound to their own hashes without writing or echoing paths", async () => {
		const before = await fs.readdir(root);
		const result = compareGodotReferenceFile(request());
		expect(result).toMatchObject({
			format: "openscreen-godot-reference-comparison",
			version: 1,
			clock: "unmapped",
			sameContent: false,
			comparison: {
				kind: "advisory-sampled-state-comparison",
				outcome: "sampled-fields-agree",
				relation: { sameTake: false, sameCheckpoint: false },
				reference: { sha256: referenceSha256, schemaVersion: 5 },
				candidate: { sha256: candidateSha256, schemaVersion: 5 },
			},
		});
		expect(JSON.stringify(result)).not.toContain(root);
		expect(await fs.readdir(root)).toEqual(before);
	});

	it("allows the same file for both sides", () => {
		const result = compareGodotReferenceFile(
			request({
				candidatePath: referencePath,
				candidateSha256: referenceSha256,
				candidateRecordSequence: referenceRecord,
			}),
		);
		expect(result.comparison.outcome).toBe("sampled-fields-agree");
		// Agreement of a take with itself is not independent confirmation.
		expect(result.sameContent).toBe(true);
		expect(result.comparison.relation).toEqual({ sameTake: true, sameCheckpoint: true });
	});

	it("rejects a second-source failure without disclosing the first source", () => {
		let message = "";
		try {
			compareGodotReferenceFile(request({ candidatePath: path.join(root, "missing.jsonl") }));
		} catch (error) {
			message = JSON.stringify({ ...(error as object), message: (error as Error).message });
		}
		expect(message).toContain("candidate-file-unavailable");
		expect(message).not.toContain("3D baseline");
		expect(message).not.toContain(referenceSha256);
	});

	it("binds each side to its own inspected hash", () => {
		const code = (change: Record<string, unknown>) => {
			try {
				compareGodotReferenceFile(request(change));
			} catch (error) {
				return error instanceof GodotCheckpointFileError ? error.code : "other";
			}
			return "ok";
		};
		expect(code({ referenceSha256: candidateSha256 })).toBe("reference-file-changed");
		expect(code({ candidateSha256: referenceSha256 })).toBe("candidate-file-changed");
		expect(code({ candidateRecordSequence: 0 })).toBe("candidate-checkpoint-invalid");
		expect(code({ referenceRecordSequence: 0 })).toBe("reference-checkpoint-invalid");
		expect(code({ tolerance: 2 })).toBe("invalid-request");
		expect(code({ candidatePath: "relative.jsonl" })).toBe("invalid-request");
		expect(code({ extra: true })).toBe("invalid-request");
		expect(code({ candidatePath: path.join(root, "missing.jsonl") })).toBe(
			"candidate-file-unavailable",
		);
	});

	it("reads both files only after the caller's currency check", () => {
		const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
		expect(() =>
			compareGodotReferenceFile(request(), () => {
				throw new Error("stale");
			}),
		).toThrow("stale");
		expect(read).not.toHaveBeenCalled();
	});

	it("stops between the two reads when cancelled after the first", () => {
		const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
		let calls = 0;
		expect(() =>
			compareGodotReferenceFile(request(), () => {
				if (++calls === 2) throw new Error("cancelled");
			}),
		).toThrow("cancelled");
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("passes an explicit tolerance through and reports exact comparison otherwise", () => {
		expect(compareGodotReferenceFile(request()).comparison.numbers).toEqual({ mode: "exact" });
		expect(compareGodotReferenceFile(request({ tolerance: 0.001 })).comparison.numbers).toEqual({
			mode: "absolute-tolerance",
			tolerance: 0.001,
			appliesTo: "continuous-transform-properties",
		});
	});
});

describe("MCP compareGodotReferenceFile", () => {
	let server: McpServer, client: Client, allowed: boolean;
	beforeEach(async () => {
		allowed = false;
		server = new McpServer({ name: "godot-reference-test", version: "0" });
		registerLessonTools(server, { transport: "http", editsAllowed: () => allowed });
		client = new Client({ name: "test", version: "0" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(a), client.connect(b)]);
	});
	afterEach(async () => {
		await client.close();
		await server.close();
	});
	const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
		(result.content as { text?: string }[]).map((part) => part.text ?? "").join("");

	it("is read-only and denies HTTP calls before any file access", async () => {
		const tool = (await client.listTools()).tools.find(
			(item) => item.name === "compareGodotReferenceFile",
		);
		expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
		const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
		const denied = await client.callTool({
			name: "compareGodotReferenceFile",
			arguments: request(),
		});
		expect(text(denied)).toContain("consent_required");
		expect(read).not.toHaveBeenCalled();
	});

	it("matches the service result and rechecks permission before returning", async () => {
		allowed = true;
		const result = JSON.parse(
			text(await client.callTool({ name: "compareGodotReferenceFile", arguments: request() })),
		);
		expect(result).toEqual(compareGodotReferenceFile(request()));
		const original = selectedFile.readSelectedFileSnapshot;
		vi.spyOn(selectedFile, "readSelectedFileSnapshot").mockImplementation((...args) => {
			const value = original(...args);
			allowed = false;
			return value;
		});
		const revoked = await client.callTool({
			name: "compareGodotReferenceFile",
			arguments: request(),
		});
		expect(text(revoked)).toContain("consent_required");
		expect(text(revoked)).not.toContain("advisory");
	});
});

describe("CLI compare-godot-reference", () => {
	const parse = (...tail: string[]) =>
		parseCliArgs(["electron", "app", "lesson", ...tail], 2, root);
	const args = (extra: string[] = []) => [
		"compare-godot-reference",
		"linux take.jsonl",
		"--reference-record",
		String(referenceRecord),
		"--reference-sha256",
		referenceSha256,
		"--candidate",
		"windows take.jsonl",
		"--candidate-record",
		String(candidateRecord),
		"--candidate-sha256",
		candidateSha256,
		...extra,
	];

	it("parses relative paths explicitly and dispatches the same result", async () => {
		const command = parse(...args(["--json"]));
		expect(command).toMatchObject({
			kind: "lesson",
			action: "compare-godot-reference",
			request: { referencePath, candidatePath },
		});
		if (command?.kind !== "lesson") throw new Error("invalid command");
		const output: string[] = [];
		expect(await runLessonCommand(command, (value) => output.push(value))).toBe(0);
		expect(JSON.parse(output.pop()!).result).toEqual(compareGodotReferenceFile(request()));
		for (const [text, value] of [
			["1.0", 1],
			["1E-3", 0.001],
			["1e+0", 1],
			["+0.1", 0.1],
			[".5", 0.5],
			["0", 0],
		] as const)
			expect(parse(...args(["--tolerance", text]))).toMatchObject({
				request: { tolerance: value },
			});
		const tolerant = parse(...args(["--tolerance", "1e-4"]));
		expect(tolerant).toMatchObject({ request: { tolerance: 0.0001 } });
	});

	it.each([
		[["--tolerance", "2"]],
		[["--tolerance", "5e-0"]],
		[["--tolerance", "1e+1"]],
		[["--tolerance", "-0.1"]],
		[["--tolerance", "NaN"]],
		[["--tolerance", "0x1"]],
		[["--unknown", "1"]],
		[["--candidate", "again.jsonl"]],
		[["--json", "--json"]],
	])("refuses %j", (extra) => {
		expect(parse(...args(extra))).toMatchObject({ kind: "error" });
	});

	it("refuses missing candidate, records or hashes", () => {
		const full = args();
		for (const flag of ["--candidate", "--reference-record", "--candidate-sha256"]) {
			const index = full.indexOf(flag);
			const without = [...full.slice(0, index), ...full.slice(index + 2)];
			expect(parse(...without)).toMatchObject({ kind: "error" });
		}
	});

	it("reports fixed error codes without paths", async () => {
		const command = parse(
			...args(["--json"]).map((value) => (value === candidateSha256 ? referenceSha256 : value)),
		);
		if (command?.kind !== "lesson") throw new Error("invalid command");
		const output: string[] = [];
		expect(await runLessonCommand(command, (value) => output.push(value))).not.toBe(0);
		const line = output.join("");
		expect(line).toContain("candidate-file-changed");
		expect(line).not.toContain(root);
	});
});

describe("review 87cc7dac follow-up", () => {
	it.each([
		3, 4,
	])("stops at currency check %i (after the second read / before returning)", (failAt) => {
		const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
		let calls = 0;
		expect(() =>
			compareGodotReferenceFile(request(), () => {
				if (++calls === failAt) throw new Error("revoked");
			}),
		).toThrow("revoked");
		expect(read).toHaveBeenCalledTimes(2);
		expect(calls).toBe(failAt);
	});

	it("rejects a candidate rewritten after inspection, before reading anything further", async () => {
		await fs.appendFile(candidatePath, "\n");
		expect(() => compareGodotReferenceFile(request())).toThrow("candidate-file-changed");
		await fs.appendFile(referencePath, "\n");
		const read = vi.spyOn(selectedFile, "readSelectedFileSnapshot");
		expect(() => compareGodotReferenceFile(request())).toThrow("reference-file-changed");
		// A stale reference is rejected before the candidate is read.
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("names the failing side for invalid bytes", async () => {
		await fs.writeFile(candidatePath, Buffer.from([0xff, 0xfe]));
		const candidateSha = await sha(candidatePath);
		expect(() => compareGodotReferenceFile(request({ candidateSha256: candidateSha }))).toThrow(
			"candidate-file-invalid",
		);
	});

	it("returns only a fixed code through MCP when the second source fails", async () => {
		const server = new McpServer({ name: "godot-reference-second", version: "0" });
		registerLessonTools(server, { transport: "stdio", editsAllowed: () => true });
		const client = new Client({ name: "test", version: "0" });
		const [a, b] = InMemoryTransport.createLinkedPair();
		await Promise.all([server.connect(a), client.connect(b)]);
		try {
			const result = await client.callTool({
				name: "compareGodotReferenceFile",
				arguments: request({ candidatePath: path.join(root, "missing.jsonl") }),
			});
			expect(result.isError).toBe(true);
			expect(result.content).toEqual([{ type: "text", text: "candidate-file-unavailable" }]);
		} finally {
			await client.close();
			await server.close();
		}
	});
	it.each([
		"2",
		"5e-0",
		"1e+1",
		"1e-400",
		"-0.1",
		"NaN",
	])("refuses tolerance %s with the range message", (value) => {
		const command = parseCliArgs(
			[
				"electron",
				"app",
				"lesson",
				"compare-godot-reference",
				"linux take.jsonl",
				"--reference-record",
				"1",
				"--reference-sha256",
				"a".repeat(64),
				"--candidate",
				"windows take.jsonl",
				"--candidate-record",
				"1",
				"--candidate-sha256",
				"b".repeat(64),
				"--tolerance",
				value,
			],
			2,
			root,
		);
		expect(JSON.stringify(command)).toContain("Choose a tolerance between 0 and 1");
	});
});
