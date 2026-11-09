import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { ExportJobs, isExportId } from "./exportJobs";

function owner(id = 1) {
	return Object.assign(new EventEmitter(), {
		id,
		isDestroyed: () => false,
	}) as unknown as WebContents;
}

function pending() {
	let resolve!: (result: number) => void;
	let reject!: (error: Error) => void;
	const result = new Promise<number>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { result, resolve, reject, cancel: vi.fn(() => true) };
}

describe("export jobs", () => {
	it("binds cancel to the sender and ID, including before native compute starts", async () => {
		const jobs = new ExportJobs();
		const sender = owner();
		const job = pending();
		const run = jobs.run(sender, "job_1", () => job, vi.fn());
		expect(jobs.cancel(owner(2), "job_1")).toBe(false);
		expect(jobs.cancel(sender, "unknown")).toBe(false);
		expect(jobs.cancel(sender, "job_1")).toBe(true);
		expect(jobs.cancel(sender, "job_1")).toBe(true);
		expect(job.cancel).toHaveBeenCalledTimes(2);
		job.resolve(1);
		await expect(run).rejects.toThrow("RENDER_JOB_INVALIDATED");
		expect(jobs.cancel(sender, "job_1")).toBe(false);
		expect(sender.listenerCount("destroyed")).toBe(0);
	});

	it("rejects a duplicate job without starting it and allows a retry after failure", async () => {
		const jobs = new ExportJobs();
		const sender = owner();
		const job = pending();
		const run = jobs.run(sender, "first", () => job, vi.fn());
		const duplicate = vi.fn(() => pending());
		await expect(jobs.run(sender, "second", duplicate, vi.fn())).rejects.toThrow("already running");
		expect(duplicate).not.toHaveBeenCalled();
		const failed = expect(run).rejects.toThrow("encoder failed");
		job.reject(new Error("encoder failed"));
		await failed;
		await expect(
			jobs.run(sender, "retry", () => ({ result: Promise.resolve(2), cancel: vi.fn() }), vi.fn()),
		).resolves.toBe(2);
		expect(sender.listenerCount("destroyed")).toBe(0);
	});

	it("cancels on sender destruction and suppresses late progress after a retry", async () => {
		const jobs = new ExportJobs();
		const sender = owner();
		const job = pending();
		const progress = vi.fn();
		let oldProgress!: (frames: number) => void;
		const run = jobs.run(
			sender,
			"old",
			(cb) => {
				oldProgress = cb;
				return job;
			},
			progress,
		);
		oldProgress(1);
		expect(progress).toHaveBeenCalledWith(1);
		sender.emit("destroyed");
		expect(job.cancel).toHaveBeenCalledOnce();
		job.resolve(1);
		await expect(run).rejects.toThrow("RENDER_JOB_INVALIDATED");
		const next = pending();
		const retry = jobs.run(sender, "new", () => next, progress);
		oldProgress(99);
		expect(progress).toHaveBeenCalledTimes(1);
		next.resolve(2);
		await retry;
	});

	it("does not reinterpret a completion that wins the cancellation race", async () => {
		const jobs = new ExportJobs();
		const sender = owner();
		const job = pending();
		job.cancel.mockReturnValue(false);
		const run = jobs.run(sender, "done", () => job, vi.fn());
		expect(jobs.cancel(sender, "done")).toBe(false);
		job.resolve(5);
		await expect(run).resolves.toBe(5);
	});

	it.each([
		undefined,
		null,
		1,
		{},
		"",
		"a/b",
		"a".repeat(129),
	])("rejects malformed IDs: %j", (id) => {
		expect(isExportId(id)).toBe(false);
	});

	it("rejects an invalid start before invoking native code", async () => {
		const start = vi.fn(() => pending());
		await expect(new ExportJobs().run(owner(), "../bad", start, vi.fn())).rejects.toThrow(
			"Invalid export ID",
		);
		expect(start).not.toHaveBeenCalled();
	});
});

