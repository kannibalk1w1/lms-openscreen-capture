import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import {
	type CapturePrivacyBinding,
	type CapturePrivacyInspection,
	type CapturePrivacyReceipt,
	capturePrivacyBindingSchema,
	capturePrivacyInspectionSchema,
	capturePrivacyReceiptSchema,
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

/** Reserve before any asynchronous probe or helper launch. Never overwrite old evidence. */
export function reserveCaptureDestination(video: string, captureId: string): () => void {
	const lock = lockPath(video);
	try {
		writeFileSync(lock, captureId, { flag: "wx", mode: 0o600 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST")
			throw new CaptureDestinationExistsError();
		throw error;
	}
	const release = () => {
		try {
			if (readFileSync(lock, "utf8") === captureId) unlinkSync(lock);
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
	return release;
}

export function writeCapturePolicyReceipt(video: string, receipt: CapturePolicyReceipt): string {
	const target = receiptPath(video);
	writeFileSync(
		target,
		`${JSON.stringify(capturePrivacyReceiptSchema.parse(receipt), null, 2)}\n`,
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
	if (receipt.version !== 2 || receipt.captureId !== captureId)
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
	let journalPresent = false;
	try {
		journalPresent = await present(`${video}.events.ndjson`);
		if (await present(lockPath(video)))
			return {
				status: "pending",
				journalPresent,
				...(embedded?.receipt ? { receipt: embedded.receipt } : {}),
			};
		let receipt: CapturePolicyReceipt | undefined;
		if (await present(receiptPath(video))) receipt = readCapturePolicyReceipt(video);
		else if (embedded?.receipt) receipt = capturePrivacyReceiptSchema.parse(embedded.receipt);
		if (!receipt) return { status: "missing", journalPresent };
		if (receipt.version === 1) return { status: "legacy", journalPresent, receipt };
		if (embedded?.receipt?.version === 2 && embedded.receipt.captureId !== receipt.captureId)
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
