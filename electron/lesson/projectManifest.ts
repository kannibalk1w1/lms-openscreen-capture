import { createHash } from "node:crypto";
import { constants, promises as fs, realpathSync, type Stats, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readSelectedFileSnapshot } from "./selectedFile";

/**
 * Opt-in, bounded application-project manifest and drift check.
 *
 * A manifest records, for ONE explicitly selected folder, each regular file's relative path,
 * size and SHA-256 — never file contents. It is written once to a new file outside that
 * folder. A drift check re-scans the same explicitly selected folder and reports changed,
 * missing, added, unobserved and not-reached paths against a manifest bound to its own
 * SHA-256. Nothing is copied, archived, restored, relinked or written into the project.
 *
 * Symbolic links (and Windows reparse points Node reports as links) are never followed;
 * special files, unreadable or unstable files and excluded tool folders are listed as
 * unobserved. File and entry limits stop the scan; a file over the remaining byte budget
 * and folders beyond the depth limit are listed and skipped. Any limit gives limited coverage.
 * A manifest describes what was observed; it never certifies that a project is correct,
 * complete, runnable or restorable. Path names are sensitive metadata.
 */
export const PROJECT_MANIFEST_DEFAULT_MAX_FILES = 10_000;
export const PROJECT_MANIFEST_MAX_FILES = 50_000;
export const PROJECT_MANIFEST_DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PROJECT_MANIFEST_MAX_BYTES = 16 * 1024 * 1024 * 1024;
export const PROJECT_MANIFEST_MAX_DEPTH = 32;
const MAX_MANIFEST_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 200;
const CHUNK = 1024 * 1024;
/** Tool caches and version-control data at the selected root only. */
export const PROJECT_MANIFEST_EXCLUSIONS = [".git", ".godot", ".import"] as const;

export class ProjectManifestError extends Error {
	constructor(
		readonly code:
			| "invalid-request"
			| "project-folder-unavailable"
			| "manifest-output-invalid"
			| "manifest-output-exists"
			| "manifest-write-failed"
			| "manifest-scan-inconsistent"
			| "manifest-unavailable"
			| "manifest-changed"
			| "manifest-invalid",
	) {
		super(code);
	}
}

const absolute = z.string().min(1).max(4096).refine(path.isAbsolute);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const createProjectManifestSchema = z
	.object({
		rootPath: absolute,
		outputPath: absolute,
		maxFiles: z.number().int().min(1).max(PROJECT_MANIFEST_MAX_FILES).optional(),
		maxBytes: z.number().int().min(1).max(PROJECT_MANIFEST_MAX_BYTES).optional(),
	})
	.strict();
export const checkProjectDriftSchema = z
	.object({ rootPath: absolute, manifestPath: absolute, manifestSha256: sha256 })
	.strict();

const reason = z.enum([
	"symbolic-link",
	"special-file",
	"unreadable",
	"unstable",
	"excluded-directory",
	"depth-limit",
	"byte-limit",
	"unsupported-name",
]);
type Reason = z.infer<typeof reason>;
const relativePath = z
	.string()
	.min(1)
	.max(4096)
	.refine(
		(value) =>
			!value.startsWith("/") &&
			!value.split("/").some((part) => part === "" || part === "." || part === ".."),
	);
