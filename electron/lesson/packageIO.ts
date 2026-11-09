import { createHash } from "node:crypto";
import { constants, lstatSync, realpathSync, type Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { readSelectedFileSnapshot } from "./selectedFile";
import { hashRegularFile } from "./sourceFiles";
export const digest = (bytes: Uint8Array | string) =>
	createHash("sha256").update(bytes).digest("hex");
export const identity = (s: Stats) => JSON.stringify([s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs]);
export function pinDirectory(target: string) {
	const initial = lstatSync(target);
	if (
		!path.isAbsolute(target) ||
		!initial.isDirectory() ||
		realpathSync(target) !== path.resolve(target)
	)
		throw new Error("package-directory-invalid");
	return () => {
		const now = lstatSync(target);
		if (
			!now.isDirectory() ||
			now.dev !== initial.dev ||
			now.ino !== initial.ino ||
			realpathSync(target) !== path.resolve(target)
		)
			throw new Error("package-directory-changed");
	};
}
export function pinMetadata(target: string, limit: number) {
	const before = readSelectedFileSnapshot(target, limit);
	return {
		bytes: before.bytes,
		assertCurrent: () => {
			const now = readSelectedFileSnapshot(target, limit);
			if (now.identity !== before.identity || !now.bytes.equals(before.bytes))
				throw new Error("package-input-changed");
		},
	};
}
export async function pinBinary(
	target: string,
	limit: number,
	check: () => void,
	signal?: AbortSignal,
) {
	check();
	if (!path.isAbsolute(target) || realpathSync(target) !== path.resolve(target))
		throw new Error("package-input-unavailable");
	const before = lstatSync(target);
	if (!before.isFile() || before.size < 1 || before.size > limit)
		throw new Error("package-input-unavailable");
	const assertCurrent = () => {
		if (
			realpathSync(target) !== path.resolve(target) ||
			identity(lstatSync(target)) !== identity(before)
		)
			throw new Error("package-input-changed");
	};
	check();
	assertCurrent();
	const hash = await hashRegularFile(target, { limit, signal });
	check();
	assertCurrent();
	return { target, before, hash, assertCurrent };
}
export type PinnedBinary = Awaited<ReturnType<typeof pinBinary>>;
/** Descriptor reads are checked against the selected inode before any content is copied. */
export async function copyPinned(source: PinnedBinary, target: string, check: () => void) {
	source.assertCurrent();
	check();
	const input = await fs.open(
		source.target,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		if (identity(await input.stat()) !== identity(source.before))
			throw new Error("package-input-changed");
		check();
		const output = await fs.open(
			target,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			const buffer = Buffer.alloc(1024 * 1024),
				hash = createHash("sha256");
			let bytes = 0;
			for (;;) {
				check();
				const read = await input.read(buffer, 0, buffer.length, null);
				check();
				if (!read.bytesRead) break;
				bytes += read.bytesRead;
				if (bytes > source.hash.bytes) throw new Error("package-input-changed");
				hash.update(buffer.subarray(0, read.bytesRead));
				let at = 0;
				while (at < read.bytesRead) {
					check();
					const written = await output.write(buffer, at, read.bytesRead - at, null);
					if (!written.bytesWritten) throw new Error("package-write-failed");
					at += written.bytesWritten;
				}
			}
			if (
				bytes !== source.hash.bytes ||
				hash.digest("hex") !== source.hash.sha256 ||
				identity(await input.stat()) !== identity(source.before)
			)
				throw new Error("package-input-changed");
			source.assertCurrent();
			check();
		} finally {
			await output.close();
		}
	} finally {
		await input.close();
	}
}
/** Enumerate only the explicitly selected, fixed-depth package tree, with an entry budget. */
export async function assertPackageTree(directory: string, files: Set<string>, check: () => void) {
	const found = new Set<string>();
	let count = 0;
	const visit = async (relative: string) => {
		check();
		const iterator = await fs.opendir(path.join(directory, relative));
		try {
			for await (const entry of iterator) {
				check();
				if (++count > 68 || entry.isSymbolicLink()) throw new Error("package-tree-invalid");
				const name = relative ? relative + "/" + entry.name : entry.name;
				if (entry.isDirectory()) {
					if (
						relative ||
						!["assets", "media"].includes(name) ||
						![...files].some((p) => p.startsWith(name + "/"))
					)
						throw new Error("package-tree-invalid");
					await visit(name);
				} else if (entry.isFile() && files.has(name)) found.add(name);
				else throw new Error("package-tree-invalid");
			}
		} finally {
			await iterator.close().catch(() => undefined);
		}
	};
	await visit("");
	check();
	if (found.size !== files.size) throw new Error("package-tree-incomplete");
}
