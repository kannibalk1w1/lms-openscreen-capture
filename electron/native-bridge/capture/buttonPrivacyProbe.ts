import { execFile } from "node:child_process";

/** Existing helpers' probeOnly path exits before portal Start or input readers.
 * Inspect capability there before launching a real session on a stale helper. */
export function requireButtonPrivacyHelper(helperPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			helperPath,
			[JSON.stringify({ probeOnly: true, capturePointerButtons: false, cursorMode: "hidden" })],
			{ encoding: "utf8", timeout: 5000, maxBuffer: 64 * 1024 },
			(error, stdout) => {
				const supported =
					!error &&
					stdout.split(/\r?\n/).some((line) => {
						try {
							const value: unknown = JSON.parse(line);
							return Boolean(
								value &&
									typeof value === "object" &&
									"event" in value &&
									value.event === "ready" &&
									"buttonPrivacyVersion" in value &&
									value.buttonPrivacyVersion === 1,
							);
						} catch {
							return false;
						}
					});
				if (supported) resolve();
				else
					reject(
						new Error(
							"The Linux helper lacks button privacy controls. Rebuild it with npm run build:native:linux.",
						),
					);
			},
		);
	});
}
