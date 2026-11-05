import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { hostname } from "node:os";
import {
	type CapturePrivacyBinding,
	type CapturePrivacyInspection,
	type CapturePrivacyReceipt,
	capturePrivacyBindingSchema,
	capturePrivacyInspectionSchema,
	capturePrivacyReceiptSchema,
	minimizeCapturePrivacyReceipt,
} from "../../src/lib/capturePrivacy";

export type CapturePolicyReceipt = CapturePrivacyReceipt;
const receiptPath = (video: string) => `${video}.capture-policy.json`;
const bindingPath = (video: string) => `${video}.capture-policy.binding.json`;
const lockPath = (video: string) => `${video}.capture-policy.lock`;

export class CaptureDestinationExistsError extends Error {
	readonly code = "CAPTURE_DESTINATION_EXISTS";
	constructor() {
		super(
			"Capture destination already contains media or evidence; choose a new recording identity.",
		);
	}
}

const machine = createHash("sha256").update(hostname()).digest("hex");
function processBirth(pid: number): string | undefined {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/)[19];
	} catch {
		return undefined;
	}
}
function processAlive(pid: number, birth?: string): "alive" | "dead" | "unknown" {
	if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647) return "unknown";
	try {
		process.kill(pid, 0);
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown";
	}
	const current = processBirth(pid);
	return birth && current && birth !== current ? "dead" : "alive";
}
export type CaptureReservation = (() => void) & { launching(): void; helper(pid?: number): void };
async function reservationStatus(video: string): Promise<"absent" | "pending" | "interrupted"> {
	if (!(await present(lockPath(video)))) return "absent";
	try {
		const owner = readBoundedJson(lockPath(video)) as Record<string, unknown>;
		if (owner.version !== 1 || owner.machine !== machine || typeof owner.ownerPid !== "number")
			return "pending";
		if (
			processAlive(
				owner.ownerPid,
				typeof owner.ownerBirth === "string" ? owner.ownerBirth : undefined,
			) !== "dead"
		)
			return "pending";
		if (owner.phase === "reserved") return "interrupted";
		if (
			owner.phase === "helper" &&
			typeof owner.helperPid === "number" &&
			processAlive(
				owner.helperPid,
				typeof owner.helperBirth === "string" ? owner.helperBirth : undefined,
			) === "dead"
		)
			return "interrupted";
	} catch {
		/* Old, unknown or unreadable ownership is never assumed abandoned. */
	}
	return "pending";
}

