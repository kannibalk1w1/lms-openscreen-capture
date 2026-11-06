import { execFile } from "node:child_process";
/** Same noninteractive, hidden, no-button probe used before native capture; never portal Start. */
export function requireClockSnapshotHelper(helperPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			helperPath,
			[JSON.stringify({ probeOnly: true, capturePointerButtons: false, cursorMode: "hidden" })],
			{ encoding: "utf8", timeout: 5000, maxBuffer: 65536 },
			(error, stdout) => {
				if (error) {
					reject(new Error("Native clock helper capability probe failed"));
					return;
				}
				try {
					const ready = stdout
						.trim()
						.split(/\r?\n/)
						.map(
							(line) =>
								JSON.parse(line) as {
									event?: unknown;
									buttonPrivacyVersion?: unknown;
									clockSnapshotVersion?: unknown;
								},
						)
						.find((event) => event && event.event === "ready");
					if (ready?.buttonPrivacyVersion !== 1 || ready.clockSnapshotVersion !== 1)
						throw new Error("unsupported");
					resolve();
				} catch {
					reject(new Error("Native helper does not support recording clock snapshots"));
				}
			},
		);
	});
}
