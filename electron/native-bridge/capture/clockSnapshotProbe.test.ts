import { execFile } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { requireClockSnapshotHelper } from "./clockSnapshotProbe";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function reply(stdout: string, error: Error | null = null) {
	vi.mocked(execFile).mockImplementationOnce(((...args: unknown[]) => {
		(args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void)(
			error,
			stdout,
			"PRIVATE_STDERR_CANARY",
		);
	}) as typeof execFile);
}
it("requires both independent clock and button-privacy capabilities through a bounded noninteractive probe", async () => {
	reply('{"event":"ready","buttonPrivacyVersion":1,"clockSnapshotVersion":1}\n');
	await expect(requireClockSnapshotHelper("/native/helper")).resolves.toBeUndefined();
	const call = vi.mocked(execFile).mock.calls[0];
	expect(JSON.parse((call[1] as string[])[0])).toEqual({
		probeOnly: true,
		capturePointerButtons: false,
		cursorMode: "hidden",
	});
	expect(call[2]).toMatchObject({ timeout: 5000, maxBuffer: 65536 });
});
it.each([
	'{"event":"ready","buttonPrivacyVersion":1}',
	'{"event":"ready","clockSnapshotVersion":1}',
	"PRIVATE_STDOUT_CANARY",
	"null",
])("rejects unsupported/malformed capability output without leaking it: %s", async (stdout) => {
	reply(stdout);
	await expect(requireClockSnapshotHelper("/native/helper")).rejects.toThrow(
		"does not support recording clock snapshots",
	);
});
it("turns probe failures into a fixed diagnostic without leaking stderr or paths", async () => {
	reply("PRIVATE_STDOUT_CANARY", new Error("PRIVATE_ERROR_CANARY"));
	await expect(requireClockSnapshotHelper("/native/helper")).rejects.toThrow(
		"Native clock helper capability probe failed",
	);
});