/** Reserve before any asynchronous probe or helper launch. Never overwrite old evidence. */
export function reserveCaptureDestination(video: string, captureId: string): CaptureReservation {
	const owner = {
		version: 1,
		captureId,
		machine,
		ownerPid: process.pid,
		ownerBirth: processBirth(process.pid),
		phase: "reserved",
		helperPid: undefined as number | undefined,
		helperBirth: undefined as string | undefined,
	};
	const lock = lockPath(video);
	try {
		writeFileSync(lock, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST")
			throw new CaptureDestinationExistsError();
		throw error;
	}
	const release = () => {
		try {
			if ((readBoundedJson(lock) as { captureId?: unknown }).captureId === captureId)
				unlinkSync(lock);
		} catch {
			/* Keep unknown ownership untouched. */
		}
	};
	try {
		for (const suffix of [
			"",
			".capture-policy.json",
			".capture-policy.binding.json",
			".events.ndjson",
			".cursor.json",
			".flags.json",
		]) {
			try {
				lstatSync(`${video}${suffix}`);
				throw new CaptureDestinationExistsError();
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
	} catch (error) {
		release();
		throw error;
	}
	return Object.assign(release, {
		launching() {
			if ((readBoundedJson(lock) as { captureId?: unknown }).captureId !== captureId)
				throw new Error("Capture reservation ownership changed");
			owner.phase = "launching";
			writeFileSync(lock, JSON.stringify(owner));
		},
		helper(pid?: number) {
			if ((readBoundedJson(lock) as { captureId?: unknown }).captureId !== captureId)
				throw new Error("Capture reservation ownership changed");
			owner.phase = "helper";
			owner.helperPid = pid;
			owner.helperBirth = pid ? processBirth(pid) : undefined;
			writeFileSync(lock, JSON.stringify(owner));
		},
	});
}

export function writeCapturePolicyReceipt(video: string, receipt: CapturePolicyReceipt): string {
	const target = receiptPath(video);
	writeFileSync(
		target,
		`${JSON.stringify(minimizeCapturePrivacyReceipt(capturePrivacyReceiptSchema.parse(receipt)), null, 2)}\n`,
		{ flag: "wx", mode: 0o600 },
	);
	return target;
}
function readBoundedJson(target: string): unknown {
	const stat = lstatSync(target);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
		throw new Error("Invalid or oversized capture privacy sidecar");
	return JSON.parse(readFileSync(target, "utf8"));
}
export function readCapturePolicyReceipt(video: string): CapturePolicyReceipt {
	return capturePrivacyReceiptSchema.parse(readBoundedJson(receiptPath(video)));
}

// Cache only a full hash of a stable file; changes to identity/size/mtime/ctime invalidate it.
const hashes = new Map<string, Promise<{ sizeBytes: number; sha256: string }>>();
async function sourceHash(video: string) {
	const before = await fs.stat(video, { bigint: true });
	if (!before.isFile()) throw new Error("Source media is not a regular file");
	const key = JSON.stringify([
		video,
		...[before.dev, before.ino, before.size, before.mtimeNs, before.ctimeNs].map(String),
	]);
	const cached = hashes.get(key);
	if (cached) return cached;
	const pending = (async () => {
		const digest = createHash("sha256");
		for await (const chunk of createReadStream(video)) digest.update(chunk);
		const after = await fs.stat(video, { bigint: true });
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs ||
			before.ctimeNs !== after.ctimeNs
		)
			throw new Error("Source changed during privacy binding");
		return { sizeBytes: Number(after.size), sha256: digest.digest("hex") };
	})();
	hashes.set(key, pending);
	if (hashes.size > 128) hashes.delete(hashes.keys().next().value!);
	try {
		return await pending;
	} catch (error) {
		hashes.delete(key);
		throw error;
	}
}
export async function bindCapturePolicyToMedia(
	video: string,
	captureId: string,
): Promise<CapturePrivacyBinding> {
	const receipt = readCapturePolicyReceipt(video);
	if (receipt.version === 1 || receipt.captureId !== captureId)
		throw new Error("Capture policy ownership mismatch");
	const binding = capturePrivacyBindingSchema.parse({
		version: 1,
		captureId,
		...(await sourceHash(video)),
	});
	writeFileSync(bindingPath(video), `${JSON.stringify(binding, null, 2)}\n`, {
		flag: "wx",
		mode: 0o600,
	});
	return binding;
}
async function present(target: string) {
	try {
		await fs.lstat(target);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

/** Production import/reopen/pack inspection. Binding proves source association, not consent authenticity. */
export async function inspectCapturePrivacy(
	video: string,
	embedded?: CapturePrivacyInspection,
): Promise<CapturePrivacyInspection> {
	const parsedEmbedded = capturePrivacyInspectionSchema.safeParse(embedded);
	embedded = parsedEmbedded.success ? parsedEmbedded.data : undefined;
	if (embedded?.receipt)
		embedded = { ...embedded, receipt: minimizeCapturePrivacyReceipt(embedded.receipt) };
	let journalPresent = false;
	try {
		journalPresent = await present(`${video}.events.ndjson`);
		const reservation = await reservationStatus(video);
		if (reservation !== "absent")
			return {
				status: reservation,
				journalPresent,
				...(embedded?.receipt ? { receipt: embedded.receipt } : {}),
			};
		let receipt: CapturePolicyReceipt | undefined;
		if (await present(receiptPath(video))) receipt = readCapturePolicyReceipt(video);
		else if (embedded?.receipt) receipt = capturePrivacyReceiptSchema.parse(embedded.receipt);
		if (receipt) receipt = minimizeCapturePrivacyReceipt(receipt);
		if (!receipt)
			return {
				status: embedded?.recoveredFrom ?? (embedded?.status === "invalid" ? "invalid" : "missing"),
				...(embedded?.recoveredFrom ? { recoveredFrom: embedded.recoveredFrom } : {}),
				journalPresent,
			};
		if (receipt.version === 1 || !receipt.captureId)
			return { status: "legacy", journalPresent, receipt };
		if (
			embedded?.receipt &&
			embedded.receipt.version !== 1 &&
			embedded.receipt.captureId &&
			embedded.receipt.captureId !== receipt.captureId
		)
			return { status: "conflict", journalPresent, receipt };
		let binding: CapturePrivacyBinding | undefined;
		if (await present(bindingPath(video)))
			binding = capturePrivacyBindingSchema.parse(readBoundedJson(bindingPath(video)));
		else if (embedded?.binding) binding = capturePrivacyBindingSchema.parse(embedded.binding);
		if (!binding) return { status: "pending", journalPresent, receipt };
		if (binding.captureId !== receipt.captureId)
			return { status: "mismatch", journalPresent, receipt, binding };
		const actual = await sourceHash(video);
		if (actual.sizeBytes !== binding.sizeBytes || actual.sha256 !== binding.sha256)
			return { status: "mismatch", journalPresent, receipt, binding };
		if (!receipt.collectionAllowedAtStart && journalPresent)
			return { status: "conflict", journalPresent, receipt, binding };
		return { status: "bound", journalPresent, receipt, binding };
	} catch (error) {
		const unavailable =
			(error as NodeJS.ErrnoException).code === "ENOENT" ||
			(error as NodeJS.ErrnoException).code === "EACCES";
		return {
			status: unavailable ? "unavailable" : "invalid",
			journalPresent,
			...(embedded?.receipt ? { receipt: embedded.receipt } : {}),
			...(embedded?.binding ? { binding: embedded.binding } : {}),
		};
	}
}