const manifestSchema = z
	.object({
		format: z.literal("openscreen-project-manifest"),
		version: z.literal(1),
		scope: z.literal("explicit-folder"),
		rootName: z.string().min(1).max(255),
		limits: z
			.object({
				maxFiles: z.number().int().min(1).max(PROJECT_MANIFEST_MAX_FILES),
				maxBytes: z.number().int().min(1).max(PROJECT_MANIFEST_MAX_BYTES),
				maxDepth: z.literal(PROJECT_MANIFEST_MAX_DEPTH),
			})
			.strict(),
		exclusions: z.tuple([z.literal(".git"), z.literal(".godot"), z.literal(".import")]),
		coverage: z.enum(["complete", "limited"]),
		limitReason: z.enum(["file-limit", "byte-limit", "entry-limit"]).optional(),
		counts: z
			.object({
				files: z.number().int().min(0),
				bytes: z.number().int().min(0),
				unobserved: z.number().int().min(0),
			})
			.strict(),
		files: z
			.array(z.object({ path: relativePath, size: z.number().int().min(0), sha256 }).strict())
			.max(PROJECT_MANIFEST_MAX_FILES),
		unobserved: z
			.array(z.object({ path: relativePath, reason }).strict())
			.max(PROJECT_MANIFEST_MAX_FILES * 4),
	})
	.strict()
	.superRefine((manifest, ctx) => {
		const seen = new Set<string>();
		let previous = "";
		for (const file of manifest.files) {
			if (seen.has(file.path) || file.path <= previous)
				ctx.addIssue({ code: "custom", message: "Unsorted or duplicate manifest path" });
			seen.add(file.path);
			previous = file.path;
		}
		let previousUnobserved = "";
		for (const entry of manifest.unobserved) {
			if (seen.has(entry.path) || entry.path <= previousUnobserved)
				ctx.addIssue({
					code: "custom",
					message: "Unsorted, duplicate or overlapping unobserved path",
				});
			seen.add(entry.path);
			previousUnobserved = entry.path;
		}
		const limited =
			manifest.limitReason !== undefined ||
			manifest.unobserved.some((entry) => entry.reason === "depth-limit");
		if (
			manifest.files.length > manifest.limits.maxFiles ||
			manifest.unobserved.length + manifest.files.length > manifest.limits.maxFiles * 4 ||
			manifest.counts.bytes > manifest.limits.maxBytes ||
			// A byte-limit row needs some limit reason; a later stopping limit takes precedence.
			(manifest.unobserved.some((entry) => entry.reason === "byte-limit") &&
				manifest.limitReason === undefined) ||
			(manifest.limitReason === "byte-limit" &&
				!manifest.unobserved.some((entry) => entry.reason === "byte-limit"))
		)
			ctx.addIssue({ code: "custom", message: "Manifest exceeds its own limits" });
		if (
			manifest.counts.files !== manifest.files.length ||
			manifest.counts.unobserved !== manifest.unobserved.length ||
			manifest.counts.bytes !== manifest.files.reduce((sum, file) => sum + file.size, 0) ||
			(manifest.coverage === "limited") !== limited
		)
			ctx.addIssue({ code: "custom", message: "Inconsistent manifest counts or coverage" });
	});
export type ProjectManifest = z.infer<typeof manifestSchema>;
type FileRow = ProjectManifest["files"][number];
type UnobservedRow = ProjectManifest["unobserved"][number];

type Scan = {
	files: FileRow[];
	unobserved: UnobservedRow[];
	coverage: "complete" | "limited";
	limitReason?: "file-limit" | "byte-limit" | "entry-limit";
	/** True when a file or entry limit stopped the scan: unseen paths are then unknown. */
	stopped: boolean;
	/** Device/inode identities of every directory the scan entered. */
	directories: Set<string>;
};

/** Errors raised by the caller's currency check: never downgraded to "unreadable". */
const cancelled = new WeakSet<object>();
const stable = (a: Stats, b: Stats) =>
	a.dev === b.dev &&
	a.ino === b.ino &&
	a.size === b.size &&
	a.mtimeMs === b.mtimeMs &&
	a.ctimeMs === b.ctimeMs;

/** Hash one regular file from a single descriptor; refuses links and changes during the read. */
async function hashFile(
	absolutePath: string,
	named: Stats,
	assertCurrent: () => void,
): Promise<string | Reason> {
	let handle: fs.FileHandle;
	try {
		handle = await fs.open(
			absolutePath,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
		);
	} catch {
		return "unreadable";
	}
	try {
		const before = await handle.stat();
		if (!before.isFile() || !stable(before, named)) return "unstable";
		const hash = createHash("sha256");
		const buffer = Buffer.alloc(CHUNK);
		let total = 0;
		for (;;) {
			// Cancellation and consent revocation are honoured within a large file too.
			assertCurrent();
			const { bytesRead } = await handle.read(buffer, 0, CHUNK, null);
			if (!bytesRead) break;
			total += bytesRead;
			if (total > before.size) return "unstable";
			hash.update(buffer.subarray(0, bytesRead));
		}
		const after = await handle.stat();
		const current = await fs.lstat(absolutePath);
		if (total !== before.size || !stable(before, after) || !stable(after, current))
			return "unstable";
		return hash.digest("hex");
	} catch (error) {
		if (typeof error === "object" && error !== null && cancelled.has(error)) throw error;
		return "unreadable";
	} finally {
		await handle.close();
	}
}

function selectedRoot(rootPath: string): string {
	try {
		// No symbolic link anywhere in the selected path, and it must be a real directory.
		if (realpathSync(rootPath) !== path.resolve(rootPath)) throw new Error("link");
	} catch {
		throw new ProjectManifestError("project-folder-unavailable");
	}
	return path.resolve(rootPath);
}