it("uses owner object identity and channel, not a reused numeric window ID", async () => {
	const jobs = new ExportJobs(),
		a = owner(1),
		impostor = owner(1),
		native = pending();
	const job = jobs.run(a, "scoped", () => native, vi.fn(), "lesson-frame");
	expect(jobs.cancel(impostor, "scoped", "lesson-frame")).toBe(false);
	expect(jobs.cancel(a, "scoped")).toBe(false);
	expect(jobs.cancel(a, "scoped", "lesson-frame")).toBe(true);
	native.resolve(1);
	await expect(job).rejects.toThrow("RENDER_JOB_INVALIDATED");
	await expect(
		jobs.run(
			a,
			"scoped",
			() => ({ result: Promise.resolve(2), cancel: () => false }),
			vi.fn(),
			"lesson-frame",
		),
	).rejects.toThrow("already been used");
});
it.each([
	"did-start-navigation",
	"render-process-gone",
])("invalidates %s, holds the owner until settlement, and clears listeners", async (event) => {
	const jobs = new ExportJobs(),
		sender = owner(),
		native = pending();
	native.cancel.mockReturnValue(false);
	const job = jobs.run(sender, "lifecycle", () => native, vi.fn());
	sender.emit(event);
	await expect(jobs.run(sender, "too-early", () => pending(), vi.fn())).rejects.toThrow(
		"already running",
	);
	native.resolve(1);
	await expect(job).rejects.toThrow("RENDER_JOB_INVALIDATED");
	for (const name of ["destroyed", "did-start-navigation", "render-process-gone"])
		expect(sender.listenerCount(name)).toBe(0);
	await expect(
		jobs.run(sender, "next", () => ({ result: Promise.resolve(2), cancel: () => false }), vi.fn()),
	).resolves.toBe(2);
});
it("reserves before synchronous start/progress reentrancy and cleans up a throwing start", async () => {
	const jobs = new ExportJobs(),
		sender = owner();
	let nested!: Promise<number>;
	const result = jobs.run(
		sender,
		"first",
		(progress) => {
			progress(1);
			throw new Error("start failed");
		},
		() => {
			nested = jobs.run(
				sender,
				"nested",
				() => ({ result: Promise.resolve(2), cancel: () => false }),
				vi.fn(),
			);
		},
	);
	await expect(result).rejects.toThrow("start failed");
	await expect(nested).rejects.toThrow("already running");
	expect(sender.listenerCount("destroyed")).toBe(0);
	await expect(
		jobs.run(sender, "retry", () => ({ result: Promise.resolve(3), cancel: () => false }), vi.fn()),
	).resolves.toBe(3);
});

it("bounds retired operation IDs per owner without affecting a fresh window", async () => {
	const { MAX_OWNER_RENDER_OPERATIONS } = await import("./exportJobs");
	const jobs = new ExportJobs(),
		sender = owner();
	for (let index = 0; index < MAX_OWNER_RENDER_OPERATIONS; index++)
		await jobs.run(
			sender,
			`operation-${index}`,
			() => ({ result: Promise.resolve(1), cancel: () => false }),
			vi.fn(),
		);
	const start = vi.fn(() => ({ result: Promise.resolve(2), cancel: () => false }));
	await expect(jobs.run(sender, "over-limit", start, vi.fn())).rejects.toThrow(
		"Reopen this window",
	);
	expect(start).not.toHaveBeenCalled();
	await expect(jobs.run(owner(), "fresh", start, vi.fn())).resolves.toBe(2);
});

it("delivers invalidation after a synchronous start callback returns its native handle", async () => {
	const jobs = new ExportJobs(),
		sender = owner(),
		native = pending(),
		invalidate = vi.fn();
	const running = jobs.run(
		sender,
		"sync-invalidation",
		() => {
			sender.emit("did-start-navigation");
			return { ...native, invalidate };
		},
		vi.fn(),
	);
	expect(invalidate).toHaveBeenCalledOnce();
	native.resolve(1);
	await expect(running).rejects.toThrow("RENDER_JOB_INVALIDATED");
});
it("suppresses progress after invalidation independently of active/destruction checks", async () => {
	const jobs = new ExportJobs(),
		sender = owner(),
		native = pending(),
		progress = vi.fn();
	let report!: (frames: number) => void;
	const running = jobs.run(
		sender,
		"late-progress",
		(callback) => {
			report = callback;
			return native;
		},
		progress,
	);
	report(1);
	jobs.invalidate(sender);
	report(99);
	expect(progress.mock.calls).toEqual([[1]]);
	native.resolve(1);
	await expect(running).rejects.toThrow("RENDER_JOB_INVALIDATED");
});
