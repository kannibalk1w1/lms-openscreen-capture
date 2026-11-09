import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readSync,
	realpathSync,
} from "node:fs";
import path from "node:path";

/** Bounded metadata only, with no relink, migration, file discovery or source grant side effects. */
const identity = (stat: import("node:fs").Stats) => ({
	dev: stat.dev,
	ino: stat.ino,
	size: stat.size,
	mtimeMs: stat.mtimeMs,
	ctimeMs: stat.ctimeMs,
});
export function readSelectedFileSnapshot(target: string, limit: number) {
	if (!path.isAbsolute(target) || realpathSync(target) !== path.resolve(target))
		throw new Error("selected-file-unavailable");
	const named = lstatSync(target);
	if (!named.isFile() || named.size > limit) throw new Error("selected-file-unavailable");
	const fd = openSync(
		target,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
	);
	try {
		const before = fstatSync(fd);
		if (
			!before.isFile() ||
			before.size > limit ||
			before.dev !== named.dev ||
			before.ino !== named.ino
		)
			throw new Error("selected-file-changed");
		const buffer = Buffer.alloc(Math.min(before.size + 1, limit + 1));
		let count = 0;
		while (count < buffer.length) {
			const n = readSync(fd, buffer, count, buffer.length - count, null);
			if (!n) break;
			count += n;
		}
		const after = fstatSync(fd),
			current = lstatSync(target);
		if (
			count !== before.size ||
			JSON.stringify(identity(before)) !== JSON.stringify(identity(after)) ||
			JSON.stringify(identity(after)) !== JSON.stringify(identity(current))
		)
			throw new Error("selected-file-changed");
		return { bytes: buffer.subarray(0, count), identity: JSON.stringify(identity(after)) };
	} finally {
		closeSync(fd);
	}
}

export const readSelectedFile = (target: string, limit: number) =>
	readSelectedFileSnapshot(target, limit).bytes;