async function scanProject(
	rootPath: string,
	limits: { maxFiles: number; maxBytes: number },
	assertCurrent: () => void,
): Promise<Scan> {
	const root = selectedRoot(rootPath);
	try {
		if (!(await fs.lstat(root)).isDirectory()) throw new Error("not a directory");
	} catch {
		throw new ProjectManifestError("project-folder-unavailable");
	}
	const files: FileRow[] = [];
	const unobserved: UnobservedRow[] = [];
	const current = () => {
		try {
			assertCurrent();
		} catch (error) {
			if (typeof error === "object" && error !== null) cancelled.add(error);
			throw error;
		}
	};
	let bytes = 0;
	let entries = 0;
	const maxEntries = limits.maxFiles * 4;
	let limitReason: Scan["limitReason"];
	const directories = new Set<string>();
	// Read through a closure: nested walks may set a stopping limit.
	const stopped = () => limitReason === "file-limit" || limitReason === "entry-limit";
	const walk = async (directory: string, relative: string[], depth: number): Promise<void> => {
		// Streamed, so one huge directory cannot exceed the entry budget in memory.
		const names: string[] = [];
		try {
			try {
				const stat = await fs.lstat(directory);
				directories.add(`${stat.dev}:${stat.ino}`);
			} catch {
				// opendir below reports an unreadable directory.
			}
			const dir = await fs.opendir(directory);
			for await (const entry of dir) {
				// A listing larger than the remaining budget is skipped as a whole, so the
				// recorded subset never depends on the OS's directory order.
				if (names.length >= maxEntries - entries) {
					limitReason = "entry-limit";
					break;
				}
				names.push(entry.name);
			}
		} catch {
			if (relative.length) unobserved.push({ path: relative.join("/"), reason: "unreadable" });
			else throw new ProjectManifestError("project-folder-unavailable");
			return;
		}
		if (stopped()) return;
		names.sort();
		for (const name of names) {
			if (stopped()) return;
			current();
			if (++entries > maxEntries) {
				limitReason = "entry-limit";
				return;
			}
			// Undecodable (non-UTF-8) names all read back with U+FFFD and could collide.
			if (name.includes("\uFFFD")) {
				unobserved.push({ path: [...relative, name].join("/"), reason: "unsupported-name" });
				continue;
			}
			const parts = [...relative, name];
			const rel = parts.join("/");
			const absolutePath = path.join(directory, name);
			let named: Stats;
			try {
				named = await fs.lstat(absolutePath);
			} catch {
				unobserved.push({ path: rel, reason: "unreadable" });
				continue;
			}
			if (named.isSymbolicLink()) unobserved.push({ path: rel, reason: "symbolic-link" });
			else if (named.isDirectory()) {
				// Skipped folders are still inside the project: an output aliasing one is refused.
				directories.add(`${named.dev}:${named.ino}`);
				if (depth === 0 && (PROJECT_MANIFEST_EXCLUSIONS as readonly string[]).includes(name))
					unobserved.push({ path: rel, reason: "excluded-directory" });
				else if (depth + 1 >= PROJECT_MANIFEST_MAX_DEPTH)
					unobserved.push({ path: rel, reason: "depth-limit" });
				else await walk(absolutePath, parts, depth + 1);
			} else if (!named.isFile()) unobserved.push({ path: rel, reason: "special-file" });
			else if (files.length >= limits.maxFiles) limitReason = "file-limit";
			else if (bytes + named.size > limits.maxBytes) {
				// Too large for the remaining budget: listed, not hashed; the scan continues.
				unobserved.push({ path: rel, reason: "byte-limit" });
				limitReason ??= "byte-limit";
			} else {
				const digest = await hashFile(absolutePath, named, current);
				if (digest.length === 64) {
					files.push({ path: rel, size: named.size, sha256: digest });
					bytes += named.size;
				} else unobserved.push({ path: rel, reason: digest as Reason });
			}
		}
	};
	await walk(root, [], 0);
	// UTF-16 code-unit order (JavaScript string comparison), independent of locale.
	const byPath = (a: { path: string }, b: { path: string }) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
	files.sort(byPath);
	unobserved.sort(byPath);
	// Several undecodable names can produce one identical unobserved row; keep one.
	for (let i = unobserved.length - 1; i > 0; i--)
		if (unobserved[i].path === unobserved[i - 1].path) unobserved.splice(i, 1);
	return {
		files,
		unobserved,
		coverage:
			limitReason || unobserved.some((entry) => entry.reason === "depth-limit")
				? "limited"
				: "complete",
		...(limitReason ? { limitReason } : {}),
		stopped: stopped(),
		directories,
	};
}

function outputOutsideRoot(outputPath: string, root: string): string {
	const target = path.resolve(outputPath);
	let parent: string;
	try {
		parent = realpathSync(path.dirname(target));
	} catch {
		throw new ProjectManifestError("manifest-output-invalid");
	}
	if (parent !== path.dirname(target)) throw new ProjectManifestError("manifest-output-invalid");
	// Compare filesystem identities, not spellings: walk the real parent's ancestors and refuse
	// if any is the selected root (case-insensitive volumes, short names and bind mounts too).
	let rootStat: Stats;
	try {
		rootStat = statSync(root);
	} catch {
		throw new ProjectManifestError("project-folder-unavailable");
	}
	for (let at = parent; ; at = path.dirname(at)) {
		let stat: Stats;
		try {
			stat = statSync(at);
		} catch {
			throw new ProjectManifestError("manifest-output-invalid");
		}
		if (stat.dev === rootStat.dev && stat.ino === rootStat.ino)
			throw new ProjectManifestError("manifest-output-invalid");
		if (path.dirname(at) === at) break;
	}
	return target;
}

/** Scan one explicit folder and write a NEW manifest file outside it. Never writes into the project. */
export async function createProjectManifestFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const parsed = createProjectManifestSchema.safeParse(input);
	if (!parsed.success) throw new ProjectManifestError("invalid-request");
	const request = parsed.data;
	assertCurrent();
	const root = selectedRoot(request.rootPath);
	const target = outputOutsideRoot(request.outputPath, root);
	try {
		await fs.lstat(target);
		throw new ProjectManifestError("manifest-output-exists");
	} catch (error) {
		if (error instanceof ProjectManifestError) throw error;
	}
	const limits = {
		maxFiles: request.maxFiles ?? PROJECT_MANIFEST_DEFAULT_MAX_FILES,
		maxBytes: request.maxBytes ?? PROJECT_MANIFEST_DEFAULT_MAX_BYTES,
	};
	const scan = await scanProject(root, limits, assertCurrent);
	// A bind mount (or other alias) of any scanned folder is still inside the project.
	try {
		const parent = statSync(path.dirname(target));
		if (scan.directories.has(`${parent.dev}:${parent.ino}`))
			throw new ProjectManifestError("manifest-output-invalid");
	} catch (error) {
		throw error instanceof ProjectManifestError
			? error
			: new ProjectManifestError("manifest-output-invalid");
	}
	const built = manifestSchema.safeParse({
		format: "openscreen-project-manifest",
		version: 1,
		scope: "explicit-folder",
		rootName: path.basename(root).slice(0, 255) || "root",
		limits: { ...limits, maxDepth: PROJECT_MANIFEST_MAX_DEPTH },
		exclusions: [...PROJECT_MANIFEST_EXCLUSIONS],
		coverage: scan.coverage,
		...(scan.limitReason ? { limitReason: scan.limitReason } : {}),
		counts: {
			files: scan.files.length,
			bytes: scan.files.reduce((sum, file) => sum + file.size, 0),
			unobserved: scan.unobserved.length,
		},
		files: scan.files,
		unobserved: scan.unobserved,
	});
	if (!built.success) throw new ProjectManifestError("manifest-scan-inconsistent");
	const manifest: ProjectManifest = built.data;
	const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
	if (bytes.length > MAX_MANIFEST_FILE_BYTES)
		throw new ProjectManifestError("manifest-output-invalid");
	assertCurrent();
	try {
		await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
	} catch (error) {
		throw new ProjectManifestError(
			(error as NodeJS.ErrnoException).code === "EEXIST"
				? "manifest-output-exists"
				: "manifest-write-failed",
		);
	}
	return {
		format: "openscreen-project-manifest-receipt" as const,
		version: 1 as const,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		coverage: manifest.coverage,
		...(manifest.limitReason ? { limitReason: manifest.limitReason } : {}),
		counts: manifest.counts,
	};
}

const MAX_ROW_BYTES = 256 * 1024;
type Bounded<T> = { count: number; rows: T[]; truncated: boolean };
/** At most 200 rows per list and 256 KiB of row JSON across all lists; clean prefixes. */
function rowBudget() {
	let used = 0;
	return <T>(rows: T[]): Bounded<T> => {
		const kept: T[] = [];
		for (const row of rows) {
			const bytes = Buffer.byteLength(JSON.stringify(row));
			if (kept.length >= MAX_ROWS || used + bytes > MAX_ROW_BYTES) break;
			used += bytes;
			kept.push(row);
		}
		return { count: rows.length, rows: kept, truncated: kept.length < rows.length };
	};
}

/**
 * Read-only drift check of one explicit folder against a manifest bound to its SHA-256.
 * Reports observed differences only; never "correct", "complete" or "restorable".
 */
export async function checkProjectDriftFile(
	input: unknown,
	assertCurrent: () => void = () => undefined,
) {
	const parsed = checkProjectDriftSchema.safeParse(input);
	if (!parsed.success) throw new ProjectManifestError("invalid-request");
	const request = parsed.data;
	assertCurrent();
	let manifestBytes: Uint8Array;
	try {
		manifestBytes = readSelectedFileSnapshot(request.manifestPath, MAX_MANIFEST_FILE_BYTES).bytes;
	} catch {
		throw new ProjectManifestError("manifest-unavailable");
	}
	if (createHash("sha256").update(manifestBytes).digest("hex") !== request.manifestSha256)
		throw new ProjectManifestError("manifest-changed");
	let manifest: ProjectManifest;
	try {
		manifest = manifestSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)),
		);
	} catch {
		throw new ProjectManifestError("manifest-invalid");
	}
	const root = selectedRoot(request.rootPath);
	const current = await scanProject(root, manifest.limits, assertCurrent);
	assertCurrent();

	const before = new Map(manifest.files.map((file) => [file.path, file]));
	const after = new Map(current.files.map((file) => [file.path, file]));
	const beforeUnobserved = new Map(manifest.unobserved.map((entry) => [entry.path, entry.reason]));
	const afterUnobserved = new Map(current.unobserved.map((entry) => [entry.path, entry.reason]));
	// A path under an unobserved directory on one side is unknown there, not missing/added.
	/** The reason of the outermost unobserved ancestor, or of the path itself, if any. */
	const underUnobserved = (file: string, unobservedPaths: Map<string, Reason>) => {
		const parts = file.split("/");
		for (let i = 1; i < parts.length; i++) {
			const reason = unobservedPaths.get(parts.slice(0, i).join("/"));
			if (reason) return reason;
		}
		return unobservedPaths.get(file);
	};
	const changed: Array<{ path: string; fields: Array<"size" | "sha256"> }> = [];
	const missing: string[] = [];
	const added: string[] = [];
	const nowUnobserved: Array<{ path: string; reason: Reason }> = [];
	const previouslyUnobserved: Array<{ path: string; reason: Reason }> = [];
	const notReached: string[] = [];
	let unchanged = 0;
	for (const [file, row] of before) {
		const now = after.get(file);
		if (now) {
			const fields: Array<"size" | "sha256"> = [];
			if (now.size !== row.size) fields.push("size");
			if (now.sha256 !== row.sha256) fields.push("sha256");
			if (fields.length) changed.push({ path: file, fields });
			else unchanged++;
		} else if (underUnobserved(file, afterUnobserved))
			nowUnobserved.push({ path: file, reason: underUnobserved(file, afterUnobserved) as Reason });
		else if (current.stopped) notReached.push(file);
		else missing.push(file);
	}
	for (const [file] of after) {
		if (before.has(file)) continue;
		if (underUnobserved(file, beforeUnobserved))
			previouslyUnobserved.push({
				path: file,
				reason: underUnobserved(file, beforeUnobserved) as Reason,
			});
		else if (manifest.limitReason === "file-limit" || manifest.limitReason === "entry-limit")
			notReached.push(file);
		else added.push(file);
	}
	const unknowns: string[] = [];
	if (manifest.coverage === "limited") unknowns.push("manifest-coverage-limited");
	if (current.coverage === "limited") unknowns.push("current-coverage-limited");
	if (manifest.unobserved.length || current.unobserved.length) unknowns.push("unobserved-paths");
	const drift = changed.length + missing.length + added.length > 0;
	notReached.sort();
	const bounded = rowBudget();
	return {
		format: "openscreen-project-drift" as const,
		version: 1 as const,
		manifestSha256: request.manifestSha256,
		rootNameMatches: path.basename(root) === manifest.rootName,
		outcome: drift
			? ("drift-observed" as const)
			: unknowns.length
				? ("partial-no-drift-observed" as const)
				: ("no-drift-observed" as const),
		unknowns,
		coverage: { manifest: manifest.coverage, current: current.coverage },
		counts: {
			unchanged,
			changed: changed.length,
			missing: missing.length,
			added: added.length,
			nowUnobserved: nowUnobserved.length,
			previouslyUnobserved: previouslyUnobserved.length,
			notReached: notReached.length,
		},
		changed: bounded(changed),
		missing: bounded(missing),
		added: bounded(added),
		nowUnobserved: bounded(nowUnobserved),
		previouslyUnobserved: bounded(previouslyUnobserved),
		notReached: bounded(notReached),
	};
}
